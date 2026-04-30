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
    try:
        from ...config import VOICES_DIR

        trusted_root = os.path.abspath(os.path.realpath(os.fspath(VOICES_DIR)))
        manifest_path = os.path.abspath(os.path.realpath(os.path.join(os.fspath(voice_dir), VOICE_MANIFEST_FILENAME)))

        if manifest_path.startswith(trusted_root + os.sep):
            if not os.path.exists(manifest_path):
                return {"version": 1}
            with open(manifest_path, "r", encoding="utf-8") as f:
                return json.load(f)
        else:
            logger.warning("Blocking voice manifest load outside voices root: %s", manifest_path)
            return {"version": 1}
    except Exception as e:
        logger.warning("Failed to load voice manifest: %s", e)
        return {"version": 1}


def save_voice_manifest(voice_dir: Path, manifest: Dict[str, Any]) -> bool:
    """Saves the voice manifest to disk atomically."""
    try:
        from ...config import VOICES_DIR

        trusted_root = os.path.abspath(os.path.realpath(os.fspath(VOICES_DIR)))
        manifest_path = os.path.abspath(os.path.realpath(os.path.join(os.fspath(voice_dir), VOICE_MANIFEST_FILENAME)))
        tmp_path = manifest_path + ".tmp"

        if manifest_path.startswith(trusted_root + os.sep) and tmp_path.startswith(trusted_root + os.sep):
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2)
            os.replace(tmp_path, manifest_path)
            return True
        else:
            logger.error("Blocking voice manifest save outside voices root: %s", manifest_path)
            return False
    except Exception as e:
        logger.error("Failed to save voice manifest: %s", e)
        return False


def get_voice_storage_version(voice_dir: Path) -> int:
    """Helper to get the storage version of a voice root."""
    manifest = load_voice_manifest(voice_dir)
    return int(manifest.get("version", 1))


def get_variant_manifest_path(variant_dir: Path) -> Path:
    return variant_dir / VARIANT_MANIFEST_FILENAME


def load_variant_manifest(variant_dir: Path) -> Dict[str, Any]:
    """Loads the variant manifest (profile.json)."""
    try:
        from ...config import VOICES_DIR

        trusted_root = os.path.abspath(os.path.realpath(os.fspath(VOICES_DIR)))
        manifest_path = os.path.abspath(os.path.realpath(os.path.join(os.fspath(variant_dir), VARIANT_MANIFEST_FILENAME)))

        if manifest_path.startswith(trusted_root + os.sep):
            if not os.path.exists(manifest_path):
                return {}
            with open(manifest_path, "r", encoding="utf-8") as f:
                return json.load(f)
        else:
            logger.warning("Blocking variant manifest load outside voices root: %s", manifest_path)
            return {}
    except Exception as e:
        logger.warning("Failed to load variant manifest: %s", e)
        return {}


def save_variant_manifest(variant_dir: Path, manifest: Dict[str, Any]) -> bool:
    """Saves the variant manifest (profile.json) atomically."""
    try:
        from ...config import VOICES_DIR

        trusted_root = os.path.abspath(os.path.realpath(os.fspath(VOICES_DIR)))
        manifest_path = os.path.abspath(
            os.path.realpath(os.path.join(os.fspath(variant_dir), VARIANT_MANIFEST_FILENAME))
        )
        tmp_path = manifest_path + ".tmp"

        if manifest_path.startswith(trusted_root + os.sep) and tmp_path.startswith(trusted_root + os.sep):
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2)
            os.replace(tmp_path, manifest_path)
            return True
        else:
            logger.error("Blocking variant manifest save outside voices root: %s", manifest_path)
            return False
    except Exception as e:
        logger.error("Failed to save variant manifest: %s", e)
        return False
