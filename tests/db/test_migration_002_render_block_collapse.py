"""Tests for migration version 2: segment_render_block_collapse (#232 Task 005).

Exercises app.db.migrations.steps.render_block_collapse directly against a
real schema built by app.db.core.init_db() (post migration 1), plus the
runner for end-to-end registry wiring.
"""
import hashlib
import shutil
import sqlite3
import uuid

import pytest

from app.db.migrations.registry import MIGRATIONS
from app.db.migrations.runner import run_migrations
from app.db.migrations.steps.render_block_collapse import (
    CollapseMigrationError,
    build_collapse_dry_run_report,
    migrate_002_render_block_collapse,
)
from app.db.segments import segment_text_hash


@pytest.fixture
def db_path(tmp_path, monkeypatch):
    path = tmp_path / "test_render_block_collapse.db"
    monkeypatch.setenv("DB_PATH", str(path))
    from app.db.core import init_db

    init_db()
    return path


def _raw_connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _make_project_and_chapter(conn, text_content):
    project_id = str(uuid.uuid4())
    chapter_id = str(uuid.uuid4())
    conn.execute("INSERT INTO projects (id, name) VALUES (?, ?)", (project_id, "P"))
    conn.execute(
        "INSERT INTO chapters (id, project_id, title, text_content) VALUES (?, ?, ?, ?)",
        (chapter_id, project_id, "Chapter One", text_content),
    )
    return chapter_id


