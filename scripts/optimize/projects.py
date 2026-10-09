#!/usr/bin/env python3
"""Optimize the static CVeDI project archive without changing page layout."""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import shutil
import subprocess
import tempfile
import unicodedata
import urllib.parse
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

from PIL import Image


TEXT_SUFFIXES = {".html", ".htm", ".css", ".js", ".json", ".xml", ".svg", ".php", ".ts", ".vue"}
RASTER_SUFFIXES = {".png", ".jpg", ".jpeg", ".jfif"}
EMBEDDED_RASTER = re.compile(rb"data:image/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)", re.I)
YEAR_FILTER: str | None = None


def sites(root: Path) -> list[Path]:
    return sorted(p for year in root.glob("a.a.*") if year.is_dir()
                  and (YEAR_FILTER is None or year.name == YEAR_FILTER)
                  for p in year.iterdir() if p.is_dir())


def text_files(site: Path) -> list[Path]:
    return [p for p in site.rglob("*") if p.is_file() and not p.is_symlink()
            and p.suffix.lower() in TEXT_SUFFIXES and "node_modules" not in p.parts
            and p.stat().st_size < 25_000_000]


def variants(name: str) -> set[bytes]:
    return {name.encode("utf-8"), urllib.parse.quote(name).encode("ascii")}


def replace_names(paths: list[Path], mapping: dict[str, str]) -> int:
    changes = 0
    for path in paths:
        original = path.read_bytes()
        updated = original
        for old, new in sorted(mapping.items(), key=lambda item: -len(item[0])):
            pairs = ((old.encode("utf-8"), new.encode("utf-8")),
                     (urllib.parse.quote(old).encode("ascii"), urllib.parse.quote(new).encode("ascii")))
            for source, target in pairs:
                pattern = re.compile(rb"(?<![A-Za-z0-9_.-])" + re.escape(source))
                updated = pattern.sub(lambda _: target, updated)
        if updated != original:
            path.write_bytes(updated)
            changes += 1
    return changes


def cwebp(src: Path, out: Path, quality: int = 90, width: int | None = None) -> bool:
    command = ["cwebp", "-quiet", "-q", str(quality), "-m", "4", "-metadata", "icc"]
    if width:
        command += ["-resize", str(width), "0"]
    command += [str(src), "-o", str(out)]
    return subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def valid_image(path: Path, original: Path, width: int | None = None) -> bool:
    try:
        with Image.open(original) as old, Image.open(path) as new:
            if getattr(old, "n_frames", 1) > 1:
                return False
            if width:
                return new.width == width and new.height > 0
            return new.size == old.size
    except Exception:
        return False


def optimize_screenshots(root: Path) -> None:
    count = old_bytes = new_bytes = 0
    for site in sites(root):
        src = site / "screenshot.png"
        if not src.exists():
            continue
        out = site / "screenshot.webp"
        if out.exists():
            continue
        with Image.open(src) as img:
            width = min(800, img.width)
        if not cwebp(src, out, quality=88, width=width) or not valid_image(out, src, width):
            out.unlink(missing_ok=True)
            continue
        old_bytes += src.stat().st_size
        new_bytes += out.stat().st_size
        replace_names(text_files(site), {"screenshot.png": "screenshot.webp"})
        src.unlink()
        count += 1
    replace_names([root / "index.html"], {"screenshot.png": "screenshot.webp"})
    print(f"screenshots: {count}, {old_bytes / 1048576:.1f} -> {new_bytes / 1048576:.1f} MiB", flush=True)


def optimize_raster(root: Path) -> None:
    count = old_bytes = new_bytes = 0
    for number, site in enumerate(sites(root), 1):
        texts = text_files(site)
        haystack = b"\n".join(p.read_bytes() for p in texts if p.suffix.lower() != ".svg" or p.stat().st_size < 3_000_000)
        groups: dict[str, list[Path]] = defaultdict(list)
        for p in site.rglob("*"):
            if p.is_file() and not p.is_symlink() and p.suffix.lower() in RASTER_SUFFIXES and p.name != "screenshot.png":
                groups[p.name].append(p)
        mapping: dict[str, str] = {}
        for name, group in groups.items():
            if not any(v in haystack for v in variants(name)):
                continue
            if any(p.stat().st_size < 100_000 or p.with_suffix(".webp").exists() for p in group):
                continue
            converted: list[tuple[Path, Path]] = []
            for src in group:
                out = src.with_name(src.stem + ".optimized.webp")
                if not cwebp(src, out) or not valid_image(out, src) or out.stat().st_size >= src.stat().st_size * .90:
                    out.unlink(missing_ok=True)
                    break
                converted.append((src, out))
            if len(converted) != len(group):
                for _, out in converted:
                    out.unlink(missing_ok=True)
                continue
            mapping[name] = group[0].with_suffix(".webp").name
            for src, out in converted:
                old_bytes += src.stat().st_size
                new_bytes += out.stat().st_size
                out.rename(src.with_suffix(".webp"))
                src.unlink()
                count += 1
        if mapping:
            replace_names(texts, mapping)
        print(f"raster {number}/{len(sites(root))}: {site.name}, {len(mapping)} names", flush=True)
    print(f"raster total: {count}, {old_bytes / 1048576:.1f} -> {new_bytes / 1048576:.1f} MiB", flush=True)


