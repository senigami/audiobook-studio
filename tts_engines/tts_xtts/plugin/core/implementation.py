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
from .diagnostics import emit_diagnostics
# Engine environment resolution
XTTS_ENV_DIR_DEFAULT = Path.home() / "xtts-env"
XTTS_ENV_DIR = Path(os.getenv("XTTS_ENV_DIR", str(XTTS_ENV_DIR_DEFAULT)))
XTTS_ENV_PYTHON = Path(os.getenv("XTTS_ENV_PYTHON", str(XTTS_ENV_DIR / ("Scripts/python.exe" if os.name == "nt" else "bin/python"))))
XTTS_ENV_ACTIVATE = XTTS_ENV_DIR / ("Scripts/Activate.ps1" if os.name == "nt" else "bin/activate")


def _xtts_env_site_packages_candidates(env_python: Path) -> list[Path]:
    """Return every plausible ``site-packages`` dir for the xtts-env interpreter.

    Layout differs by platform (``lib/pythonX.Y/site-packages`` on POSIX,
    ``Lib/site-packages`` on Windows) and the exact minor version isn't known
    up front, so this globs rather than hardcoding a path. Returns ALL
    matches (not just the first) so a stale ``lib/pythonX.Y`` left behind by
    a Python upgrade — re-provisioned into a new ``lib/pythonX.Z`` dir in the
    same env root — doesn't shadow the real one and falsely report not-ready.
    """
    env_root = env_python.parent.parent
    if os.name == "nt":
        candidate = env_root / "Lib" / "site-packages"
        return [candidate] if candidate.is_dir() else []
    return sorted(env_root.glob("lib/python*/site-packages"))


def xtts_env_ready() -> tuple[bool, str]:
    """Check whether the external xtts-env has XTTS's inference deps installed.

    Real inference always shells out to ``XTTS_ENV_PYTHON`` as a subprocess
    (see ``run_xtts_inference`` below) -- this process never imports
    ``TTS``/``torch`` itself. Readiness is therefore checked by looking for
    the installed package on disk in that *external* env, never by importing
    it in the current (server) process: an in-process import would silently
    check the wrong interpreter (the app's own venv, which never receives
    these heavy deps -- see ``run.sh``), and a subprocess import would be far
    too slow for a check called on every ``/synthesize`` request and every
    5-second health poll.

    Looks for the ``coqui_tts-*.dist-info`` marker rather than a bare ``TTS``
    package dir: pip populates a package's files progressively during
    install but writes its ``dist-info`` only once the install completes, so
    this avoids reporting "ready" mid-install (which would otherwise flap
    ready/not-ready on the 5s heartbeat and could accept a synthesis request
    that then fails deep in the subprocess instead of surfacing needs_setup).
    """
    if not XTTS_ENV_PYTHON.exists():
        return False, (
            f"XTTS environment not found at {XTTS_ENV_PYTHON}. "
            "Run ./run.sh (or ./run.ps1) to provision it."
        )

    for site_packages in _xtts_env_site_packages_candidates(XTTS_ENV_PYTHON):
        if any(site_packages.glob("coqui_tts-*.dist-info")):
            return True, "OK"

    return False, (
        "XTTS dependencies not found in the xtts-env. "
        "Run ./run.sh (or ./run.ps1) to provision it."
    )

# Module-level warm worker manager (lazy singleton).
# Replaced/cleared in tests via _reset_warm_worker() below.
_warm_worker_manager: "Any | None" = None
_warm_worker_lock = __import__("threading").Lock()


def _get_warm_worker_manager(idle_seconds: int = 300):
    """Return the module-level WarmWorkerManager, creating it on first call."""
    global _warm_worker_manager
    with _warm_worker_lock:
        if _warm_worker_manager is None:
            from .warm_worker import WarmWorkerManager  # noqa: PLC0415
            env = os.environ.copy()
            env["PYTHONUNBUFFERED"] = "1"
            # Read concurrency cap from this plugin's own manifest behavior block.
            # Every current manifest declares max_concurrent_workers=1, so this
            # ships dark (cap=1 → single-worker, serialized, byte-identical).
            try:
                _cap = max(1, int(_get_local_behavior().get("max_concurrent_workers", 1)))
            except Exception:
                _cap = 1
            _warm_worker_manager = WarmWorkerManager(
                XTTS_ENV_PYTHON,
                idle_seconds=idle_seconds,
                env=env,
                cap=_cap,
            )
        return _warm_worker_manager


