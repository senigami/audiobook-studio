"""Recovered contexts must carry chapter_id/project_id as real fields.

``TaskContext`` declares ``project_id`` and ``chapter_id`` as top-level fields
and the orchestrator gates on them directly (``context.chapter_id``), never on
``payload``.  Recovery previously read ``chapter_id`` only for its per-chapter
dedup and dropped it, so every recovered context arrived with both as ``None``
and a crashed chapter render could not resume.

Revert-check: drop the ``project_id=``/``chapter_id=`` arguments in
``load_recoverable_task_contexts`` and both tests below fail — the first on the
``None`` fields, the second because reconstruction falls through to a bare
``SynthesisTask`` whose ``validate()`` rejects the empty ``script_text``.
"""

from __future__ import annotations

import pytest
from app.db.chapters import create_chapter
from app.db.projects import create_project
from app.db.queue import upsert_queue_row
from app.orchestration.scheduler.recovery import load_recoverable_task_contexts


def _recovered(job_id: str):
    """Return the recovered context for ``job_id``, or fail loudly."""
    for ctx in load_recoverable_task_contexts():
        if ctx.task_id == job_id:
            return ctx
    pytest.fail(f"{job_id} was not returned by load_recoverable_task_contexts()")


def test_recovered_context_carries_chapter_and_project_id():
    """The identifiers the orchestrator gates on survive recovery."""
    pid = create_project("P-recovery-identifiers")
    cid = create_chapter(pid, "C-recovery-identifiers")
    job_id = "job-recovery-identifiers-1"
    upsert_queue_row(job_id, project_id=pid, chapter_id=cid, status="running")

    ctx = _recovered(job_id)

    # Expected values come from the fixtures, not from anything recovery.py
    # computed, so this cannot pass by agreeing with itself.
    assert ctx.chapter_id == cid
    assert ctx.project_id == pid


def test_recovered_chapter_job_reconstructs_as_a_chapter_task(orchestrator):
    """The consequence: a recovered chapter render rebuilds as a chapter task.

    Asserting the identifiers alone would not catch a regression that kept the
    fields but broke the gate, so this drives the real reconstruction path and
    asserts what it produces.
    """
    from app.orchestration.tasks.synthesis import SynthesisTask

    pid = create_project("P-recovery-reconstruct")
    cid = create_chapter(pid, "C-recovery-reconstruct", text_content="Hello there.")
    job_id = "job-recovery-reconstruct-1"
    upsert_queue_row(
        job_id,
        project_id=pid,
        chapter_id=cid,
        status="running",
        engine="xtts",
    )

    ctx = _recovered(job_id)
    task = orchestrator._reconstruct_task(ctx)

    assert task is not None, "recovered chapter job reconstructed to nothing"
    assert not isinstance(task, SynthesisTask), (
        "recovered chapter job fell through to a bare SynthesisTask; "
        "its validate() rejects the empty script_text and the job dies"
    )
