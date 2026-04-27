import json
import logging
import os
from pathlib import Path
from typing import Dict, Any, Optional

from ...pathing import secure_join_flat
logger = logging.getLogger(__name__)

PROJECT_MANIFEST_FILENAME = "project.json"
CURRENT_STORAGE_VERSION = 2

def get_project_manifest_path(project_dir: Path) -> Path:
    from ...config import PROJECTS_DIR
    # Rule 9: Explicit containment check for scanner locality
    try:
        projects_root = os.path.abspath(os.fspath(PROJECTS_DIR))
        resolved = os.path.abspath(os.fspath(project_dir))
        if not resolved.startswith(projects_root + os.sep):
             raise ValueError(f"Invalid or out-of-bounds project directory: {project_dir}")
    except (OSError, ValueError) as e:
         raise ValueError(f"Invalid or out-of-bounds project directory: {project_dir}") from e

    return secure_join_flat(project_dir, PROJECT_MANIFEST_FILENAME)

def load_project_manifest(project_dir: Path) -> Dict[str, Any]:
    """Loads the project manifest from disk, or returns a default v1 manifest if missing."""
    try:
        manifest_path = get_project_manifest_path(project_dir)
        if not manifest_path.exists():
            return {"version": 1}

        import os
        from ...config import PROJECTS_DIR
        trusted_root = os.path.abspath(os.fspath(PROJECTS_DIR))
        resolved_path = os.path.abspath(os.fspath(manifest_path))

        if resolved_path.startswith(trusted_root + os.sep):
            with open(resolved_path, "r", encoding="utf-8") as f:
                return json.load(f)
        else:
            logger.warning("Blocking manifest load outside projects root: %s", resolved_path)
            return {"version": 1}
    except Exception as e:
        logger.warning("Failed to load project manifest: %s", e)
        return {"version": 1}

def save_project_manifest(project_dir: Path, manifest: Dict[str, Any]) -> bool:
    """Saves the project manifest to disk atomically."""
    try:
        manifest_path = get_project_manifest_path(project_dir)
        tmp_path = manifest_path.with_suffix(".json.tmp")

        import os
        from ...config import PROJECTS_DIR
        trusted_root = os.path.abspath(os.fspath(PROJECTS_DIR))
        resolved_path = os.path.abspath(os.fspath(manifest_path))
        resolved_tmp = os.path.abspath(os.fspath(tmp_path))

        if resolved_path.startswith(trusted_root + os.sep) and resolved_tmp.startswith(trusted_root + os.sep):
            with open(resolved_tmp, "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2)
            os.replace(resolved_tmp, resolved_path)
            return True
        else:
            logger.error("Blocking manifest save outside projects root: %s", resolved_path)
            return False
    except Exception as e:
        logger.error("Failed to save project manifest: %s", e)
        return False

def get_storage_version(project_dir: Path) -> int:
    """Helper to get the storage version of a project."""
    manifest = load_project_manifest(project_dir)
    return int(manifest.get("version", 1))
