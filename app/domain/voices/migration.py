from __future__ import annotations
import os
import shutil
import logging
import re
import threading
from pathlib import Path
from typing import Dict, Any, List
from .manifest import (
    load_voice_manifest,
    save_voice_manifest,
    load_variant_manifest,
    save_variant_manifest,
    load_voice_state,
    save_voice_state,
    CURRENT_VOICE_STORAGE_VERSION
)
from ...core import config

# Exposed so tests can patch it directly
VOICES_DIR = config.VOICES_DIR

logger = logging.getLogger(__name__)
SAFE_PROFILE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")


def _load_voice_manifest_with_v1_fallback(voice_dir: Path) -> Dict[str, Any]:
    """Loads the voice manifest, falling back to version 1 if missing for migration."""
    manifest = load_voice_manifest(voice_dir)
    if not manifest:
        return {"version": 1}
    return manifest

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

_migration_lock = threading.Lock()

def migrate_voices_to_v2() -> bool:
    """Migrates all flat voice folders to the nested v2 structure."""
    if not config.VOICES_DIR.exists():
        return True

    if not _migration_lock.acquire(blocking=False):
        # Already migrating in another thread
        return True

    try:
        # 1. Identify all candidate folders
        flat_folders = []
        for entry in config.VOICES_DIR.iterdir():
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
        for entry in config.VOICES_DIR.iterdir():
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
    manifest = _load_voice_manifest_with_v1_fallback(voice_root)
    changed = False

    # Ensure name is present
    if not manifest.get("name"):
        manifest["name"] = voice_root.name
        changed = True

    # Clean up stale root profile.json (leftover from v1 or manual edit)
    stale_root_profile = voice_root / "profile.json"
    if stale_root_profile.exists():
        default_dir = voice_root / "Default"
        if not (default_dir / "profile.json").exists():
            logger.info("Moving stale root profile files to Default for %s", voice_root.name)
            default_dir.mkdir(parents=True, exist_ok=True)
            for entry in list(voice_root.iterdir()):
                if entry.name in {"voice.json", "Default", ".quarantine"}:
                    continue
                if entry.is_dir():
                    # Existing variants must remain siblings of Default.
                    continue
                target = default_dir / entry.name
                if target.exists():
                    logger.warning("Migration collision: %s already exists. Skipping %s", target, entry)
                    continue
                shutil.move(str(entry), str(target))
        else:
            # Already have a Default variant, quarantine the root one
            quarantine_dir = voice_root / ".quarantine"
            quarantine_dir.mkdir(parents=True, exist_ok=True)
            import time
            ts = int(time.time())
            target = quarantine_dir / f"stale_profile_{ts}.json"
            logger.warning("Quarantining stale root profile.json for %s -> %s", voice_root.name, target.name)
            shutil.move(str(stale_root_profile), str(target))

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
    voice_root = config.VOICES_DIR / voice_name
    variant_dir = voice_root / variant_name

    # Ensure voice root exists and has a manifest
    voice_root.mkdir(parents=True, exist_ok=True)
    voice_manifest = _load_voice_manifest_with_v1_fallback(voice_root)
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


# ---------------------------------------------------------------------------
# Phase B — migrate voice.json files to the v1.0 bundle schema
# ---------------------------------------------------------------------------

BUNDLE_SPEC = "audiobook-studio-voice"
BUNDLE_SPEC_VERSION = "1.0"
BUNDLE_TAXONOMY_VERSION = "1.0"

# Fields that belong in voice.json bundle schema
_SCHEMA_FORBIDDEN_FIELDS = {"version", "default_variant"}


