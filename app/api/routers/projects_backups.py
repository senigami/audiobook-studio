import json
import logging
import os
import time
import urllib.parse
import zipfile
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Request, Query, Body, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.encoders import jsonable_encoder

from ...db import get_project, get_chapter, update_chapter
from ...core.config import get_project_dir, get_chapter_dir
from ...utils.pathing import find_secure_file, secure_join_flat, safe_basename, safe_stem
from ...domain.chapters.timing import validate_timing_sidecar, TimingSidecarValidationError
from ...domain.chapters.timing_generator import write_timing_sidecar
from .projects_helpers import _get_project_service, _create_backup_archive

logger = logging.getLogger(__name__)

router = APIRouter()

# Safety cap on any single archived member (chapter WAV or timing sidecar)
# read into memory during restore -- not full zip-bomb defense, just a
# bound against one absurdly large member.
_MAX_RESTORE_MEMBER_BYTES = 2 * 1024 ** 3  # 2 GB

# Safety cap on the bundle.json member specifically -- read (unlike the WAV
# and timing members above) in three different functions in this file
# (list, metadata update, restore), so it gets its own named constant even
# though it shares the same bound.
_MAX_BUNDLE_JSON_BYTES = 2 * 1024 ** 3  # 2 GB

# Only bundle_version this codebase has ever written; a bundle without a
# recognized version declared is rejected rather than assumed-compatible
# (owner directive: every contract/manifest/schema declares an explicit
# version validated at load time).
_SUPPORTED_BUNDLE_VERSION = 1

@router.get("/{project_id}/export-manifest")
def api_get_project_export_manifest(project_id: str, format_id: str = Query("audiobook")):
    """Build and return an export manifest for the project."""
    service = _get_project_service()
    try:
        manifest = service.build_export_manifest(project_id, format_id=format_id)
        return JSONResponse(jsonable_encoder(manifest))
    except KeyError:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)
    except NotImplementedError:
        return JSONResponse({"status": "error", "message": "Feature not implemented for this format"}, status_code=501)
    except Exception as e:
        logger.error(f"Failed to build export manifest for project {project_id}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": "Internal server error during export manifest build"}, status_code=500)

@router.post("/{project_id}/snapshots")
def api_create_project_snapshot(project_id: str):
    """Create a new revision-safe snapshot for the project."""
    service = _get_project_service()
    try:
        snapshot = service.create_snapshot(project_id)
        return JSONResponse(jsonable_encoder(snapshot))
    except KeyError:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)
    except Exception as e:
        logger.error(f"Failed to create snapshot for project {project_id}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": "Internal server error during snapshot creation"}, status_code=500)

@router.post("/{project_id}/backup-bundle")
def api_create_project_backup_bundle(project_id: str, comment: Optional[str] = Query(None), include_audio: bool = Query(True)):
    """Create a new dated backup bundle for the project."""
    service = _get_project_service()
    try:
        bundle = service.create_backup_bundle(project_id, comment=comment, include_audio=include_audio)
        return JSONResponse(jsonable_encoder(bundle))
    except KeyError:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)
    except Exception as e:
        logger.error(f"Failed to create backup bundle for project {project_id}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": "Internal server error during backup bundle creation"}, status_code=500)

@router.get("/{project_id}/backup-bundle/download")
def api_download_project_backup_bundle(project_id: str, comment: Optional[str] = Query(None), include_audio: bool = Query(True)):
    """Create and download a project backup bundle as a ZIP archive."""
    service = _get_project_service()
    try:
        # 1. Create the bundle plan (snapshot + manifest)
        bundle = service.create_backup_bundle(project_id, comment=comment, include_audio=include_audio)

        # 2. Package it into an archive
        archive_buf = _create_backup_archive(bundle)

        # 3. Return as a downloadable file
        return StreamingResponse(
            archive_buf,
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename={bundle.bundle_name}"
            }
        )
    except KeyError:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)
    except Exception as e:
        logger.error(f"Failed to package backup bundle for project {project_id}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": "Internal server error during backup packaging"}, status_code=500)

