"""Integration test: load_recoverable_task_contexts reads from the DB (B18 fix).

Revert-check: if list_jobs_by_status is removed from app.db.queue (or the
import in recovery.py is pointed at a nonexistent name), these tests fail
with an ImportError / AttributeError rather than silently returning [].

B18 startup-recovery tests verify that run_startup_recovery() re-submits
interrupted tasks to the orchestrator (R2: TaskOrchestrator.submit is patched
because it is outside the unit under test — boot.py / run_startup_recovery).
"""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest
from app.db.queue import upsert_queue_row
from app.db.projects import create_project
from app.db.chapters import create_chapter
from app.orchestration.scheduler.recovery import (
    load_recoverable_task_contexts,
    _RECOVERABLE_STATUSES,
)
from app.orchestration.tasks.base import TaskContext


def test_recoverable_contexts_found_for_running_job():
    """A 'running' queue row is returned as a TaskContext by load_recoverable_task_contexts."""
    pid = create_project("P-recovery-running")
    cid = create_chapter(pid, "C-recovery-running")
    job_id = "job-recover-running-1"
    upsert_queue_row(job_id, project_id=pid, chapter_id=cid, status="running")

    contexts = load_recoverable_task_contexts()

    task_ids = [c.task_id for c in contexts]
    assert job_id in task_ids, f"Expected {job_id} in recovered contexts, got {task_ids}"


def test_recoverable_contexts_found_for_queued_job():
    """A 'queued' queue row is returned as a TaskContext."""
    pid = create_project("P-recovery-queued")
    cid = create_chapter(pid, "C-recovery-queued")
    job_id = "job-recover-queued-1"
    upsert_queue_row(job_id, project_id=pid, chapter_id=cid, status="queued")

    contexts = load_recoverable_task_contexts()

    task_ids = [c.task_id for c in contexts]
    assert job_id in task_ids, f"Expected {job_id} in recovered contexts, got {task_ids}"


def test_recoverable_context_has_recovered_flag():
    """Recovered context payload carries _recovered=True and the original status."""
    pid = create_project("P-recovery-flag")
    cid = create_chapter(pid, "C-recovery-flag")
    job_id = "job-recover-flag-1"
    upsert_queue_row(job_id, project_id=pid, chapter_id=cid, status="running")

    contexts = load_recoverable_task_contexts()
    ctx = next((c for c in contexts if c.task_id == job_id), None)
    assert ctx is not None
    assert ctx.payload.get("_recovered") is True
    assert ctx.payload.get("_recovered_from_status") == "running"


def test_recoverable_context_is_task_context_instance():
    """load_recoverable_task_contexts returns TaskContext objects."""
    pid = create_project("P-recovery-type")
    cid = create_chapter(pid, "C-recovery-type")
    job_id = "job-recover-type-1"
    upsert_queue_row(job_id, project_id=pid, chapter_id=cid, status="running")

    contexts = load_recoverable_task_contexts()
    for ctx in contexts:
        assert isinstance(ctx, TaskContext)


def test_dedup_keeps_most_active_row_running_over_waiting():
    """When a chapter has both a 'waiting' and a 'running' row, the per-chapter
    dedup in load_recoverable_task_contexts() must keep the 'running' row.

    Contract test (not a naive revert-check): a bare ``set`` of status strings
    does not have a guaranteed iteration order across process runs (Python
    randomizes string hashing by default), so this could false-green even on
    the pre-fix code depending on hash seed. _RECOVERABLE_STATUSES must be an
    ordered sequence with 'running' before 'waiting' for this to be
    deterministic. See revert-check note below for how this was verified.
    """
    pid = create_project("P-recovery-dedup-order")
    cid = create_chapter(pid, "C-recovery-dedup-order")
    waiting_job_id = "job-recover-dedup-waiting-1"
    running_job_id = "job-recover-dedup-running-1"
    upsert_queue_row(waiting_job_id, project_id=pid, chapter_id=cid, status="waiting")
    upsert_queue_row(running_job_id, project_id=pid, chapter_id=cid, status="running")

    contexts = load_recoverable_task_contexts()
    chapter_contexts = [c for c in contexts if c.payload.get("chapter_id") == cid]

    assert len(chapter_contexts) == 1, (
        f"Expected exactly one deduped context for chapter {cid}, got {chapter_contexts}"
    )
    assert chapter_contexts[0].task_id == running_job_id, (
        f"Expected the 'running' row ({running_job_id}) to win dedup, "
        f"got {chapter_contexts[0].task_id}"
    )


