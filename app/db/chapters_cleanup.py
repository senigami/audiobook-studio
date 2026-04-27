import logging
import os
import shutil
import uuid
from pathlib import Path
from typing import List, Optional

from ..pathing import secure_join_flat
from .chapters_helpers import (
    _canonical_chapter_id, 
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
    from .. import config

    # 1. Identify all candidate directories
    legacy_pdir = config.find_existing_project_subdir(project_id, "audio") if project_id else config.XTTS_OUT_DIR
    nested_pdir = config.get_chapter_dir(project_id, chapter_id) if project_id else None

    target_dirs: List[str] = []
    # Explicit containment check for scanner locality
    try:
        p_root = os.path.abspath(os.path.realpath(os.fspath(config.PROJECTS_DIR)))
        x_root = os.path.abspath(os.path.realpath(os.fspath(config.XTTS_OUT_DIR)))

        if legacy_pdir:
            l_path = os.path.abspath(os.path.realpath(os.fspath(legacy_pdir)))
            if l_path == x_root or l_path.startswith(x_root + os.sep):
                target_dirs.append(l_path)
            elif l_path == p_root or l_path.startswith(p_root + os.sep):
                target_dirs.append(l_path)

        if nested_pdir:
            n_path = os.path.abspath(os.path.realpath(os.fspath(nested_pdir)))
            if n_path == p_root or n_path.startswith(p_root + os.sep):
                target_dirs.append(n_path)
                # Check segments subdir
                s_path = os.path.abspath(os.path.realpath(os.path.join(n_path, "segments")))
                if s_path.startswith(n_path + os.sep):
                    if os.path.isdir(s_path):
                        target_dirs.append(s_path)
    except (OSError, ValueError):
        pass

    if not target_dirs:
        return True

    # 2. Collect all files from all target directories using string-based scandir
    known_files: List[tuple[str, str, str]] = []  # (root, full_path, name)
    for d_path in target_dirs:
        try:
            # Rule 9: Locally visible proof for discovery sink
            # (Already proven in target_dirs loop above, but we re-prove for absolute locality)
            if not (d_path == x_root or d_path.startswith(x_root + os.sep) or d_path.startswith(p_root + os.sep)):
                continue

            for entry in os.scandir(d_path):
                if entry.is_file() and entry.name.lower().endswith((".wav", ".mp3", ".m4a")):
                    # Prove containment of result path
                    res_path = os.path.abspath(os.path.realpath(entry.path))
                    if res_path.startswith(d_path + os.sep):
                        known_files.append((d_path, res_path, entry.name))
        except OSError:
            continue

    # 3. Cleanup explicit files
    for raw_name in explicit_files or []:
        if not raw_name:
            continue
        for root, f_path, f_name in list(known_files):
            if f_name == raw_name:
                try:
                    # Rule 9: Proof for deletion sink
                    if f_path.startswith(root + os.sep):
                        os.remove(f_path)
                        known_files = [item for item in known_files if item[1] != f_path]
                except Exception:
                    logger.warning("Failed to delete explicit audio file %s", f_path, exc_info=True)

    # 4. Cleanup chapter outputs
    if delete_chapter_outputs:
        for root, f_path, f_name in list(known_files):
            is_legacy_match = f_name.startswith(chapter_id)
            is_nested_match = nested_pdir and root == os.path.abspath(os.path.realpath(os.fspath(nested_pdir))) and (
                f_name.startswith("chapter.") or f_name.startswith(chapter_id)
            )

            if is_legacy_match or is_nested_match:
                try:
                    if f_path.startswith(root + os.sep):
                        os.remove(f_path)
                        known_files = [item for item in known_files if item[1] != f_path]
                except Exception:
                    logger.warning("Failed to delete chapter audio file %s", f_path, exc_info=True)

    # 5. Cleanup segment files
    for sid in segment_ids or []:
        if not SAFE_SEGMENT_PREFIX_RE.fullmatch(sid):
            logger.warning("Skipping invalid segment id %s", sid)
            continue
        prefixes = (f"seg_{sid}", f"chunk_{sid}", f"{sid}.")
        for root, f_path, f_name in list(known_files):
            if any(f_name.startswith(prefix) for prefix in prefixes):
                try:
                    if f_path.startswith(root + os.sep):
                        os.remove(f_path)
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
    from .. import config

    if not project_id:
        return True

    try:
        chapter_id = _canonical_chapter_id(chapter_id)
    except ValueError:
        logger.warning("Skipping trash move for invalid chapter id %s", chapter_id)
        return False

    # Rule 9: Explicit containment for dynamic chapter_id
    try:
        # Use project-aware trash dir resolution
        base_trash_path = config.get_project_trash_dir(project_id) or config.TRASH_DIR
        trash_root_path = os.path.abspath(os.path.realpath(os.path.join(os.fspath(base_trash_path), chapter_id)))

        # Explicit containment check for scanner locality
        trash_base_resolved = os.path.abspath(os.path.realpath(os.fspath(base_trash_path)))
        if not (trash_root_path == trash_base_resolved or trash_root_path.startswith(trash_base_resolved + os.sep)):
             # Also check PROJECTS_DIR if it's a project-specific trash
             p_root = os.path.abspath(os.path.realpath(os.fspath(config.PROJECTS_DIR)))
             if not (trash_root_path == p_root or trash_root_path.startswith(p_root + os.sep)):
                 raise ValueError("Trash path escape")
    except Exception:
        logger.warning("Skipping trash move for invalid chapter id %s", chapter_id)
        return False

    # Rule 9: secure_join_flat for literals
    trash_audio_dir = os.path.join(trash_root_path, "audio")
    trash_text_dir = os.path.join(trash_root_path, "text")

    # Prove containment before mkdir
    if trash_audio_dir.startswith(trash_root_path + os.sep):
        os.makedirs(trash_audio_dir, exist_ok=True)
    if trash_text_dir.startswith(trash_root_path + os.sep):
        os.makedirs(trash_text_dir, exist_ok=True)

    # 1. Identify all source candidates
    try:
        legacy_audio_dir = config.find_existing_project_subdir(project_id, "audio") or config.get_project_audio_dir(project_id)
        legacy_text_dir = config.find_existing_project_subdir(project_id, "text") or config.get_project_text_dir(project_id)
        nested_dir = config.get_chapter_dir(project_id, chapter_id)
    except (OSError, ValueError):
        legacy_audio_dir = legacy_text_dir = nested_dir = None

    # 2. Collect all potential files using string-based scandir
    source_files: List[tuple[str, str, str]] = []  # (root_path, full_path, name)
    for d in [legacy_audio_dir, legacy_text_dir, nested_dir]:
        if d:
            d_path = os.path.abspath(os.path.realpath(os.fspath(d)))
            if os.path.isdir(d_path):
                try:
                    for entry in os.scandir(d_path):
                        if entry.is_file():
                            res_path = os.path.abspath(os.path.realpath(entry.path))
                            if res_path.startswith(d_path + os.sep):
                                source_files.append((d_path, res_path, entry.name))
                    # Also check segments subdir if nested
                    if d == nested_dir:
                        seg_dir = os.path.abspath(os.path.realpath(os.path.join(d_path, "segments")))
                        if seg_dir.startswith(d_path + os.sep) and os.path.isdir(seg_dir):
                            for entry in os.scandir(seg_dir):
                                if entry.is_file():
                                    res_path = os.path.abspath(os.path.realpath(entry.path))
                                    if res_path.startswith(seg_dir + os.sep):
                                        source_files.append((seg_dir, res_path, entry.name))
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
        elif name.startswith(chapter_id):
            should_move = True
        elif name == "chapter.wav" or name == "chapter.txt":
            should_move = True
        elif is_audio:
            # Check segments
            for sid in segment_ids_set:
                if name.startswith(f"seg_{sid}") or name.startswith(f"chunk_{sid}") or name == f"{sid}.wav":
                    should_move = True
                    break

        if not should_move:
            continue

        try:
            # Rule 9 for dynamic name
            if not SAFE_AUDIO_NAME_RE.fullmatch(name) and not SAFE_TEXT_NAME_RE.fullmatch(name):
                 continue

            dest = os.path.abspath(os.path.realpath(os.path.join(target_dir, name)))
            # Ensure unique destination name if multiple sources have same filename
            if os.path.exists(dest):
                unique_name = f"{uuid.uuid4().hex}_{name}"
                dest = os.path.abspath(os.path.realpath(os.path.join(target_dir, unique_name)))

            # Rule 9: Locally visible containment proof for both source and destination
            if src_path.startswith(root + os.sep) and dest.startswith(target_dir + os.sep):
                shutil.move(src_path, dest)
                if is_audio: audio_moved += 1
                else: text_moved += 1
        except Exception as e:
            logger.warning("Failed to move artifact %s to trash: %s", src_path, e, exc_info=True)

    return True
