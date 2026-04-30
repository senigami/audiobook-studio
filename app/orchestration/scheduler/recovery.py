"""Scheduler recovery helpers.

Loads incomplete tasks from the database on startup so the orchestrator can
re-queue work that was interrupted by a crash or restart.

Recovery contract
-----------------
The orchestrator's ``recover()`` method is responsible for calling Phase 4
reconciliation on each recovered context before re-queuing.  This module
only discovers interrupted jobs — it does not decide what to re-render.

The intended recovery flow is:
1. This module discovers interrupted ``running``, ``queued``, ``waiting`` jobs.
2. The orchestrator calls ``reconcile_work_item()`` for each batch in scope.
3. Already-valid artifacts are reused (not re-rendered).
4. Only unresolved work items are re-queued.
5. Recovery-specific progress transitions are published.
"""

from __future__ import annotations

import logging

from app.orchestration.tasks.base import TaskContext

logger = logging.getLogger(__name__)

# Job statuses that indicate interrupted work to be recovered.
_RECOVERABLE_STATUSES = {"running", "queued", "waiting"}


def load_recoverable_task_contexts() -> list[TaskContext]:
    """Load recoverable task contexts from the database on startup.

    Scans the job queue for tasks in ``running``, ``queued``, or ``waiting``
    states and returns minimal ``TaskContext`` objects so the orchestrator can
    reconcile and resume them.

    .. note::

       This function discovers interrupted jobs only.  It does **not** call
       reconciliation or decide what to re-render.  That responsibility
       belongs to ``TaskOrchestrator.recover()``, which must call
       ``reconcile_work_item()`` for each batch before dispatching work.

    Returns:
        list[TaskContext]: Contexts for recoverable tasks.  Empty list when
        there are no dangling jobs or the database is unavailable.
    """

    try:
        from app.db.queue import list_jobs_by_status  # noqa: PLC0415
    except ImportError:
        logger.debug("DB queue not available for recovery; skipping.")
        return []

    contexts: list[TaskContext] = []

    for status in _RECOVERABLE_STATUSES:
        try:
            jobs = list_jobs_by_status(status=status) or []
        except Exception as exc:
            logger.warning(
                "Could not load %s jobs for recovery: %s", status, exc
            )
            continue

        for job in jobs:
            if not isinstance(job, dict):
                continue

            job_id = job.get("id") or job.get("job_id")
            task_type = job.get("type") or job.get("task_type", "synthesis")

            if not job_id:
                continue

            ctx = TaskContext(
                task_id=str(job_id),
                task_type=str(task_type),
                payload={
                    **job,
                    "_recovered": True,
                    "_recovered_from_status": status,
                },
            )
            contexts.append(ctx)

    if contexts:
        logger.info("Recovered %d task(s) from previous session.", len(contexts))

    return contexts
