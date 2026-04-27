import logging
import os
import shutil
import uuid
from pathlib import Path
from typing import List, Dict, Any

from app import config
from app.db.chapters import list_chapters
from .manifest import load_project_manifest, save_project_manifest, CURRENT_STORAGE_VERSION

logger = logging.getLogger(__name__)


def migrate_project_to_v2(project_id: str) -> bool:
    """Migrates a project from flat v1 layout to nested v2 chapter folders."""
    try:
        canonical_project_id = str(uuid.UUID(project_id))
    except (ValueError, TypeError, AttributeError):
        if isinstance(project_id, str) and config.SAFE_PROJECT_ID_RE.fullmatch(project_id):
            canonical_project_id = project_id
        else:
            logger.warning("Skipping project migration for invalid project id: %r", project_id)
            return False

    projects_root = os.path.abspath(str(config.PROJECTS_DIR))
    project_dir_path = os.path.abspath(
        os.path.normpath(os.path.join(projects_root, canonical_project_id))
    )
    projects_root_prefix = projects_root if projects_root.endswith(os.sep) else projects_root + os.sep
    if project_dir_path != projects_root and not project_dir_path.startswith(projects_root_prefix):
        logger.warning("Skipping project migration outside projects root: %r", project_id)
        return False

    project_dir = Path(project_dir_path)
    manifest = load_project_manifest(project_dir)

    current_version = int(manifest.get("version", 1))

    # If version is current, we might still need to backfill missing metadata (Milestone 3)
    if current_version >= CURRENT_STORAGE_VERSION:
        if all(manifest.get(k) for k in ["title", "author", "series", "created_at"]):
            return True
        logger.info("Backfilling missing metadata for project %s", project_id)
    else:
        logger.info("Migrating project %s to storage version %s", project_id, CURRENT_STORAGE_VERSION)

    try:
        chapters = list_chapters(project_id)
        audio_dir = project_dir / "audio"
        text_dir = project_dir / "text"

        for chap in chapters:
            chapter_id = chap["id"]
            nested_dir = project_dir / "chapters" / chapter_id
            nested_dir.mkdir(parents=True, exist_ok=True)
            segments_dir = nested_dir / "segments"
            segments_dir.mkdir(exist_ok=True)

            # 1. Move text files
            # Try {chapter_id}.txt and {chapter_id}_0.txt
            for cand_name in [f"{chapter_id}.txt", f"{chapter_id}_0.txt"]:
                src = text_dir / cand_name
                if src.exists():
                    dest = nested_dir / "chapter.txt"
                    if not dest.exists():
                        shutil.move(str(src), str(dest))
                    else:
                        # If destination exists, keep both but log warning
                        shutil.move(str(src), str(nested_dir / cand_name))

            # 2. Move main audio files
            # Try {chapter_id}.wav, .mp3, .m4a
            for ext in [".wav", ".mp3", ".m4a"]:
                for cand_name in [f"{chapter_id}{ext}", f"{chapter_id}_0{ext}"]:
                    src = audio_dir / cand_name
                    if src.exists():
                        dest = nested_dir / f"chapter{ext}"
                        if not dest.exists():
                            shutil.move(str(src), str(dest))
                        else:
                            shutil.move(str(src), str(nested_dir / cand_name))

            # 3. Move segment audio files (chunk_*.wav)
            from app.db.segments import get_chapter_segments
            from app.db.segments import update_segment
            segments = get_chapter_segments(chapter_id)
            for segment_index, seg in enumerate(segments):
                sid = str(seg["id"])
                audio_root = os.path.abspath(str(audio_dir))
                segments_root = os.path.abspath(str(segments_dir))
                legacy_name = f"chunk_{sid}.wav"
                src_path = None
                if audio_dir.exists() and audio_dir.is_dir():
                    for entry in audio_dir.iterdir():
                        if entry.is_file() and entry.name == legacy_name:
                            candidate_src_path = os.path.abspath(
                                os.path.normpath(str(entry))
                            )
                            audio_root_prefix = audio_root if audio_root.endswith(os.sep) else audio_root + os.sep
                            if (
                                candidate_src_path != audio_root
                                and candidate_src_path.startswith(audio_root_prefix)
                                and candidate_src_path.startswith(projects_root_prefix)
                            ):
                                src_path = candidate_src_path
                            break

                dest_filename = f"seg_{segment_index}.wav"
                dest_path = os.path.abspath(
                    os.path.normpath(os.path.join(segments_root, dest_filename))
                )
                segments_root_prefix = segments_root if segments_root.endswith(os.sep) else segments_root + os.sep
                if (
                    dest_path != segments_root
                    and not dest_path.startswith(segments_root_prefix)
                ) or (
                    dest_path != projects_root
                    and not dest_path.startswith(projects_root_prefix)
                ):
                    logger.warning("Skipping generated segment audio path outside migration root: %s", dest_filename)
                    continue

                if src_path and os.path.exists(src_path):
                    if not os.path.exists(dest_path):
                        shutil.move(src_path, dest_path)
                        update_segment(sid, broadcast=False, audio_status="done", audio_file_path=dest_filename)

        # 4. Update manifest
        from app.db.projects import get_project
        p = get_project(project_id)
        if p:
            manifest["title"] = p.get("name")
            manifest["author"] = p.get("author")
            manifest["series"] = p.get("series")
            manifest["created_at"] = p.get("created_at")

        manifest["version"] = CURRENT_STORAGE_VERSION
        save_project_manifest(project_dir, manifest)

        # 5. Cleanup legacy residues
        # We only remove if migration was fully successful and manifest is saved
        try:
            if audio_dir.exists() and audio_dir.is_dir():
                # Double check: only remove if it's actually the legacy 'audio' dir under project
                if audio_dir.name == "audio" and audio_dir.parent == project_dir:
                    shutil.rmtree(audio_dir, ignore_errors=True)
            if text_dir.exists() and text_dir.is_dir():
                if text_dir.name == "text" and text_dir.parent == project_dir:
                    shutil.rmtree(text_dir, ignore_errors=True)
        except Exception as e:
            logger.warning("Failed to clean up legacy residue for project %s: %s", project_id, e)

        logger.info("Successfully migrated project %s to v2", project_id)
        return True

    except Exception as e:
        logger.error("Failed to migrate project %s to v2: %s", project_id, e, exc_info=True)
        return False
