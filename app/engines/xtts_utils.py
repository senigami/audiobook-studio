"""XTTS-specific engine logic and utilities."""

from __future__ import annotations

import hashlib
import os
import re
import shutil
from pathlib import Path
from typing import Any, Callable

from app.config import BASE_DIR, XTTS_ENV_ACTIVATE, XTTS_ENV_PYTHON
from app.textops import pack_text_to_limit, safe_split_long_sentences, sanitize_for_xtts


def xtts_generate(
    text: str,
    out_wav: Path,
    safe_mode: bool,
    on_output: Callable[[str], None],
    cancel_check: Callable[[], bool],
    speaker_wav: str | None = None,
    speed: float = 1.0,
    voice_profile_dir: Path | None = None,
) -> int:
    """Invoke XTTS inference via subprocess."""
    from app.engines import XTTS_ENV_ACTIVATE, XTTS_ENV_PYTHON, run_cmd_stream

    if not XTTS_ENV_ACTIVATE.exists():
        on_output(f"[error] XTTS activate not found: {XTTS_ENV_ACTIVATE}\n")
        return 1

    sw = speaker_wav

    if not sw and voice_profile_dir is None:
        on_output("[error] No speaker profile or reference WAV provided\n")
        return 1

    if safe_mode:
        text = sanitize_for_xtts(text)
        text = safe_split_long_sentences(text)
    else:
        # Raw mode: Absolute bare minimum to prevent speech engine crashes
        text = re.sub(r"[^\x00-\x7F]+", "", text)  # ASCII only
        text = text.strip()

    text = pack_text_to_limit(text, pad=True) or " "

    cmd = [
        str(XTTS_ENV_PYTHON),
        str(BASE_DIR / "app" / "xtts_inference.py"),
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
) -> int:
    """Invoke XTTS script-based inference via subprocess."""
    from app.engines import XTTS_ENV_ACTIVATE, XTTS_ENV_PYTHON, run_cmd_stream

    if not XTTS_ENV_ACTIVATE.exists():
        on_output(f"[error] XTTS activate not found: {XTTS_ENV_ACTIVATE}\n")
        return 1

    cmd = [
        str(XTTS_ENV_PYTHON),
        str(BASE_DIR / "app" / "xtts_inference.py"),
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
    """Copies a legacy cache latent into a profile-owned latent path if needed."""
    profile_latent = Path(voice_profile_dir) / "latent.pth"
    if profile_latent.exists():
        return profile_latent

    from app.engines import get_speaker_latent_path as _get_path
    legacy_latent = _get_path(speaker_wavs_str)
    if legacy_latent and legacy_latent.exists():
        profile_latent.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(legacy_latent, profile_latent)
        return profile_latent

    return None
