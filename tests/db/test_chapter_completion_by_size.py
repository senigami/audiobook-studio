"""Unit coverage for ``app.db.segments.chapter_completion_by_size`` (W-PAR
enable-gate — size-weighted, order-independent chapter completion).

Added by the 2026-07-04 review-ratchet pass: the helper shipped with zero
callers and zero tests — its sqlite3.Row column aliasing (``row["total_chars"]``)
had never executed. This exercises the real DB path end-to-end.
"""

from app.db.segments import chapter_completion_by_size


def _insert_segment(conn, seg_id: str, chapter_id: str, order: int, text: str, status: str) -> None:
    conn.execute(
        """
        INSERT INTO chapter_segments
            (id, chapter_id, segment_order, text_content, character_id,
             speaker_profile_name, audio_status, audio_file_path, audio_generated_at)
        VALUES (?, ?, ?, ?, NULL, 'narrator', ?, NULL, NULL)
        """,
        (seg_id, chapter_id, order, text, status),
    )


def test_empty_chapter_returns_zero_zero(db_conn):
    assert chapter_completion_by_size("no-such-chapter") == (0, 0)


def test_size_weighted_done_vs_total(db_conn):
    chapter_id = "chap-size"
    _insert_segment(db_conn, "s1", chapter_id, 0, "x" * 100, "pending")
    _insert_segment(db_conn, "s2", chapter_id, 1, "y" * 900, "done")
    _insert_segment(db_conn, "s3", "other-chapter", 0, "z" * 500, "done")
    db_conn.commit()

    done_chars, total_chars = chapter_completion_by_size(chapter_id)
    assert total_chars == 1000
    # Only audio_status='done' counts; a large done segment dominates the
    # ratio regardless of manuscript/completion order (order-independence).
    assert done_chars == 900


def test_non_done_statuses_do_not_count(db_conn):
    chapter_id = "chap-statuses"
    for i, status in enumerate(["pending", "processing", "failed", "unprocessed"]):
        _insert_segment(db_conn, f"n{i}", chapter_id, i, "a" * 10, status)
    db_conn.commit()

    assert chapter_completion_by_size(chapter_id) == (0, 40)
