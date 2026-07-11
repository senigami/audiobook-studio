import subprocess
import sys
from pathlib import Path


FFPROBE_DURATION_CMD = (
    "ffprobe",
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
)


def coerce_subprocess_output(value) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, str):
        return value
    return ""


def write_subprocess_output(*, stdout=None, stderr=None) -> None:
    stdout_text = coerce_subprocess_output(stdout)
    stderr_text = coerce_subprocess_output(stderr)
    if stdout_text:
        sys.stdout.write(stdout_text)
        sys.stdout.flush()
    if stderr_text:
        sys.stderr.write(stderr_text)
        sys.stderr.flush()


def probe_audio_duration(audio_path: Path, *, timeout: int = 2) -> float:
    result = subprocess.run(
        [*FFPROBE_DURATION_CMD, str(audio_path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=timeout,
    )
    stdout = coerce_subprocess_output(getattr(result, "stdout", ""))
    if stdout:
        write_subprocess_output(stdout=stdout)
    returncode = getattr(result, "returncode", 0)
    if not isinstance(returncode, int):
        returncode = 0
    if returncode != 0:
        return 0.0
    return float(stdout.strip())


def probe_audio_stream_info(audio_path: Path, *, timeout: int = 2) -> tuple[int, int]:
    """Returns (sample_rate, channels). Mirrors probe_audio_duration's shape/safety."""
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "stream=sample_rate,channels",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(audio_path),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=timeout,
    )
    stdout = coerce_subprocess_output(getattr(result, "stdout", ""))
    if stdout:
        write_subprocess_output(stdout=stdout)
    returncode = getattr(result, "returncode", 0)
    if not isinstance(returncode, int):
        returncode = 0
    if returncode != 0:
        return (0, 0)
    lines = [line.strip() for line in stdout.strip().splitlines() if line.strip()]
    if len(lines) < 2:
        return (0, 0)
    try:
        return (int(lines[0]), int(lines[1]))
    except ValueError:
        return (0, 0)