@router.post("/{project_id}/backup-bundle/save")
def api_save_project_backup_bundle(project_id: str, comment: Optional[str] = Query(None), include_audio: bool = Query(True)):
    """Create and persist a backup bundle under the project backups directory."""
    service = _get_project_service()
    try:
        # 1. Create the bundle plan
        bundle = service.create_backup_bundle(project_id, comment=comment, include_audio=include_audio)

        # 2. Package it
        archive_buf = _create_backup_archive(bundle)

        # 3. Save to project backups directory
        from ...storage.manager import get_storage_manager
        storage = get_storage_manager()
        ctx = storage.get_project_context(project_id)
        backups_dir = ctx.root / "backups"

        # Rule 9: Locally visible containment check via abstraction
        if not storage.is_safe(backups_dir):
             raise ValueError(f"Invalid backups directory for project: {project_id}")

        backups_dir.mkdir(parents=True, exist_ok=True)

        # Validate bundle name
        from ...utils.pathing import safe_basename
        safe_name = safe_basename(bundle.bundle_name)
        backup_full_path = backups_dir / safe_name

        if not storage.is_safe(backup_full_path):
            raise ValueError(f"Invalid backup path for project {project_id}")

        with open(backup_full_path, "wb") as f:
            f.write(archive_buf.getvalue())

        return JSONResponse({
            "status": "ok",
            "filename": bundle.bundle_name,
            "created_at": bundle.created_at.isoformat(),
            "size_bytes": os.path.getsize(backup_full_path)
        })
    except KeyError:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)
    except Exception as e:
        logger.error(f"Failed to save backup bundle for project {project_id}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": "Internal server error during backup save"}, status_code=500)

@router.get("/{project_id}/backups")
def api_list_project_backups(project_id: str):
    """List saved backups for a project with portable metadata."""
    try:
        if get_project(project_id) is None:
            return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

        from ...storage.manager import get_storage_manager
        storage = get_storage_manager()
        ctx = storage.get_project_context(project_id)
        backups_dir = ctx.root / "backups"

        if not storage.is_safe(backups_dir):
             return JSONResponse({"status": "error", "message": "Invalid backups directory"}, status_code=403)

        backups = []
        if backups_dir.exists():
            # Rule 8: match from backups dir using os.scandir for explicit containment proof
            for entry in os.scandir(backups_dir):
                if entry.is_file() and entry.name.lower().endswith((".zip", ".abf")):
                    # Prove containment for entry
                    if not storage.is_safe(entry.path):
                        continue

                    st = entry.stat()
                    comment = None
                    # Try to extract comment from bundle.json inside the zip
                    try:
                        with zipfile.ZipFile(entry.path, "r") as zf:
                            if "bundle.json" in zf.namelist():
                                bundle_info = zf.getinfo("bundle.json")
                                if bundle_info.file_size <= _MAX_BUNDLE_JSON_BYTES:
                                    bundle_data = json.loads(zf.read("bundle.json"))
                                    comment = bundle_data.get("comment")
                    except Exception:
                        pass

                    backups.append({
                        "filename": entry.name,
                        "created_at": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(),
                        "size_bytes": st.st_size,
                        "comment": comment,
                        "download_url": f"/api/projects/{project_id}/backups/{urllib.parse.quote(entry.name)}/download"
                    })

        backups.sort(key=lambda x: x["created_at"], reverse=True)
        return JSONResponse(backups)
    except Exception as e:
        logger.error(f"Failed to list backups for project {project_id}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": "Internal server error during backup listing"}, status_code=500)