def rebuild_raster_references(root: Path, source: Path) -> None:
    """Rebuild text from the source tree using only complete filename conversions."""
    changed = 0
    for source_site in sites(source):
        dest_site = root / source_site.relative_to(source)
        groups: dict[str, list[Path]] = defaultdict(list)
        for p in source_site.rglob("*"):
            if p.is_file() and p.suffix.lower() in RASTER_SUFFIXES | {".png"}:
                groups[p.name].append(p)
        mapping = {}
        for name, paths in groups.items():
            if all(not (dest_site / p.relative_to(source_site)).exists()
                   and (dest_site / p.relative_to(source_site)).with_suffix(".webp").exists() for p in paths):
                mapping[name] = paths[0].with_suffix(".webp").name
        for original in text_files(source_site):
            target = dest_site / original.relative_to(source_site)
            if target.exists():
                target.write_bytes(original.read_bytes())
        if mapping:
            changed += replace_names(text_files(dest_site), mapping)
    (root / "index.html").write_bytes((source / "index.html").read_bytes())
    replace_names([root / "index.html"], {"screenshot.png": "screenshot.webp"})
    print(f"rebuilt raster references in {changed} files", flush=True)


def optimize_colliding_names(root: Path) -> None:
    """Handle large assets whose basenames occur in multiple site directories."""
    count = old_bytes = new_bytes = 0
    for site in sites(root):
        texts = text_files(site)
        groups: dict[str, list[Path]] = defaultdict(list)
        for p in site.rglob("*"):
            if p.is_file() and not p.is_symlink() and p.suffix.lower() in RASTER_SUFFIXES:
                groups[p.name].append(p)
        for paths in groups.values():
            if len(paths) < 2:
                continue
            for src in paths:
                if src.stat().st_size < 250_000 or src.with_suffix(".webp").exists():
                    continue
                refs: dict[Path, list[tuple[bytes, bytes]]] = {}
                new_name = src.with_suffix(".webp").name
                for text_path in texts:
                    relative = Path(os.path.relpath(src, text_path.parent)).as_posix()
                    site_relative = src.relative_to(site).as_posix()
                    root_relative = "/" + src.relative_to(root).as_posix()
                    options = {relative, "./" + relative, site_relative, "./" + site_relative, root_relative}
                    old_new = [(old, old[: -len(src.name)] + new_name) for old in options]
                    data = text_path.read_bytes()
                    matches = []
                    for old, new in sorted(old_new, key=lambda pair: -len(pair[0])):
                        for source, target in ((old.encode(), new.encode()),
                                               (urllib.parse.quote(old).encode(), urllib.parse.quote(new).encode())):
                            pattern = re.compile(rb"(?<![A-Za-z0-9_./-])" + re.escape(source))
                            if pattern.search(data):
                                matches.append((source, target))
                    if matches:
                        refs[text_path] = matches
                if not refs:
                    continue
                out = src.with_name(src.stem + ".optimized.webp")
                if not cwebp(src, out) or not valid_image(out, src) or out.stat().st_size >= src.stat().st_size * .90:
                    out.unlink(missing_ok=True)
                    continue
                for text_path, pairs in refs.items():
                    data = text_path.read_bytes()
                    for source, target in sorted(set(pairs), key=lambda pair: -len(pair[0])):
                        pattern = re.compile(rb"(?<![A-Za-z0-9_./-])" + re.escape(source))
                        data = pattern.sub(lambda _: target, data)
                    text_path.write_bytes(data)
                old_bytes += src.stat().st_size
                new_bytes += out.stat().st_size
                out.rename(src.with_suffix(".webp"))
                src.unlink()
                count += 1
    print(f"collision raster: {count}, {old_bytes / 1048576:.1f} -> {new_bytes / 1048576:.1f} MiB", flush=True)


