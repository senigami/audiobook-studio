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

    # Rule 9: Locally visible containment proof for projects root
    projects_root = os.path.abspath(os.path.realpath(os.fspath(config.PROJECTS_DIR)))
    projects_root_prefix = projects_root if projects_root.endswith(os.sep) else projects_root + os.sep

    project_dir_path = os.path.abspath(
        os.path.normpath(os.path.join(projects_root, canonical_project_id))
    )
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

        # Resolve legacy dirs as proven strings
        audio_root = os.path.abspath(os.path.realpath(os.path.join(project_dir_path, "audio")))
        if not audio_root.startswith(project_dir_path + os.sep):
            audio_root = None

        text_root = os.path.abspath(os.path.realpath(os.path.join(project_dir_path, "text")))
        if not text_root.startswith(project_dir_path + os.sep):
            text_root = None

        for chap in chapters:
            chapter_id = chap["id"]

            # Rule 9: Prove containment for dynamic chapter folder
            nested_dir_path = os.path.abspath(
                os.path.normpath(os.path.join(project_dir_path, "chapters", chapter_id))
            )
            if not nested_dir_path.startswith(project_dir_path + os.sep):
                logger.warning("Skipping malicious chapter ID: %r", chapter_id)
                continue

            if not os.path.exists(nested_dir_path):
                os.makedirs(nested_dir_path, exist_ok=True)

            segments_dir_path = os.path.abspath(
                os.path.normpath(os.path.join(nested_dir_path, "segments"))
            )
            if not segments_dir_path.startswith(nested_dir_path + os.sep):
                logger.warning("Skipping malicious segments path for chapter: %r", chapter_id)
                continue

            if not os.path.exists(segments_dir_path):
                os.makedirs(segments_dir_path, exist_ok=True)

            nested_root_prefix = nested_dir_path if nested_dir_path.endswith(os.sep) else nested_dir_path + os.sep

            # 1. Move text files
            if text_root and os.path.isdir(text_root):
                text_root_prefix = text_root if text_root.endswith(os.sep) else text_root + os.sep
                for text_index, cand_name in enumerate([f"{chapter_id}.txt", f"{chapter_id}_0.txt"]):
                    src_path = None
                    # Rule 8: Enumerate trusted root and match by entry.name
                    for entry in os.scandir(text_root):
                        if entry.is_file() and entry.name == cand_name:
                            candidate_src_path = os.path.abspath(os.path.realpath(entry.path))
                            if (
                                candidate_src_path != text_root
                                and candidate_src_path.startswith(text_root_prefix)
                                and candidate_src_path.startswith(projects_root_prefix)
                            ):
                                src_path = candidate_src_path
                            break

                    if src_path and os.path.exists(src_path):
                        dest_filename = "chapter.txt"
                        dest_path = os.path.abspath(os.path.normpath(os.path.join(nested_dir_path, dest_filename)))
                        if not dest_path.startswith(nested_root_prefix) or not dest_path.startswith(projects_root_prefix):
                            continue

                        if not os.path.exists(dest_path):
                            shutil.move(src_path, dest_path)
                        else:
                            fallback_filename = f"legacy_text_{text_index}.txt"
                            fallback_path = os.path.abspath(os.path.normpath(os.path.join(nested_dir_path, fallback_filename)))
                            if fallback_path.startswith(nested_root_prefix) and fallback_path.startswith(projects_root_prefix):
                                shutil.move(src_path, fallback_path)

            # 2. Move main audio files
            if audio_root and os.path.isdir(audio_root):
                audio_root_prefix = audio_root if audio_root.endswith(os.sep) else audio_root + os.sep
                for ext in [".wav", ".mp3", ".m4a"]:
                    for audio_index, cand_name in enumerate([f"{chapter_id}{ext}", f"{chapter_id}_0{ext}"]):
                        src_path = None
                        # Rule 8: Enumerate trusted root
                        for entry in os.scandir(audio_root):
                            if entry.is_file() and entry.name == cand_name:
                                candidate_src_path = os.path.abspath(os.path.realpath(entry.path))
                                if (
                                    candidate_src_path != audio_root
                                    and candidate_src_path.startswith(audio_root_prefix)
                                    and candidate_src_path.startswith(projects_root_prefix)
                                ):
                                    src_path = candidate_src_path
                                break

                        if src_path and os.path.exists(src_path):
                            dest_filename = f"chapter{ext}"
                            dest_path = os.path.abspath(os.path.normpath(os.path.join(nested_dir_path, dest_filename)))
                            if not dest_path.startswith(nested_root_prefix) or not dest_path.startswith(projects_root_prefix):
                                continue

                            if not os.path.exists(dest_path):
                                shutil.move(src_path, dest_path)
                            else:
                                fallback_filename = f"legacy_audio_{audio_index}{ext}"
                                fallback_path = os.path.abspath(os.path.normpath(os.path.join(nested_dir_path, fallback_filename)))
                                if fallback_path.startswith(nested_root_prefix) and fallback_path.startswith(projects_root_prefix):
                                    shutil.move(src_path, fallback_path)

            # 3. Move segment audio files (chunk_*.wav)
            from app.db.segments import get_chapter_segments
            from app.db.segments import update_segment
            segments = get_chapter_segments(chapter_id)
            for segment_index, seg in enumerate(segments):
                sid = str(seg["id"])
                legacy_name = f"chunk_{sid}.wav"
                src_path = None
                if audio_root and os.path.isdir(audio_root):
                    audio_root_prefix = audio_root if audio_root.endswith(os.sep) else audio_root + os.sep
                    # Rule 8: Enumerate trusted root
                    for entry in os.scandir(audio_root):
                        if entry.is_file() and entry.name == legacy_name:
                            candidate_src_path = os.path.abspath(os.path.realpath(entry.path))
                            if (
                                candidate_src_path != audio_root
                                and candidate_src_path.startswith(audio_root_prefix)
                                and candidate_src_path.startswith(projects_root_prefix)
                            ):
                                src_path = candidate_src_path
                            break

                dest_filename = f"seg_{segment_index}.wav"
                segments_root_prefix = segments_dir_path if segments_dir_path.endswith(os.sep) else segments_dir_path + os.sep
                dest_path = os.path.abspath(
                    os.path.normpath(os.path.join(segments_dir_path, dest_filename))
                )
                if (
                    dest_path.startswith(segments_root_prefix)
                    and dest_path.startswith(projects_root_prefix)
                ):
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
            if audio_root and os.path.isdir(audio_root):
                # Double check: only remove if it's actually the legacy 'audio' dir under project
                if (
                    os.path.basename(audio_root) == "audio"
                    and os.path.abspath(os.path.realpath(os.path.join(audio_root, ".."))) == project_dir_path
                    and audio_root.startswith(projects_root_prefix)
                ):
                    shutil.rmtree(audio_root, ignore_errors=True)
            if text_root and os.path.isdir(text_root):
                if (
                    os.path.basename(text_root) == "text"
                    and os.path.abspath(os.path.realpath(os.path.join(text_root, ".."))) == project_dir_path
                    and text_root.startswith(projects_root_prefix)
                ):
                    shutil.rmtree(text_root, ignore_errors=True)
        except Exception as e:
            logger.warning("Failed to clean up legacy residue for project %s: %s", project_id, e)

        logger.info("Successfully migrated project %s to v2", project_id)
        return True

    except Exception as e:
        logger.error("Failed to migrate project %s to v2: %s", project_id, e, exc_info=True)
        return False
