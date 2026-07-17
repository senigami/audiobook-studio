"""W-PERF task 001: additive performance-metadata columns on chapter_segments/characters.

Covers both a fresh DB (CREATE TABLE path) and an upgraded v1 DB (add_column_if_missing
path), asserting the new columns exist, existing rows read back with documented
defaults, and re-running init_db() is idempotent.
"""
import sqlite3
import uuid

SEGMENT_COLUMNS = [
    "performance_data",
    "speaker_confidence",
    "speaker_basis",
    "speaker_evidence",
    "needs_review",
    "review_reasons",
    "locked",
    "ai_suggested",
]

CHARACTER_COLUMNS = [
    "display_name",
    "role",
    "character_type",
    "aliases",
    "source_presence",
    "source_profile",
    "voice_guidance",
    "needs_review",
    "review_reasons",
    "locked",
    "ai_suggested",
]


def _table_columns(conn, table):
    cursor = conn.cursor()
    cursor.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cursor.fetchall()}


def test_fresh_db_has_wperf_columns(tmp_path, monkeypatch):
    db_path = tmp_path / f"test_db_{uuid.uuid4().hex}.db"
    studio_db_path = tmp_path / f"test_studio_{uuid.uuid4().hex}.db"
    monkeypatch.setenv("DB_PATH", str(db_path))
    monkeypatch.setenv("STUDIO_DB_PATH", str(studio_db_path))

    import app.db.core
    import importlib
    importlib.reload(app.db.core)
    app.db.core.init_db()

    with app.db.core.get_connection() as conn:
        seg_cols = _table_columns(conn, "chapter_segments")
        char_cols = _table_columns(conn, "characters")

    for col in SEGMENT_COLUMNS:
        assert col in seg_cols, f"chapter_segments missing {col}"
    for col in CHARACTER_COLUMNS:
        assert col in char_cols, f"characters missing {col}"

    assert "span_start" not in seg_cols
    assert "span_end" not in seg_cols
    assert "sentence_index" not in seg_cols
    assert "render" not in seg_cols


def test_upgrade_existing_db_gets_wperf_columns_with_null_defaults(tmp_path, monkeypatch):
    db_path = tmp_path / f"test_db_{uuid.uuid4().hex}.db"
    studio_db_path = tmp_path / f"test_studio_{uuid.uuid4().hex}.db"
    monkeypatch.setenv("DB_PATH", str(db_path))
    monkeypatch.setenv("STUDIO_DB_PATH", str(studio_db_path))

    # 1. Manually create a pre-W-PERF v1 schema and insert a row.
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE characters (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL,
            speaker_profile_name TEXT,
            default_emotion TEXT,
            color TEXT DEFAULT '#8b5cf6'
        )
    """)
    cursor.execute("""
        CREATE TABLE chapter_segments (
            id TEXT PRIMARY KEY,
            chapter_id TEXT NOT NULL,
            segment_order INTEGER NOT NULL,
            text_content TEXT NOT NULL,
            sanitized_text TEXT,
            character_id TEXT,
            speaker_profile_name TEXT,
            audio_file_path TEXT,
            audio_status TEXT DEFAULT 'unprocessed',
            audio_generated_at REAL
        )
    """)
    cursor.execute(
        "INSERT INTO characters (id, project_id, name) VALUES ('char-1', 'proj-1', 'Alice')"
    )
    cursor.execute(
        "INSERT INTO chapter_segments (id, chapter_id, segment_order, text_content) "
        "VALUES ('seg-1', 'chap-1', 0, 'hello')"
    )
    conn.commit()
    conn.close()

    import app.db.core
    import importlib
    importlib.reload(app.db.core)

    # 2. Run init_db() to trigger the additive migration.
    app.db.core.init_db()
    # Idempotency: running it again must not error or duplicate columns.
    app.db.core.init_db()

    with app.db.core.get_connection() as conn:
        seg_cols = _table_columns(conn, "chapter_segments")
        char_cols = _table_columns(conn, "characters")

        for col in SEGMENT_COLUMNS:
            assert col in seg_cols, f"chapter_segments missing {col} after upgrade"
        for col in CHARACTER_COLUMNS:
            assert col in char_cols, f"characters missing {col} after upgrade"

        cursor = conn.cursor()
        cursor.execute(
            "SELECT performance_data, needs_review, locked, ai_suggested FROM chapter_segments WHERE id = 'seg-1'"
        )
        row = cursor.fetchone()
        assert row["performance_data"] is None
        assert row["needs_review"] in (0, None)
        assert row["locked"] in (0, None)
        assert row["ai_suggested"] in (0, None)

        cursor.execute(
            "SELECT display_name, needs_review, locked, ai_suggested FROM characters WHERE id = 'char-1'"
        )
        crow = cursor.fetchone()
        assert crow["display_name"] is None
        assert crow["needs_review"] in (0, None)
        assert crow["locked"] in (0, None)
        assert crow["ai_suggested"] in (0, None)

        # Pre-existing row data must survive the migration untouched.
        cursor.execute("SELECT name FROM characters WHERE id = 'char-1'")
        assert cursor.fetchone()["name"] == "Alice"
        cursor.execute("SELECT text_content FROM chapter_segments WHERE id = 'seg-1'")
        assert cursor.fetchone()["text_content"] == "hello"
