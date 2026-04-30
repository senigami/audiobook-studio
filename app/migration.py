import os
import uuid
import time
from pathlib import Path
from .config import CHAPTER_DIR, XTTS_OUT_DIR
from .db import get_connection, create_project

def import_legacy_filesystem_data():
    """
    Scans CHAPTER_DIR for .txt files and matches them with audio in XTTS_OUT_DIR.
    Creates a 'Legacy Import' project and populates it with chapters.
    """
    # Rule 8: Enumerate trusted root
    trusted_chapter_root = os.path.abspath(os.path.realpath(os.fspath(CHAPTER_DIR)))
    try:
        txt_files = [
            entry.name
            for entry in os.scandir(trusted_chapter_root)
            if entry.is_file() and entry.name.endswith(".txt")
        ]
    except OSError:
        return {"status": "error", "message": "Could not scan chapter directory."}

    if not txt_files:
        return {"status": "success", "message": "No legacy text files found."}

    # Create a new project for the import
    project_id = create_project(
        name=f"Legacy Import ({time.strftime('%Y-%m-%d %H:%M')})",
        series="Imported",
        author="System",
    )

    imported_count = 0
    with get_connection() as conn:
        cursor = conn.cursor()

        for txt_name in txt_files:
            stem = Path(txt_name).stem

            # Rule 9: Locally visible containment proof
            txt_path_full = os.path.abspath(
                os.path.realpath(os.path.join(trusted_chapter_root, txt_name))
            )
            if not txt_path_full.startswith(trusted_chapter_root + os.sep):
                continue

            # Read content
            try:
                with open(txt_path_full, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
            except Exception:
                continue

            char_count = len(content)
            word_count = len(content.split())

            # Look for matching audio
            audio_file = None
            audio_status = "unprocessed"

            trusted_xtts_root = os.path.abspath(os.path.realpath(os.fspath(XTTS_OUT_DIR)))
            # Priority .mp3 > .wav
            for ext in [".mp3", ".wav"]:
                cand_name = f"{stem}{ext}"
                # Rule 8: Match by name from scanner to prove locality
                try:
                    for entry in os.scandir(trusted_xtts_root):
                        if entry.is_file() and entry.name == cand_name:
                            audio_file = entry.name
                            audio_status = "done"
                            break
                except OSError:
                    pass
                if audio_file:
                    break

            chap_id = str(uuid.uuid4())
            now = time.time()

            # Insert into chapters
            cursor.execute("""
                INSERT INTO chapters (
                    id, project_id, title, text_content, sort_order, 
                    audio_status, audio_file_path, text_last_modified, 
                    char_count, word_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                chap_id,
                project_id,
                stem,
                content,
                imported_count,
                audio_status,
                audio_file,
                now,
                char_count,
                word_count
            ))
            imported_count += 1

        conn.commit()

    return {
        "status": "success", 
        "message": f"Successfully imported {imported_count} chapters into Project {project_id}.",
        "project_id": project_id
    }
