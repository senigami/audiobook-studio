"""XTTS-specific engine logic and utilities."""

from __future__ import annotations

import hashlib
import os
import re
import shutil
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable

from .text_utils import pack_text_to_limit, safe_split_long_sentences, sanitize_text
from .proc_utils import run_cmd_stream
# Engine environment resolution
XTTS_ENV_DIR_DEFAULT = Path.home() / "xtts-env"
XTTS_ENV_DIR = Path(os.getenv("XTTS_ENV_DIR", str(XTTS_ENV_DIR_DEFAULT)))
XTTS_ENV_PYTHON = Path(os.getenv("XTTS_ENV_PYTHON", str(XTTS_ENV_DIR / ("Scripts/python.exe" if os.name == "nt" else "bin/python"))))
XTTS_ENV_ACTIVATE = XTTS_ENV_DIR / ("Scripts/Activate.ps1" if os.name == "nt" else "bin/activate")



@lru_cache(maxsize=1)
def _load_local_manifest() -> dict[str, Any]:
    """Load the manifest.json from the plugin root for local behavior discovery."""
    try:
        # Implementation is in plugin/core/, manifest is 2 levels up
        manifest_path = Path(__file__).parents[2] / "manifest.json"
        if manifest_path.exists():
            return json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def _get_local_behavior() -> dict[str, Any]:
    return _load_local_manifest().get("behavior") or {}


def xtts_generate(
    text: str,
    out_wav: Path,
    safe_mode: bool,
    on_output: Callable[[str], None],
    cancel_check: Callable[[], bool],
    speaker_wav: str | None = None,
    speed: float = 1.0,
    voice_profile_dir: Path | None = None,
    task_id: str | None = None,
) -> int:
    """Invoke XTTS inference via subprocess."""

    import sys
    python_exe = XTTS_ENV_PYTHON

    if not XTTS_ENV_ACTIVATE.exists():
        # Fallback: check if TTS is available in the current environment
        try:
            import TTS  # noqa: F401, PLC0415
            python_exe = Path(sys.executable)
            on_output("XTTS environment not found; falling back to current environment (TTS detected).\n")
        except ImportError:
            on_output(f"[error] XTTS activate not found: {XTTS_ENV_ACTIVATE} and 'TTS' not found in current environment.\n")
            return 1

    sw = speaker_wav

    if not sw and voice_profile_dir is None:
        on_output("[error] No speaker profile or reference WAV provided\n")
        return 1

    if safe_mode:
        text = sanitize_text(text)
        behavior = _get_local_behavior()
        split_target = behavior.get("text_split_target", 450)
        text = safe_split_long_sentences(text, target=split_target)
    else:
        # Raw mode: Absolute bare minimum to prevent speech engine crashes
        text = re.sub(r"[^\x00-\x7F]+", "", text)  # ASCII only
        text = text.strip()

    behavior = _get_local_behavior()
    chunk_limit = behavior.get("text_chunk_limit", 500)
    text = pack_text_to_limit(text, limit=chunk_limit, pad=True) or " "

    cmd = [
        str(python_exe),
        str(Path(__file__).parent / "xtts_inference.py"),
        "--text",
        text,
        "--language",
        "en",
        "--repetition_penalty",
        "2.0",
        "--speed",
        str(speed),
        "--out_path", str(out_wav),
    ]
    if sw:
        cmd.extend(["--speaker_wav", sw])
    if voice_profile_dir is not None:
        cmd.extend(["--voice_profile_dir", str(voice_profile_dir)])
    if task_id:
        cmd.extend(["--task_id", task_id])
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    on_output("Launching XTTS inference...\n")
    on_output("XTTS may take a while on first use while models load, caches warm, or assets download.\n")
    return run_cmd_stream(cmd, on_output, cancel_check, env=env)


def xtts_generate_script(
    script_json_path: Path,
    out_wav: Path,
    on_output: Callable[[str], None],
    cancel_check: Callable[[], bool],
    speed: float = 1.0,
    voice_profile_dir: Path | None = None,
    task_id: str | None = None,
) -> int:
    """Invoke XTTS script-based inference via subprocess."""

    import sys
    python_exe = XTTS_ENV_PYTHON

    if not XTTS_ENV_ACTIVATE.exists():
        # Fallback: check if TTS is available in the current environment
        try:
            import TTS  # noqa: F401, PLC0415
            python_exe = Path(sys.executable)
            on_output("XTTS environment not found; falling back to current environment (TTS detected).\n")
        except ImportError:
            on_output(f"[error] XTTS activate not found: {XTTS_ENV_ACTIVATE} and 'TTS' not found in current environment.\n")
            return 1

    cmd = [
        str(python_exe),
        str(Path(__file__).parent / "xtts_inference.py"),
        "--script_json",
        str(script_json_path),
        "--language",
        "en",
        "--repetition_penalty",
        "2.0",
        "--speed",
        str(speed),
        "--out_path",
        str(out_wav),
    ]
    if voice_profile_dir is not None:
        cmd.extend(["--voice_profile_dir", str(voice_profile_dir)])
    if task_id:
        cmd.extend(["--task_id", task_id])
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    on_output("Launching XTTS inference...\n")
    on_output("XTTS may take a while on first use while models load, caches warm, or assets download.\n")
    return run_cmd_stream(cmd, on_output, cancel_check, env=env)


def get_speaker_latent_path(speaker_wavs_str: str | list[str] | None, voice_profile_dir: Path | None = None) -> Path | None:
    """Computes the same latent path as xtts_inference.py."""
    if voice_profile_dir is not None:
        return Path(voice_profile_dir) / "latent.pth"

    if not speaker_wavs_str:
        return None

    if isinstance(speaker_wavs_str, list):
        combined_paths = "|".join(sorted([os.path.abspath(p) for p in speaker_wavs_str]))
    elif "," in speaker_wavs_str:
        wavs = [s.strip() for s in speaker_wavs_str.split(",") if s.strip()]
        combined_paths = "|".join(sorted([os.path.abspath(p) for p in wavs]))
    else:
        combined_paths = os.path.abspath(speaker_wavs_str)

    speaker_id = hashlib.md5(combined_paths.encode()).hexdigest()
    voice_dir = Path(os.path.expanduser("~/.cache/audiobook-studio/voices"))
    return voice_dir / f"{speaker_id}.pth"


def migrate_speaker_latent_to_profile(speaker_wavs_str: str | list[str] | None, voice_profile_dir: Path) -> Path | None:
    """Copy a shared cache latent into a profile-owned latent path if needed."""
    profile_latent = Path(voice_profile_dir) / "latent.pth"
    if profile_latent.exists():
        return profile_latent

    _get_path = get_speaker_latent_path
    cached_latent = _get_path(speaker_wavs_str)
    if cached_latent and cached_latent.exists():
        profile_latent.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(cached_latent, profile_latent)
        return profile_latent

    return None
