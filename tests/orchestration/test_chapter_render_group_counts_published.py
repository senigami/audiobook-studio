"""Regression: ``ChapterSynthesisTask._publish_progress`` must publish the
real render-batch counts (``render_group_count``/``completed_render_groups``),
not just the count-based ``progress`` ratio.

Bug (owner-reported, live screenshot 2026-08-26): a "Part 19" chapter render
showed "39 of 306 segments done" in the GlobalQueue card — 306 is the raw
per-sentence ``chapter_segments`` row count, not the real render-batch count
(#231 fixed the FRONTEND to prefer ``job.render_group_count`` /
``job.completed_render_groups`` over ``segments.length`` when both are
present and > 0/not-None). For a chapter dispatched through
``ChapterSynthesisTask`` (the W-PAR parallel chapter-fanout path —
``is_chapter_fanout=True``, which bypasses ``orchestrator_helpers.py``'s
generic ``_dispatch_segment`` entirely per its own docstring), those two
fields were never passed to ``ProgressService.publish`` at all: the frontend
gate then falls back to the raw ``segments.length``, reproducing exactly
this bug.

``_publish_progress`` already has both real numbers on hand — ``total`` is
the real chunk-group count (``len(children)``, from ``build_chunk_groups``)
and ``completed`` is the real completed-group count — they are the same
numbers used to derive ``progress = completed / total``. This test calls
``_publish_progress`` directly (R2: only the progress service, the boundary
being asserted against, is mocked — no code under test is mocked) and
asserts those two real group numbers reach ``service.publish``.
"""

from __future__ import annotations

from unittest.mock import MagicMock

from app.orchestration.tasks.segment_synthesis import ChapterSynthesisTask


def _make_task() -> ChapterSynthesisTask:
    task = ChapterSynthesisTask(
        task_id="chap-part19",
        engine_id="mixed",
        chapter_id="chapter-part19",
        project_id="proj-1",
        output_path="/tmp/chap-part19.wav",
        script=[],
    )
    task._progress_service = MagicMock()
    return task


def test_publish_progress_includes_real_render_group_counts():
    task = _make_task()

    task._publish_progress(completed=39, total=58, status="running", done_chars=500, total_chars=1000)

    assert task._progress_service.publish.called, "expected a progress publish"
    kwargs = task._progress_service.publish.call_args.kwargs
    assert kwargs.get("render_group_count") == 58, (
        f"expected the real chunk-group total (58), not omitted/None; got {kwargs.get('render_group_count')!r}"
    )
    assert kwargs.get("completed_render_groups") == 39, (
        f"expected the real completed-group count (39), not omitted/None; got {kwargs.get('completed_render_groups')!r}"
    )


def test_publish_progress_render_group_counts_track_completed_and_total_exactly():
    task = _make_task()

    task._publish_progress(completed=0, total=306, status="running", done_chars=0, total_chars=0)

    kwargs = task._progress_service.publish.call_args.kwargs
    # These must be the REAL group numbers this call was invoked with (58-style
    # batch counts in production), never silently substituted with a raw
    # per-sentence segment count from elsewhere.
    assert kwargs.get("render_group_count") == 306
    assert kwargs.get("completed_render_groups") == 0
