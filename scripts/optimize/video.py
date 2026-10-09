#!/usr/bin/env python3
"""Try a more efficient H.264 encode from the supplied original videos.

Only replaces an existing project video when the new encode is smaller and its
full-length SSIM against the original is at least as good as the current file.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import tempfile
from pathlib import Path


def probe(path: Path) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout)


def streams(data: dict, kind: str) -> list[dict]:
    return [item for item in data["streams"] if item["codec_type"] == kind]


def ssim(original: Path, candidate: Path) -> float:
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-loglevel", "info", "-i", str(original),
         "-i", str(candidate), "-lavfi", "[0:v:0][1:v:0]ssim", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    if result.returncode:
        raise RuntimeError(result.stderr[-1000:])
    matches = re.findall(r"SSIM Y:[^\n]* All:([0-9.]+)", result.stderr)
    if not matches:
        raise RuntimeError("SSIM result missing")
    return float(matches[-1])


def same_media(reference: dict, candidate: dict) -> bool:
    old_video, new_video = streams(reference, "video"), streams(candidate, "video")
    old_audio, new_audio = streams(reference, "audio"), streams(candidate, "audio")
    if len(old_video) != 1 or len(new_video) != 1 or len(old_audio) != len(new_audio):
        return False
    for key in ("width", "height", "r_frame_rate", "pix_fmt", "color_range", "color_space",
                "color_primaries", "color_transfer"):
        if old_video[0].get(key) != new_video[0].get(key):
            return False
    for old, new in zip(old_audio, new_audio):
        for key in ("codec_name", "sample_rate", "channels"):
            if old.get(key) != new.get(key):
                return False
    return abs(float(reference["format"]["duration"]) - float(candidate["format"]["duration"])) < 0.1


def same_timing(source: dict, current: dict) -> bool:
    old_video, new_video = streams(source, "video"), streams(current, "video")
    if len(old_video) != 1 or len(new_video) != 1:
        return False
    if any(old_video[0].get(key) != new_video[0].get(key)
           for key in ("width", "height", "r_frame_rate")):
        return False
    return abs(float(source["format"]["duration"]) - float(current["format"]["duration"])) < 0.1


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--projects", type=Path, required=True)
    parser.add_argument("--originals", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--source-map", type=Path)
    args = parser.parse_args()
    projects = args.projects.resolve()
    originals = args.originals.resolve()
    source_map = json.loads(args.source_map.read_text()) if args.source_map else None
    lines = ["status\told_bytes\tnew_bytes\told_ssim\tnew_ssim\tpath"]
    for current in sorted(projects.rglob("*.mp4")):
        relative = current.relative_to(projects)
        if source_map is not None and relative.as_posix() not in source_map:
            continue
        source = originals / (source_map[relative.as_posix()] if source_map is not None else relative)
        if not source.is_file():
            continue
        print(relative, flush=True)
        old_bytes = current.stat().st_size
        try:
            source_info, current_info = probe(source), probe(current)
            if not same_timing(source_info, current_info):
                lines.append(f"incompatible_source\t{old_bytes}\t0\t\t\t{relative}")
                continue
            with tempfile.TemporaryDirectory(prefix="video-recode-") as temp_dir:
                candidate = Path(temp_dir) / "candidate.mp4"
                old_video = streams(current_info, "video")[0]
                color_args = []
                for key, flag in (("color_range", "-color_range"), ("color_space", "-colorspace"),
                                  ("color_primaries", "-color_primaries"), ("color_transfer", "-color_trc")):
                    if old_video.get(key):
                        color_args.extend((flag, old_video[key]))
                command = (
                    ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                     "-i", str(source), "-map", "0:v:0", "-map", "0:a?", "-map_metadata", "0",
                     "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-pix_fmt", "yuv420p"]
                    + color_args + ["-c:a", "copy", "-movflags", "+faststart", str(candidate)]
                )
                result = subprocess.run(command, capture_output=True, text=True)
                if result.returncode:
                    raise RuntimeError(result.stderr[-1000:])
                new_bytes = candidate.stat().st_size
                if not same_media(current_info, probe(candidate)):
                    lines.append(f"incompatible_encode\t{old_bytes}\t{new_bytes}\t\t\t{relative}")
                    continue
                if new_bytes >= old_bytes * .95:
                    lines.append(f"larger_or_small_gain\t{old_bytes}\t{new_bytes}\t\t\t{relative}")
                    continue
                old_score, new_score = ssim(source, current), ssim(source, candidate)
                if new_score + .0005 < old_score:
                    status = "lower_quality"
                else:
                    candidate.replace(current)
                    status = "replaced"
                lines.append(f"{status}\t{old_bytes}\t{new_bytes}\t{old_score:.6f}\t{new_score:.6f}\t{relative}")
        except Exception as error:
            lines.append(f"error:{str(error).replace(chr(9), ' ')[:100]}\t{old_bytes}\t0\t\t\t{relative}")
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text("\n".join(lines) + "\n")
    args.report.write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
