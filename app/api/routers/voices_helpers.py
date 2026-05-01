import os
import logging
import re
import urllib.parse
import json
import time
import uuid
import shutil
from pathlib import Path
from typing import Optional, List, Dict
from fastapi.responses import JSONResponse
from ...db.speakers import (
    infer_speaker_name,
    infer_variant_name,
    DEFAULT_PROFILE_ENGINE,
    VALID_PROFILE_ENGINES,
)
from ...jobs import (
    get_speaker_settings,
    update_speaker_settings,
    DEFAULT_SPEAKER_TEST_TEXT,
    enqueue,
)
from ...engines.bridge import create_voice_bridge
from ... import config
from ...pathing import safe_join_flat, find_secure_file, secure_join_flat
from ...state import put_job
from ...models import Job

logger = logging.getLogger(__name__)

SAFE_PROFILE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")
SAFE_SAMPLE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")

# Compatibility for tests that monkeypatch these
def get_voices_dir() -> Path:
    return config.VOICES_DIR

VOICES_DIR = config.VOICES_DIR 

def _valid_profile_name(name: str) -> str:
    if not SAFE_PROFILE_NAME_RE.fullmatch(name):
        raise ValueError(f"Invalid profile name: {name}")
    return name


def _valid_sample_name(sample_name: str) -> str:
    if not SAFE_SAMPLE_NAME_RE.fullmatch(sample_name):
        raise ValueError(f"Invalid sample name: {sample_name}")
    return sample_name


def _profile_dir_has_assets(profile_dir: Path) -> bool:
    if not profile_dir.exists() or not profile_dir.is_dir():
        return False
    if find_secure_file(profile_dir, "profile.json"):
        return True
    # If it's a v2 voice root (voice.json), it's NOT a playable profile directory itself.
    if find_secure_file(profile_dir, "voice.json"):
        return False
    # For legacy/compatibility and test support, we allow directories to be treated as profiles
    # even if empty or missing profile.json, so they can be discovered/built.
    return True


def _normalize_profile_engine(engine: Optional[str]) -> str:
    normalized = (engine or DEFAULT_PROFILE_ENGINE).strip().lower()
    if normalized not in VALID_PROFILE_ENGINES:
        raise ValueError(f"Invalid profile engine: {engine}")
    return normalized


def _is_engine_active(engine_id: str) -> bool:
    from ...engines.errors import EngineUnavailableError
    bridge = create_voice_bridge()
    try:
        engines = bridge.describe_registry()
    except EngineUnavailableError:
        # If the TTS Server is starting up, we can't get the registry yet.
        # We assume built-in engines are active to avoid blocking
        # voice listing/creation during boot.
        from ...engines.behavior import is_built_in
        return is_built_in(engine_id)
    for e in engines:
        if e["engine_id"] == engine_id:
            return bool(e.get("enabled"))

    # If not in registry, it's definitely not active
    return False


def _has_behavior(engine_id: str, behavior_name: str) -> bool:
    """Helper to check behavior for an engine."""
    from ...engines.behavior import has_behavior
    return has_behavior(engine_id, behavior_name)


def _voice_dirs_map() -> Dict[str, Path]:
    root = get_voices_dir()
    if not root.exists():
        return {}
    dirs: Dict[str, Path] = {}
    for entry in sorted(root.iterdir(), key=lambda e: e.name):
        if entry.is_dir() and SAFE_PROFILE_NAME_RE.fullmatch(entry.name):
            if find_secure_file(entry, "voice.json"):
                for sub in entry.iterdir():
                    if sub.is_dir() and _profile_dir_has_assets(sub):
                        name = f"{entry.name} - {sub.name}"
                        if sub.name == "Default":
                            name = entry.name
                        dirs[name] = sub.resolve()
            elif _profile_dir_has_assets(entry):
                dirs[entry.name] = entry.resolve()
    return dirs


def _existing_voice_profile_dir(name: str) -> Optional[Path]:
    return _voice_dirs_map().get(_valid_profile_name(name))


def _new_voice_profile_dir(name: str) -> Path:
    candidate = _valid_profile_name(name)
    root = get_voices_dir()
    if " - " in candidate:
        voice_name, variant_name = candidate.split(" - ", 1)
        voice_name = voice_name.strip()
        variant_name = variant_name.strip()
        from ...config import get_voice_storage_version
        if get_voice_storage_version(voice_name) >= 2:
            try:
                voice_root = secure_join_flat(root, voice_name)
                voice_root.resolve().relative_to(root.resolve())
                voice_root.mkdir(parents=True, exist_ok=True)
                from ...domain.voices.manifest import save_voice_manifest
                if not find_secure_file(voice_root, "voice.json"):
                    save_voice_manifest(voice_root, {"version": 2, "name": voice_name})
                dest = secure_join_flat(voice_root, variant_name)
                dest.resolve().relative_to(voice_root.resolve())
                return dest
            except (ValueError, OSError, RuntimeError) as e:
                 raise ValueError(str(e))
        if find_secure_file(root, candidate):
             return secure_join_flat(root, candidate)
        try:
            voice_root = secure_join_flat(root, voice_name)
            voice_root.resolve().relative_to(root.resolve())
            voice_root.mkdir(parents=True, exist_ok=True)
            from ...domain.voices.manifest import save_voice_manifest
            if not find_secure_file(voice_root, "voice.json"):
                save_voice_manifest(voice_root, {"version": 2, "name": voice_name})
            dest = secure_join_flat(voice_root, variant_name)
            dest.resolve().relative_to(voice_root.resolve())
            return dest
        except (ValueError, OSError, RuntimeError) as e:
             raise ValueError(str(e))
    return secure_join_flat(root, candidate)


