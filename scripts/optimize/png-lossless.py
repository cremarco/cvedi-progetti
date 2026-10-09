#!/usr/bin/env python3
"""Replace referenced PNGs with smaller pixel-identical lossless WebP files."""

from __future__ import annotations

import argparse
import subprocess
import tempfile
import urllib.parse
import zipfile
from collections import Counter
from pathlib import Path

from PIL import Image, ImageChops


TEXT_EXTENSIONS = {".html", ".htm", ".css", ".js", ".json", ".xml", ".svg"}


def pixels_equal(source: Path, target: Path) -> bool:
    with Image.open(source) as old, Image.open(target) as new:
        if old.size != new.size or getattr(old, "n_frames", 1) != 1:
            return False
        old_rgba = old.convert("RGBA")
        new_rgba = new.convert("RGBA")
        return old_rgba.tobytes() == new_rgba.tobytes()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--projects", type=Path, required=True)
    parser.add_argument("--report-dir", type=Path, required=True)
    parser.add_argument("--year", help="Only optimize the named academic-year directory")
    args = parser.parse_args()
    projects = args.projects.resolve()
    report_dir = args.report_dir.resolve()
    report_dir.mkdir(parents=True, exist_ok=True)
    archive = report_dir / "before-png-lossless.zip"
    report = report_dir / "png-lossless.tsv"
    lines = ["status\told_bytes\tnew_bytes\tpath"]
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as backup:
        saved: set[Path] = set()
        for site in sorted(path for year in projects.glob("a.a.*") if year.is_dir()
                           and (args.year is None or year.name == args.year)
                           for path in year.iterdir() if path.is_dir()):
            texts = [path for path in site.rglob("*") if path.is_file()
                     and path.suffix.lower() in TEXT_EXTENSIONS and "node_modules" not in path.parts]
            pngs = [path for path in site.rglob("*.png") if path.is_file() and path.stat().st_size >= 100_000]
            counts = Counter(path.name for path in site.rglob("*.png") if path.is_file())
            for source in sorted(pngs, key=lambda path: path.stat().st_size, reverse=True):
                relative = source.relative_to(projects)
                old_bytes = source.stat().st_size
                target = source.with_suffix(".webp")
                if target.exists():
                    target = source.with_name(source.stem + "-lossless.webp")
                if counts[source.name] != 1 or target.exists():
                    lines.append(f"name_collision\t{old_bytes}\t0\t{relative}")
                    continue
                old_name = source.name.encode("utf-8")
                encoded_name = urllib.parse.quote(source.name).encode("ascii")
                references = [path for path in texts if old_name in path.read_bytes()
                              or encoded_name in path.read_bytes()]
                if not references:
                    lines.append(f"no_literal_reference\t{old_bytes}\t0\t{relative}")
                    continue
                try:
                    with tempfile.TemporaryDirectory(prefix="png-lossless-") as temp_dir:
                        candidate = Path(temp_dir) / "candidate.webp"
                        result = subprocess.run(
                            ["cwebp", "-quiet", "-lossless", "-m", "6", "-exact", "-metadata", "all",
                             str(source), "-o", str(candidate)], capture_output=True, text=True,
                        )
                        if result.returncode:
                            raise RuntimeError(result.stderr[-200:])
                        new_bytes = candidate.stat().st_size
                        if new_bytes >= old_bytes * .8 or old_bytes - new_bytes < 50_000:
                            lines.append(f"insufficient_gain\t{old_bytes}\t{new_bytes}\t{relative}")
                            continue
                        if not pixels_equal(source, candidate):
                            lines.append(f"pixel_difference\t{old_bytes}\t{new_bytes}\t{relative}")
                            continue
                        for path in references:
                            if path not in saved:
                                backup.write(path, path.relative_to(projects))
                                saved.add(path)
                        backup.write(source, relative)
                        target.write_bytes(candidate.read_bytes())
                        for path in references:
                            original = path.read_bytes()
                            updated = original.replace(old_name, target.name.encode("utf-8"))
                            updated = updated.replace(encoded_name, urllib.parse.quote(target.name).encode("ascii"))
                            path.write_bytes(updated)
                        source.unlink()
                        lines.append(f"replaced\t{old_bytes}\t{new_bytes}\t{relative}")
                        print(f"replaced {relative}: {old_bytes} -> {new_bytes}", flush=True)
                except Exception as error:
                    lines.append(f"error:{str(error).replace(chr(9), ' ')[:100]}\t{old_bytes}\t0\t{relative}")
                report.write_text("\n".join(lines) + "\n")
    report.write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
