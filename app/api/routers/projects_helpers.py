import json
import re
import logging
import io
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List

from ...db import (
    get_project,
    get_chapter,
    list_projects,
    list_chapters as db_list_chapters,
    delete_project,
)
from ...config import COVER_DIR, get_project_dir
from ...pathing import safe_basename, find_secure_file, secure_join_flat
from ...domain.projects.service import create_project_service, ProjectService
from ...domain.projects.models import ProjectModel, ProjectSnapshotModel, ProjectBackupBundleModel
from ...domain.chapters.models import ChapterModel
from ...db.core import _db_lock, get_connection

logger = logging.getLogger(__name__)

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


async def _store_project_cover(project_id: str, project_dir: Path, cover):
    safe_cover_name = safe_basename(cover.filename)
    ext = Path(safe_cover_name).suffix.lower() or ".jpg"
    project_root = project_dir.resolve()
    # Rule 9: Secure join for literal subdirectory
    try:
        cover_dir = secure_join_flat(project_root, "cover")
    except ValueError:
        raise ValueError(f"Invalid cover directory for project: {project_id}")
    cover_dir.mkdir(parents=True, exist_ok=True)
    cover_filename = f"cover{ext}"
    try:
        cover_p = secure_join_flat(cover_dir, cover_filename)
    except ValueError:
        raise ValueError(f"Invalid project cover filename for id: {project_id}")

    for existing in cover_dir.iterdir():
        if existing.is_file() and existing.name != cover_filename:
            existing.unlink(missing_ok=True)

    content = await cover.read()
    cover_p.write_bytes(content)
    return f"/projects/{project_id}/cover/{cover_filename}"


def _create_backup_archive(bundle: ProjectBackupBundleModel) -> io.BytesIO:
    """Helper to assemble a portable ZIP archive from a backup bundle plan."""
    from fastapi.encoders import jsonable_encoder
    from ...config import find_existing_project_dir
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

                from app.config import get_project_audio_dir
                audio_dir = get_project_audio_dir(project_id)
                # Rule 8: Enumerate and match
                audio_path = find_secure_file(audio_dir, wav_path)
                if not audio_path:
                    # Fallback to the original path if wav not found (might already be wav)
                    audio_path = find_secure_file(audio_dir, raw_path)

                if audio_path and audio_path.exists() and audio_path.suffix.lower() == ".wav":
                    audio_ext = ".wav"
                    # Use the same base filename as the text for easy pairing
                    try:
                        audio_filename = secure_join_flat(audio_dir, f"{Path(text_filename).stem}{audio_ext}").name
                        zf.write(audio_path, arcname=f"chapters/{audio_filename}")
                        chapter_info["audio_path"] = f"chapters/{audio_filename}"
                    except ValueError:
                        pass

            chapter_map[chapter_id] = chapter_info

        # Attach the resolved map to the bundle before serialization
        bundle.chapter_map = chapter_map

        # 2. Metadata files (portable JSON)
        zf.writestr("bundle.json", json.dumps(jsonable_encoder(bundle), indent=2))
        zf.writestr("manifest.json", json.dumps(jsonable_encoder(bundle.export_manifest), indent=2))
        zf.writestr("snapshot.json", json.dumps(jsonable_encoder(bundle.snapshot), indent=2))

        # 3. Cover art
        # Rule 9: Secure join for literal subdirectory
        try:
            cover_dir = secure_join_flat(project_dir, "cover")
        except ValueError:
            pass
        else:
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