def optimize_svg(root: Path) -> None:
    count = embedded = old_bytes = new_bytes = 0
    svg_root = root / YEAR_FILTER if YEAR_FILTER else root
    for path in svg_root.rglob("*.svg"):
        if path.is_symlink() or path.stat().st_size < 100_000:
            continue
        original = path.read_bytes()
        matches = list(EMBEDDED_RASTER.finditer(original))
        if not matches:
            continue
        try:
            ET.fromstring(original)
        except ET.ParseError:
            continue
        changed = 0
        with tempfile.TemporaryDirectory() as temp:
            def substitute(match: re.Match[bytes]) -> bytes:
                nonlocal changed
                try:
                    data = base64.b64decode(match.group(2), validate=True)
                    source = Path(temp) / f"{changed}-source.png"
                    output = Path(temp) / f"{changed}-output.webp"
                    source.write_bytes(data)
                    if not cwebp(source, output, quality=90) or not valid_image(output, source):
                        return match.group(0)
                    result = output.read_bytes()
                    if len(result) >= len(data) * .90:
                        return match.group(0)
                    changed += 1
                    return b"data:image/webp;base64," + base64.b64encode(result)
                except Exception:
                    return match.group(0)
            updated = EMBEDDED_RASTER.sub(substitute, original)
        if changed and len(updated) < len(original) * .90:
            try:
                ET.fromstring(updated)
            except ET.ParseError:
                continue
            path.write_bytes(updated)
            count += 1
            embedded += changed
            old_bytes += len(original)
            new_bytes += len(updated)
    print(f"svg: {count} files, {embedded} embedded images, {old_bytes / 1048576:.1f} -> {new_bytes / 1048576:.1f} MiB", flush=True)


def optimize_gifs(root: Path) -> None:
    count = old_bytes = new_bytes = 0
    for site in sites(root):
        texts = text_files(site)
        haystack = b"\n".join(p.read_bytes() for p in texts if p.suffix.lower() != ".svg")
        for src in site.rglob("*.gif"):
            if src.is_symlink() or src.stat().st_size < 100_000 or src.with_suffix(".webp").exists():
                continue
            if not any(v in haystack for v in variants(src.name)):
                continue
            out = src.with_name(src.stem + ".optimized.webp")
            result = subprocess.run(["gif2webp", "-quiet", "-q", "90", "-m", "4", str(src), "-o", str(out)],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if result.returncode or not out.exists() or out.stat().st_size >= src.stat().st_size * .85:
                out.unlink(missing_ok=True)
                continue
            try:
                with Image.open(src) as before, Image.open(out) as after:
                    valid = before.size == after.size and before.n_frames == after.n_frames
            except Exception:
                valid = False
            if not valid:
                out.unlink(missing_ok=True)
                continue
            old_bytes += src.stat().st_size
            new_bytes += out.stat().st_size
            target = src.with_suffix(".webp")
            out.rename(target)
            replace_names(texts, {src.name: target.name})
            src.unlink()
            count += 1
    print(f"gifs: {count}, {old_bytes / 1048576:.1f} -> {new_bytes / 1048576:.1f} MiB", flush=True)


def optimize_videos(root: Path) -> None:
    def info(path: Path) -> tuple[float, tuple[int, int]] | None:
        result = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                                 "format=duration:stream=codec_type,width,height", "-of", "json", str(path)],
                                capture_output=True, text=True)
        if result.returncode:
            return None
        data = json.loads(result.stdout)
        video = next((stream for stream in data.get("streams", []) if stream.get("codec_type") == "video"), None)
        if not video:
            return None
        return float(data["format"]["duration"]), (int(video["width"]), int(video["height"]))

    count = old_bytes = new_bytes = 0
    for site in sites(root):
        texts = text_files(site)
        haystack = b"\n".join(p.read_bytes() for p in texts if p.suffix.lower() != ".svg")
        for src in list(site.rglob("*")):
            if not src.is_file() or src.is_symlink() or src.suffix.lower() not in {".mov", ".mp4", ".m4v"}:
                continue
            if not any(v in haystack for v in variants(src.name)):
                continue
            target = src.with_suffix(".mp4")
            if target != src and target.exists():
                continue
            out = src.with_name(src.stem + ".optimized.mp4")
            command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
                       "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "fast",
                       "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
                       "-movflags", "+faststart", str(out)]
            print(f"video: {src.relative_to(root)}", flush=True)
            result = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            before = info(src)
            after = info(out) if out.exists() else None
            valid = (before is not None and after is not None and abs(before[0] - after[0]) < .5
                     and sorted(before[1]) == sorted(after[1]))
            if result.returncode or not valid or out.stat().st_size >= src.stat().st_size * .90:
                out.unlink(missing_ok=True)
                continue
            old_bytes += src.stat().st_size
            new_bytes += out.stat().st_size
            if target == src:
                out.replace(src)
            else:
                out.rename(target)
                replace_names(texts, {src.name: target.name})
                src.unlink()
            count += 1
    print(f"videos: {count}, {old_bytes / 1048576:.1f} -> {new_bytes / 1048576:.1f} MiB", flush=True)


