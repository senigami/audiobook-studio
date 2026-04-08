"""Task orchestrator for Studio 2.0.

This will eventually coordinate resource claims, recovery, and task dispatch.
Legacy worker behavior still owns runtime execution until the queue cutover.
"""

from app.engines.bridge import create_voice_bridge
from app.orchestration.progress.service import create_progress_service
from app.orchestration.tasks.base import StudioTask


class TaskOrchestrator:
    """Placeholder orchestrator surface for Studio 2.0.

    Intended flow:
    - accept a StudioTask
    - coordinate scheduling and recovery
    - rely on progress services and voice bridge instead of direct worker logic
    """

    def submit(self, task: StudioTask) -> str:
        """Queue a future task through the orchestrator boundary."""
        _ = (create_progress_service, create_voice_bridge, task)
        raise NotImplementedError("Studio 2.0 task submission is not implemented yet.")

    def recover(self) -> None:
        """Recover queued work after restart using 2.0 orchestration rules."""
        raise NotImplementedError("Studio 2.0 recovery is not implemented yet.")


def create_orchestrator() -> TaskOrchestrator:
    """Factory for the future orchestrator."""
    raise NotImplementedError
