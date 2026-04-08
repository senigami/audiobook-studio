"""StudioTask base contract.

Every queueable unit in Studio 2.0 should derive from this boundary so the
orchestrator can remain task-type agnostic.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class TaskResult:
    """Placeholder task result model used by future task implementations."""

    status: str
    message: str | None = None


class StudioTask:
    """Placeholder task interface."""

    def validate(self) -> None:
        raise NotImplementedError

    def run(self) -> TaskResult:
        raise NotImplementedError

    def on_cancel(self) -> None:
        raise NotImplementedError
