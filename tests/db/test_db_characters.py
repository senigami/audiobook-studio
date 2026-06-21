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


# ── Chapter-scoped temp character tests ─────────────────────────────────────

def test_create_chapter_scoped_character(db_conn):
    """A character created with chapter_id is stored and queryable by chapter scope."""
    from app.db.characters import promote_character
    pid = create_project("ProjectA")

    cid = create_character(pid, "TempChar", chapter_id="chapter-123")
    assert cid is not None

    # The character has chapter_id set in DB
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT chapter_id FROM characters WHERE id = ?", (cid,))
    row = cursor.fetchone()
    assert row is not None
    assert row[0] == "chapter-123"


def test_get_characters_chapter_scope_returns_book_and_chapter_temps(db_conn):
    """get_characters(pid, chapter_id=X) returns book chars + chapter-X temps, not chapter-Y temps."""
    pid = create_project("ProjectB")

    book_id = create_character(pid, "BookChar", chapter_id=None)
    chap_x_id = create_character(pid, "ChapXChar", chapter_id="chap-x")
    chap_y_id = create_character(pid, "ChapYChar", chapter_id="chap-y")

    result = get_characters(pid, chapter_id="chap-x")
    ids = {c["id"] for c in result}

    assert book_id in ids, "book-scoped character should appear"
    assert chap_x_id in ids, "chapter-x temp should appear"
    assert chap_y_id not in ids, "chapter-y temp must NOT appear"


def test_get_characters_without_chapter_id_returns_all(db_conn):
    """get_characters(pid) with no chapter_id arg returns all characters (existing behavior)."""
    pid = create_project("ProjectC")

    book_id = create_character(pid, "BookChar")
    temp_id = create_character(pid, "TempChar", chapter_id="some-chapter")

    result = get_characters(pid)
    ids = {c["id"] for c in result}

    assert book_id in ids
    assert temp_id in ids


def test_promote_character_clears_chapter_id(db_conn):
    """promote_character sets chapter_id = NULL so the character becomes book-scoped."""
    from app.db.characters import promote_character
    pid = create_project("ProjectD")

    temp_id = create_character(pid, "TempChar", chapter_id="chap-a")
    other_id = create_character(pid, "BookChar", chapter_id=None)

    # Before promotion: temp does not appear in book-wide query for chap-b
    result_before = get_characters(pid, chapter_id="chap-b")
    ids_before = {c["id"] for c in result_before}
    assert temp_id not in ids_before
    assert other_id in ids_before

    promote_character(temp_id)

    # After promotion: temp appears book-wide (NULL chapter_id)
    all_chars = get_characters(pid)
    ids_all = {c["id"] for c in all_chars}
    assert temp_id in ids_all

    # Verify the chapter_id column is NULL in DB
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT chapter_id FROM characters WHERE id = ?", (temp_id,))
    row = cursor.fetchone()
    assert row[0] is None
