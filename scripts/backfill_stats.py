import sqlite3
import time
import sys
from pathlib import Path

# Add app to path
sys.path.append(str(Path.cwd()))
from app.utils.text.textops_cleaning import clean_text_for_tts

DB_PATH = Path("audiobook_studio.db")

def backfill():
    if not DB_PATH.exists():
        print("DB not found")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT id, text_content FROM chapters")
    rows = cursor.fetchall()

    for row in rows:
        cid = row['id']
        text = row['text_content'] or ""

        char_count = len(text)
        word_count = len(text.split())
        sent_count = text.count('.') + text.count('?') + text.count('!')
        predicted_audio_length = char_count / 16.7

        cursor.execute("""
            UPDATE chapters 
            SET char_count = ?, word_count = ?, sent_count = ?, predicted_audio_length = ?
            WHERE id = ?
        """, (char_count, word_count, sent_count, predicted_audio_length, cid))

    conn.commit()
    print(f"Updated {len(rows)} chapters")
    conn.close()

if __name__ == "__main__":
    backfill()
