import json
import logging
import os
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

VOICE_MANIFEST_FILENAME = "voice.json"
VARIANT_MANIFEST_FILENAME = "profile.json"
CURRENT_VOICE_STORAGE_VERSION = 2

def get_voice_manifest_path(voice_dir: Path) -> Path:
    return voice_dir / VOICE_MANIFEST_FILENAME

def load_voice_manifest(voice_dir: Path) -> Dict[str, Any]:
    """Loads the voice manifest from disk, or returns a default v1 manifest if missing."""
    manifest_path = get_voice_manifest_path(voice_dir)
    if not manifest_path.exists():
        return {"version": 1}

    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning("Failed to load voice manifest at %s: %s", manifest_path, e)
        return {"version": 1}

def save_voice_manifest(voice_dir: Path, manifest: Dict[str, Any]) -> bool:
    """Saves the voice manifest to disk atomically."""
    manifest_path = get_voice_manifest_path(voice_dir)
    tmp_path = manifest_path.with_suffix(".json.tmp")

    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)
        os.replace(tmp_path, manifest_path)
        return True
    except Exception as e:
        logger.error("Failed to save voice manifest at %s: %s", manifest_path, e)
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
        return False

def get_voice_storage_version(voice_dir: Path) -> int:
    """Helper to get the storage version of a voice root."""
    manifest = load_voice_manifest(voice_dir)
    return int(manifest.get("version", 1))

def get_variant_manifest_path(variant_dir: Path) -> Path:
    return variant_dir / VARIANT_MANIFEST_FILENAME

def load_variant_manifest(variant_dir: Path) -> Dict[str, Any]:
    """Loads the variant manifest (profile.json)."""
    manifest_path = get_variant_manifest_path(variant_dir)
    if not manifest_path.exists():
        return {}

    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning("Failed to load variant manifest at %s: %s", manifest_path, e)
        return {}

def save_variant_manifest(variant_dir: Path, manifest: Dict[str, Any]) -> bool:
    """Saves the variant manifest (profile.json) atomically."""
    manifest_path = get_variant_manifest_path(variant_dir)
    tmp_path = manifest_path.with_suffix(".json.tmp")

    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)
        os.replace(tmp_path, manifest_path)
        return True
    except Exception as e:
        logger.error("Failed to save variant manifest at %s: %s", manifest_path, e)
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
        return False
