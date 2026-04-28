from __future__ import annotations
import os
import shutil
import logging
import re
from pathlib import Path
from typing import Dict, Any, List
from .manifest import (
    load_voice_manifest,
    save_voice_manifest,
    load_variant_manifest,
    save_variant_manifest,
    CURRENT_VOICE_STORAGE_VERSION
)
from ...config import VOICES_DIR

logger = logging.getLogger(__name__)
SAFE_PROFILE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")

def _move_profile_contents(src_dir: Path, dest_dir: Path, *, preserve_names: set[str] | None = None) -> None:
    """Move all files/directories from src_dir into dest_dir.

    This is used for voice root migrations where the destination lives inside
    the source tree (for example ``voices/Test`` -> ``voices/Test/Default``).
    """
    dest_dir.mkdir(parents=True, exist_ok=True)
    preserve = set(preserve_names or set())
    for entry in list(src_dir.iterdir()):
        if entry.name in preserve:
            continue
        if entry.resolve() == dest_dir.resolve():
            continue
        target = dest_dir / entry.name
        if target.exists():
            logger.warning("Migration collision: %s already exists. Skipping %s", target, entry)
            continue
        shutil.move(str(entry), str(target))

import threading

_migration_lock = threading.Lock()

def migrate_voices_to_v2() -> bool:
    """Migrates all flat voice folders to the nested v2 structure."""
    if not VOICES_DIR.exists():
        return True

    if not _migration_lock.acquire(blocking=False):
        # Already migrating in another thread
        return True

    try:
        # 1. Identify all candidate folders
        flat_folders = []
        for entry in VOICES_DIR.iterdir():
            if not entry.is_dir():
                continue
            if not SAFE_PROFILE_NAME_RE.fullmatch(entry.name):
                continue

            # If it doesn't have a voice.json, it's a legacy structure (v1)
            if not (entry / "voice.json").exists():
                flat_folders.append(entry)

        for folder in flat_folders:
            if " - " in folder.name:
                voice_name, variant_name = folder.name.split(" - ", 1)
                voice_name = voice_name.strip()
                variant_name = variant_name.strip()
            else:
                voice_name = folder.name
                variant_name = "Default"

            migrate_voice_variant(folder, voice_name, variant_name)

        # 2. Backfill existing v2 roots to ensure default_variant and speaker_id consistency
        for entry in VOICES_DIR.iterdir():
            if entry.is_dir() and (entry / "voice.json").exists():
                _backfill_voice_root(entry)

        return True
    except Exception as e:
        logger.error("Failed to migrate voices to v2: %s", e, exc_info=True)
        return False
    finally:
        _migration_lock.release()

def _backfill_voice_root(voice_root: Path) -> None:
    """Ensures a v2 voice root manifest is complete and consistent."""
    manifest = load_voice_manifest(voice_root)
    changed = False

    # Ensure name is present
    if not manifest.get("name"):
        manifest["name"] = voice_root.name
        changed = True

    # Sync speaker_id and default_variant if missing
    subdirs = sorted([d for d in voice_root.iterdir() if d.is_dir() and (d / "profile.json").exists()], key=lambda d: d.name)
    if subdirs:
        # Default variant backfill
        if not manifest.get("default_variant"):
            # Prefer 'Default' if it exists, otherwise first subfolder
            defaults = [d for d in subdirs if d.name == "Default"]
            manifest["default_variant"] = defaults[0].name if defaults else subdirs[0].name
            changed = True

        # Speaker ID backfill from first available variant
        if not manifest.get("id"):
            for sd in subdirs:
                meta = load_variant_manifest(sd)
                if meta.get("speaker_id"):
                    manifest["id"] = meta["speaker_id"]
                    changed = True
                    break

    if changed:
        logger.info("Backfilled manifest for voice root %s", voice_root.name)
        save_voice_manifest(voice_root, manifest)

def migrate_voice_variant(src_dir: Path, voice_name: str, variant_name: str) -> bool:
    """Migrates a single flat voice folder to its nested destination."""
    voice_root = VOICES_DIR / voice_name
    variant_dir = voice_root / variant_name

    # Ensure voice root exists and has a manifest
    voice_root.mkdir(parents=True, exist_ok=True)
    voice_manifest = load_voice_manifest(voice_root)
    meta = load_variant_manifest(src_dir)
    voice_manifest["version"] = CURRENT_VOICE_STORAGE_VERSION
    voice_manifest["name"] = voice_name
    voice_manifest["default_variant"] = variant_name or "Default"
    # Attempt to find speaker_id from profile.json
    if "speaker_id" in meta:
        voice_manifest["id"] = meta["speaker_id"]
    save_voice_manifest(voice_root, voice_manifest)

    # If the source already is the destination, nothing to move.
    if src_dir.resolve() == variant_dir.resolve():
        meta = load_variant_manifest(variant_dir)
        meta["variant_name"] = variant_name
        save_variant_manifest(variant_dir, meta)
        return True

    # If the destination already exists and is not the source, merge by moving
    # the current contents over. This handles partially migrated roots safely.
    if variant_dir.exists() and variant_dir != src_dir:
        logger.info("Merging %s into existing %s", src_dir, variant_dir)
        _move_profile_contents(src_dir, variant_dir, preserve_names={"voice.json"} if src_dir == voice_root else None)
    else:
        logger.info("Moving %s to %s", src_dir, variant_dir)
        _move_profile_contents(src_dir, variant_dir, preserve_names={"voice.json"} if src_dir == voice_root else None)

    # Remove the legacy source directory if it is now empty and not the voice root.
    if src_dir != voice_root:
        try:
            if src_dir.exists() and not any(src_dir.iterdir()):
                src_dir.rmdir()
        except OSError:
            shutil.rmtree(src_dir, ignore_errors=True)

    # Update variant manifest
    meta = load_variant_manifest(variant_dir)
    meta["variant_name"] = variant_name
    save_variant_manifest(variant_dir, meta)

    return True
