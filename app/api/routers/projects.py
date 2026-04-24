import uuid
import time
import json
import re
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List
import zipfile
import io
from fastapi import APIRouter, Form, File, UploadFile, Request, Query, Body
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.encoders import jsonable_encoder
from ...db import (
    create_project,
    get_project,
    get_chapter,
    list_projects,
    update_project,
    delete_project,
    list_chapters as db_list_chapters,
    reorder_chapters,
)
from ...config import COVER_DIR, XTTS_OUT_DIR, get_project_dir, get_project_cover_dir, find_existing_project_dir, find_existing_project_subdir, get_project_audio_dir
import urllib.parse
from ...jobs import enqueue
from ...engines import get_audio_duration
from ...state import put_job, update_job, get_jobs
from ...models import Job
from ...pathing import safe_basename, safe_join, safe_join_flat
from ...api.utils import SAFE_FILE_RE, preferred_audiobook_download_filename, probe_audiobook_metadata
from ...constants import DEFAULT_VOICE_SENTINEL
from ...domain.projects.service import create_project_service, ProjectService
from ...domain.projects.models import ProjectModel, ProjectSnapshotModel, ProjectBackupBundleModel
from ...domain.chapters.models import ChapterModel
from ...db.core import _db_lock, get_connection

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["projects"])


class SqliteProjectRepository:
    """Project repository implementation using existing SQLite DB."""

    def _ensure_table(self):
        with _db_lock:
            with get_connection() as conn:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS project_snapshots (
                        id TEXT PRIMARY KEY,
                        project_id TEXT NOT NULL,
                        label TEXT NOT NULL,
                        source_revision TEXT NOT NULL,
                        metadata_json TEXT,
                        chapter_ids TEXT,
                        artifact_hashes TEXT,
                        created_at REAL,
                        FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
                    )
                """)
                conn.commit()

    def get(self, project_id: str) -> Optional[ProjectModel]:
        p = get_project(project_id)
        if not p:
            return None
        return ProjectModel(
            id=p["id"],
            title=p["name"],
            author=p.get("author"),
            series=p.get("series"),
            cover_asset_ref=p.get("cover_image_path"),
            default_voice_id=p.get("speaker_profile_name"),
        )

    def list_all(self) -> List[ProjectModel]:
        return [
            ProjectModel(
                id=p["id"],
                title=p["name"],
                author=p.get("author"),
                series=p.get("series"),
                cover_asset_ref=p.get("cover_image_path"),
                default_voice_id=p.get("speaker_profile_name"),
            )
            for p in list_projects()
        ]

    def save(self, project: ProjectModel) -> ProjectModel:
        # Placeholder for real persistence update if needed in this slice
        return project

    def delete(self, project_id: str) -> None:
        delete_project(project_id)

    def save_snapshot(self, snapshot: ProjectSnapshotModel) -> ProjectSnapshotModel:
        self._ensure_table()
        with _db_lock:
            with get_connection() as conn:
                conn.execute("""
                    INSERT OR REPLACE INTO project_snapshots
                    (id, project_id, label, source_revision, metadata_json, chapter_ids, artifact_hashes, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    snapshot.id,
                    snapshot.project_id,
                    snapshot.label,
                    snapshot.source_revision,
                    json.dumps(snapshot.metadata_json),
                    json.dumps(snapshot.chapter_ids),
                    json.dumps(snapshot.artifact_hashes),
                    snapshot.created_at.timestamp() if snapshot.created_at else time.time()
                ))
                conn.commit()
        return snapshot

    def get_snapshot(self, project_id: str, revision_id: str) -> Optional[ProjectSnapshotModel]:
        self._ensure_table()
        with _db_lock:
            with get_connection() as conn:
                cursor = conn.execute(
                    "SELECT * FROM project_snapshots WHERE project_id = ? AND source_revision = ?",
                    (project_id, revision_id)
                )
                row = cursor.fetchone()
                if not row:
                    return None
                return ProjectSnapshotModel(
                    id=row["id"],
                    project_id=row["project_id"],
                    label=row["label"],
                    source_revision=row["source_revision"],
                    metadata_json=json.loads(row["metadata_json"]),
                    chapter_ids=json.loads(row["chapter_ids"]),
                    artifact_hashes=json.loads(row["artifact_hashes"]),
                    created_at=datetime.fromtimestamp(row["created_at"], timezone.utc) if row["created_at"] else datetime.now(timezone.utc)
                )

    def list_snapshots(self, project_id: str) -> List[ProjectSnapshotModel]:
        self._ensure_table()
        with _db_lock:
            with get_connection() as conn:
                cursor = conn.execute(
                    "SELECT * FROM project_snapshots WHERE project_id = ? ORDER BY created_at DESC",
                    (project_id,)
                )
                return [
                    ProjectSnapshotModel(
                        id=row["id"],
                        project_id=row["project_id"],
                        label=row["label"],
                        source_revision=row["source_revision"],
                        metadata_json=json.loads(row["metadata_json"]),
                        chapter_ids=json.loads(row["chapter_ids"]),
                        artifact_hashes=json.loads(row["artifact_hashes"]),
                        created_at=datetime.fromtimestamp(row["created_at"], timezone.utc) if row["created_at"] else datetime.now(timezone.utc)
                    )
                    for row in cursor.fetchall()
                ]