@router.get("/{project_id}/backups/{filename}/download")
def api_download_saved_backup(project_id: str, filename: str):
    """Download a previously saved backup file."""
    try:
        if get_project(project_id) is None:
            return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

        from ...storage.manager import get_storage_manager
        storage = get_storage_manager()
        ctx = storage.get_project_context(project_id)
        backups_dir = ctx.root / "backups"

        if not storage.is_safe(backups_dir):
             return JSONResponse({"status": "error", "message": "Invalid backups directory"}, status_code=403)

        # Validation
        if not (filename.endswith(".zip") or filename.endswith(".abf")):
            return JSONResponse({"status": "error", "message": "Invalid filename extension"}, status_code=400)

        # Rule 8: Enumerate and match from backups dir for local proof
        backup_found_path = None
        if backups_dir.exists():
            for entry in os.scandir(backups_dir):
                if entry.is_file() and entry.name == filename:
                    if storage.is_safe(entry.path):
                        backup_found_path = entry.path
                        break

        if not backup_found_path:
            return JSONResponse({"status": "error", "message": "Backup not found"}, status_code=404)

        media_type = "application/zip" if filename.endswith(".zip") else "application/x-audiobook-factory-bundle"

        return FileResponse(
            backup_found_path,
            media_type=media_type,
            filename=filename,
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
    except Exception as e:
        logger.error(f"Failed to download saved backup {filename} for project {project_id}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": "Internal server error during backup download"}, status_code=500)

@router.patch("/{project_id}/backups/{filename}")
def api_update_project_backup_metadata(project_id: str, filename: str, comment: str = Body(..., embed=True)):
    """Update metadata (comment) for a saved backup."""
    try:
        if get_project(project_id) is None:
            return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

        from ...storage.manager import get_storage_manager
        storage = get_storage_manager()
        ctx = storage.get_project_context(project_id)
        backups_dir = ctx.root / "backups"

        if not storage.is_safe(backups_dir):
             return JSONResponse({"status": "error", "message": "Invalid backups directory"}, status_code=403)

        # Validation
        if not (filename.endswith(".zip") or filename.endswith(".abf")):
            return JSONResponse({"status": "error", "message": "Invalid filename extension"}, status_code=400)

        # Rule 8: Enumerate and match for local proof
        backup_found_path = None
        if backups_dir.exists():
            for entry in os.scandir(backups_dir):
                if entry.is_file() and entry.name == filename:
                    if storage.is_safe(entry.path):
                        backup_found_path = entry.path
                        break

        if not backup_found_path:
            return JSONResponse({"status": "error", "message": "Backup not found"}, status_code=404)

        # Update bundle.json inside the ZIP
        import tempfile
        import shutil

        # Use a safe temp directory
        # Explicit cast to string for mkstemp dir
        fd, temp_path = tempfile.mkstemp(dir=str(backups_dir))
        try:
            os.close(fd)
            # Proof both sides independently for move
            if not storage.is_safe(temp_path) or not storage.is_safe(backup_found_path):
                 raise ValueError("Invalid operation path")

            with zipfile.ZipFile(backup_found_path, "r") as zin:
                with zipfile.ZipFile(temp_path, "w", zipfile.ZIP_DEFLATED) as zout:
                    for item in zin.infolist():
                        if item.filename == "bundle.json":
                            if item.file_size > _MAX_BUNDLE_JSON_BYTES:
                                return JSONResponse(
                                    {"status": "error", "message": "Backup bundle.json exceeds maximum allowed size"},
                                    status_code=400,
                                )
                            data = json.loads(zin.read(item.filename))
                            data["comment"] = comment
                            zout.writestr(item.filename, json.dumps(data, indent=2))
                        else:
                            zout.writestr(item, zin.read(item.filename))

            shutil.move(temp_path, backup_found_path)
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

        return JSONResponse({"status": "ok"})
    except Exception as e:
        logger.error(f"Failed to update backup metadata for {filename}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": "Internal server error during backup metadata update"}, status_code=500)

