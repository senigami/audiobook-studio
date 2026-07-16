"""Reconciliation between on-disk voice profiles and the ``speakers`` table.

Split out of the former monolithic ``speakers.py`` (see ``app/db/speakers.py``,
now a thin facade).
"""
import json
import logging
import sqlite3
from pathlib import Path
from typing import Dict, Any, Optional

from .core import _db_lock, get_connection
from ..utils.pathing import find_secure_file
from ..core import config
from .speaker_paths import _profile_dir_has_assets
from .speaker_naming import infer_speaker_name, is_default_profile_name
from .speakers_paths import SAFE_PROFILE_NAME_RE, _looks_like_uuid
from .speakers_settings import normalize_profile_metadata
from .speakers_crud import create_speaker, get_speaker, update_speaker

logger = logging.getLogger(__name__)


def sync_speakers_from_profiles(voices_dir: Optional[Path] = None) -> None:

    root = voices_dir or config.VOICES_DIR
    if not root.exists():
        return

    # Gather all profile directories (V2 only)
    all_profile_dirs = []
    for entry in root.iterdir():
        if not entry.is_dir() or not SAFE_PROFILE_NAME_RE.fullmatch(entry.name):
            continue

        # Check if it's a voice root (has voice.json)
        if find_secure_file(entry, "voice.json"):
            for sub in entry.iterdir():
                if sub.is_dir() and _profile_dir_has_assets(sub):
                    all_profile_dirs.append(sub)

    if not all_profile_dirs:
        return

    voice_dirs = sorted(all_profile_dirs, key=lambda entry: entry.name.lower())

    if not voice_dirs:
        return

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM speakers ORDER BY name ASC")
            speakers = [dict(row) for row in cursor.fetchall()]

            speakers_by_id = {speaker["id"]: speaker for speaker in speakers}
            speakers_by_name = {speaker["name"]: speaker for speaker in speakers}

            for profile_dir in voice_dirs:
                # Map nested storage to profile identifiers
                if profile_dir.parent == root:
                    profile_name = profile_dir.name
                else:
                    profile_name = f"{profile_dir.parent.name} - {profile_dir.name}"
                    if profile_dir.name == "Default":
                        profile_name = profile_dir.parent.name

                import os
                trusted_voices_root = os.path.abspath(os.fspath(root))
                resolved_pdir = os.path.abspath(os.fspath(profile_dir))

                if not resolved_pdir.startswith(trusted_voices_root + os.sep):
                    continue

                meta_path_full = os.path.normpath(os.path.join(resolved_pdir, "profile.json"))
                if not meta_path_full.startswith(resolved_pdir + os.sep):
                    continue

                meta: Dict[str, Any] = {}
                if os.path.exists(meta_path_full):
                    try:
                        with open(meta_path_full, "r", encoding="utf-8") as f:
                            meta = json.loads(f.read())
                    except Exception:
                        logger.warning("Failed to read speaker metadata for %s", meta_path_full, exc_info=True)
                        meta = {}

                # Create a copy of the original metadata on disk
                orig_meta = json.loads(json.dumps(meta))

                meta = normalize_profile_metadata(profile_name, meta, persist=False)
                speaker_name = infer_speaker_name(profile_name, meta)
                is_default_profile = is_default_profile_name(profile_name, meta)
                desired_default_profile_name = profile_name if is_default_profile else None

                raw_speaker_id = meta.get("speaker_id")
                speaker: Optional[Dict[str, Any]] = None

                if isinstance(raw_speaker_id, str) and raw_speaker_id in speakers_by_id:
                    speaker = speakers_by_id[raw_speaker_id]
                elif speaker_name in speakers_by_name:
                    speaker = speakers_by_name[speaker_name]
                else:
                    desired_id = raw_speaker_id if _looks_like_uuid(raw_speaker_id) else None
                    try:
                        created_id = create_speaker(
                            speaker_name,
                            default_profile_name=desired_default_profile_name or profile_name,
                            speaker_id=desired_id,
                        )
                        speaker = get_speaker(created_id)
                    except sqlite3.IntegrityError:
                        speaker = get_speaker(desired_id) if desired_id else None
                        if not speaker and speaker_name in speakers_by_name:
                            speaker = speakers_by_name[speaker_name]
                    if not speaker:
                        continue
                    speakers_by_id[speaker["id"]] = speaker
                    speakers_by_name[speaker["name"]] = speaker

                updates: Dict[str, Any] = {}
                if desired_default_profile_name and speaker.get("default_profile_name") != desired_default_profile_name:
                    updates["default_profile_name"] = desired_default_profile_name
                elif not speaker.get("default_profile_name"):
                    updates["default_profile_name"] = profile_name

                if updates:
                    update_speaker(speaker["id"], **updates)
                    speaker.update(updates)
                    speakers_by_id[speaker["id"]] = speaker
                    speakers_by_name[speaker["name"]] = speaker

                if orig_meta.get("speaker_id") != speaker["id"] or not os.path.exists(meta_path_full):
                    orig_meta["speaker_id"] = speaker["id"]
                    if orig_meta.get("engine"):
                        from ..engines.behavior import setting_aliases_for
                        aliases = setting_aliases_for(orig_meta["engine"])
                        for source, target in aliases.items():
                            if source in orig_meta and target not in orig_meta:
                                orig_meta[target] = orig_meta.pop(source)
                    try:
                        os.makedirs(os.path.dirname(meta_path_full), exist_ok=True)
                        with open(meta_path_full, "w", encoding="utf-8") as f:
                            f.write(json.dumps(orig_meta, indent=2))
                    except Exception:
                        logger.warning("Failed to persist synchronized speaker metadata for %s", meta_path_full, exc_info=True)

def update_voice_profile_references(old_name: str, new_name: str):
    """Updates all references to a voice profile name in the database."""
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            # 1. Update characters table
            cursor.execute("UPDATE characters SET speaker_profile_name = ? WHERE speaker_profile_name = ?", (new_name, old_name))
            # 2. Update chapter_segments table
            cursor.execute("UPDATE chapter_segments SET speaker_profile_name = ? WHERE speaker_profile_name = ?", (new_name, old_name))
            conn.commit()
