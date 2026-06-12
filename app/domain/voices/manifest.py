import json
import logging
import os
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)

VOICE_MANIFEST_FILENAME = "voice.json"
VARIANT_MANIFEST_FILENAME = "profile.json"
CURRENT_VOICE_STORAGE_VERSION = 2

def get_voice_manifest_path(voice_dir: Path) -> Path:
    return voice_dir / VOICE_MANIFEST_FILENAME

def load_voice_manifest(voice_dir: Path) -> Dict[str, Any]:
    """Loads the voice manifest from disk. Returns empty dict if missing."""
    try:
        from ...core.config import VOICES_DIR

        trusted_root = os.path.abspath(os.path.realpath(os.fspath(VOICES_DIR)))
        manifest_path = os.path.abspath(os.path.realpath(os.path.join(os.fspath(voice_dir), VOICE_MANIFEST_FILENAME)))

        if manifest_path.startswith(trusted_root + os.sep):
            if not os.path.exists(manifest_path):
                return {}
            with open(manifest_path, "r", encoding="utf-8") as f:
                return json.load(f)
        else:
            logger.warning("Blocking voice manifest load outside voices root: %s", manifest_path)
            return {}
    except Exception as e:
        logger.warning("Failed to load voice manifest: %s", e)
        return {}


def save_voice_manifest(voice_dir: Path, manifest: Dict[str, Any]) -> bool:
    """Saves the voice manifest to disk atomically."""
    try:
        from ...core.config import VOICES_DIR

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


def load_and_validate_voice_manifest(voice_dir: Path) -> Tuple[Dict[str, Any], bool]:
    """Load voice.json and apply lenient taxonomy validation (Phase A, A2+A3).

    Performs:
    - Loads raw manifest from disk via ``load_voice_manifest``.
    - Checks ``taxonomy_version`` compatibility (warning only; loads regardless).
    - Validates ``attributes`` against controlled vocabulary; unknown enum values
      are demoted to ``tags[]`` rather than causing a load failure (taxonomy §5).
    - Sets ``_untagged`` sentinel (True) when required attributes are absent (D7).
    - Stores ``_taxonomy_version`` on the returned dict for caller inspection.

    Returns:
        (manifest_dict, is_untagged)
    """
    from .taxonomy import check_taxonomy_version, validate_and_degrade_attributes

    manifest = load_voice_manifest(voice_dir)
    if not manifest:
        return manifest, True  # missing file → treat as untagged

    taxonomy_version = manifest.get("taxonomy_version")
    check_taxonomy_version(taxonomy_version)

    attributes = manifest.get("attributes")
    tags = list(manifest.get("tags") or [])

    cleaned_attrs, updated_tags, is_untagged = validate_and_degrade_attributes(
        attributes, tags
    )

    # Mutate in place — manifest is a fresh dict from json.load
    if cleaned_attrs is not None:
        manifest["attributes"] = cleaned_attrs
    elif "attributes" in manifest:
        del manifest["attributes"]

    manifest["tags"] = updated_tags
    manifest["_untagged"] = is_untagged
    manifest["_taxonomy_version"] = taxonomy_version

    return manifest, is_untagged


def get_voice_storage_version(voice_dir: Path) -> int:
    """Helper to get the storage version of a voice root. Returns 0 if missing."""
    manifest = load_voice_manifest(voice_dir)
    return int(manifest.get("version", 0))


def get_variant_manifest_path(variant_dir: Path) -> Path:
    return variant_dir / VARIANT_MANIFEST_FILENAME


def load_variant_manifest(variant_dir: Path) -> Dict[str, Any]:
    """Loads the variant manifest (profile.json)."""
    try:
        from ...core.config import VOICES_DIR

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
        from ...core.config import VOICES_DIR

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