class SqliteChapterRepository:
    """Chapter repository implementation using existing SQLite DB."""

    def list_by_project(self, project_id: str) -> List[ChapterModel]:
        chapters = db_list_chapters(project_id)
        return [
            ChapterModel(
                id=c["id"],
                project_id=c["project_id"],
                title=c["title"],
                order_index=c.get("sort_order", 0),
                word_count=c.get("word_count", 0),
                character_count=c.get("char_count", 0),
            )
            for c in chapters
        ]

    def get(self, chapter_id: str) -> Optional[ChapterModel]:
        c = get_chapter(chapter_id)
        if not c:
            return None
        return ChapterModel(
            id=c["id"],
            project_id=c["project_id"],
            title=c["title"],
            order_index=c.get("sort_order", 0),
            word_count=c.get("word_count", 0),
            character_count=c.get("char_count", 0),
        )


def _get_project_service() -> ProjectService:
    return create_project_service(
        repository=SqliteProjectRepository(),
        chapter_repository=SqliteChapterRepository()
    )


async def _store_project_cover(project_id: str, project_dir: Path, cover: UploadFile) -> str:
    safe_cover_name = safe_basename(cover.filename)
    ext = Path(safe_cover_name).suffix.lower() or ".jpg"
    project_root = os.path.abspath(os.path.normpath(os.fspath(project_dir)))
    cover_dir_path = os.path.abspath(os.path.normpath(os.path.join(project_root, "cover")))
    if not cover_dir_path.startswith(project_root + os.sep):
        raise ValueError(f"Invalid project cover directory for id: {project_id}")
    cover_dir = Path(cover_dir_path)
    cover_dir.mkdir(parents=True, exist_ok=True)
    cover_filename = f"cover{ext}"
    cover_path_str = os.path.abspath(os.path.normpath(os.path.join(cover_dir_path, cover_filename)))
    if not cover_path_str.startswith(cover_dir_path + os.sep):
        raise ValueError(f"Invalid project cover filename for id: {project_id}")
    cover_p = Path(cover_path_str)

    for existing in cover_dir.iterdir():
        if existing.is_file() and existing.name != cover_filename:
            existing.unlink(missing_ok=True)

    content = await cover.read()
    cover_p.write_bytes(content)
    return f"/projects/{project_id}/cover/{cover_filename}"

@router.get("")
def api_list_projects():
    return JSONResponse(list_projects())

@router.post("/{project_id}/reorder_chapters")
def api_reorder_chapters_route(project_id: str, chapter_ids: str = Form(...)):
    try:
        ids_list = json.loads(chapter_ids)
        reorder_chapters(ids_list)
        return JSONResponse({"status": "ok"})
    except Exception:
        logger.warning("Failed to reorder chapters for project %s", project_id, exc_info=True)
        return JSONResponse({"status": "error", "message": "Invalid chapter order"}, status_code=400)