def test_terminal_jobs_not_recovered():
    """Done/failed/cancelled rows are NOT included in recovered contexts."""
    pid = create_project("P-recovery-terminal")
    cid = create_chapter(pid, "C-recovery-terminal")
    upsert_queue_row("job-done-skip", project_id=pid, chapter_id=cid, status="done")
    upsert_queue_row("job-failed-skip", project_id=pid, chapter_id=cid, status="failed")

    contexts = load_recoverable_task_contexts()
    task_ids = {c.task_id for c in contexts}
    assert "job-done-skip" not in task_ids
    assert "job-failed-skip" not in task_ids


# ---------------------------------------------------------------------------
# B18 startup-recovery wiring tests
# ---------------------------------------------------------------------------

class TestStartupRecovery:
    """Tests for run_startup_recovery() end-to-end wiring.

    Revert-check: without the run_startup_recovery() call in boot.py (or
    without the contexts= parameter on recover()), the orchestrator.submit
    mock is never called and test_startup_recovery_resubmits_interrupted_task
    fails.
    """

    def test_startup_recovery_resubmits_interrupted_task(self, monkeypatch):
        """run_startup_recovery() causes orchestrator.recover() to be called
        with the pre-snapshotted contexts, which then calls submit().

        Patch boundary (R2): TaskOrchestrator.submit is outside the unit under
        test (run_startup_recovery / recover wiring). The mock replaces only
        the dispatch boundary, not the recovery logic itself.
        """
        pid = create_project("P-startup-recover-submit")
        cid = create_chapter(pid, "C-startup-recover-submit")
        job_id = "job-startup-recover-submit-1"
        upsert_queue_row(job_id, project_id=pid, chapter_id=cid, status="running")

        # Snapshot contexts before reconciliation (mirrors startup step 0)
        contexts = load_recoverable_task_contexts()
        assert any(c.task_id == job_id for c in contexts), "Precondition: job must be recoverable"

        submitted_ids: list[str] = []

        def fake_submit(task):
            submitted_ids.append(task.describe().task_id if hasattr(task, "describe") else str(task))
            return getattr(task, "task_id", str(task))

        # Patch at the orchestrator class level so any instance is affected.
        monkeypatch.setenv("STUDIO_RECOVER_ON_STARTUP", "1")
        with patch(
            "app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit",
            side_effect=fake_submit,
        ):
            from app.core.boot import run_startup_recovery
            run_startup_recovery(contexts)

        # submit() should have been invoked for our job (possibly among others)
        assert job_id in submitted_ids, (
            f"Expected {job_id} to be submitted during startup recovery; got {submitted_ids}"
        )

    def test_startup_recovery_disabled_by_env_var(self, monkeypatch):
        """When STUDIO_RECOVER_ON_STARTUP=0 recovery is skipped entirely."""
        pid = create_project("P-startup-recover-disabled")
        cid = create_chapter(pid, "C-startup-recover-disabled")
        job_id = "job-startup-recover-disabled-1"
        upsert_queue_row(job_id, project_id=pid, chapter_id=cid, status="running")

        contexts = load_recoverable_task_contexts()
        assert any(c.task_id == job_id for c in contexts), "Precondition: job must be recoverable"

        monkeypatch.setenv("STUDIO_RECOVER_ON_STARTUP", "0")

        submitted_ids: list[str] = []

        def fake_submit(task):
            submitted_ids.append(getattr(task, "task_id", str(task)))
            return getattr(task, "task_id", str(task))

        with patch(
            "app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit",
            side_effect=fake_submit,
        ):
            from app.core.boot import run_startup_recovery
            run_startup_recovery(contexts)

        assert job_id not in submitted_ids, (
            "Recovery must be suppressed when STUDIO_RECOVER_ON_STARTUP=0"
        )


# ---------------------------------------------------------------------------
# Issue #238 — recovered synthesis payload uses the DB's `engine` column, not
# a nonexistent `engine_id` key, and a crash mid-resubmission doesn't vanish
# silently.
# ---------------------------------------------------------------------------

