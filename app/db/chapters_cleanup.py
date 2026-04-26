import logging
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
    legacy_pdir = (
        config.find_existing_project_subdir(project_id, "audio")
        if project_id
        else config.XTTS_OUT_DIR
    )
    nested_pdir = config.get_chapter_dir(project_id, chapter_id) if project_id else None

    target_dirs = []
    # Explicit containment check for scanner locality
    try:
        projects_root = config.PROJECTS_DIR.resolve()
        if legacy_pdir and legacy_pdir.exists():
            res_legacy = legacy_pdir.resolve()
            try:
                res_legacy.relative_to(projects_root)
                target_dirs.append(legacy_pdir)
            except ValueError:
                if res_legacy == config.XTTS_OUT_DIR.resolve():
                    target_dirs.append(legacy_pdir)

        if nested_pdir and nested_pdir.exists():
            res_nested = nested_pdir.resolve()
            try:
                res_nested.relative_to(projects_root)
                target_dirs.append(nested_pdir)

                # Rule 9: Secure join for literal subdirectory
                try:
                    seg_dir = secure_join_flat(nested_pdir, "segments")
                    if seg_dir.exists():
                        target_dirs.append(seg_dir)
                except ValueError:
                    pass
            except ValueError:
                pass
    except (OSError, ValueError):
        pass

    if not target_dirs:
        return True

    # 2. Collect all files from all target directories
    known_files: List[tuple[Path, Path]] = []  # (root, file_path)
    for d in target_dirs:
        resolved_root = d.resolve()
        for entry in d.iterdir():
            if entry.is_file() and entry.suffix.lower() in (".wav", ".mp3", ".m4a"):
                known_files.append((resolved_root, entry))

    # 3. Cleanup explicit files
    for raw_path in explicit_files or []:
        if not raw_path:
            continue
        # For explicit files, we check if they exist in any of our target dirs
        for root, p in list(known_files):
            if p.name == raw_path:
                try:
                    p.unlink()
                    known_files.remove((root, p))
                except Exception:
                    logger.warning("Failed to delete explicit audio file %s", p, exc_info=True)

    # 4. Cleanup chapter outputs
    if delete_chapter_outputs:
        for root, p in list(known_files):
            # In legacy, they start with chapter_id. In nested, they might be "chapter.wav" or chapter_id.wav
            is_legacy_match = p.name.startswith(chapter_id)
            is_nested_match = nested_pdir and root == nested_pdir.resolve() and (
                p.name.startswith("chapter.") or p.name.startswith(chapter_id)
            )

            if is_legacy_match or is_nested_match:
                try:
                    p.unlink()
                    known_files.remove((root, p))
                except Exception:
                    logger.warning("Failed to delete chapter audio file %s", p, exc_info=True)

    # 5. Cleanup segment files
    for sid in segment_ids or []:
        if not SAFE_SEGMENT_PREFIX_RE.fullmatch(sid):
            logger.warning("Skipping invalid segment id %s", sid)
            continue
        prefixes = (f"seg_{sid}", f"chunk_{sid}", f"{sid}.")
        for root, p in list(known_files):
            if any(p.name.startswith(prefix) for prefix in prefixes):
                try:
                    p.unlink()
                    known_files.remove((root, p))
                except Exception:
                    logger.warning("Failed to delete segment audio file %s", p, exc_info=True)

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
        trash_root = secure_join_flat(base_trash_path, chapter_id)

        # Explicit containment check for scanner locality
        resolved_trash = trash_root.resolve()
        # It should be under its own base trash path (project-specific or global)
        trash_base_resolved = base_trash_path.resolve()
        try:
            resolved_trash.relative_to(trash_base_resolved)
        except ValueError:
             # Also check PROJECTS_DIR if it's a project-specific trash
             projects_root = config.PROJECTS_DIR.resolve()
             resolved_trash.relative_to(projects_root)
    except Exception:
        logger.warning("Skipping trash move for invalid chapter id %s", chapter_id)
        return False

    # Rule 9: secure_join_flat for literals
    trash_audio_dir = secure_join_flat(trash_root, "audio")
    trash_text_dir = secure_join_flat(trash_root, "text")

    trash_audio_dir.mkdir(parents=True, exist_ok=True)
    trash_text_dir.mkdir(parents=True, exist_ok=True)

    # 1. Identify all source candidates
    legacy_audio_dir = (
        config.find_existing_project_subdir(project_id, "audio")
        or config.get_project_audio_dir(project_id)
    )
    legacy_text_dir = (
        config.find_existing_project_subdir(project_id, "text")
        or config.get_project_text_dir(project_id)
    )
    nested_dir = config.get_chapter_dir(project_id, chapter_id)

    # 2. Collect all potential files
    source_files: List[tuple[Path, Path]] = []  # (root, file_path)
    for d in [legacy_audio_dir, legacy_text_dir, nested_dir]:
        if d and d.exists():
            for entry in d.iterdir():
                if entry.is_file():
                    source_files.append((d, entry))
            # Also check segments subdir if nested
            if d == nested_dir:
                try:
                    seg_dir = secure_join_flat(d, "segments")
                    if seg_dir.exists():
                        for entry in seg_dir.iterdir():
                            if entry.is_file():
                                source_files.append((seg_dir, entry))
                except ValueError:
                    pass

    # 3. Filter and move
    audio_moved = 0
    text_moved = 0

    segment_ids_set = set(segment_ids or [])
    explicit_audio_set = set(explicit_audio_files or [])

    for root, src in source_files:
        name = src.name
        is_audio = src.suffix.lower() in (".wav", ".mp3", ".m4a")
        is_text = src.suffix.lower() == ".txt"

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

            dest = secure_join_flat(target_dir, name)
            # Ensure unique destination name if multiple sources have same filename
            if dest.exists():
                unique_name = f"{uuid.uuid4().hex}_{name}"
                dest = secure_join_flat(target_dir, unique_name)

            shutil.move(str(src), str(dest))
            if is_audio: audio_moved += 1
            else: text_moved += 1
        except Exception as e:
            logger.warning("Failed to move artifact %s to trash: %s", src, e, exc_info=True)

    return True