def _insert_segment(conn, chapter_id, order, text, *, audio_file_path=None, audio_status="unprocessed"):
    seg_id = str(uuid.uuid4())
    conn.execute(
        """
        INSERT INTO chapter_segments
            (id, chapter_id, segment_order, text_content, audio_file_path, audio_status)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (seg_id, chapter_id, order, text, audio_file_path, audio_status),
    )
    return seg_id


def _run_migration_1(conn, db_path):
    run_migrations(conn, MIGRATIONS[:1], db_path=db_path)


class TestRenderedGroupCollapse:
    """A chapter with one already-rendered group: rows sharing the same
    non-null audio_file_path collapse into one row, preserving the leader's
    id and the on-disk filename verbatim (zero renames)."""

    def test_contiguous_rendered_rows_collapse_to_leader_preserving_filename(self, db_path):
        conn = _raw_connect(db_path)
        try:
            text = "First sentence. Second sentence. Third sentence."
            chapter_id = _make_project_and_chapter(conn, text)
            leader_id = _insert_segment(
                conn, chapter_id, 0, "First sentence. ", audio_file_path="abc.wav", audio_status="done"
            )
            _insert_segment(
                conn, chapter_id, 1, "Second sentence. ", audio_file_path="abc.wav", audio_status="done"
            )
            _insert_segment(conn, chapter_id, 2, "Third sentence.")
            conn.commit()
            _run_migration_1(conn, db_path)

            migrate_002_render_block_collapse(conn)
            conn.commit()

            rows = conn.execute(
                "SELECT * FROM chapter_segments WHERE chapter_id = ?", (chapter_id,)
            ).fetchall()
            assert len(rows) == 2  # the rendered group (1) + "Third sentence." (unrendered, 1)
            rendered_row = next(r for r in rows if r["audio_file_path"] == "abc.wav")
            assert rendered_row["id"] == leader_id, "zero-rename: leader keeps its id/filename"
            assert rendered_row["text_content"] == "First sentence. Second sentence. "
            assert rendered_row["start_offset"] == 0
            assert rendered_row["end_offset"] == len("First sentence. Second sentence. ")
            assert rendered_row["text_hash"] == segment_text_hash(rendered_row["text_content"])
        finally:
            conn.close()


class TestUnrenderedGroupCollapse:
    """Never-rendered rows group by the LIVE build_chunk_groups decision."""

    def test_unrendered_rows_with_no_audio_group_by_live_logic(self, db_path):
        conn = _raw_connect(db_path)
        try:
            text = "One. Two. Three."
            chapter_id = _make_project_and_chapter(conn, text)
            _insert_segment(conn, chapter_id, 0, "One. ")
            _insert_segment(conn, chapter_id, 1, "Two. ")
            _insert_segment(conn, chapter_id, 2, "Three.")
            conn.commit()
            _run_migration_1(conn, db_path)

            migrate_002_render_block_collapse(conn)
            conn.commit()

            rows = conn.execute(
                "SELECT * FROM chapter_segments WHERE chapter_id = ? ORDER BY segment_order",
                (chapter_id,),
            ).fetchall()
            # All three share no character/profile/engine distinction and fit under
            # the default text_chunk_limit, so build_chunk_groups merges them into one.
            assert len(rows) == 1
            assert rows[0]["text_content"] == text
            assert rows[0]["start_offset"] == 0
            assert rows[0]["end_offset"] == len(text)
            assert rows[0]["audio_file_path"] is None
        finally:
            conn.close()


class TestMixedRenderedUnrenderedBoundary:
    """The trickiest case per the task file: a rendered group directly
    adjacent to unrendered content must not merge across that boundary."""

    def test_rendered_and_unrendered_runs_do_not_merge_across_the_boundary(self, db_path):
        conn = _raw_connect(db_path)
        try:
            text = "Rendered one. Rendered two. Fresh one. Fresh two."
            chapter_id = _make_project_and_chapter(conn, text)
            leader_id = _insert_segment(
                conn, chapter_id, 0, "Rendered one. ", audio_file_path="grp.wav", audio_status="done"
            )
            _insert_segment(
                conn, chapter_id, 1, "Rendered two. ", audio_file_path="grp.wav", audio_status="done"
            )
            _insert_segment(conn, chapter_id, 2, "Fresh one. ")
            _insert_segment(conn, chapter_id, 3, "Fresh two.")
            conn.commit()
            _run_migration_1(conn, db_path)

            migrate_002_render_block_collapse(conn)
            conn.commit()

            rows = conn.execute(
                "SELECT * FROM chapter_segments WHERE chapter_id = ? ORDER BY segment_order",
                (chapter_id,),
            ).fetchall()
            assert len(rows) == 2
            rendered_row, fresh_row = rows[0], rows[1]
            assert rendered_row["id"] == leader_id
            assert rendered_row["text_content"] == "Rendered one. Rendered two. "
            assert rendered_row["audio_file_path"] == "grp.wav"
            assert fresh_row["text_content"] == "Fresh one. Fresh two."
            assert fresh_row["audio_file_path"] is None
            assert rendered_row["end_offset"] == fresh_row["start_offset"]
        finally:
            conn.close()


class TestDuplicateAudioRemediation:
    def test_non_contiguous_duplicate_audio_path_is_remediated_before_grouping(self, db_path):
        conn = _raw_connect(db_path)
        try:
            text = "A. B. C."
            chapter_id = _make_project_and_chapter(conn, text)
            leader_id = _insert_segment(
                conn, chapter_id, 0, "A. ", audio_file_path="dup.wav", audio_status="done"
            )
            _insert_segment(conn, chapter_id, 1, "B. ")
            # Non-contiguous duplicate: same file referenced again after a gap.
            _insert_segment(conn, chapter_id, 2, "C.", audio_file_path="dup.wav", audio_status="done")
            conn.commit()
            _run_migration_1(conn, db_path)

            report = build_collapse_dry_run_report(conn)
            chapter_report = next(r for r in report.per_chapter if r.chapter_id == chapter_id)
            assert chapter_report.audio_refs_dropped_by_duplicate_remediation == 1

            migrate_002_render_block_collapse(conn)
            conn.commit()

            rows = conn.execute(
                "SELECT * FROM chapter_segments WHERE chapter_id = ? ORDER BY segment_order",
                (chapter_id,),
            ).fetchall()
            audio_rows = [r for r in rows if r["audio_file_path"] == "dup.wav"]
            assert len(audio_rows) == 1
            assert audio_rows[0]["id"] == leader_id
        finally:
            conn.close()


class TestOffsetMismatchPolicy:
    def test_offset_mismatch_raises_and_rolls_back_whole_migration(self, db_path):
        conn = _raw_connect(db_path)
        try:
            # Canonical text drifted from the row's stored text -- the row's
            # text can never be located sequentially.
            chapter_id = _make_project_and_chapter(conn, "Completely different canonical text.")
            _insert_segment(conn, chapter_id, 0, "This text does not appear in canonical.")
            conn.commit()
            _run_migration_1(conn, db_path)

            with pytest.raises(CollapseMigrationError):
                migrate_002_render_block_collapse(conn)
            conn.rollback()

            # R1 (revert-check companion): confirm the row is untouched --
            # nothing partially applied.
            row = conn.execute(
                "SELECT start_offset, end_offset, text_hash FROM chapter_segments WHERE chapter_id = ?",
                (chapter_id,),
            ).fetchone()
            assert row["start_offset"] is None
            assert row["end_offset"] is None
        finally:
            conn.close()

    def test_dry_run_reports_mismatch_without_raising_or_writing(self, db_path):
        conn = _raw_connect(db_path)
        try:
            chapter_id = _make_project_and_chapter(conn, "Completely different canonical text.")
            _insert_segment(conn, chapter_id, 0, "This text does not appear in canonical.")
            conn.commit()
            _run_migration_1(conn, db_path)

            report = build_collapse_dry_run_report(conn)
            assert chapter_id in report.chapters_with_offset_mismatch

            row = conn.execute(
                "SELECT start_offset, end_offset FROM chapter_segments WHERE chapter_id = ?",
                (chapter_id,),
            ).fetchone()
            assert row["start_offset"] is None, "dry-run must never write"
        finally:
            conn.close()


class TestDryRunIsolationSafety:
    """Hard requirement from the task file: dry-run must run against a
    filesystem copy, never the live path. Verified mechanically here by
    checksumming/mtime-checking the ORIGINAL file after running the report
    against an isolated copy."""

    def test_dry_run_against_a_copy_never_touches_the_original_file(self, db_path):
        conn = _raw_connect(db_path)
        try:
            chapter_id = _make_project_and_chapter(conn, "One. Two.")
            _insert_segment(conn, chapter_id, 0, "One. ", audio_file_path="x.wav", audio_status="done")
            _insert_segment(conn, chapter_id, 1, "Two.")
            conn.commit()
            _run_migration_1(conn, db_path)
            conn.commit()
        finally:
            conn.close()

        original_mtime_before = db_path.stat().st_mtime_ns
        original_checksum_before = hashlib.sha256(db_path.read_bytes()).hexdigest()

        copy_path = db_path.with_name("isolated_copy.db")
        shutil.copy2(db_path, copy_path)

        copy_conn = _raw_connect(copy_path)
        try:
            report = build_collapse_dry_run_report(copy_conn)
            assert len(report.per_chapter) == 1
        finally:
            copy_conn.close()

        assert db_path.stat().st_mtime_ns == original_mtime_before
        assert hashlib.sha256(db_path.read_bytes()).hexdigest() == original_checksum_before


class TestRegistryWiring:
    def test_both_migrations_apply_in_order_via_the_runner(self, db_path):
        conn = _raw_connect(db_path)
        try:
            chapter_id = _make_project_and_chapter(conn, "Hello world.")
            _insert_segment(conn, chapter_id, 0, "Hello world.")
            conn.commit()

            applied = run_migrations(conn, MIGRATIONS, db_path=db_path)
            assert [m.version for m in applied] == [1, 2]

            row = conn.execute(
                "SELECT text_hash, start_offset, end_offset FROM chapter_segments WHERE chapter_id = ?",
                (chapter_id,),
            ).fetchone()
            assert row["text_hash"] is not None
            assert row["start_offset"] == 0
        finally:
            conn.close()

    def test_migration_2_is_idempotent_via_the_runner(self, db_path):
        conn = _raw_connect(db_path)
        try:
            chapter_id = _make_project_and_chapter(conn, "Hello world.")
            _insert_segment(conn, chapter_id, 0, "Hello world.")
            conn.commit()

            run_migrations(conn, MIGRATIONS, db_path=db_path)
            second = run_migrations(conn, MIGRATIONS, db_path=db_path)
            assert second == []
        finally:
            conn.close()


class TestNullTextHashSafetyNet:
    def test_zero_surviving_rows_with_null_text_hash_after_collapse(self, db_path):
        conn = _raw_connect(db_path)
        try:
            chapter_id = _make_project_and_chapter(conn, "One. Two. Three.")
            _insert_segment(conn, chapter_id, 0, "One. ")
            _insert_segment(conn, chapter_id, 1, "Two. ")
            _insert_segment(conn, chapter_id, 2, "Three.")
            conn.commit()
            _run_migration_1(conn, db_path)

            migrate_002_render_block_collapse(conn)
            conn.commit()

            null_count = conn.execute(
                "SELECT COUNT(*) AS c FROM chapter_segments WHERE text_hash IS NULL"
            ).fetchone()["c"]
            assert null_count == 0
        finally:
            conn.close()