@router.delete("/{project_id}/backups/{filename}")
def api_delete_project_backup(project_id: str, filename: str):
    """Delete a saved project backup."""
    try:
        if get_project(project_id) is None:
            return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

        from ...storage.manager import get_storage_manager
        storage = get_storage_manager()
        ctx = storage.get_project_context(project_id)
        backups_dir = ctx.root / "backups"

        if not storage.is_safe(backups_dir):
             return JSONResponse({"status": "error", "message": "Invalid backups directory"}, status_code=403)

        # Validation
        if not (filename.endswith(".zip") or filename.endswith(".abf")):
            return JSONResponse({"status": "error", "message": "Invalid filename extension"}, status_code=400)

        # Rule 8: Enumerate and match for local proof
        backup_found_path = None
        if backups_dir.exists():
            for entry in os.scandir(backups_dir):
                if entry.is_file() and entry.name == filename:
                    if storage.is_safe(entry.path):
                        backup_found_path = entry.path
                        break

        if not backup_found_path:
            return JSONResponse({"status": "error", "message": "Backup not found"}, status_code=404)

        os.unlink(backup_found_path)
        return JSONResponse({"status": "ok"})
    except Exception as e:
        logger.error(f"Failed to delete backup {filename} for project {project_id}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": "Internal server error during backup deletion"}, status_code=500)

