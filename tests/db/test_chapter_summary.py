"""Unit coverage for ``app.domain.chapters.summary.get_chapter_summary`` (#232
Task 007) -- the single source of truth for chapter progress/status math.

Owner's non-negotiable requirement: progress is character-weighted, never
sentence/segment-count-weighted. The regression this file guards against is
concrete and already lived once (`app.db.segments.chapter_completion_by_size`
sums raw ``LENGTH(text_content)``, which double-counts characters trimmed by
`.strip()` relative to the render pipeline's own weight unit in
`app.domain.chunk_groups.build_script_entry_for_group` -- ``len(" ".join(
group["text_parts"]).strip())``). ``get_chapter_summary`` must use the
STRIPPED length so percent/ETA math agrees with what actually gets rendered.
"""
from app.core.boot import run_schema_migrations
from app.db.chapters import create_chapter
from app.db.projects import create_project
from app.domain.chapters.summary import get_chapter_summary


def _insert_segment(conn, seg_id, chapter_id, order, start, end, text, status):
    conn.execute(
        """
        INSERT INTO chapter_segments
            (id, chapter_id, segment_order, text_content, text_hash,
             start_offset, end_offset, character_id, speaker_profile_name,
             audio_status, audio_file_path, audio_generated_at)
        VALUES (?, ?, ?, ?, 'deadbeef', ?, ?, NULL, 'narrator', ?, NULL, NULL)
        """,
        (seg_id, chapter_id, order, text, start, end, status),
    )
    conn.commit()


def test_zero_segments_returns_zero_percent_no_crash(db_conn):
    run_schema_migrations()
    summary = get_chapter_summary(db_conn, "no-such-chapter")
    assert summary.segment_count == 0
    assert summary.total_chars == 0
    assert summary.percent_complete == 0.0
    assert summary.chars_remaining == 0
    assert summary.segments == []


def test_all_segments_done_is_100_percent(db_conn):
    run_schema_migrations()
    pid = create_project("P-summary-a", "/tmp")
    cid = create_chapter(pid, "C-summary-a")
    _insert_segment(db_conn, "s1", cid, 0, 0, 10, "0123456789", "done")
    _insert_segment(db_conn, "s2", cid, 1, 10, 20, "9876543210", "done")

    summary = get_chapter_summary(db_conn, cid)
    assert summary.total_chars == 20
    assert summary.percent_complete == 100.0
    assert summary.chars_remaining == 0


def test_percent_is_character_weighted_not_count_weighted(db_conn):
    """The exact bug class this function exists to prevent: one long DONE
    segment plus one short UNDONE segment must show a high percent, not the
    50% a naive count-based (done_segments / total_segments) ratio would
    report.
    """
    run_schema_migrations()
    pid = create_project("P-summary-b", "/tmp")
    cid = create_chapter(pid, "C-summary-b")
    long_done = "x" * 990
    short_undone = "y" * 10
    _insert_segment(db_conn, "long", cid, 0, 0, 990, long_done, "done")
    _insert_segment(db_conn, "short", cid, 1, 990, 1000, short_undone, "unprocessed")

    summary = get_chapter_summary(db_conn, cid)
    assert summary.total_chars == 1000
    # Count-weighted would report 50.0 -- that is the regression this test
    # exists to catch.
    assert summary.percent_complete == 99.0
    assert summary.chars_remaining == 10


def test_char_count_uses_stripped_text_matching_render_pipeline_weight(db_conn):
    """Pins the unit: total_chars must sum len(text_content.strip()), the
    same unit `app.domain.chunk_groups` uses for its own render weight --
    not raw len(text_content), which is what the older
    `chapter_completion_by_size` helper (now superseded) used.
    """
    run_schema_migrations()
    pid = create_project("P-summary-c", "/tmp")
    cid = create_chapter(pid, "C-summary-c")
    padded_text = "   hello world   "  # len=17, stripped len=11
    _insert_segment(db_conn, "s1", cid, 0, 0, 17, padded_text, "unprocessed")

    summary = get_chapter_summary(db_conn, cid)
    assert summary.total_chars == len("hello world")
    assert summary.segments[0].char_count == len("hello world")


def test_segments_ordered_by_start_offset_not_segment_order(db_conn):
    """Per 01-map.md's ordering decision: segment_order is a derived
    convenience column, not authoritative -- ORDER BY start_offset is.
    Insert rows whose segment_order and start_offset disagree and confirm
    the summary orders by start_offset.
    """
    run_schema_migrations()
    pid = create_project("P-summary-d", "/tmp")
    cid = create_chapter(pid, "C-summary-d")
    # segment_order says s2 first, but start_offset says s1 comes first.
    _insert_segment(db_conn, "s2", cid, 0, 10, 20, "second_text", "unprocessed")
    _insert_segment(db_conn, "s1", cid, 1, 0, 10, "first_text!", "unprocessed")

    summary = get_chapter_summary(db_conn, cid)
    assert [s.id for s in summary.segments] == ["s1", "s2"]


def test_trusts_persisted_audio_status_without_filesystem_revalidation(db_conn, monkeypatch):
    """Resolves W5: this function must not duplicate get_chapter_segments's
    read-path healing (which NULLs audio_status for files missing on disk).
    It reads whatever audio_status is persisted at query time.
    """
    run_schema_migrations()
    pid = create_project("P-summary-e", "/tmp")
    cid = create_chapter(pid, "C-summary-e")
    _insert_segment(db_conn, "s1", cid, 0, 0, 10, "0123456789", "done")

    # Point audio_file_path at a file that does not exist on disk -- if this
    # function re-validated against the filesystem, 'done' would be healed
    # away to 'unprocessed'.
    db_conn.execute(
        "UPDATE chapter_segments SET audio_file_path = ? WHERE id = ?",
        ("/nonexistent/path/does-not-exist.wav", "s1"),
    )
    db_conn.commit()

    summary = get_chapter_summary(db_conn, cid)
    assert summary.segments[0].audio_status == "done"
    assert summary.percent_complete == 100.0