def _migrate_one_voice_to_v1_schema(voice_root: Path) -> None:
    """Migrate a single voice root's voice.json to the v1.0 bundle schema.

    Idempotent: voices that already have spec_version=1.0 are only checked for
    residual forbidden fields (``version``, ``default_variant``).

    Decision references:
      D6 — labels[] → tags[]
      D7 — attributes absent (no placeholder)
      D8 — default_variant moves to state.json; integer version dropped
    """
    manifest = load_voice_manifest(voice_root)
    if not manifest:
        return  # no voice.json — skip silently

    changed = False

    # --- D8: add spec identity fields if absent ---
    if manifest.get("spec") != BUNDLE_SPEC:
        manifest["spec"] = BUNDLE_SPEC
        changed = True
    if manifest.get("spec_version") != BUNDLE_SPEC_VERSION:
        manifest["spec_version"] = BUNDLE_SPEC_VERSION
        changed = True
    if manifest.get("taxonomy_version") != BUNDLE_TAXONOMY_VERSION:
        manifest["taxonomy_version"] = BUNDLE_TAXONOMY_VERSION
        changed = True

    # --- D8: move default_variant to state.json ---
    default_variant = manifest.pop("default_variant", None)
    if default_variant is not None:
        state = load_voice_state(voice_root)
        if "default_variant" not in state:
            state["default_variant"] = default_variant
            save_voice_state(voice_root, state)
        changed = True

    # --- D8: drop integer version field (superseded by spec_version) ---
    if "version" in manifest:
        del manifest["version"]
        changed = True

    # --- D6: migrate labels[] to tags[] ---
    labels = manifest.pop("labels", None)
    if labels is not None:
        existing_tags: list = list(manifest.get("tags") or [])
        existing_set = set(existing_tags)
        for label in labels:
            if label and label not in existing_set:
                existing_tags.append(label)
                existing_set.add(label)
        manifest["tags"] = existing_tags
        changed = True

    # --- D7: never write attributes block during migration ---
    # (If a pre-existing migration wrote one accidentally, do NOT remove it here
    # because the voice may have been user-tagged since.  Only omit on fresh migration.)
    # We simply do not add one.

    # --- B1-f: copy preview_audio from default variant's profile.json into samples[] ---
    # Only act if no samples[] present already.
    if not manifest.get("samples"):
        state = load_voice_state(voice_root)
        chosen_variant = state.get("default_variant") or default_variant
        samples: list[dict] = []
        # Check default variant first, then any variant
        variant_dirs = sorted(
            [d for d in voice_root.iterdir() if d.is_dir() and (d / "profile.json").exists()],
            key=lambda d: (d.name != chosen_variant, d.name),
        )
        for variant_dir in variant_dirs:
            profile = load_variant_manifest(variant_dir)
            preview_audio = profile.get("preview_audio")
            if preview_audio:
                entry: dict = {"path": preview_audio}
                preview_text = profile.get("preview_text")
                if preview_text:
                    entry["text"] = preview_text
                # Only the default/first variant's sample is primary
                entry["primary"] = len(samples) == 0
                samples.append(entry)
        if samples:
            manifest["samples"] = samples
            changed = True

    if changed:
        save_voice_manifest(voice_root, manifest)


def migrate_voices_to_v1_schema(voices_root: Path | None = None) -> bool:
    """Migrate all voice.json files under voices_root to the v1.0 bundle schema.

    Idempotent: safe to run multiple times.  Non-destructive: existing fields
    are preserved or moved (not deleted) unless the schema explicitly forbids
    them (``version``, ``default_variant``).

    Args:
        voices_root: Directory containing voice subdirectories.  Defaults to
            ``config.VOICES_DIR`` when not supplied.

    Returns:
        True on success; False if a fatal error prevented completion.
    """
    if voices_root is None:
        voices_root = config.VOICES_DIR

    if not voices_root.exists():
        return True

    try:
        for entry in voices_root.iterdir():
            if not entry.is_dir():
                continue
            if not (entry / "voice.json").exists():
                continue
            try:
                _migrate_one_voice_to_v1_schema(entry)
            except Exception:
                logger.error(
                    "Failed to migrate voice %r to v1 schema", entry.name, exc_info=True
                )
        return True
    except Exception:
        logger.error("migrate_voices_to_v1_schema: fatal error", exc_info=True)
        return False