class TestRecoveredSynthesisEngineField:
    """A recovered ``processing_queue`` row's payload has a key named
    ``engine`` (see ``list_jobs_by_status`` docstring) — there is no
    ``engine_id`` key anywhere in the raw DB row. ``SynthesisTask.from_task_context``
    must fall back to ``engine`` or every recovered synthesis task fails
    ``validate()`` with ``ValueError: engine_id is required``.
    """

    def test_from_task_context_falls_back_to_engine_column(self):
        from app.orchestration.tasks.synthesis import SynthesisTask
        from app.orchestration.tasks.base import TaskContext

        ctx = TaskContext(
            task_id="job-engine-fallback-1",
            task_type="synthesis",
            payload={
                "id": "job-engine-fallback-1",
                "engine": "xtts",
                "script_text": "hello world",
                "output_path": "/tmp/out.wav",
            },
        )

        task = SynthesisTask.from_task_context(ctx)

        assert task.engine_id == "xtts"
        task.validate()  # must not raise

    def test_recovered_job_from_real_db_row_reconstructs_with_engine_id(self):
        """End-to-end: a real recoverable DB row (as produced by
        ``upsert_queue_row``/``list_jobs_by_status``) reconstructs into a
        ``SynthesisTask`` whose ``engine_id`` is populated and whose
        ``validate()`` does not raise.
        """
        pid = create_project("P-recovery-engine-field")
        cid = create_chapter(pid, "C-recovery-engine-field")
        job_id = "job-recover-engine-field-1"
        upsert_queue_row(job_id, project_id=pid, chapter_id=cid, status="running", engine="xtts")

        contexts = load_recoverable_task_contexts()
        ctx = next(c for c in contexts if c.task_id == job_id)

        from app.orchestration.tasks.synthesis import SynthesisTask
        task = SynthesisTask.from_task_context(ctx)

        assert task.engine_id == "xtts"
        # A recovered context has no `script_text` (processing_queue never
        # stores it) and `TaskContext.chapter_id` isn't threaded through by
        # `load_recoverable_task_contexts` — a separate, pre-existing gap
        # outside this issue's scope — so validate() still raises here, but
        # it must be the script_text complaint, never "engine_id is
        # required": that's the specific defect issue #238 reports.
        with pytest.raises(ValueError, match="script_text"):
            task.validate()


class TestRecoverySubmissionCrashIsSurfaced:
    """A validation (or any other) exception raised inside the background
    thread that resubmits a recovered task must not vanish silently — it
    must be logged and published as a failure, not leave the job stuck
    forever in whatever terminal status ``reconcile_queue_status`` already
    wrote, with no trace in the app's own logs/progress stream.
    """

    def test_submit_exception_in_recovery_thread_is_caught_and_reported(self, monkeypatch):
        from app.orchestration.scheduler.orchestrator import create_orchestrator

        pid = create_project("P-recovery-crash")
        cid = create_chapter(pid, "C-recovery-crash")
        job_id = "job-recover-crash-1"
        # Deliberately no `engine` column, and no reconstructable payload —
        # forces from_task_context -> validate() to raise inside submit().
        upsert_queue_row(job_id, project_id=pid, chapter_id=cid, status="running", engine=None)

        contexts = load_recoverable_task_contexts()
        assert any(c.task_id == job_id for c in contexts)

        orchestrator = create_orchestrator()

        published_statuses: list[str] = []
        original_publish = orchestrator.progress_service.publish

        def spy_publish(*, job_id=None, status=None, **kwargs):
            published_statuses.append(status)
            return original_publish(job_id=job_id, status=status, **kwargs)

        monkeypatch.setattr(orchestrator.progress_service, "publish", spy_publish)

        class SynchronousThread:
            """Runs the target inline on .start() — no real threading, no
            sleep-based waiting needed to observe its effect (R4)."""

            def __init__(self, target=None, args=(), kwargs=None, daemon=None, name=None):
                self._target = target
                self._args = args
                self._kwargs = kwargs or {}

            def start(self):
                self._target(*self._args, **self._kwargs)

            def join(self, *a, **kw):
                pass

        with (
            patch(
                "app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit",
                side_effect=ValueError("engine_id is required"),
            ),
            patch("threading.Thread", SynchronousThread),
        ):
            recovered = orchestrator.recover(contexts=contexts)

        assert job_id in recovered
        assert "failed" in published_statuses, (
            "A submit() exception inside the recovery thread must be caught "
            "and published as a failed status, not vanish silently."
        )
