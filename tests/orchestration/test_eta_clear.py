"""Tests for the clear_eta parameter on OrchestratorPublishMixin._publish (Task: eta-clear).

Covers:
  - Publishing with clear_eta=True AND eta_seconds=None clears a previously-persisted
    positive ETA in the state store.
  - Publishing with clear_eta=False (default) and eta_seconds=None PRESERVES a
    previously-persisted positive ETA (no clobber).

Mock boundary (R2):
  - progress_service is stubbed (external I/O) — matches the conftest fixture pattern.
  - app.db.state put_job / get_jobs / update_job are monkeypatched (filesystem boundary).
  - We do NOT mock _publish itself or state-store internals of the job under test.
  - We do NOT mock app.engines.behavior (import-time side-effect-free), but we
    supply a minimal engine_id that won't trigger heavy imports.

R4: no sleep; all time values are explicit constants.
"""

from __future__ import annotations

import pytest
from unittest.mock import MagicMock

from app.orchestration.scheduler.orchestrator import TaskOrchestrator
from app.orchestration.tasks.base import TaskContext
from app.db.models import Job


# ---------------------------------------------------------------------------
# Harness helpers
# ---------------------------------------------------------------------------

def _make_orchestrator(monkeypatch):
    """Build a TaskOrchestrator with:
    - A stubbed progress_service (R2: external I/O boundary).
    - An in-process jobs_db dict that stands in for the real state.json store.
      Monkeypatches app.db.state.{put_job,get_jobs,update_job} to use it.

    Returns (orchestrator, jobs_db).
    """
    # Stub progress_service — external broadcast boundary only
    svc = MagicMock()
    svc.publish.return_value = None

    # Stub voice_bridge — not used in these tests but required by constructor
    bridge = MagicMock()

    orc = TaskOrchestrator(progress_service=svc, voice_bridge=bridge)

    # In-process state store: keyed by job id
    jobs_db: dict[str, Job] = {}

    def _put_job(job: Job) -> None:
        jobs_db[job.id] = job

    def _get_jobs() -> dict[str, Job]:
        return jobs_db

    def _update_job(job_id: str, **kwargs) -> None:
        job = jobs_db.get(job_id)
        if job is None:
            return
        for k, v in kwargs.items():
            # skip internal orchestration kwargs that aren't Job fields
            if hasattr(job, k):
                setattr(job, k, v)

    # Patch all import sites used by _publish (lazy imports inside _publish body)
    for target in (
        "app.db.state.put_job",
        "app.db.state_jobs.put_job",
    ):
        monkeypatch.setattr(target, _put_job)

    for target in (
        "app.db.state.get_jobs",
        "app.db.state_jobs.get_jobs",
    ):
        monkeypatch.setattr(target, _get_jobs)

    for target in (
        "app.db.state.update_job",
        "app.db.state_jobs.update_job",
    ):
        monkeypatch.setattr(target, _update_job)

    # Suppress the engine-behavior import (no heavy plugins needed in unit tests)
    monkeypatch.setattr(
        "app.engines.behavior.uses_segment_orchestration",
        lambda engine_id: False,
    )
    monkeypatch.setattr(
        "app.engines.behavior.supports_segment_rendering",
        lambda engine_id: False,
    )

    return orc, jobs_db


def _make_context(task_id: str) -> TaskContext:
    return TaskContext(
        task_id=task_id,
        task_type="synthesis",
        project_id="proj-eta-clear",
        chapter_id="ch-eta-clear",
        payload={"engine_id": ""},
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestEtaClear:
    """Behavioral tests for the clear_eta parameter on _publish.

    R1 revert-check: stash only the `elif clear_eta:` lines + the param; the
    assertion in test_clear_eta_true_clears_persisted_eta goes RED with:
        AssertionError: After clear_eta=True, eta_seconds must be None …
    """

    def test_positive_eta_is_persisted_on_first_publish(self, monkeypatch):
        """Precondition: a first publish with eta_seconds=30 writes 30 to the job."""
        orc, jobs_db = _make_orchestrator(monkeypatch)
        ctx = _make_context("eta-clear-pre-1")

        orc._publish(
            context=ctx,
            status="running",
            progress=0.1,
            eta_seconds=30,
        )

        job = jobs_db.get("eta-clear-pre-1")
        assert job is not None, "Job must be created after first _publish"
        assert job.eta_seconds == 30, (
            f"First publish with eta_seconds=30 must persist eta=30, got {job.eta_seconds!r}"
        )

    def test_clear_eta_true_clears_persisted_eta(self, monkeypatch):
        """Publishing with eta_seconds=None, clear_eta=True clears a positive persisted ETA."""
        orc, jobs_db = _make_orchestrator(monkeypatch)
        ctx = _make_context("eta-clear-job-1")

        # Step 1: establish a positive ETA
        orc._publish(
            context=ctx,
            status="running",
            progress=0.1,
            eta_seconds=30,
        )
        job = jobs_db.get("eta-clear-job-1")
        assert job is not None
        assert job.eta_seconds == 30, "Setup: eta_seconds must be 30 after first frame"

        # Step 2: publish with clear_eta=True and eta_seconds=None — must clear the ETA
        orc._publish(
            context=ctx,
            status="running",
            progress=0.15,
            eta_seconds=None,
            clear_eta=True,
        )
        job = jobs_db.get("eta-clear-job-1")
        assert job.eta_seconds is None, (
            f"After clear_eta=True, eta_seconds must be None in the persisted job, "
            f"got {job.eta_seconds!r}"
        )

    def test_clear_eta_false_preserves_positive_eta(self, monkeypatch):
        """Guard: publishing with eta_seconds=None and clear_eta=False (default) must NOT clobber a good ETA."""
        orc, jobs_db = _make_orchestrator(monkeypatch)
        ctx = _make_context("eta-clear-job-2")

        # Step 1: establish a positive ETA
        orc._publish(
            context=ctx,
            status="running",
            progress=0.1,
            eta_seconds=45,
        )
        job = jobs_db.get("eta-clear-job-2")
        assert job is not None
        assert job.eta_seconds == 45, "Setup: eta_seconds must be 45 after first frame"

        # Step 2: publish with eta_seconds=None and clear_eta=False (default) — must NOT touch ETA
        orc._publish(
            context=ctx,
            status="running",
            progress=0.2,
            eta_seconds=None,
            # clear_eta defaults to False — omitted intentionally to test the default
        )
        job = jobs_db.get("eta-clear-job-2")
        assert job.eta_seconds == 45, (
            f"A frame with eta_seconds=None and clear_eta=False must PRESERVE "
            f"the previously-persisted eta_seconds=45, got {job.eta_seconds!r}"
        )
