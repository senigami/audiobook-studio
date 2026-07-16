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
