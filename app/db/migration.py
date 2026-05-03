import time
import uuid
import json
import logging
from .core import _db_lock, get_connection, init_db

logger = logging.getLogger(__name__)

def migrate_state_json_to_db():
    from ..config import BASE_DIR
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
                from ..migration import migrate_db_performance_metrics
                if migrate_db_performance_metrics(cursor):
                    conn.commit()
                    logger.info("Successfully migrated legacy performance metrics blob in DB")
            except Exception:
                pass

    # 3. Perform state.json cleanup (Settings and Metrics)
    try:
        from ..migration import ensure_state_migrated
        if ensure_state_migrated(state_data):
            from ..state_helpers import _atomic_write_text
            _atomic_write_text(state_file, json.dumps(state_data, indent=2))
            logger.info("Cleaned up legacy engine-keys from state.json")
    except Exception as e:
        logger.debug("Minor: Non-job state migration skipped or failed: %s", e)
