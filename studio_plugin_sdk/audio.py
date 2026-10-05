"""Audio conversion mechanism for engine plugins.

Stdlib-only: no ``app.*`` imports. Host policy (MP3 quality, the host's
process runner) is injected by the app-side wrapper in
``app/engines/audio_ops.py``.
"""

from __future__ import annotations

from pathlib import Path
from typing import Callable

from studio_plugin_sdk import proc as _proc


def wav_to_mp3(
    in_wav: Path,
    out_mp3: Path,
    *,
    quality: int,
    on_output: Callable[[str], None] | None = None,
    cancel_check: Callable[[], bool] | None = None,
    runner: Callable[..., int] | None = None,
) -> int:
    """Convert WAV to MP3 using FFmpeg.

    ``quality`` is the LAME VBR quality (host injects its configured value).
    ``runner`` defaults to :func:`studio_plugin_sdk.proc.run_cmd_stream`; the
    Studio host injects its own runner so host-level instrumentation applies.
    """
    def noop(*_args):
        return None

    def never_cancel():
        return False

    if on_output is None:
        on_output = noop
    if cancel_check is None:
        cancel_check = never_cancel
    if runner is None:
        runner = _proc.run_cmd_stream

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(in_wav),
        "-codec:a",
        "libmp3lame",
        "-q:a",
        str(quality),
        str(out_mp3),
    ]
    return runner(cmd, on_output, cancel_check)
