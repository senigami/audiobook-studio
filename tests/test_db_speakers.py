import pytest
import os
import json
from pathlib import Path
from unittest.mock import patch, MagicMock
from app.db.core import init_db, get_connection
from app.db.speakers import (
    create_speaker, get_speaker, list_speakers, update_speaker, delete_speaker,
    update_voice_profile_references
)

@pytest.fixture
def db_conn():
    db_path = "/tmp/test_speakers.db"
    if os.path.exists(db_path):
        os.unlink(db_path)

    os.environ["DB_PATH"] = db_path
    import app.db.core
    import importlib
    importlib.reload(app.db.core)

    init_db()
    conn = get_connection()
    yield conn
    conn.close()
    if os.path.exists(db_path):
        os.unlink(db_path)

def test_speaker_crud(db_conn):
    sid = create_speaker("Narrator 1", "narrator_v1")
    assert sid is not None

    speaker = get_speaker(sid)
    assert speaker is not None
    assert speaker["name"] == "Narrator 1"
    assert speaker["default_profile_name"] == "narrator_v1"

    speakers = list_speakers()
    assert len(speakers) == 1
    assert speakers[0]["id"] == sid

    success = update_speaker(sid, name="Old Narrator")
    assert success is True
    assert get_speaker(sid)["name"] == "Old Narrator"

    success = delete_speaker(sid)
    assert success is True
    assert get_speaker(sid) is None

def test_speaker_collision_handling(db_conn):
    sid = create_speaker("Narrator 1")
    assert sid is not None
    speaker = get_speaker(sid)
    assert speaker is not None
    assert speaker["name"] == "Narrator 1"

def test_update_voice_profile_references(db_conn):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter

    pid = create_project("P1")
    cid = create_chapter(pid, "C1")

    with get_connection() as conn:
        cursor = conn.cursor()
        # insert character with old profile
        cursor.execute("INSERT INTO characters (id, project_id, name, speaker_profile_name) VALUES (?, ?, ?, ?)", ("char1", pid, "OldChar", "old_prof"))
        # insert segment with old profile
        cursor.execute("INSERT INTO chapter_segments (id, chapter_id, segment_order, text_content, speaker_profile_name) VALUES (?, ?, ?, ?, ?)", ("seg1", cid, 1, "text", "old_prof"))
        conn.commit()

    update_voice_profile_references("old_prof", "new_prof")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT speaker_profile_name FROM characters WHERE id = 'char1'")
        assert cursor.fetchone()["speaker_profile_name"] == "new_prof"
        cursor.execute("SELECT speaker_profile_name FROM chapter_segments WHERE id = 'seg1'")
        assert cursor.fetchone()["speaker_profile_name"] == "new_prof"