def _reset_warm_worker() -> None:
    """Shut down and discard the warm worker — for tests."""
    global _warm_worker_manager
    with _warm_worker_lock:
        if _warm_worker_manager is not None:
            try:
                _warm_worker_manager.shutdown()
            except Exception:
                pass
            _warm_worker_manager = None



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
    engine_settings: dict[str, Any] | None = None,
) -> int:
    """Invoke XTTS inference via subprocess."""

    import sys
    python_exe = XTTS_ENV_PYTHON

    if not XTTS_ENV_ACTIVATE.exists():
        # Fallback: check if TTS is available in the current environment
        try:
            import TTS  # noqa: F401, PLC0415
            python_exe = Path(sys.executable)
            emit_diagnostics(on_output, "XTTS environment not found; falling back to current environment (TTS detected).\n")
        except ImportError:
            emit_diagnostics(on_output, f"[error] XTTS activate not found: {XTTS_ENV_ACTIVATE} and 'TTS' not found in current environment.\n")
            return 1

    sw = speaker_wav

    if not sw and voice_profile_dir is None:
        emit_diagnostics(on_output, "[error] No speaker profile or reference WAV provided\n")
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
    emit_diagnostics(on_output, "Launching XTTS inference...\n")
    emit_diagnostics(on_output, "XTTS may take a while on first use while models load, caches warm, or assets download.\n")

    # Warm-worker path: if keep_model_loaded is enabled, try to run through the
    # persistent worker instead of a fresh subprocess.
    # Settings come from engine_settings (request) if provided, else manifest behavior.
    # XTTS_WARM_WORKER_DISABLED=1 disables the path entirely (used in unit tests).
    _settings = engine_settings or {}
    behavior = _get_local_behavior()
    _disabled_by_env = os.environ.get("XTTS_WARM_WORKER_DISABLED", "") == "1"
    keep_loaded = (not _disabled_by_env) and bool(_settings.get("keep_model_loaded", behavior.get("keep_model_loaded", True)))
    if keep_loaded:
        idle_secs = int(_settings.get("keep_model_loaded_idle_seconds", behavior.get("keep_model_loaded_idle_seconds", 300)))
        if idle_secs > 0:
            job: dict[str, Any] = {
                "text": text,
                "language": "en",
                "repetition_penalty": 2.0,
                "speed": speed,
                "out_path": str(out_wav),
            }
            if speaker_wav:
                job["speaker_wav"] = speaker_wav
            if voice_profile_dir is not None:
                job["voice_profile_dir"] = str(voice_profile_dir)
            if task_id:
                job["task_id"] = task_id
            manager = _get_warm_worker_manager(idle_secs)
            rc = manager.run_job(job, on_output, cancel_check)
            if rc != -1:  # -1 signals fallback to one-shot
                return rc
            # Fallback: manager signalled worker crash — fall through to one-shot.
            emit_diagnostics(on_output, "Warm worker unavailable; falling back to one-shot subprocess.\n")

    return run_cmd_stream(cmd, on_output, cancel_check, env=env)


def xtts_generate_script(
    script_json_path: Path,
    out_wav: Path,
    on_output: Callable[[str], None],
    cancel_check: Callable[[], bool],
    speed: float = 1.0,
    voice_profile_dir: Path | None = None,
    task_id: str | None = None,
    engine_settings: dict[str, Any] | None = None,
) -> int:
    """Invoke XTTS script-based inference via subprocess."""

    import sys
    python_exe = XTTS_ENV_PYTHON

    if not XTTS_ENV_ACTIVATE.exists():
        # Fallback: check if TTS is available in the current environment
        try:
            import TTS  # noqa: F401, PLC0415
            python_exe = Path(sys.executable)
            emit_diagnostics(on_output, "XTTS environment not found; falling back to current environment (TTS detected).\n")
        except ImportError:
            emit_diagnostics(on_output, f"[error] XTTS activate not found: {XTTS_ENV_ACTIVATE} and 'TTS' not found in current environment.\n")
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
    emit_diagnostics(on_output, "Launching XTTS inference...\n")
    emit_diagnostics(on_output, "XTTS may take a while on first use while models load, caches warm, or assets download.\n")

    # Warm-worker path for script-based synthesis.
    _settings2 = engine_settings or {}
    behavior = _get_local_behavior()
    _disabled_by_env2 = os.environ.get("XTTS_WARM_WORKER_DISABLED", "") == "1"
    keep_loaded = (not _disabled_by_env2) and bool(_settings2.get("keep_model_loaded", behavior.get("keep_model_loaded", True)))
    if keep_loaded:
        idle_secs = int(_settings2.get("keep_model_loaded_idle_seconds", behavior.get("keep_model_loaded_idle_seconds", 300)))
        if idle_secs > 0:
            script_job: dict[str, Any] = {
                "script_json": str(script_json_path),
                "language": "en",
                "repetition_penalty": 2.0,
                "speed": speed,
                "out_path": str(out_wav),
            }
            if voice_profile_dir is not None:
                script_job["voice_profile_dir"] = str(voice_profile_dir)
            if task_id:
                script_job["task_id"] = task_id
            manager = _get_warm_worker_manager(idle_secs)
            rc = manager.run_job(script_job, on_output, cancel_check)
            if rc != -1:
                return rc
            emit_diagnostics(on_output, "Warm worker unavailable; falling back to one-shot subprocess.\n")

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
