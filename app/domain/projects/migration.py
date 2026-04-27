import logging
import os
import re
import shutil
from pathlib import Path
from typing import List, Dict, Any

from app.config import get_project_dir, get_project_audio_dir, get_project_text_dir
from app.db.chapters import list_chapters
from .manifest import load_project_manifest, save_project_manifest, CURRENT_STORAGE_VERSION

logger = logging.getLogger(__name__)

SAFE_SEGMENT_AUDIO_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


def migrate_project_to_v2(project_id: str) -> bool:
    """Migrates a project from flat v1 layout to nested v2 chapter folders."""
    project_dir = get_project_dir(project_id)
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
        audio_dir = get_project_audio_dir(project_id)
        text_dir = get_project_text_dir(project_id)

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
            segments = get_chapter_segments(chapter_id)
            for seg in segments:
                sid = str(seg["id"])
                if not SAFE_SEGMENT_AUDIO_ID_RE.fullmatch(sid):
                    logger.warning("Skipping unsafe segment audio id during project migration: %r", sid)
                    continue

                audio_root = os.path.abspath(str(audio_dir))
                segments_root = os.path.abspath(str(segments_dir))

                # Legacy naming: chunk_{sid}.wav
                src_path = os.path.abspath(
                    os.path.normpath(os.path.join(audio_root, f"chunk_{sid}.wav"))
                )
                dest_path = os.path.abspath(
                    os.path.normpath(os.path.join(segments_root, f"{sid}.wav"))
                )
                if (
                    os.path.commonpath([audio_root, src_path]) != audio_root
                    or os.path.commonpath([segments_root, dest_path]) != segments_root
                ):
                    logger.warning("Skipping segment audio path outside migration roots: %r", sid)
                    continue

                src = Path(src_path)
                if src.exists():
                    dest = Path(dest_path)
                    if not dest.exists():
                        shutil.move(str(src), str(dest))

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
