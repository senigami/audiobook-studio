from __future__ import annotations
import logging
import os
import shutil
import uuid
from pathlib import Path
from typing import List, Optional

from ..utils.pathing import secure_join_flat
from ..core.config import is_safe
from .chapters_helpers import (
    SAFE_SEGMENT_PREFIX_RE, 
    SAFE_AUDIO_NAME_RE, 
    SAFE_TEXT_NAME_RE
)

logger = logging.getLogger(__name__)


def cleanup_chapter_audio_files(
    project_id: Optional[str],
    chapter_id: str,
    segment_ids: Optional[List[str]] = None,
    explicit_files: Optional[List[str]] = None,
    delete_chapter_outputs: bool = True,
) -> bool:
    """Delete chapter-level and selected segment audio files without touching DB state."""
    from ..storage.manager import get_storage_manager
    storage = get_storage_manager()

    try:
        # 1. Identify all candidate directories
        if not project_id:
            return True

        ctx = storage.get_project_context(project_id)
        nested_pdir = ctx.get_chapter_dir(chapter_id)

        target_dirs: List[Path] = []
        if nested_pdir.exists() and storage.is_safe(nested_pdir):
            target_dirs.append(nested_pdir)
            seg_dir = nested_pdir / "segments"
            if seg_dir.exists() and storage.is_safe(seg_dir):
                target_dirs.append(seg_dir)
    except (OSError, ValueError):
        return False

    if not target_dirs:
        return True

    # 2. Collect all files from all target directories
    known_files: List[tuple[Path, Path, str]] = []  # (root, full_path, name)
    for d_path in target_dirs:
        try:
            if not storage.is_safe(d_path):
                continue

            for entry in os.scandir(d_path):
                if entry.is_file() and entry.name.lower().endswith((".wav", ".mp3", ".m4a")):
                    if storage.is_safe(entry.path):
                        known_files.append((d_path, Path(entry.path), entry.name))
        except OSError:
            continue

    # 3. Cleanup explicit files
    for raw_name in explicit_files or []:
        if not raw_name:
            continue
        for root, f_path, f_name in list(known_files):
            if f_name == raw_name:
                try:
                    if storage.is_safe(f_path):
                        f_path.unlink(missing_ok=True)
                        known_files = [item for item in known_files if item[1] != f_path]
                except Exception:
                    logger.warning("Failed to delete explicit audio file %s", f_path, exc_info=True)

    # 4. Cleanup chapter outputs
    if delete_chapter_outputs:
        for root, f_path, f_name in list(known_files):
            # Chapter outputs are in the chapter root dir, not segments subdir
            is_match = root == nested_pdir and f_name.startswith("chapter.")

            if is_match:
                try:
                    if storage.is_safe(f_path):
                        f_path.unlink(missing_ok=True)
                        known_files = [item for item in known_files if item[1] != f_path]
                except Exception:
                    logger.warning("Failed to delete chapter audio file %s", f_path, exc_info=True)

    # 5. Cleanup segment files
    for sid in segment_ids or []:
        if not SAFE_SEGMENT_PREFIX_RE.fullmatch(sid):
            logger.warning("Skipping invalid segment id %s", sid)
            continue
        prefixes = (f"{sid}.",)
        for root, f_path, f_name in list(known_files):
            if any(f_name.startswith(prefix) for prefix in prefixes):
                try:
                    if storage.is_safe(f_path) and f_path.resolve().is_relative_to(root.resolve()):
                        f_path.unlink(missing_ok=True)
                        known_files = [item for item in known_files if item[1] != f_path]
                except Exception:
                    logger.warning("Failed to delete segment audio file %s", f_path, exc_info=True)

    return True


def move_chapter_artifacts_to_trash(
    project_id: Optional[str],
    chapter_id: str,
    segment_ids: Optional[List[str]] = None,
    explicit_audio_files: Optional[List[str]] = None,
) -> bool:
    from ..storage.manager import get_storage_manager
    storage = get_storage_manager()

    if not project_id:
        return True

    try:
        from ..core.config import canonical_chapter_id
        canonical_cid = canonical_chapter_id(chapter_id)
        ctx = storage.get_project_context(project_id)
        # Use project-aware trash dir resolution
        base_trash_path = ctx.root / "trash"
        trash_root_path = base_trash_path / canonical_cid

        if not storage.is_safe(trash_root_path):
            raise ValueError("Trash path escape")
    except Exception:
        logger.warning("Skipping trash move for invalid chapter id %s", chapter_id)
        return False

    # secure_join_flat for literals
    trash_audio_dir = trash_root_path / "audio"
    trash_text_dir = trash_root_path / "text"

    # Prove containment before mkdir
    if storage.is_safe(trash_audio_dir):
        trash_audio_dir.mkdir(parents=True, exist_ok=True)
    if storage.is_safe(trash_text_dir):
        trash_text_dir.mkdir(parents=True, exist_ok=True)

    # 1. Identify all source candidates
    try:
        nested_dir = ctx.get_chapter_dir(chapter_id)
    except (OSError, ValueError):
        nested_dir = None

    # 2. Collect all potential files
    source_files: List[tuple[Path, Path, str]] = []  # (root_path, full_path, name)
    if nested_dir and nested_dir.exists() and storage.is_safe(nested_dir):
        try:
            for entry in os.scandir(nested_dir):
                if entry.is_file():
                    if storage.is_safe(entry.path):
                        source_files.append((nested_dir, Path(entry.path), entry.name))

            # Also check segments subdir
            seg_dir = nested_dir / "segments"
            if seg_dir.exists() and storage.is_safe(seg_dir):
                for entry in os.scandir(seg_dir):
                    if entry.is_file():
                        if storage.is_safe(entry.path):
                            source_files.append((seg_dir, Path(entry.path), entry.name))
        except OSError:
            pass

    # 3. Filter and move
    audio_moved = 0
    text_moved = 0

    segment_ids_set = set(segment_ids or [])
    explicit_audio_set = set(explicit_audio_files or [])

    for root, src_path, name in source_files:
        is_audio = any(name.lower().endswith(ext) for ext in (".wav", ".mp3", ".m4a"))
        is_text = name.lower().endswith(".txt")

        should_move = False
        target_dir = trash_audio_dir if is_audio else trash_text_dir

        # Match logic
        if name in explicit_audio_set:
            should_move = True
        elif name == "chapter.wav" or name == "chapter.txt":
            should_move = True
        elif is_audio:
            # Check segments
            for sid in segment_ids_set:
                if name == f"{sid}.wav":
                    should_move = True
                    break

        if not should_move:
            continue

        try:
            # Rule 9 for dynamic name
            if not SAFE_AUDIO_NAME_RE.fullmatch(name) and not SAFE_TEXT_NAME_RE.fullmatch(name):
                 continue

            dest = target_dir / name
            # Ensure unique destination name if multiple sources have same filename
            if dest.exists():
                unique_name = f"{uuid.uuid4().hex}_{name}"
                dest = target_dir / unique_name

            # Rule 9: Locally visible containment proof for both source and destination
            if storage.is_safe(src_path) and storage.is_safe(dest):
                shutil.move(src_path, dest)
                if is_audio: audio_moved += 1
                else: text_moved += 1
        except Exception as e:
            logger.warning("Failed to move artifact %s to trash: %s", src_path, e, exc_info=True)

    return True