@router.get("/{project_id}")
def api_get_project(project_id: str):
    p = get_project(project_id)
    if not p:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)
    return JSONResponse(p)

@router.post("")
async def api_create_project(
    name: str = Form(...),
    series: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    speaker_profile_name: Optional[str] = Form(None),
    cover: Optional[UploadFile] = File(None)
):
    normalized_profile_name = (speaker_profile_name or "").strip() or None
    pid = create_project(name, series, author, None, normalized_profile_name)
    if cover:
        cover_path = await _store_project_cover(pid, get_project_dir(pid), cover)
        update_project(pid, cover_image_path=cover_path)
    return JSONResponse({"status": "ok", "project_id": pid})

@router.put("/{project_id}")
async def api_update_project(
    project_id: str,
    name: Optional[str] = Form(None),
    series: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    speaker_profile_name: Optional[str] = Form(None),
    cover: Optional[UploadFile] = File(None)
):
    p = get_project(project_id)
    if not p:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

    updates = {}
    if name is not None: updates["name"] = name
    if series is not None: updates["series"] = series
    if author is not None: updates["author"] = author
    if speaker_profile_name is not None:
        normalized_profile_name = (speaker_profile_name.strip() or None)
        if normalized_profile_name == DEFAULT_VOICE_SENTINEL:
            normalized_profile_name = None
        updates["speaker_profile_name"] = normalized_profile_name

    if cover:
        project_dir = find_existing_project_dir(project_id) or get_project_dir(project_id)
        updates["cover_image_path"] = await _store_project_cover(project_id, project_dir, cover)

    if updates:
        update_project(project_id, **updates)

    return JSONResponse({"status": "ok", "project_id": project_id})

@router.delete("/{project_id}")
def api_delete_project(project_id: str):
    success = delete_project(project_id)
    if success:
        return JSONResponse({"status": "ok"})
    return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

@router.get("/{project_id}/audiobooks")
def api_list_project_audiobooks(project_id: str):
    project = get_project(project_id)
    if not project:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

    m4b_dir = find_existing_project_subdir(project_id, "m4b")
    m4b_files = []
    if m4b_dir and m4b_dir.exists():
        for p in m4b_dir.iterdir():
            if not p.is_file() or p.suffix.lower() != ".m4b" or not SAFE_FILE_RE.fullmatch(p.name):
                continue
            encoded_name = urllib.parse.quote(p.name)
            m4b_files.append((p.name, f"/projects/{project_id}/m4b/{encoded_name}"))

    seen_paths = set()
    unique_files = []
    for filename, url in m4b_files:
        if filename not in seen_paths:
            seen_paths.add(filename)
            unique_files.append((filename, url))

    res = []
    unique_files.sort(key=lambda x: (m4b_dir / x[0]).stat().st_mtime, reverse=True)

    for filename, url in unique_files:
        if m4b_dir is None:
            continue
        probe_target = os.path.abspath(os.path.normpath(os.path.join(os.fspath(m4b_dir), filename)))
        trusted_root = os.path.abspath(os.path.normpath(os.fspath(m4b_dir)))
        if not probe_target.startswith(trusted_root + os.sep) or not os.path.isfile(probe_target):
            continue
        p = Path(probe_target)
        st = p.stat()
        item = {
            "filename": p.name,
            "title": p.name,
            "cover_url": None,
            "url": url,
            "created_at": st.st_mtime,
            "size_bytes": st.st_size,
            "download_filename": p.name,
        }
        try:
            probe_data = probe_audiobook_metadata(m4b_dir, p.name)
            if "format" in probe_data:
                fmt = probe_data["format"]
                if "duration" in fmt:
                    item["duration_seconds"] = float(fmt["duration"])
                if "tags" in fmt and "title" in fmt["tags"]:
                    item["title"] = fmt["tags"]["title"]
        except Exception:
            logger.warning("Failed to probe audiobook metadata for %s", p, exc_info=True)

        item["download_filename"] = preferred_audiobook_download_filename(item["title"], p.name)

        # Read description from sidecar file if it exists
        description_path = p.with_suffix(p.suffix + ".description")
        if description_path.exists():
            try:
                item["description"] = description_path.read_text(encoding="utf-8").strip()
            except Exception:
                pass

        # Look for cover image with multiple extensions
        item["cover_url"] = None
        for ext in [".jpg", ".png", ".jpeg", ".webp"]:
            target_img = p.with_suffix(ext)
            if target_img.exists() and target_img.stat().st_size > 0:
                encoded_ext = urllib.parse.quote(target_img.name)
                item["cover_url"] = f"/projects/{project_id}/m4b/{encoded_ext}"
                break
        res.append(item)
    return res

