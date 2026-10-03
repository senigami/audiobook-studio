"""Tests for migration version 3: processing_queue_nullable_ids (#245).

Moves the old ad-hoc ``init_db`` rebuild of ``processing_queue`` (drop NOT
NULL on ``project_id``/``chapter_id``) onto the versioned runner. Built
against a real legacy-shaped table, run through the real registry.
"""
import sqlite3

import pytest

from app.db.core import init_db
from app.db.migrations.registry import MIGRATIONS
from app.db.migrations.runner import MigrationError, run_migrations


@pytest.fixture
def db_path(tmp_path, monkeypatch):
    path = tmp_path / "test_queue_nullable.db"
    monkeypatch.setenv("DB_PATH", str(path))
    init_db()
    return path


def _connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _make_legacy_queue(conn, *, with_new_columns=True):
    """Replace processing_queue with the legacy NOT NULL shape plus rows."""
    conn.execute("DROP TABLE processing_queue")
    extra = ", custom_title TEXT, engine TEXT" if with_new_columns else ""
    conn.execute(
        f"""
        CREATE TABLE processing_queue (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            chapter_id TEXT NOT NULL,
            split_part INTEGER DEFAULT 0,
            status TEXT DEFAULT 'queued',
            created_at REAL,
            started_at REAL,
            completed_at REAL,
            error TEXT{extra}
        )
        """
    )
    conn.execute(
        "INSERT INTO processing_queue (id, project_id, chapter_id, split_part, status, created_at, error) "
        "VALUES ('q1', 'p1', 'c1', 2, 'done', 111.5, 'boom')"
    )
    conn.execute(
        "INSERT INTO processing_queue (id, project_id, chapter_id) VALUES ('q2', 'p1', 'c2')"
    )
    conn.commit()


def _not_null(conn, column):
    return {r[1]: r[3] for r in conn.execute("PRAGMA table_info(processing_queue)")}[column]


@pytest.mark.parametrize("with_new_columns", [True, False])
def test_legacy_not_null_table_is_rebuilt_preserving_rows(db_path, with_new_columns):
    conn = _connect(db_path)
    _make_legacy_queue(conn, with_new_columns=with_new_columns)
    assert _not_null(conn, "project_id") == 1

    run_migrations(conn, MIGRATIONS, db_path=db_path)

    assert _not_null(conn, "project_id") == 0
    assert _not_null(conn, "chapter_id") == 0
    rows = conn.execute(
        "SELECT id, project_id, chapter_id, split_part, status, created_at, error "
        "FROM processing_queue ORDER BY id"
    ).fetchall()
    rows = [tuple(r) for r in rows]
    assert rows == [
        ("q1", "p1", "c1", 2, "done", 111.5, "boom"),
        ("q2", "p1", "c2", 0, "queued", None, None),
    ]
    # System tasks (no project/chapter) are the whole point of the change.
    conn.execute("INSERT INTO processing_queue (id) VALUES ('sys')")
    # The composite index survives the rebuild.
    idx = {r[1] for r in conn.execute("PRAGMA index_list(processing_queue)")}
    assert "idx_processing_queue_chapter_status" in idx
    conn.close()


def test_already_nullable_table_is_left_untouched(db_path):
    conn = _connect(db_path)
    conn.execute("INSERT INTO processing_queue (id, project_id) VALUES ('keep', 'p9')")
    conn.commit()
    before = conn.execute("SELECT sql FROM sqlite_master WHERE name='processing_queue'").fetchone()[0]

    run_migrations(conn, MIGRATIONS, db_path=db_path)

    after = conn.execute("SELECT sql FROM sqlite_master WHERE name='processing_queue'").fetchone()[0]
    assert after == before
    assert [tuple(r) for r in conn.execute("SELECT id FROM processing_queue")] == [("keep",)]
    conn.close()


def test_failure_aborts_with_migration_error_instead_of_being_swallowed(db_path):
    conn = _connect(db_path)
    _make_legacy_queue(conn)
    # A leftover table from a prior crashed rebuild makes the RENAME fail.
    conn.execute("CREATE TABLE _processing_queue_old (x)")
    conn.commit()

    with pytest.raises(MigrationError):
        run_migrations(conn, MIGRATIONS, db_path=db_path)

    # Rolled back: the legacy table and its rows are intact.
    assert _not_null(conn, "project_id") == 1
    assert conn.execute("SELECT COUNT(*) FROM processing_queue").fetchone()[0] == 2
    conn.close()


def test_init_db_no_longer_rebuilds_the_queue_itself(db_path):
    """The rebuild lives only in the runner now (#245)."""
    conn = _connect(db_path)
    _make_legacy_queue(conn)
    conn.close()

    init_db()

    conn = _connect(db_path)
    assert _not_null(conn, "project_id") == 1
    conn.close()
