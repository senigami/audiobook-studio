import os
import subprocess
import logging
import sys
from .core import _db_lock, get_connection

logger = logging.getLogger(__name__)

def reconcile_project_audio(project_id: str):
    """
    Scans the project's audio directory and updates the database if audio files exist 
    but the chapter status is not 'done'.
    """
    from ..config import find_existing_project_subdir
    audio_dir = find_existing_project_subdir(project_id, "audio")
    if not audio_dir or not audio_dir.exists():
        return

    all_audio_paths = {
        entry.name: entry.resolve()
        for entry in audio_dir.iterdir()
        if entry.is_file()
    }

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, audio_status, audio_length_seconds FROM chapters WHERE project_id = ?", (project_id,))
            chapters = cursor.fetchall()

            for cid, status, length in chapters:
                if status not in ('done', 'unprocessed'):
                    continue # Never reconcile while a job is active or failed

                # Find candidate files matching the chapter ID prefix
                # We filter for common audio extensions and ensure it's not a segment
                candidates = [
                    f for f in all_audio_paths
                    if f.startswith(cid) and f.lower().endswith(('.wav', '.mp3', '.m4a'))
                ]

                if not candidates:
                    if status == 'done':
                        cursor.execute(
                            "UPDATE chapters SET audio_status = 'unprocessed', audio_file_path = NULL, audio_length_seconds = NULL WHERE id = ?", 
                            (cid,)
                        )
                    continue

                # Prioritize: mp3 > m4a > wav
                best_file = None
                for ext in ['.mp3', '.m4a', '.wav']:
                    for f in candidates:
                        if f.lower().endswith(ext):
                            best_file = f
                            break
                    if best_file: break

                if not best_file:
                    best_file = candidates[0]

                cursor.execute("SELECT audio_file_path FROM chapters WHERE id = ?", (cid,))
                current_path_row = cursor.fetchone()
                current_path = current_path_row[0] if current_path_row else None

                if status != 'done' or current_path != best_file:
                    duration = length or 0.0
                    if duration == 0.0 or current_path != best_file:
                        try:
                            audio_path = all_audio_paths.get(best_file)
                            if not audio_path:
                                raise FileNotFoundError(best_file)
                            result = subprocess.run(
                                ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path)],
                                stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT,
                                text=True,
                                timeout=2
                            )
                            if result.stdout:
                                sys.stdout.write(result.stdout)
                                sys.stdout.flush()
                            if result.returncode == 0:
                                duration = float(result.stdout.strip())
                        except Exception:
                            logger.debug("Failed to probe audio duration for %s", best_file, exc_info=True)

                    cursor.execute(
                        "UPDATE chapters SET audio_status = 'done', audio_file_path = ?, audio_length_seconds = ? WHERE id = ?", 
                        (best_file, duration, cid)
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