@router.post("/{project_id}/assemble")
def assemble_project(project_id: str, chapter_ids: Optional[str] = Form(None)):
    import json

    project = get_project(project_id)
    if not project:
        return JSONResponse({"error": "Project not found"}, status_code=404)

    chapters = db_list_chapters(project_id)
    if not chapters:
        return JSONResponse({"error": "No chapters found in project"}, status_code=400)

    selected_ids = []
    if chapter_ids:
        try:
            selected_ids = json.loads(chapter_ids)
        except Exception:
            selected_ids = []

    if selected_ids:
        chapters = [c for c in chapters if c['id'] in selected_ids]

    if not chapters:
        return JSONResponse({"error": "No valid chapters selected for assembly"}, status_code=400)

    chapter_list = []
    for c in chapters:
        if c['audio_status'] == 'done' and c['audio_file_path']:
            chapter_list.append({
                'filename': c['audio_file_path'],
                'title': c['title']
            })
        else:
            return JSONResponse({
                "error": f"Chapter '{c['title']}' is not processed yet or audio is missing."
            }, status_code=400)

    book_title = project['name']
    timestamp = time.strftime("%Y-%m-%d_%H-%M-%S")
    # Include project_id for better uniqueness and filtering
    unique_filename = f"{book_title}_{project_id[:8]}_{timestamp}"

    jid = uuid.uuid4().hex[:12]
    cover_path = project.get('cover_image_path', None)
    if cover_path:
        if cover_path.startswith('/out/covers/'):
            filename = cover_path.replace('/out/covers/', '')
            cover_path = str(safe_join_flat(COVER_DIR, filename))
        elif cover_path.startswith(f'/projects/{project_id}/'):
            filename = cover_path.replace(f'/projects/{project_id}/', '')
            cover_path = str(safe_join(get_project_dir(project_id), filename))

    j = Job(
        id=jid,
        project_id=project_id,
        engine="audiobook",
        chapter_file=unique_filename,
        custom_title=book_title,
        status="queued",
        created_at=time.time(),
        safe_mode=False,
        make_mp3=False,
        bypass_pause=True,
        author_meta=project.get('author', ''),
        narrator_meta="Generated by Audiobook Studio",
        chapter_list=chapter_list,
        cover_path=cover_path
    )
    put_job(j)
    update_job(jid, force_broadcast=True, status="queued", project_id=project_id, custom_title=book_title)
    enqueue(j)
    return JSONResponse({"status": "ok", "job_id": jid})

