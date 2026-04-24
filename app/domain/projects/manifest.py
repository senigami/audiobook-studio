import json
import logging
import os
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

PROJECT_MANIFEST_FILENAME = "project.json"
CURRENT_STORAGE_VERSION = 2

def get_project_manifest_path(project_dir: Path) -> Path:
    return project_dir / PROJECT_MANIFEST_FILENAME

def load_project_manifest(project_dir: Path) -> Dict[str, Any]:
    """Loads the project manifest from disk, or returns a default v1 manifest if missing."""
    manifest_path = get_project_manifest_path(project_dir)
    if not manifest_path.exists():
        return {"version": 1}

    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning("Failed to load project manifest at %s: %s", manifest_path, e)
        return {"version": 1}

def save_project_manifest(project_dir: Path, manifest: Dict[str, Any]) -> bool:
    """Saves the project manifest to disk atomically."""
    manifest_path = get_project_manifest_path(project_dir)
    tmp_path = manifest_path.with_suffix(".json.tmp")

    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)
        os.replace(tmp_path, manifest_path)
        return True
    except Exception as e:
        logger.error("Failed to save project manifest at %s: %s", manifest_path, e)
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
        return False

def get_storage_version(project_dir: Path) -> int:
    """Helper to get the storage version of a project."""
    manifest = load_project_manifest(project_dir)
    return int(manifest.get("version", 1))
