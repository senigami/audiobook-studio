import os
import time
import uuid
import json
import logging
import shutil
from pathlib import Path
from typing import Optional, Dict, Any

from .core import _db_lock, get_connection, init_db

logger = logging.getLogger(__name__)

def migrate_state_json_to_db():
    from ..core.config import BASE_DIR
    state_file = BASE_DIR / "state.json"
    if not state_file.exists():
        return

    init_db()

    # 1. Load state_data
    try:
        raw = state_file.read_text(encoding="utf-8", errors="replace").strip()
        if not raw:
            state_data = {}
        else:
            state_data = json.loads(raw)
    except Exception:
        logger.warning("Error loading state.json for migration", exc_info=True)
        return

    # 2. Perform DB migrations (Jobs and DB-resident metrics)
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()

            # Migrate Jobs
            cursor.execute("SELECT COUNT(*) FROM projects")
            count = cursor.fetchone()[0]
            if count == 0:
                jobs = state_data.get("jobs", {})
                if jobs:
                    project_id = str(uuid.uuid4())
                    now = time.time()
                    cursor.execute("""
                        INSERT INTO projects (id, name, series, author, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (project_id, "Imported Project", "Legacy Data", None, now, now))

                    for jid, jdata in jobs.items():
                        chap_id = str(uuid.uuid4())
                        audio_status = 'unprocessed'
                        if jdata.get("status") == "done": audio_status = 'done'
                        elif jdata.get("status") in ["queued", "running"]: audio_status = 'processing'

                        cursor.execute("""
                            INSERT INTO chapters (id, project_id, title, sort_order, audio_status, audio_file_path, text_last_modified, predicted_audio_length)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            chap_id,
                            project_id,
                            jdata.get("custom_title") or jdata.get("chapter_file", "Unknown Chapter"),
                            0,
                            audio_status,
                            jdata.get("output_mp3") or jdata.get("output_wav"),
                            now,
                            jdata.get("eta_seconds", 0)
                        ))
                    conn.commit()
                    logger.info("Successfully migrated legacy state.json jobs into the database")

            # Migrate DB-resident metrics blob
            try:
                from .legacy_migration import migrate_db_performance_metrics
                if migrate_db_performance_metrics(cursor):
                    conn.commit()
                    logger.info("Successfully migrated legacy performance metrics blob in DB")
            except Exception:
                pass

    # 3. Perform state.json cleanup (Settings and Metrics)
    try:
        from .legacy_migration import ensure_state_migrated
        if ensure_state_migrated(state_data):
            from ..state_helpers import _atomic_write_text
            _atomic_write_text(state_file, json.dumps(state_data, indent=2))
            logger.info("Cleaned up legacy engine-keys from state.json")
    except Exception as e:
        logger.debug("Minor: Non-job state migration skipped or failed: %s", e)

def migrate_legacy_project_covers() -> int:
    """
    Migration: Moves any shared global cover files into project-local storage
    so assets are correctly partitioned in v2.
    """
    from ..core import config

    candidates: list[tuple[str, Path, Path, str]] = []
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, cover_image_path FROM projects WHERE cover_image_path LIKE '/out/covers/%'")
            rows = cursor.fetchall()
            for row in rows:
                project_id = row["id"]
                cover_image_path = row["cover_image_path"]
                if not cover_image_path:
                    continue

                shared_name = Path(cover_image_path.replace("/out/covers/", "")).name
                if not shared_name:
                    continue

                shared_path = config.COVER_DIR / shared_name
                if not shared_path.is_file():
                    continue

                project_cover_dir = config.get_project_cover_dir(project_id)
                new_name = f"cover{shared_path.suffix.lower()}"
                destination = project_cover_dir / new_name
                new_virtual_path = f"/projects/{project_id}/cover/{new_name}"
                candidates.append((project_id, shared_path, destination, new_virtual_path))

    migrated_updates: list[tuple[str, str]] = []
    from ..storage.manager import get_storage_manager
    storage = get_storage_manager()

    for project_id, shared_path, destination, new_virtual_path in candidates:
        # Rule 9: Locally visible containment check via abstraction
        if not storage.is_safe(destination):
             logger.warning("Migration destination escapes projects root: %s", destination)
             continue

        os.makedirs(destination.parent, exist_ok=True)

        try:
            # Proof both sides
            if storage.is_safe(shared_path) and storage.is_safe(destination):
                if destination != shared_path:
                    shutil.copy2(shared_path, destination)
                migrated_updates.append((project_id, new_virtual_path))
        except Exception:
            logger.warning("Failed to migrate legacy shared cover %s for project %s", shared_path, project_id, exc_info=True)

    if migrated_updates:
        with _db_lock:
            with get_connection() as conn:
                cursor = conn.cursor()
                for project_id, new_virtual_path in migrated_updates:
                    cursor.execute(
                        "UPDATE projects SET cover_image_path = ?, updated_at = ? WHERE id = ?",
                        (new_virtual_path, time.time(), project_id),
                    )
                conn.commit()

    return len(migrated_updates)


def migrate_voice_profiles(voices_dir: Optional[Path] = None) -> None:
    """
    Migration: Reconciles speaker metadata and default profile assignments
    during transition to v2 storage.
    """
    from ..core import config
    from .speakers import normalize_profile_metadata
    voices_dir = voices_dir or config.VOICES_DIR

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, name, default_profile_name FROM speakers ORDER BY name ASC")
            speakers = [dict(row) for row in cursor.fetchall()]

    if not speakers:
        return

    pending_updates = []
    trusted_voices_root = os.path.abspath(os.fspath(voices_dir))

    # Pre-scan voices root once
    try:
        root_entries = {e.name: e for e in os.scandir(trusted_voices_root) if e.is_dir()}
    except OSError:
        return

    for speaker in speakers:
        speaker_name = speaker["name"]
        from ..storage.manager import get_storage_manager
        storage = get_storage_manager()
        voice_dir = storage.get_voice_dir(speaker_name)

        if not voice_dir.is_dir():
            continue

        # Check for v2 structure
        voice_json = voice_dir / "voice.json"
        if voice_json.exists():
            # Authoritative V2 structure: resolve to Default variant
            variant_dir = voice_dir / "Default"
            if not variant_dir.is_dir():
                continue
            meta_path_full = variant_dir / "profile.json"
        else:
            # LEGACY FALLBACK: Flat layout
            meta_path_full = voice_dir / "profile.json"

        if not meta_path_full.exists():
            continue

        meta: Dict[str, Any] = {}
        try:
            with open(meta_path_full, "r", encoding="utf-8") as f:
                meta = json.loads(f.read())
        except Exception:
            logger.warning("Failed to read base profile metadata for %s", meta_path_full, exc_info=True)
            continue

        # Normalize in memory
        orig_meta = meta.copy()
        meta = normalize_profile_metadata(speaker_name, meta, persist=False)

        if meta != orig_meta:
            try:
                with open(meta_path_full, "w", encoding="utf-8") as f:
                    f.write(json.dumps(meta, indent=2))
            except Exception:
                logger.warning("Failed to persist base profile metadata for %s", speaker_name, exc_info=True)

        if speaker.get("default_profile_name") != speaker_name:
            pending_updates.append((speaker_name, time.time(), speaker["id"]))

    if pending_updates:
        with _db_lock:
            with get_connection() as conn:
                cursor = conn.cursor()
                cursor.executemany(
                    "UPDATE speakers SET default_profile_name = ?, updated_at = ? WHERE id = ?",
                    pending_updates
                )
                conn.commit()
