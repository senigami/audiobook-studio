"""PERF-3: init_db() must add non-unique indexes on the hot lookup/join
columns behind the queue/history correlated-subquery cliff.

init_db() already uses ``CREATE INDEX IF NOT EXISTS`` and runs on every boot
(idempotent, applies on upgrade), so these tests exercise that same
contract: run init_db() twice with no error, then assert each new index
exists (queried from ``sqlite_master``) and none of them are UNIQUE.
"""
import sqlite3

from app.db.core import get_connection, get_studio_connection, init_db


def _index_sql(cursor: sqlite3.Cursor, index_name: str) -> str | None:
    cursor.execute(
        "SELECT sql FROM sqlite_master WHERE type='index' AND name=?",
        (index_name,),
    )
    row = cursor.fetchone()
    return row[0] if row else None


def test_init_db_is_idempotent_and_adds_new_non_unique_indexes(tmp_path, monkeypatch):
    user_db = tmp_path / "test_audiobook_studio.db"
    studio_db = tmp_path / "test_studio.db"
    monkeypatch.setenv("DB_PATH", str(user_db))
    monkeypatch.setenv("STUDIO_DB_PATH", str(studio_db))

    # Idempotency: running init_db() twice must not raise.
    init_db()
    init_db()

    user_conn = sqlite3.connect(user_db)
    try:
        user_cursor = user_conn.cursor()

        expected_user_indexes = {
            "idx_chapter_segments_chapter_id": "chapter_segments",
            "idx_chapters_project_id": "chapters",
            "idx_characters_project_id": "characters",
            "idx_lexicon_project_id": "lexicon",
            "idx_processing_queue_chapter_status": "processing_queue",
        }
        for index_name, table_name in expected_user_indexes.items():
            sql = _index_sql(user_cursor, index_name)
            assert sql is not None, f"Expected index {index_name} on {table_name} to exist"
            assert "unique" not in sql.lower(), f"{index_name} must be non-unique, got: {sql}"

        # Composite processing_queue index must cover BOTH columns.
        composite_sql = _index_sql(user_cursor, "idx_processing_queue_chapter_status")
        assert "chapter_id" in composite_sql
        assert "status" in composite_sql
    finally:
        user_conn.close()

    studio_conn = sqlite3.connect(studio_db)
    try:
        studio_cursor = studio_conn.cursor()
        render_perf_sql = _index_sql(studio_cursor, "idx_render_performance_job_id")
        assert render_perf_sql is not None, "Expected idx_render_performance_job_id to exist"
        assert "unique" not in render_perf_sql.lower()
        assert "job_id" in render_perf_sql
    finally:
        studio_conn.close()


def test_init_db_does_not_add_chapter_segments_audio_status_index(tmp_path, monkeypatch):
    """Explicitly NOT added (write-amp on the hot render path, per plan)."""
    user_db = tmp_path / "test_audiobook_studio.db"
    studio_db = tmp_path / "test_studio.db"
    monkeypatch.setenv("DB_PATH", str(user_db))
    monkeypatch.setenv("STUDIO_DB_PATH", str(studio_db))

    init_db()

    user_conn = sqlite3.connect(user_db)
    try:
        user_cursor = user_conn.cursor()
        user_cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='chapter_segments'"
        )
        index_names = {row[0] for row in user_cursor.fetchall()}
        for name in index_names:
            sql = _index_sql(user_cursor, name) or ""
            assert "audio_status" not in sql, (
                f"chapter_segments(audio_status) must not be indexed (write-amp on hot render path); "
                f"found in {name}: {sql}"
            )
    finally:
        user_conn.close()
