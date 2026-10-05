"""Voice profile directory resolution helpers.

Split out of the former monolithic ``speakers.py`` (see ``app/db/speakers.py``,
now a thin facade). Owns V2 nested-storage directory resolution: locating an
existing profile directory, creating a new one, and resolving a speaker
name/ID/profile name to the best existing profile identifier.
"""
import os
import logging
from pathlib import Path
from typing import Optional

from ..utils.pathing import safe_basename, find_secure_file, contained_path
from ..core import config
from .speaker_paths import (
    resolve_existing_profile_dir as _resolve_existing_profile_dir,
    new_profile_dir as _new_profile_dir_impl,
    SAFE_PROFILE_NAME_RE as _SPEAKER_PATHS_NAME_RE,
)
from .speaker_naming import looks_like_uuid as _looks_like_uuid_impl

logger = logging.getLogger(__name__)
SAFE_PROFILE_NAME_RE = _SPEAKER_PATHS_NAME_RE


def _looks_like_uuid(value: Optional[str]) -> bool:
    return _looks_like_uuid_impl(value)


def _existing_profile_dir(profile_name: str) -> Optional[Path]:
    """Internal helper to resolve an existing profile directory in V2 nested storage."""
    return _resolve_existing_profile_dir(config.VOICES_DIR, profile_name)


def _new_profile_dir(voices_dir: Path, profile_name: str) -> Path:
    return _new_profile_dir_impl(voices_dir, profile_name)


def _resolve_existing_profile_name(profile_name_or_id: str) -> Optional[str]:
    """Resolve a speaker name/ID/profile name to the best existing profile identifier."""
    from ..db.state import get_settings
    default_settings = get_settings()
    target_profile = profile_name_or_id or default_settings.get("default_speaker_profile") or "Dark Fantasy"

    candidates: list[str] = []

    def add_candidate(name: Optional[str]):
        if name and name not in candidates:
            candidates.append(name)

    add_candidate(target_profile)

    # Cross-module lookups honor a facade-level monkeypatch (mirrors the
    # app.db.state precedent of preferring the facade's current attribute).
    from . import speakers as _speakers_module
    _get_speaker = getattr(_speakers_module, "get_speaker", None)
    _list_speakers = getattr(_speakers_module, "list_speakers", None)
    if _get_speaker is None or _list_speakers is None:
        from .speakers_crud import get_speaker as _get_speaker, list_speakers as _list_speakers

    speaker_name: Optional[str] = None
    speaker_default_profile: Optional[str] = None
    if _looks_like_uuid(target_profile):
        spk = _get_speaker(target_profile)
        if spk:
            speaker_name = spk.get("name")
            speaker_default_profile = spk.get("default_profile_name")
    else:
        spk_match = next((s for s in _list_speakers() if s["name"] == target_profile), None)
        if spk_match:
            speaker_name = spk_match.get("name")
            speaker_default_profile = spk_match.get("default_profile_name")

    if speaker_name:
        add_candidate(speaker_name)
    add_candidate(speaker_default_profile)

    prefix_source = speaker_name or (None if _looks_like_uuid(target_profile) else target_profile)
    voices_root = config.VOICES_DIR
    if prefix_source and voices_root.exists():
        # Nested layout candidates — sanitize prefix_source before joining (Rule 9)
        try:
            _safe_prefix = safe_basename(prefix_source)
        except ValueError:
            _safe_prefix = None
        if _safe_prefix:
            try:
                v_dir_path = contained_path(voices_root, _safe_prefix)
            except ValueError:
                v_dir_path = None
        else:
            v_dir_path = None
        if v_dir_path is not None and v_dir_path.exists() and v_dir_path.is_dir():
            try:
                for entry in sorted(os.scandir(v_dir_path), key=lambda e: e.name):
                    if entry.is_dir():
                        if find_secure_file(Path(entry.path), "profile.json"):
                            add_candidate(f"{prefix_source} - {entry.name}")
            except OSError:
                pass

    _existing_profile_dir_fn = getattr(_speakers_module, "_existing_profile_dir", _existing_profile_dir)
    for candidate in candidates:
        try:
            p = _existing_profile_dir_fn(candidate)
        except ValueError:
            continue
        if p:
            return candidate

    return None


def get_profile_dir(profile_name: str) -> Path:
    """Resolve the directory for a voice profile, supporting canonical name resolution."""
    exact = _existing_profile_dir(profile_name)
    if exact:
        return exact

    resolved_name = _resolve_existing_profile_name(profile_name)
    if resolved_name and resolved_name != profile_name:
        resolved = _existing_profile_dir(resolved_name)
        if resolved:
            return resolved
    return _new_profile_dir(config.VOICES_DIR, profile_name)


def get_profile_wavs(profile_name_or_id: str) -> Optional[str]:
    """Returns a comma-separated string of absolute paths for the given profile or speaker ID."""
    target_profile = _resolve_existing_profile_name(profile_name_or_id)
    if not target_profile:
        return None

    try:
        p = get_profile_dir(target_profile)
    except ValueError:
        return None

    wavs = sorted(w for w in p.glob("*.wav") if w.name != "sample.wav")
    if not wavs:
        wavs = sorted(p.glob("sample.wav"))
    if not wavs:
        return None

    return ",".join([str(w.absolute()) for w in wavs])
