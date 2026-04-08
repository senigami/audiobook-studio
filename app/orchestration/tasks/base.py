"""StudioTask base contract.

Every queueable unit in Studio 2.0 should derive from this boundary so the
orchestrator can remain task-type agnostic.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class TaskContext:
    """Shared task metadata used by the orchestrator and progress services."""

    task_id: str
    task_type: str
    project_id: str | None = None
    chapter_id: str | None = None
    requested_by: str | None = None


@dataclass(frozen=True)
class TaskResult:
    """Placeholder task result model used by future task implementations."""

    status: str
    message: str | None = None


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
