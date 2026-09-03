"""Profile-directory path resolution for speaker voices.

Extracted from app.db.speakers — pure path-logic helpers that traverse the
V2 nested voice layout and enforce containment.  No DB access, no state.json
reads.  speakers.py re-exports these names for backward compatibility.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Optional

from ..utils.pathing import safe_basename, contained_path, find_secure_file

SAFE_PROFILE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")


def _profile_name_or_error(profile_name: str) -> str:
    if not SAFE_PROFILE_NAME_RE.fullmatch(profile_name):
        raise ValueError(f"Invalid profile name: {profile_name}")
    return profile_name


def _profile_dir_has_assets(profile_dir: Path) -> bool:
    if not profile_dir.exists() or not profile_dir.is_dir():
        return False
    if find_secure_file(profile_dir, "profile.json"):
        return True
    # If it's a v2 voice root (voice.json), it's NOT a playable profile directory itself.
    if find_secure_file(profile_dir, "voice.json"):
        return False
    # Check for loose wav discovery
    try:
        for entry in os.scandir(profile_dir):
            if entry.is_file() and entry.name.endswith(".wav"):
                return True
    except OSError:
        pass
    return False


def resolve_existing_profile_dir(voices_dir: Path, profile_name: str) -> Optional[Path]:
    """Resolve an existing profile directory using the V2 nested storage layout.

    Supports three resolution paths:
    1. ``"Dracula - Angry"`` → voices/Dracula/Angry (nested variant)
    2. ``"Dracula"`` → voices/Dracula/Default (or explicit default_variant)
    3. Returns None when the directory does not exist or fails containment.
    """
    profile_name = _profile_name_or_error(profile_name)
    voices_root = os.path.abspath(os.path.realpath(os.fspath(voices_dir)))

    try:
        entries = {e.name: e for e in os.scandir(voices_root) if e.is_dir()}
    except OSError:
        return None

    # V2 Nested resolution: "Dracula - Angry" -> voices/Dracula/Angry
    if " - " in profile_name:
        parts = [s.strip() for s in profile_name.split(" - ", 1)]
        if len(parts) == 2:
            v_name, var_name = parts
            if v_name in entries:
                voice_root = entries[v_name]
                try:
                    voice_root_resolved = os.path.abspath(os.path.realpath(voice_root.path))
                    if voice_root_resolved != voices_root and not voice_root_resolved.startswith(voices_root + os.sep):
                        return None
                    sub_entries = {e.name: e for e in os.scandir(voice_root_resolved) if e.is_dir()}
                    if var_name in sub_entries:
                        nested = sub_entries[var_name]
                        if _profile_dir_has_assets(Path(nested.path)):
                            return Path(nested.path)
                except OSError:
                    pass

    # V2 Base voice default: "Dracula" -> voices/Dracula/Default (or explicit default)
    if profile_name in entries:
        voice_root = entries[profile_name]
        try:
            voice_root_resolved = os.path.abspath(os.path.realpath(voice_root.path))
            if voice_root_resolved != voices_root and not voice_root_resolved.startswith(voices_root + os.sep):
                return None

            voice_root_path = Path(voice_root_resolved)

            if find_secure_file(voice_root_path, "voice.json"):
                sub_entries = {e.name: e for e in os.scandir(voice_root_resolved) if e.is_dir()}
                target_variant = "Default"
                if "Default" not in sub_entries:
                    try:
                        from ..domain.voices.manifest import load_voice_state
                        state = load_voice_state(voice_root_path)
                        if state.get("default_variant"):
                            target_variant = state["default_variant"]
                        else:
                            with open(voice_root_path / "voice.json", "r", encoding="utf-8") as f:
                                v_meta = json.loads(f.read())
                                target_variant = v_meta.get("default_variant", "Default")
                    except Exception:
                        pass
                if target_variant in sub_entries:
                    nested_target = sub_entries[target_variant]
                    if _profile_dir_has_assets(Path(nested_target.path)):
                        return Path(nested_target.path)
        except OSError:
            pass

    return None


def new_profile_dir(voices_dir: Path, profile_name: str) -> Path:
    """Compute the target directory path for a new (not-yet-existing) profile.

    Enforces containment; raises ValueError on invalid names or traversal.
    """
    name = _profile_name_or_error(profile_name)

    try:
        if " - " in name:
            parts = [s.strip() for s in name.split(" - ", 1)]
            if len(parts) == 2:
                safe_part0 = safe_basename(parts[0])
                safe_part1 = safe_basename(parts[1])
                return contained_path(voices_dir, safe_part0, safe_part1)
            else:
                safe_name = safe_basename(name)
                return contained_path(voices_dir, safe_name)
        else:
            safe_name = safe_basename(name)
            return contained_path(voices_dir, safe_name)
    except (OSError, ValueError, RuntimeError):
        raise ValueError(f"Invalid profile path: {profile_name}")
