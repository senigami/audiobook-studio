import json
import logging
import os
import urllib.parse
import zipfile
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Request, Query, Body, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.encoders import jsonable_encoder

from ...db import get_project
from ...config import get_project_dir, find_existing_project_dir, find_existing_project_subdir
from ...pathing import find_secure_file, secure_join_flat
from .projects_helpers import _get_project_service, _create_backup_archive

logger = logging.getLogger(__name__)

router = APIRouter()

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
        project_dir_path = find_existing_project_dir(project_id) or get_project_dir(project_id)

        # Rule 9: Locally visible safe-path pattern
        import os
        trusted_root = os.path.abspath(os.path.realpath(os.fspath(project_dir_path)))
        backups_dir_path = os.path.normpath(os.path.join(trusted_root, "backups"))

        if not backups_dir_path.startswith(trusted_root + os.sep) and backups_dir_path != trusted_root:
             raise ValueError(f"Invalid backups directory for project: {project_id}")

        os.makedirs(backups_dir_path, exist_ok=True)

        # Validate bundle name
        safe_name = os.path.basename(bundle.bundle_name)
        if safe_name != bundle.bundle_name:
            raise ValueError(f"Invalid bundle name: {bundle.bundle_name}")

        backup_full_path = os.path.normpath(os.path.join(backups_dir_path, safe_name))
        if not backup_full_path.startswith(backups_dir_path + os.sep):
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

        project_dir = find_existing_project_dir(project_id) or get_project_dir(project_id)
        # Rule 9: Secure join for literal subdirectory
        try:
            backups_dir = secure_join_flat(project_dir, "backups")
            backups_dir_path = os.path.abspath(os.path.realpath(os.fspath(backups_dir)))
        except ValueError:
             return JSONResponse({"status": "error", "message": "Invalid backups directory"}, status_code=403)

        backups = []
        if os.path.exists(backups_dir_path):
            # Rule 8: match from backups dir using os.scandir for explicit containment proof
            for entry in os.scandir(backups_dir_path):
                if entry.is_file() and entry.name.lower().endswith((".zip", ".abf")):
                    # Prove containment for entry
                    entry_path = os.path.abspath(os.path.realpath(entry.path))
                    if not entry_path.startswith(backups_dir_path + os.sep):
                        continue

                    st = entry.stat()
                    comment = None
                    # Try to extract comment from bundle.json inside the zip
                    try:
                        with zipfile.ZipFile(entry_path, "r") as zf:
                            if "bundle.json" in zf.namelist():
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

        project_dir = find_existing_project_dir(project_id) or get_project_dir(project_id)
        try:
            backups_dir = secure_join_flat(project_dir, "backups")
            backups_dir_path = os.path.abspath(os.path.realpath(os.fspath(backups_dir)))
        except ValueError:
             return JSONResponse({"status": "error", "message": "Invalid backups directory"}, status_code=403)

        # Validation
        if not (filename.endswith(".zip") or filename.endswith(".abf")):
            return JSONResponse({"status": "error", "message": "Invalid filename extension"}, status_code=400)

        # Rule 8: Enumerate and match from backups dir for local proof
        backup_found_path = None
        for entry in os.scandir(backups_dir_path):
            if entry.is_file() and entry.name == filename:
                cand_path = os.path.abspath(os.path.realpath(entry.path))
                if cand_path.startswith(backups_dir_path + os.sep):
                    backup_found_path = cand_path
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

        project_dir = find_existing_project_dir(project_id) or get_project_dir(project_id)
        try:
            backups_dir = secure_join_flat(project_dir, "backups")
            backups_dir_path = os.path.abspath(os.path.realpath(os.fspath(backups_dir)))
        except ValueError:
             return JSONResponse({"status": "error", "message": "Invalid backups directory"}, status_code=403)

        # Validation
        if not (filename.endswith(".zip") or filename.endswith(".abf")):
            return JSONResponse({"status": "error", "message": "Invalid filename extension"}, status_code=400)

        # Rule 8: Enumerate and match for local proof
        backup_found_path = None
        for entry in os.scandir(backups_dir_path):
            if entry.is_file() and entry.name == filename:
                cand_path = os.path.abspath(os.path.realpath(entry.path))
                if cand_path.startswith(backups_dir_path + os.sep):
                    backup_found_path = cand_path
                    break

        if not backup_found_path:
            return JSONResponse({"status": "error", "message": "Backup not found"}, status_code=404)

        # Update bundle.json inside the ZIP
        import tempfile
        import shutil

        # Use a safe temp directory
        fd, temp_path = tempfile.mkstemp(dir=os.path.dirname(backup_found_path))
        try:
            os.close(fd)
            # Proof both sides independently for move
            source_abs = os.path.abspath(os.path.realpath(temp_path))
            dest_abs = os.path.abspath(os.path.realpath(backup_found_path))

            if not source_abs.startswith(backups_dir_path + os.sep) or not dest_abs.startswith(backups_dir_path + os.sep):
                 raise ValueError("Invalid operation path")

            with zipfile.ZipFile(dest_abs, "r") as zin:
                with zipfile.ZipFile(source_abs, "w", zipfile.ZIP_DEFLATED) as zout:
                    for item in zin.infolist():
                        if item.filename == "bundle.json":
                            data = json.loads(zin.read(item.filename))
                            data["comment"] = comment
                            zout.writestr(item.filename, json.dumps(data, indent=2))
                        else:
                            zout.writestr(item, zin.read(item.filename))

            shutil.move(source_abs, dest_abs)
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

        project_dir = find_existing_project_dir(project_id) or get_project_dir(project_id)
        try:
            backups_dir = secure_join_flat(project_dir, "backups")
            backups_dir_path = os.path.abspath(os.path.realpath(os.fspath(backups_dir)))
        except ValueError:
             return JSONResponse({"status": "error", "message": "Invalid backups directory"}, status_code=403)

        # Validation
        if not (filename.endswith(".zip") or filename.endswith(".abf")):
            return JSONResponse({"status": "error", "message": "Invalid filename extension"}, status_code=400)

        # Rule 8: Enumerate and match for local proof
        backup_found_path = None
        for entry in os.scandir(backups_dir_path):
            if entry.is_file() and entry.name == filename:
                cand_path = os.path.abspath(os.path.realpath(entry.path))
                if cand_path.startswith(backups_dir_path + os.sep):
                    backup_found_path = cand_path
                    break

        if not backup_found_path:
            return JSONResponse({"status": "error", "message": "Backup not found"}, status_code=404)

        os.unlink(backup_found_path)
        return JSONResponse({"status": "ok"})
    except Exception as e:
        logger.error(f"Failed to delete backup {filename} for project {project_id}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": "Internal server error during backup deletion"}, status_code=500)
