"""StudioTask base contract.

Every queueable unit in Studio 2.0 should derive from this boundary so the
orchestrator can remain task-type agnostic.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class TaskContext:
    """Shared task metadata used by the orchestrator and progress services.

    Attributes:
        task_id: Stable unique identifier for this task (e.g. job UUID).
        task_type: Machine-readable task category (e.g. ``"synthesis"``,
            ``"api_synthesis"``).
        project_id: Optional owning project identifier.
        chapter_id: Optional owning chapter identifier.
        requested_by: Optional user or caller identifier.
        payload: Flexible task parameters passed between the submitter and the
            executor.  Keys and value types are task-type specific.
        source: Origination of the task.  ``"ui"`` for Studio-originated tasks,
            ``"api"`` for external API tasks.  Used by priority policies.
        submitted_at: Monotonic timestamp set at submission time.  Used for
            FIFO tie-breaking within priority buckets.
    """

    task_id: str
    task_type: str
    project_id: str | None = None
    chapter_id: str | None = None
    requested_by: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    source: str = "ui"
    submitted_at: float = field(default_factory=time.monotonic)


@dataclass(frozen=True)
class TaskResult:
    """Placeholder task result model used by future task implementations."""

    status: str
    message: str | None = None
    retriable: bool = False


class StudioTask:
    """Placeholder task interface for all queueable Studio 2.0 work."""

    def validate(self) -> None:
        """Validate task payload before it enters the scheduler.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        raise NotImplementedError

    def describe(self) -> TaskContext:
        """Return the identifying metadata needed for scheduling.

        Returns:
            TaskContext: Stable task identity and parent ownership data.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        raise NotImplementedError

    def run(self) -> TaskResult:
        """Execute the task body once resources have been reserved.

        Returns:
            TaskResult: Placeholder task completion result.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        raise NotImplementedError

    def on_cancel(self) -> None:
        """Release task-level resources when a task is cancelled.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        raise NotImplementedError
