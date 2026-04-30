import os
import logging
from .core import _db_lock, get_connection
from ..subprocess_utils import probe_audio_duration

logger = logging.getLogger(__name__)

def reconcile_project_audio(project_id: str):
    """
    Scans the project's audio directories and updates the database if audio files exist
    but the chapter status is not 'done'.
    """
    from .. import config

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, audio_status, audio_length_seconds, audio_file_path FROM chapters WHERE project_id = ?",
                (project_id,),
            )
            chapters = cursor.fetchall()

            for cid, status, length, current_path in chapters:
                if status not in ("done", "unprocessed"):
                    continue  # Never reconcile while a job is active or failed

                # 1. Resolve the current asset
                resolved = config.resolve_chapter_asset_path(
                    project_id, cid, "audio", filename=current_path
                )
                if not resolved and not current_path:
                    # Try default names
                    resolved = config.resolve_chapter_asset_path(project_id, cid, "audio")

                if not resolved:
                    if status == "done":
                        cursor.execute(
                            "UPDATE chapters SET audio_status = 'unprocessed', audio_file_path = NULL, audio_length_seconds = NULL WHERE id = ?",
                            (cid,),
                        )
                    continue

                best_file = resolved.name
                if status != "done" or current_path != best_file:
                    duration = length or 0.0
                    if duration == 0.0 or current_path != best_file:
                        try:
                            duration = probe_audio_duration(resolved)
                        except Exception:
                            logger.debug(
                                "Failed to probe audio duration for %s",
                                resolved,
                                exc_info=True,
                            )

                    cursor.execute(
                        "UPDATE chapters SET audio_status = 'done', audio_file_path = ?, audio_length_seconds = ? WHERE id = ?",
                        (best_file, duration, cid),
                    )
            conn.commit()


def reconcile_all_chapter_statuses(active_chapter_ids: set[str]):
    """
    Resets any chapters marked as 'processing' to 'unprocessed' if their ID
    is not in the provided active set. This clears 'stuck' indicators.
    """
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            # 1. First, any chapter that is 'processing' but not in our active set
            if active_chapter_ids:
                placeholders = ','.join(['?'] * len(active_chapter_ids))
                params = list(active_chapter_ids)
                cursor.execute(f"UPDATE chapters SET audio_status = 'unprocessed' WHERE audio_status = 'processing' AND id NOT IN ({placeholders})", params)
            else:
                cursor.execute("UPDATE chapters SET audio_status = 'unprocessed' WHERE audio_status = 'processing'")

            # 2. Also ensure that if they are 'done', they actually have a file_path
            cursor.execute("UPDATE chapters SET audio_status = 'unprocessed' WHERE audio_status = 'done' AND (audio_file_path IS NULL OR audio_file_path = '')")

            conn.commit()
