import sqlite3
import subprocess
from pathlib import Path

DB_PATH = Path("audiobook_studio.db")
AUDIO_OUT_DIR = Path("audio_out")

def get_duration(file_path):
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(file_path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=5
        )
        return float(result.stdout.strip())
    except Exception:
        return 0.0

def sync_durations():
    if not DB_PATH.exists(): return
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT id, audio_file_path FROM chapters WHERE audio_status = 'done'")
    rows = cursor.fetchall()

    updated = 0
    for row in rows:
        cid = row['id']
        path = row['audio_file_path']
        if not path: continue

        # Check standard path
        full_path = AUDIO_OUT_DIR / path

        # If wav, try mp3 as well for duration (sometimes more accurate for some players)
        if not full_path.exists():
            stem = Path(path).stem
            for ext in ['.mp3', '.wav']:
                p = AUDIO_OUT_DIR / (stem + ext)
                if p.exists():
                    full_path = p
                    break

        if full_path.exists():
            duration = get_duration(full_path)
            if duration > 0:
                cursor.execute("UPDATE chapters SET audio_length_seconds = ? WHERE id = ?", (duration, cid))
                updated += 1

    conn.commit()
    print(f"Updated actual durations for {updated} chapters from {AUDIO_OUT_DIR}")
    conn.close()

if __name__ == "__main__":
    sync_durations()