@router.post("/{project_id}/backups/{filename}/restore")
def api_restore_project_backup(project_id: str, filename: str):
    """Restore chapter WAV + timing sidecar from a previously saved backup.

    Scoped recovery (synced_reader plan Task 6b, owner-approved addition):
    writes the chapter WAV and its paired timing sidecar back into a
    chapter's audio directory so the reader works immediately post-restore,
    even when the archive contains no segment WAVs. This restores audio
    into chapters that already exist in this project only -- it does not
    create new chapter/project rows, does not touch characters/speakers/
    queue state, and does not restore a chapter_id into a project other
    than the one that already owns it. Full project-structure
    reconstruction (a general import feature) is out of scope.

    Security: every file read from the archive goes through zf.read() on an
    arcname taken directly from the archive's own already-parsed chapter_map
    (never zf.extract()/extractall(), never zf.namelist() enumeration), and
    every destination path is built from trusted project_id/chapter_id via
    get_chapter_dir + secure_join_flat -- never from the arcname string.
    """
    try:
        if get_project(project_id) is None:
            return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

        from ...storage.manager import get_storage_manager
        storage = get_storage_manager()
        ctx = storage.get_project_context(project_id)
        backups_dir = ctx.root / "backups"

        if not storage.is_safe(backups_dir):
             return JSONResponse({"status": "error", "message": "Invalid backups directory"}, status_code=403)

        # Validation
        if not (filename.endswith(".zip") or filename.endswith(".abf")):
            return JSONResponse({"status": "error", "message": "Invalid filename extension"}, status_code=400)

        # Rule 8: Enumerate and match from backups dir for local proof (same
        # pattern as api_download_saved_backup / api_delete_project_backup).
        backup_found_path = None
        if backups_dir.exists():
            for entry in os.scandir(backups_dir):
                if entry.is_file() and entry.name == filename:
                    if storage.is_safe(entry.path):
                        backup_found_path = entry.path
                        break

        if not backup_found_path:
            return JSONResponse({"status": "error", "message": "Backup not found"}, status_code=404)

        restored_chapter_ids = []
        skipped_chapter_ids = []

        with zipfile.ZipFile(backup_found_path, "r") as zf:
            try:
                bundle_info = zf.getinfo("bundle.json")
            except KeyError:
                return JSONResponse({"status": "error", "message": "Backup archive is missing bundle.json"}, status_code=400)

            if bundle_info.file_size > _MAX_BUNDLE_JSON_BYTES:
                return JSONResponse({"status": "error", "message": "Backup bundle.json exceeds maximum allowed size"}, status_code=400)

            bundle_data = json.loads(zf.read("bundle.json"))

            # Every contract/manifest/schema in this codebase declares an
            # explicit version validated at load time (owner directive) --
            # a missing bundle_version is rejected the same as an
            # unsupported one, never silently assumed to be version 1.
            if bundle_data.get("bundle_version") != _SUPPORTED_BUNDLE_VERSION:
                return JSONResponse(
                    {"status": "error", "message": "Unsupported backup bundle version"},
                    status_code=400,
                )

            chapter_map = bundle_data.get("chapter_map") or {}

            for chapter_id, chapter_info in chapter_map.items():
                if not isinstance(chapter_info, dict):
                    skipped_chapter_ids.append(chapter_id)
                    continue

                # Recovery-into-an-existing-chapter only: never create a new
                # chapter row, never restore a chapter_id into a project
                # that doesn't already own it.
                chapter = get_chapter(chapter_id, project_id=project_id)
                if not chapter:
                    logger.info(
                        "Restore of backup %s: chapter %s not found in project %s; skipping",
                        filename, chapter_id, project_id,
                    )
                    skipped_chapter_ids.append(chapter_id)
                    continue

                audio_arcname = chapter_info.get("audio_path")
                if not audio_arcname:
                    # Nothing to restore for this chapter (no audio at
                    # backup time) -- not a failure, just a no-op.
                    continue

                # Only ever read the exact arcname the bundle's own
                # already-parsed chapter_map declared for this chapter --
                # never enumerate zf.namelist() and act on arbitrary members.
                try:
                    audio_info = zf.getinfo(audio_arcname)
                except KeyError:
                    logger.warning(
                        "Restore of backup %s: chapter_map audio_path %r for chapter %s is not a real archive member; skipping",
                        filename, audio_arcname, chapter_id,
                    )
                    skipped_chapter_ids.append(chapter_id)
                    continue

                if audio_info.file_size > _MAX_RESTORE_MEMBER_BYTES:
                    logger.warning(
                        "Restore of backup %s: member %r for chapter %s exceeds max restore size (%s bytes); skipping",
                        filename, audio_arcname, chapter_id, audio_info.file_size,
                    )
                    skipped_chapter_ids.append(chapter_id)
                    continue

                audio_bytes = zf.read(audio_arcname)

                # Destination is built entirely from trusted project_id /
                # chapter_id -- never from the arcname string. Reuse the
                # chapter's own recorded audio filename (stem) if it has
                # one, else fall back to the canonical "chapter" stem
                # resolve_chapter_asset_path's own fallback lookup uses.
                # Bundles are WAV-only (backup creation enforces this), so
                # the restored file is always written with a .wav suffix.
                chapter_dir = get_chapter_dir(project_id, chapter_id)
                chapter_dir.mkdir(parents=True, exist_ok=True)
                existing_filename = chapter.get("audio_file_path")
                dest_stem = safe_stem(existing_filename) if existing_filename else "chapter"
                dest_path = secure_join_flat(chapter_dir, f"{dest_stem}.wav")

                dest_path.write_bytes(audio_bytes)

                audio_generated_at = time.time()

                timing_arcname = chapter_info.get("timing_path")
                if timing_arcname:
                    timing_dest_path = dest_path.with_suffix(".timing.json")
                    try:
                        timing_info = zf.getinfo(timing_arcname)
                        if timing_info.file_size > _MAX_RESTORE_MEMBER_BYTES:
                            raise ValueError(
                                f"timing sidecar {timing_arcname!r} exceeds max restore size ({timing_info.file_size} bytes)"
                            )
                        timing_raw = json.loads(zf.read(timing_arcname))
                        parsed_timing = validate_timing_sidecar(timing_raw)
                    except (KeyError, ValueError, TimingSidecarValidationError):
                        logger.warning(
                            "Restore of backup %s: timing sidecar %r for chapter %s failed validation; restoring WAV only",
                            filename, timing_arcname, chapter_id, exc_info=True,
                        )
                    else:
                        write_timing_sidecar(timing_dest_path, parsed_timing)
                        audio_generated_at = parsed_timing.audio_generated_at

                update_chapter(
                    chapter_id,
                    audio_status="done",
                    audio_file_path=dest_path.name,
                    audio_generated_at=audio_generated_at,
                )

                restored_chapter_ids.append(chapter_id)

        return JSONResponse({
            "status": "ok",
            "restored_chapter_ids": restored_chapter_ids,
            "skipped_chapter_ids": skipped_chapter_ids,
        })
    except Exception as e:
        logger.error(f"Failed to restore backup {filename} for project {project_id}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": "Internal server error during backup restore"}, status_code=500)
