"""Scheduler policy helpers.

This module describes queue ordering, fairness, and resource-priority policy
separately from task execution code.
"""

from app.orchestration.tasks.base import TaskContext


def choose_next_task(*, queued_tasks: list[TaskContext]) -> TaskContext | None:
    """Describe task selection according to Studio 2.0 scheduler policy.

    Args:
        queued_tasks: Recoverable or waiting task contexts eligible to run.

    Returns:
        TaskContext | None: Selected task context, or None when nothing is
        eligible to run.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = queued_tasks
    raise NotImplementedError
