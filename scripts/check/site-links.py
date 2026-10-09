#!/usr/bin/env python3
"""Audit links in the static project sites without following external URLs."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit

from bs4 import BeautifulSoup


def exact_path(path: Path, root: Path, names: dict[Path, set[str]]) -> bool:
    """Check the spelling that a case-insensitive development disk may hide."""
    try:
        parts = Path(os.path.normpath(path)).relative_to(root).parts
    except ValueError:
        return False
    current = root
    for part in parts:
        if current not in names:
            names[current] = {entry.name for entry in current.iterdir()} if current.is_dir() else set()
        if part not in names[current]:
            return False
        current /= part
    return True


def page_soup(path: Path, cache: dict[Path, BeautifulSoup]) -> BeautifulSoup:
    if path not in cache:
        cache[path] = BeautifulSoup(path.read_text(encoding="utf-8", errors="replace"), "html.parser")
    return cache[path]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", type=Path, default=Path("."))
    args = parser.parse_args()
    root = args.root.resolve()
    pages = [
        path for year in root.glob("a.a.*") if year.is_dir()
        for path in year.rglob("*")
        if path.is_file() and path.suffix.lower() in {".html", ".htm"}
        and "node_modules" not in path.parts
    ]
    cache: dict[Path, BeautifulSoup] = {}
    names: dict[Path, set[str]] = {}
    missing: list[tuple[Path, str]] = []
    wrong_case: list[tuple[Path, str]] = []
    missing_fragments: list[tuple[Path, str]] = []
    external: set[str] = set()
    local_count = 0
    sites: set[tuple[str, str]] = set()

    for page in pages:
        relative = page.relative_to(root)
        if len(relative.parts) < 2:
            continue  # Gallery, outside a project site.
        site = root.joinpath(*relative.parts[:2])
        sites.add((relative.parts[0], relative.parts[1]))
        for anchor in page_soup(page, cache).find_all("a", href=True):
            url = anchor["href"].strip()
            parsed = urlsplit(url)
            if parsed.scheme in {"http", "https"} or url.startswith("//"):
                external.add(url)
                continue
            if parsed.scheme or (not parsed.path and not parsed.fragment):
                continue  # mailto, tel, fax, JavaScript, empty href.

            path = unquote(parsed.path)
            if path.startswith("/"):
                # Gallery URLs begin with the academic-year folder. Older sites
                # also use paths relative to their own site root.
                target_root = root if path.lstrip("/").startswith("a.a.") else site
                target = target_root / path.lstrip("/")
            elif path:
                target = page.parent / path
            else:
                target = page
            if target.is_dir():
                target /= "index.html"
            if path:
                local_count += 1
            if not target.exists():
                missing.append((relative, url))
                continue
            if not exact_path(target, root, names):
                wrong_case.append((relative, url))
            if parsed.fragment and parsed.fragment not in {"0", "!"}:
                fragment = unquote(parsed.fragment)
                destination = page_soup(target, cache)
                if not destination.find(id=fragment) and not destination.find(attrs={"name": fragment}):
                    missing_fragments.append((relative, url))

    print(f"Sites: {len(sites)}; HTML pages: {len(pages)}; local links: {local_count}; external URLs: {len(external)}")
    print(f"Missing local targets: {len(missing)}; case mismatches: {len(wrong_case)}; missing fragments: {len(missing_fragments)}")
    for label, issues in (
        ("missing", missing),
        ("case", wrong_case),
        ("fragment", missing_fragments),
    ):
        for page, url in issues:
            print(f"{label}: {page} -> {url}")
    return 1 if missing or wrong_case or missing_fragments else 0


if __name__ == "__main__":
    raise SystemExit(main())
