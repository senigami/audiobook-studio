"""Video sample generation utilities."""

from __future__ import annotations

import shlex
from pathlib import Path
from typing import Any, Callable


def generate_video_sample(
    input_audio: Path,
    output_video: Path,
    logo_path: Path | None,
    on_output: Callable[[str], None],
    cancel_check: Callable[[], bool],
    max_duration: int = 120,
) -> int:
    """Generates a video sample (MP4) from an audio file with a logo overlay."""
    if not input_audio.exists():
        on_output(f"[error] Input audio not found: {input_audio}\n")
        return 1

    # Using ffmpeg list format for command building
    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"color=c=black:s=400x400:d={max_duration}",
        "-i",
        str(input_audio),
    ]

    if logo_path and logo_path.exists():
        cmd.extend(["-i", str(logo_path)])
        cmd.extend(
            [
                "-filter_complex",
                "[2:v]scale=400:400:force_original_aspect_ratio=decrease[logo];[0:v][logo]overlay=(W-w)/2:(H-h)/2[outv]",
                "-map",
                "[outv]",
            ]
        )
    else:
        cmd.extend(["-map", "0:v"])

    cmd.extend(
        [
            "-map",
            "1:a",
            "-c:v",
            "libx264",
            "-c:a",
            "copy",
            "-t",
            str(max_duration),
            "-shortest",
            str(output_video),
        ]
    )
    from app.engines import run_cmd_stream
    return run_cmd_stream(cmd, on_output, cancel_check)
