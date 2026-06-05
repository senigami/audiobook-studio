import json
import logging
import os
from pathlib import Path
from typing import Dict, Any, Optional

from ...utils.pathing import secure_join_flat
logger = logging.getLogger(__name__)

PROJECT_MANIFEST_FILENAME = "project.json"
CURRENT_STORAGE_VERSION = 2

def get_project_manifest_path(project_dir: Path) -> Path:
    from ...storage.manager import get_storage_manager
    storage = get_storage_manager()
    if not storage.is_safe(project_dir):
         raise ValueError(f"Invalid or out-of-bounds project directory: {project_dir}")

    return secure_join_flat(project_dir, PROJECT_MANIFEST_FILENAME)

def load_project_manifest(project_dir: Path) -> Dict[str, Any]:
    """Loads the project manifest from disk. Returns empty dict if missing."""
    try:
        manifest_path = get_project_manifest_path(project_dir)
        if not manifest_path.exists():
            return {}

        from ...storage.manager import get_storage_manager
        storage = get_storage_manager()
        if storage.is_safe(manifest_path):
            with open(manifest_path, "r", encoding="utf-8") as f:
                return json.load(f)
        else:
            logger.warning("Blocking manifest load outside projects root: %s", manifest_path)
            return {}
    except Exception as e:
        logger.warning("Failed to load project manifest: %s", e)
        return {}

def save_project_manifest(project_dir: Path, manifest: Dict[str, Any]) -> bool:
    """Saves the project manifest to disk atomically."""
    try:
        manifest_path = get_project_manifest_path(project_dir)
        tmp_path = manifest_path.with_suffix(".json.tmp")

        from ...storage.manager import get_storage_manager
        storage = get_storage_manager()
        if storage.is_safe(manifest_path) and storage.is_safe(tmp_path):
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2)
            os.replace(tmp_path, manifest_path)
            return True
        else:
            logger.error("Blocking manifest save outside projects root: %s", manifest_path)
            return False
    except Exception as e:
        logger.error("Failed to save project manifest: %s", e)
        return False

def get_storage_version(project_dir: Path) -> int:
    """Helper to get the storage version of a project. Returns 0 if missing."""
    manifest = load_project_manifest(project_dir)
    return int(manifest.get("version", 0))
