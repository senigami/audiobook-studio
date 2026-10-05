"""Regression: ``ChapterSynthesisTask._publish_progress``'s durable-refresh
write must persist ``render_group_count``/``completed_render_groups`` on the
job row, not just the live WS broadcast.

Bug (found 2026-08-26, third in this same feature): commit 44649b6a fixed
``service.publish(...)`` (the live broadcast) to carry the real render-batch
counts (see ``test_chapter_render_group_counts_published.py``), but the
"Durable refresh (2026-07-07 fix)" block right below it — the
``update_job(self.task_id, skip_job_updated=True, **update_kwargs)`` call
that keeps the job ROW current for REST-hydrated reads — never adds
``render_group_count``/``completed_render_groups`` to ``update_kwargs``.
Confirmed live: a restarted app's ``state.json`` job row showed
``render_group_count: null, completed_render_groups: null`` despite the live
broadcast carrying real values and the job having ticked since restart.

Effect: any REST-hydrated read of the job row (page load, reconnect, a fresh
queue fetch, recovery-after-restart) sees the stale/null fields and falls
back to the raw per-sentence segment count, until the next WS tick happens
to land on an already-open tab.

This test calls ``_publish_progress`` directly and asserts the values
``update_job`` is called with (R2: only ``update_job``, the DB-write
boundary, is mocked — no code under test is mocked).
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

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


def test_publish_progress_durable_write_includes_real_render_group_counts():
    task = _make_task()

    with patch("app.db.state.update_job") as mock_update_job:
        task._publish_progress(completed=39, total=58, status="running", done_chars=500, total_chars=1000)

    assert mock_update_job.called, "expected a durable job-row update"
    kwargs = mock_update_job.call_args.kwargs
    assert kwargs.get("render_group_count") == 58, (
        f"expected the real chunk-group total (58) persisted on the job row, not omitted/None; "
        f"got {kwargs.get('render_group_count')!r}"
    )
    assert kwargs.get("completed_render_groups") == 39, (
        f"expected the real completed-group count (39) persisted on the job row, not omitted/None; "
        f"got {kwargs.get('completed_render_groups')!r}"
    )
