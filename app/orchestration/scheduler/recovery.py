"""Scheduler recovery helpers.

This module will own restart recovery rules for queued work, resource claims,
and partial execution state.
"""

from app.orchestration.tasks.base import TaskContext


def load_recoverable_task_contexts() -> list[TaskContext]:
    """Describe startup recovery discovery for queued work.

    Returns:
        list[TaskContext]: Recoverable task contexts discovered at startup.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    raise NotImplementedError