def cleanup(root: Path) -> None:
    removed = bytes_removed = 0
    safe_suffixes = {".map", ".patch", ".scss", ".sass", ".ts", ".log"}
    safe_names = {".DS_Store", "Thumbs.db"}
    for site in sites(root):
        haystack = b"\n".join(p.read_bytes() for p in text_files(site) if p.suffix.lower() != ".svg")
        for vendor in site.rglob("node_modules"):
            if vendor.is_dir() and b"node_modules/" not in haystack:
                bytes_removed += sum(p.stat().st_size for p in vendor.rglob("*") if p.is_file())
                removed += sum(1 for p in vendor.rglob("*") if p.is_file())
                shutil.rmtree(vendor)
        splide = site / "splide-4.1.3"
        if splide.is_dir() and (splide / "dist").is_dir():
            for item in splide.iterdir():
                if item.name == "dist":
                    continue
                if item.is_dir():
                    bytes_removed += sum(p.stat().st_size for p in item.rglob("*") if p.is_file())
                    removed += sum(1 for p in item.rglob("*") if p.is_file())
                    shutil.rmtree(item)
                elif item.is_file():
                    bytes_removed += item.stat().st_size
                    removed += 1
                    item.unlink()
        for p in list(site.rglob("*")):
            if not p.is_file() or p.is_symlink():
                continue
            name = p.name
            candidate = (name in safe_names or p.suffix.lower() in safe_suffixes or name.endswith("~")
                         or p.suffix.lower() == ".pdf" or name.lower().startswith("readme")
                         or p.suffix.lower() == ".zip")
            if p.suffix.lower() == ".map" or (candidate and not any(v in haystack for v in variants(name))):
                bytes_removed += p.stat().st_size
                p.unlink()
                removed += 1
        for p in sorted(site.rglob("*"), key=lambda p: len(p.parts), reverse=True):
            if p.is_dir() and not p.is_symlink() and not any(p.iterdir()):
                p.rmdir()
    for p in root.rglob(".DS_Store"):
        bytes_removed += p.stat().st_size
        p.unlink()
        removed += 1
    print(f"cleanup: {removed} files, {bytes_removed / 1048576:.1f} MiB", flush=True)


def slug(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()))


def rename_sites(root: Path) -> None:
    gallery = root / "gallery-data.json"
    data = json.loads(gallery.read_text())
    rename: list[tuple[Path, Path, str, str]] = []
    for item in data["photos"]:
        old_url = item["url"]
        old_dir = root / old_url.lstrip("/")
        if slug(old_dir.name) == slug(item["name"]):
            continue
        new_dir = old_dir.with_name(slug(item["name"]))
        if not old_dir.exists() or new_dir.exists():
            print(f"rename skipped: {old_url}", flush=True)
            continue
        new_url = old_url.rsplit("/", 2)[0] + "/" + new_dir.name + "/"
        rename.append((old_dir, new_dir, old_url, new_url))
    all_text = [p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in TEXT_SUFFIXES
                and p.stat().st_size < 25_000_000]
    replace_names(all_text, {old_url: new_url for _, _, old_url, new_url in rename})
    for old_dir, new_dir, _, _ in rename:
        old_dir.rename(new_dir)
    print(f"renamed sites: {len(rename)}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    parser.add_argument("phase", choices=["screenshots", "raster", "repair-raster", "collision-raster", "svg", "gifs", "videos", "cleanup", "rename"])
    parser.add_argument("--source", type=Path)
    parser.add_argument("--year", help="Limit site phases to one academic-year folder")
    args = parser.parse_args()
    global YEAR_FILTER
    YEAR_FILTER = args.year
    root = args.root.resolve()
    if not (root / "gallery-data.json").exists():
        raise SystemExit("Missing gallery-data.json")
    if args.phase == "repair-raster":
        if not args.source:
            raise SystemExit("--source is required for repair-raster")
        rebuild_raster_references(root, args.source.resolve())
    else:
        {"screenshots": optimize_screenshots, "raster": optimize_raster, "collision-raster": optimize_colliding_names,
         "svg": optimize_svg, "gifs": optimize_gifs,
         "videos": optimize_videos, "cleanup": cleanup, "rename": rename_sites}[args.phase](root)


if __name__ == "__main__":
    main()