@router.get("/{project_id}/export-manifest")
def api_get_project_export_manifest(project_id: str, format_id: str = Query("audiobook")):
    """Build and return an export manifest for the project."""
    service = _get_project_service()
    try:
        manifest = service.build_export_manifest(project_id, format_id=format_id)
        return JSONResponse(jsonable_encoder(manifest))
    except KeyError:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)
    except NotImplementedError as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=501)
    except Exception as e:
        logger.error(f"Failed to build export manifest for project {project_id}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

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
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

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
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

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
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

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
        project_dir = find_existing_project_dir(project_id) or get_project_dir(project_id)
        backups_dir = project_dir / "backups"
        backups_dir.mkdir(parents=True, exist_ok=True)

        backup_path = backups_dir / bundle.bundle_name
        backup_path.write_bytes(archive_buf.getvalue())

        return JSONResponse({
            "status": "ok",
            "filename": bundle.bundle_name,
            "created_at": bundle.created_at.isoformat(),
            "size_bytes": backup_path.stat().st_size
        })
    except KeyError:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)
    except Exception as e:
        logger.error(f"Failed to save backup bundle for project {project_id}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

@router.get("/{project_id}/backups")
def api_list_project_backups(project_id: str):
    """List saved backups for a project with portable metadata."""
    try:
        if get_project(project_id) is None:
            return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

        project_dir = find_existing_project_dir(project_id) or get_project_dir(project_id)
        backups_dir = project_dir / "backups"

        backups = []
        if backups_dir.exists():
            for p in backups_dir.iterdir():
                if p.is_file() and p.suffix.lower() in (".zip", ".abf"):
                    st = p.stat()
                    comment = None
                    # Try to extract comment from bundle.json inside the zip
                    try:
                        with zipfile.ZipFile(p, "r") as zf:
                            if "bundle.json" in zf.namelist():
                                bundle_data = json.loads(zf.read("bundle.json"))
                                comment = bundle_data.get("comment")
                    except Exception:
                        pass

                    backups.append({
                        "filename": p.name,
                        "created_at": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(),
                        "size_bytes": st.st_size,
                        "comment": comment,
                        "download_url": f"/api/projects/{project_id}/backups/{urllib.parse.quote(p.name)}/download"
                    })

        backups.sort(key=lambda x: x["created_at"], reverse=True)
        return JSONResponse(backups)
    except Exception as e:
        logger.error(f"Failed to list backups for project {project_id}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

@router.get("/{project_id}/backups/{filename}/download")
def api_download_saved_backup(project_id: str, filename: str):
    """Download a previously saved backup file."""
    try:
        if get_project(project_id) is None:
            return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

        project_dir = find_existing_project_dir(project_id) or get_project_dir(project_id)
        backups_dir = project_dir / "backups"

        # Validation
        if not (filename.endswith(".zip") or filename.endswith(".abf")) or "/" in filename or "\\" in filename:
            return JSONResponse({"status": "error", "message": "Invalid filename"}, status_code=400)

        backup_path = backups_dir / filename
        if not backup_path.exists() or not backup_path.is_file():
            return JSONResponse({"status": "error", "message": "Backup not found"}, status_code=404)

        # Security: Ensure it's still under backups_dir
        if not os.path.abspath(backup_path).startswith(os.fspath(backups_dir.resolve()) + os.sep):
            return JSONResponse({"status": "error", "message": "Access denied"}, status_code=403)

        media_type = "application/zip" if filename.endswith(".zip") else "application/x-audiobook-factory-bundle"

        return FileResponse(
            backup_path,
            media_type=media_type,
            filename=filename,
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
    except Exception as e:
        logger.error(f"Failed to download saved backup {filename} for project {project_id}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

@router.patch("/{project_id}/backups/{filename}")
def api_update_project_backup_metadata(project_id: str, filename: str, comment: str = Body(..., embed=True)):
    """Update metadata (comment) for a saved backup."""
    try:
        if get_project(project_id) is None:
            return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

        project_dir = find_existing_project_dir(project_id) or get_project_dir(project_id)
        backups_dir = project_dir / "backups"

        # Validation
        if not (filename.endswith(".zip") or filename.endswith(".abf")) or "/" in filename or "\\" in filename:
            return JSONResponse({"status": "error", "message": "Invalid filename"}, status_code=400)

        backup_path = backups_dir / filename
        if not backup_path.exists() or not backup_path.is_file():
            return JSONResponse({"status": "error", "message": "Backup not found"}, status_code=404)

        # Security: Ensure it's still under backups_dir
        if not os.path.abspath(backup_path).startswith(os.fspath(backups_dir.resolve()) + os.sep):
            return JSONResponse({"status": "error", "message": "Access denied"}, status_code=403)

        # Update bundle.json inside the ZIP
        import tempfile
        import shutil

        fd, temp_path = tempfile.mkstemp()
        try:
            os.close(fd)
            with zipfile.ZipFile(backup_path, "r") as zin:
                with zipfile.ZipFile(temp_path, "w", zipfile.ZIP_DEFLATED) as zout:
                    for item in zin.infolist():
                        if item.filename == "bundle.json":
                            data = json.loads(zin.read(item.filename))
                            data["comment"] = comment
                            zout.writestr(item.filename, json.dumps(data, indent=2))
                        else:
                            zout.writestr(item, zin.read(item.filename))
            shutil.move(temp_path, backup_path)
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

        return JSONResponse({"status": "ok"})
    except Exception as e:
        logger.error(f"Failed to update backup metadata for {filename}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

@router.patch("/{project_id}/audiobooks/{filename}")
def api_update_audiobook_metadata(project_id: str, filename: str, description: str = Body(..., embed=True)):
    """Update metadata (description) for a project assembly."""
    try:
        if get_project(project_id) is None:
            return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

        project_dir = find_existing_project_dir(project_id) or get_project_dir(project_id)
        m4b_dir = project_dir / "m4b"

        # Validation
        if not filename.endswith(".m4b") or "/" in filename or "\\" in filename:
            return JSONResponse({"status": "error", "message": "Invalid filename"}, status_code=400)

        audiobook_path = m4b_dir / filename
        if not audiobook_path.exists() or not audiobook_path.is_file():
            return JSONResponse({"status": "error", "message": "Audiobook not found"}, status_code=404)

        # Security
        if not os.path.abspath(audiobook_path).startswith(os.fspath(m4b_dir.resolve()) + os.sep):
            return JSONResponse({"status": "error", "message": "Access denied"}, status_code=403)

        # Store description in sidecar file
        description_path = audiobook_path.with_suffix(audiobook_path.suffix + ".description")
        description_path.write_text(description, encoding="utf-8")

        return JSONResponse({"status": "ok"})
    except Exception as e:
        logger.error(f"Failed to update audiobook metadata for {filename}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

@router.delete("/{project_id}/backups/{filename}")
def api_delete_project_backup(project_id: str, filename: str):
    """Delete a saved project backup."""
    try:
        if get_project(project_id) is None:
            return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

        project_dir = find_existing_project_dir(project_id) or get_project_dir(project_id)
        backups_dir = project_dir / "backups"

        # Validation
        if not (filename.endswith(".zip") or filename.endswith(".abf")) or "/" in filename or "\\" in filename:
            return JSONResponse({"status": "error", "message": "Invalid filename"}, status_code=400)

        backup_path = backups_dir / filename
        if not backup_path.exists() or not backup_path.is_file():
            return JSONResponse({"status": "error", "message": "Backup not found"}, status_code=404)

        # Security: Ensure it's still under backups_dir
        if not os.path.abspath(backup_path).startswith(os.fspath(backups_dir.resolve()) + os.sep):
            return JSONResponse({"status": "error", "message": "Access denied"}, status_code=403)

        backup_path.unlink()
        return JSONResponse({"status": "ok"})
    except Exception as e:
        logger.error(f"Failed to delete backup {filename} for project {project_id}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

def _create_backup_archive(bundle: ProjectBackupBundleModel) -> io.BytesIO:
    """Helper to assemble a portable ZIP archive from a backup bundle plan."""
    buf = io.BytesIO()

    # Track paths and handle collisions for the bundle metadata
    chapter_map = {}
    used_filenames = set()

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # 1. Project Assets (Process chapters first to build the mapping)
        project_id = bundle.project_id
        project_dir = find_existing_project_dir(project_id) or get_project_dir(project_id)

        for idx, chapter_id in enumerate(bundle.snapshot.chapter_ids, 1):
            chapter = get_chapter(chapter_id)
            if not chapter:
                continue

            title = chapter.get("title") or f"Chapter {idx}"
            sanitized_title = _sanitize_filename(title)

            # Filename format: {order:02d}_{sanitized_title}.txt
            base_filename = f"{idx:02d}_{sanitized_title}"
            if not sanitized_title:
                base_filename = f"{idx:02d}_Chapter"

            text_filename = f"{base_filename}.txt"

            # Disambiguate if collision
            counter = 1
            while text_filename in used_filenames:
                text_filename = f"{base_filename}_{counter}.txt"
                counter += 1

            used_filenames.add(text_filename)

            # Include Chapter Text
            text_content = chapter.get("text_content", "")
            zf.writestr(f"chapters/{text_filename}", text_content.encode("utf-8"))

            chapter_info = {
                "title": title,
                "order": idx,
                "text_path": f"chapters/{text_filename}"
            }

            # Optional Chapter Audio (WAV-only)
            if bundle.export_manifest.include_audio and chapter.get("audio_file_path") and chapter.get("audio_status") == "done":
                # Find the WAV asset specifically
                raw_path = chapter["audio_file_path"]
                wav_path = raw_path
                if not raw_path.lower().endswith(".wav"):
                    # Try to find corresponding .wav if path points to .mp3 or similar
                    wav_path = str(Path(raw_path).with_suffix(".wav"))

                audio_dir = get_project_audio_dir(project_id)
                audio_path = audio_dir / wav_path
                if not audio_path.exists():
                    # Fallback to the original path if wav not found (might already be wav)
                    audio_path = audio_dir / raw_path

                if audio_path.exists() and audio_path.suffix.lower() == ".wav":
                    audio_ext = ".wav"
                    # Use the same base filename as the text for easy pairing
                    audio_filename = f"{Path(text_filename).stem}{audio_ext}"
                    zf.write(audio_path, arcname=f"chapters/{audio_filename}")
                    chapter_info["audio_path"] = f"chapters/{audio_filename}"

            chapter_map[chapter_id] = chapter_info

        # Attach the resolved map to the bundle before serialization
        bundle.chapter_map = chapter_map

        # 2. Metadata files (portable JSON)
        zf.writestr("bundle.json", json.dumps(jsonable_encoder(bundle), indent=2))
        zf.writestr("manifest.json", json.dumps(jsonable_encoder(bundle.export_manifest), indent=2))
        zf.writestr("snapshot.json", json.dumps(jsonable_encoder(bundle.snapshot), indent=2))

        # 3. Cover art
        cover_dir = project_dir / "cover"
        if cover_dir.exists():
            for p in cover_dir.iterdir():
                if p.is_file() and p.stem == "cover":
                    zf.write(p, arcname=f"cover{p.suffix}")
                    break

    buf.seek(0)
    return buf

def _sanitize_filename(name: str) -> str:
    """Sanitize a string for use as a filesystem filename."""
    # Replace non-alphanumeric (except . - _) with underscores
    s = re.sub(r'[^a-zA-Z0-9._-]', '_', name)
    # Collapse multiple underscores
    s = re.sub(r'_+', '_', s)
    # Strip leading/trailing underscores
    return s.strip('_')

@router.get("/audiobook/prepare")
def prepare_audiobook():
    """Scans folders and returns a preview of chapters/durations for the modal."""
    src_dir = XTTS_OUT_DIR
    if not src_dir.exists():
        return JSONResponse({"title": "", "chapters": []})

    all_files = [p.name for p in src_dir.iterdir() if p.is_file() and p.suffix.lower() in ('.wav', '.mp3') and not p.name.startswith('seg_')]
    chapters_found = {}
    for f in all_files:
        stem = Path(f).stem
        ext = Path(f).suffix.lower()
        if stem not in chapters_found or ext == '.mp3':
             chapters_found[stem] = f

    def extract_number(filename):
        # Match part numbers or the whole stem to avoid UUID hashes
        match = re.search(r'(?:part_)?(\d+)(?:\.|$|_)', filename, re.IGNORECASE)
        return int(match.group(1)) if match else 0

    sorted_stems = sorted(chapters_found.keys(), key=lambda x: extract_number(x))
    preview = []
    total_sec = 0.0
    existing_jobs = get_jobs()
    job_titles = {j.chapter_file: j.custom_title for j in existing_jobs.values() if j.custom_title}

    for stem in sorted_stems:
        fname = chapters_found[stem]
        dur = get_audio_duration(safe_join_flat(src_dir, fname))
        display_name = job_titles.get(stem + ".txt") or job_titles.get(stem) or stem
        preview.append({
            "filename": fname,
            "title": display_name,
            "duration": dur
        })
        total_sec += dur

    return {
        "title": "Audiobook Project",
        "chapters": preview,
        "total_duration": total_sec
    }
