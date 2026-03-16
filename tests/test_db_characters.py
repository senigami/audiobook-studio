import pytest
import os
from app.db.core import init_db, get_connection
from app.db.characters import (
    create_character, get_characters, update_character, delete_character
)
from app.db.projects import create_project

@pytest.fixture
def db_conn():
    db_path = "/tmp/test_characters.db"
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

def test_character_crud(db_conn):
    pid = create_project("P1")

    # Create
    chid = create_character(pid, "Alice", "alice_voice", "Happy", color="#ff0000")
    assert chid is not None

    # Get List
    chars = get_characters(pid)
    assert len(chars) == 1
    assert chars[0]["name"] == "Alice"
    assert chars[0]["speaker_profile_name"] == "alice_voice"
    assert chars[0]["default_emotion"] == "Happy"
    assert chars[0]["color"] == "#ff0000"

    # Update
    success = update_character(chid, name="Alice Updated", default_emotion="Sad")
    assert success is True
    chars = get_characters(pid)
    assert chars[0]["name"] == "Alice Updated"
    assert chars[0]["default_emotion"] == "Sad"

    # Update No-op
    assert update_character(chid) is False

    # Delete
    success = delete_character(chid)
    assert success is True
    assert len(get_characters(pid)) == 0
