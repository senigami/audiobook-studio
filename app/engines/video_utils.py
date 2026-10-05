"""Video sample generation utilities.

Produces a short, shareable MP4 that pairs a chapter's rendered audio with a
still image (the book cover, or the Studio logo when a project has no cover).
The visual is scaled to fit and letterboxed onto a dark canvas so cover art is
never cropped. See ``design-docs/specs/video-sample.md`` for the contract.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Callable

# Bundled fallback visual, resolved from the source tree (not the data dir) so
# it is present regardless of AUDIOBOOK_BASE_DIR overrides (e.g. under test).
STUDIO_LOGO_PATH = Path(__file__).resolve().parents[2] / "assets" / "logo.png"

# Supported output frames: (width, height). Square reads well on most feeds;
# portrait targets Stories/Reels.
ORIENTATIONS: dict[str, tuple[int, int]] = {
    "square": (1080, 1080),
    "portrait": (1080, 1920),
}

DEFAULT_ORIENTATION = "square"
DEFAULT_DURATION_SECONDS = 30
MAX_DURATION_SECONDS = 120
_CANVAS_COLOR = "0x0B0B0C"

# Return code used when ffmpeg is not installed, so callers can surface a
# clear "video tools unavailable" message rather than a generic failure.
FFMPEG_MISSING_RC = 127


def clamp_duration(seconds: int | None) -> int:
    """Clamp a requested clip length into the allowed [1, MAX] range."""
    if not seconds or seconds < 1:
        return DEFAULT_DURATION_SECONDS
    return min(int(seconds), MAX_DURATION_SECONDS)


def resolve_orientation(name: str | None) -> tuple[int, int]:
    """Resolve an orientation name to (width, height); default when unknown."""
    return ORIENTATIONS.get((name or "").lower(), ORIENTATIONS[DEFAULT_ORIENTATION])


def build_video_sample_command(
    input_audio: Path,
    output_video: Path,
    image_path: Path,
    orientation: str = DEFAULT_ORIENTATION,
    max_duration: int = DEFAULT_DURATION_SECONDS,
) -> list[str]:
    """Build the ffmpeg argv for a still-image + audio sample video.

    The image is scaled to fit inside the frame and padded (letterboxed) onto a
    dark canvas — the whole cover is preserved, never cropped. ``-t`` caps the
    length and ``-shortest`` ends the clip early when the audio is shorter.
    """
    width, height = resolve_orientation(orientation)
    duration = clamp_duration(max_duration)

    vf = (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color={_CANVAS_COLOR},"
        f"setsar=1"
    )

    return [
        "ffmpeg",
        "-y",
        "-loop",
        "1",
        "-i",
        str(image_path),
        "-i",
        str(input_audio),
        "-vf",
        vf,
        "-map",
        "0:v",
        "-map",
        "1:a",
        "-c:v",
        "libx264",
        "-tune",
        "stillimage",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "2",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-t",
        str(duration),
        "-shortest",
        "-movflags",
        "+faststart",
        str(output_video),
    ]


def generate_video_sample(
    input_audio: Path,
    output_video: Path,
    image_path: Path | None,
    on_output: Callable[[str], None],
    cancel_check: Callable[[], bool],
    orientation: str = DEFAULT_ORIENTATION,
    max_duration: int = DEFAULT_DURATION_SECONDS,
) -> int:
    """Render a shareable MP4 sample video from audio + a still image.

    Falls back to the bundled Studio logo when ``image_path`` is missing.
    Returns the ffmpeg exit code, ``FFMPEG_MISSING_RC`` when ffmpeg is absent,
    or ``1`` on a missing/invalid input.
    """
    if shutil.which("ffmpeg") is None:
        on_output("[error] ffmpeg is not installed; video export is unavailable.\n")
        return FFMPEG_MISSING_RC

    if not input_audio.exists():
        on_output(f"[error] Input audio not found: {input_audio}\n")
        return 1

    visual = image_path if (image_path and image_path.exists()) else STUDIO_LOGO_PATH
    if not visual.exists():
        on_output(f"[error] No cover image and Studio logo missing: {visual}\n")
        return 1

    cmd = build_video_sample_command(
        input_audio, output_video, visual, orientation=orientation, max_duration=max_duration
    )
    from .proc_utils import run_cmd_stream

    return run_cmd_stream(cmd, on_output, cancel_check)
