from __future__ import annotations
import os
import re
import uuid
import logging
from pathlib import Path
from typing import Optional, Union

from ..utils.pathing import safe_join, safe_join_flat, find_secure_file, secure_join_flat

BASE_DIR = Path(os.getenv("AUDIOBOOK_BASE_DIR", str(Path(__file__).resolve().parents[2])))

# Global limits
PART_CHAR_LIMIT = 30000
MAKE_MP3_DEFAULT = False
MP3_QUALITY = "2"  # ffmpeg -q:a 2
AUDIOBOOK_BITRATE = "64k"

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(BASE_DIR / "uploads")))
REPORT_DIR = Path(os.getenv("REPORT_DIR", str(BASE_DIR / "reports")))
VOICES_DIR = Path(os.getenv("VOICES_DIR", str(BASE_DIR / "voices")))
PROJECTS_DIR = Path(os.getenv("PROJECTS_DIR", str(BASE_DIR / "projects")))
COVER_DIR = Path(os.getenv("COVER_DIR", str(UPLOAD_DIR / "covers")))
TRANSIENT_DIR = Path(os.getenv("TRANSIENT_DIR", str(BASE_DIR / "transient")))
TRASH_DIR = Path(os.getenv("TRASH_DIR", str(BASE_DIR / "trash")))

# Storage layout constants
PLUGINS_DIR = Path(os.getenv("PLUGINS_DIR", str(BASE_DIR / "plugins")))
PLUGIN_DATA_DIR = Path(os.getenv("PLUGIN_DATA_DIR", str(BASE_DIR / "plugin_data")))
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
SAFE_PROJECT_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
SAFE_VOICE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")


def canonical_voice_name(name: str) -> str:
    if not name or not isinstance(name, str):
        raise ValueError("Invalid voice name")
    clean = name.strip()
    if not SAFE_VOICE_NAME_RE.fullmatch(clean):
        raise ValueError(f"Invalid voice name: {name}")
    return clean


def _canonical_project_id(project_id: str) -> str:
    try:
        return str(uuid.UUID(project_id))
    except (ValueError, TypeError, AttributeError):
        raise ValueError(f"Invalid project id: {project_id}")


def get_project_dir(project_id: str) -> Path:
    from app.storage.manager import get_storage_manager
    return get_storage_manager().get_project_context(project_id).root


def get_project_m4b_dir(project_id: str) -> Path:
    from app.storage.manager import get_storage_manager
    return get_storage_manager().get_project_context(project_id).m4b_dir


def get_project_cover_dir(project_id: str) -> Path:
    from app.storage.manager import get_storage_manager
    return get_storage_manager().get_project_context(project_id).cover_dir


def get_project_trash_dir(project_id: str) -> Path:
    from app.storage.manager import get_storage_manager
    return get_storage_manager().get_project_context(project_id).trash_dir


def canonical_chapter_id(chapter_id: str) -> str:
    try:
        return str(uuid.UUID(chapter_id))
    except (ValueError, TypeError, AttributeError):
        # We only accept UUIDs for chapter IDs in version 2 storage
        raise ValueError(f"Invalid chapter id: {chapter_id}")


def get_chapter_dir(project_id: str, chapter_id: str) -> Path:
    from app.storage.manager import get_storage_manager
    return get_storage_manager().get_project_context(project_id).get_chapter_dir(chapter_id)


def get_voice_dir(voice_name: str) -> Path:
    """Returns the root directory for a voice."""
    from app.storage.manager import get_storage_manager
    return get_storage_manager().get_voice_dir(voice_name)


def get_variant_dir(voice_name: str, variant_name: str) -> Path:
    """Returns the directory for a voice variant in nested layout."""
    return safe_join(get_voice_dir(voice_name), variant_name)


def is_safe(path: Union[Path, str]) -> bool:
    """Rule 9: Validates that a path is within trusted application roots."""
    from app.storage.manager import get_storage_manager
    return get_storage_manager().is_safe(path)


def _find_file(directory: Path, filename: str) -> Optional[Path]:
    """Rule 8: Enumerate trusted root and match by entry.name for existing files."""
    from app.storage.manager import get_storage_manager
    return get_storage_manager()._find_file(directory, filename)


def resolve_chapter_asset_path(
    project_id: Optional[str],
    chapter_id: str,
    asset_type: str,
    filename: Optional[str] = None,
) -> Optional[Path]:
    """Resolves a chapter asset path by checking the V2 nested layout only.

    Supported asset_types: 'text', 'audio', 'segment'
    """
    from app.storage.manager import get_storage_manager
    return get_storage_manager().resolve_chapter_asset_path(
        project_id, chapter_id, asset_type, filename=filename
    )