def _cleanup_voice_root(root: Path):
    if not root.exists() or not root.is_dir() or root == get_voices_dir():
        return
    has_variants = False
    for sub in root.iterdir():
        if sub.is_dir() and find_secure_file(sub, "profile.json"):
            has_variants = True
            break
    if not has_variants:
        remaining = [f for f in root.iterdir() if f.name != ".DS_Store"]
        if not remaining or (len(remaining) == 1 and remaining[0].name == "voice.json"):
            import os
            import shutil
            trusted_voices_root = os.path.abspath(os.fspath(get_voices_dir()))
            resolved_root = os.path.abspath(os.fspath(root))

            if resolved_root.startswith(trusted_voices_root + os.sep) and resolved_root != trusted_voices_root:
                try:
                    shutil.rmtree(resolved_root)
                except Exception:
                    logger.warning("Failed to cleanup empty voice root: %s", resolved_root)

def _voice_file_map(profile_dir: Optional[Path]) -> Dict[str, Path]:
    if not profile_dir or not profile_dir.exists():
        return {}
    files: Dict[str, Path] = {}
    for entry in profile_dir.iterdir():
        if entry.is_file():
            try:
                res = entry.resolve()
                res.relative_to(profile_dir.resolve())
                files[entry.name] = res
            except (ValueError, OSError, RuntimeError):
                continue
    return files


def _existing_voice_sample_path(name: str, sample_name: str) -> Optional[Path]:
    return _voice_file_map(_existing_voice_profile_dir(name)).get(_valid_sample_name(sample_name))


def _new_voice_sample_path(profile_dir: Path, sample_name: str) -> Path:
    return secure_join_flat(profile_dir, sample_name)


def _voice_raw_sample_count(name: str) -> int:
    try:
        profile_dir = _existing_voice_profile_dir(name)
    except ValueError:
        return 0
    if not profile_dir:
        return 0
    return len([
        f for f in profile_dir.iterdir()
        if f.is_file() and f.suffix.lower() == ".wav" and f.name != "sample.wav"
    ])


def _voice_preview_url(name: str) -> Optional[str]:
    profile_dir = _existing_voice_profile_dir(name)
    if not profile_dir:
        return None
    try:
        root = get_voices_dir()
        rel_path = profile_dir.relative_to(root)
        url_path = rel_path.as_posix()
    except ValueError:
        url_path = name
    files = _voice_file_map(profile_dir)
    if "sample.mp3" in files:
        return f"/out/voices/{url_path}/sample.mp3"
    if "sample.wav" in files:
        return f"/out/voices/{url_path}/sample.wav"
    return None


def _voice_asset_base_url(profile_dir: Path) -> str:
    try:
        root = get_voices_dir()
        rel_path = profile_dir.relative_to(root)
        url_path = urllib.parse.quote(rel_path.as_posix(), safe="/")
    except ValueError:
        url_path = urllib.parse.quote(profile_dir.name, safe="/")
    return f"/out/voices/{url_path}"


def _voice_has_latent(name: str) -> bool:
    profile_dir = _existing_voice_profile_dir(name)
    if not profile_dir:
        return False
    return (_voice_file_map(profile_dir).get("latent.pth") or _new_voice_sample_path(profile_dir, "latent.pth")).exists()


def _voice_has_generation_material(name: str) -> bool:
    settings = get_speaker_settings(name)
    engine = settings.get("engine", DEFAULT_PROFILE_ENGINE)
    if not _is_engine_active(engine):
        return False
    bridge = create_voice_bridge()
    try:
        profile_dir = _existing_voice_profile_dir(name)
        if not profile_dir:
            return False
        ready, _ = bridge.check_readiness(
            engine_id=engine,
            profile_id=name,
            settings=settings,
            profile_dir=str(profile_dir)
        )
        return ready
    except Exception as exc:
        logger.warning("Failed to check voice readiness for %s: %s", name, exc)
        return False


def _voice_job_title(name: str, action: str = "Building voice for") -> str:
    settings = get_speaker_settings(name)
    variant_name = str(settings.get("variant_name") or infer_variant_name(name) or "Default").strip() or "Default"
    speaker_name = infer_speaker_name(name, settings).strip() or name
    return f"{action} {speaker_name}: {variant_name}"

def delete_speaker_sample(
    name: str,
    sample_name: str,
):
    try:
        try:
            profile_dir = _existing_voice_profile_dir(name)
            if not profile_dir:
                 return JSONResponse({"status": "error", "message": "Profile not found"}, status_code=404)

            import os
            trusted_voices_root = os.path.abspath(os.fspath(get_voices_dir()))
            resolved_pdir = os.path.abspath(os.fspath(profile_dir))

            if not resolved_pdir.startswith(trusted_voices_root + os.sep):
                 return JSONResponse({"status": "error", "message": "Access denied"}, status_code=403)

            sample_filename = _valid_sample_name(sample_name)
            target_path = os.path.normpath(os.path.join(resolved_pdir, sample_filename))

            if not target_path.startswith(resolved_pdir + os.sep):
                 return JSONResponse({"status": "error", "message": "Invalid sample path"}, status_code=403)

            if os.path.exists(target_path) and os.path.isfile(target_path):
                os.unlink(target_path)
                return JSONResponse({"status": "ok"})
            return JSONResponse({"status": "error", "message": "File not found"}, status_code=404)
        except ValueError:
            return JSONResponse({"status": "error", "message": "Invalid path"}, status_code=403)
    except Exception as e:
        logger.error(f"Delete failed for {name}/{sample_name}: {e}")
        return JSONResponse({"status": "error", "message": "Delete failed"}, status_code=500)
