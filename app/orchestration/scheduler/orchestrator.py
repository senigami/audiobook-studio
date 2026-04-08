"""Task orchestrator for Studio 2.0.

This will eventually coordinate resource claims, recovery, and task dispatch.
Legacy worker behavior still owns runtime execution until the queue cutover.
"""

from app.engines.bridge import create_voice_bridge
from app.orchestration.progress.service import create_progress_service
from app.orchestration.tasks.base import StudioTask, TaskContext

from .policies import choose_next_task
from .recovery import load_recoverable_task_contexts
from .resources import reserve_task_resources


class TaskOrchestrator:
    """Placeholder orchestrator surface for Studio 2.0.

    Intended flow:
    - accept a StudioTask
    - coordinate scheduling and recovery
    - rely on progress services and voice bridge instead of direct worker logic
    """

    def __init__(self, *, progress_service, voice_bridge):
        self.progress_service = progress_service
        self.voice_bridge = voice_bridge

    def submit(self, task: StudioTask) -> str:
        """Queue a future task through the orchestrator boundary.

        Args:
            task: Task shell implementing the StudioTask contract.

        Returns:
            str: Scheduled task identifier used by queue and progress surfaces.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        context = task.describe()
        self._validate_task_submission(task=task, context=context)
        self._reserve_resources(context=context)
        self._publish_task_started(context=context)
        _ = self._dispatch_task(task=task, context=context)
        raise NotImplementedError("Studio 2.0 task submission is not implemented yet.")

    def recover(self) -> None:
        """Recover queued work after restart using 2.0 orchestration rules.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        _ = self._load_recoverable_tasks()
        raise NotImplementedError("Studio 2.0 recovery is not implemented yet.")

    def cancel(self, task_id: str) -> None:
        """Cancel a scheduled task through the orchestrator boundary.

        Args:
            task_id: Stable task identifier to cancel.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        _ = task_id
        raise NotImplementedError("Studio 2.0 task cancellation is not implemented yet.")

    def _validate_task_submission(self, *, task: StudioTask, context: TaskContext) -> None:
        """Validate task readiness before queue admission.

        Args:
            task: Task shell implementing the StudioTask contract.
            context: Stable task identity and ownership metadata.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        _ = (task, context)
        raise NotImplementedError("Studio 2.0 task validation is not implemented yet.")

    def _reserve_resources(self, *, context: TaskContext) -> dict[str, object]:
        """Describe resource reservation before dispatch begins.

        Args:
            context: Stable task identity and ownership metadata.

        Returns:
            dict[str, object]: Placeholder resource-claim record.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        _ = reserve_task_resources(task_type=context.task_id, resource_claims={})
        raise NotImplementedError("Studio 2.0 resource reservation is not implemented yet.")

    def _publish_task_started(self, *, context: TaskContext) -> None:
        """Describe the first progress event emitted after scheduling.

        Args:
            context: Stable task identity and ownership metadata.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        _ = self.progress_service
        _ = context
        raise NotImplementedError("Studio 2.0 task-start publishing is not implemented yet.")

    def _dispatch_task(self, *, task: StudioTask, context: TaskContext) -> str:
        """Describe how a validated task moves into execution.

        Args:
            task: Task shell implementing the StudioTask contract.
            context: Stable task identity and ownership metadata.

        Returns:
            str: Stable task identifier routed to the execution layer.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        _ = choose_next_task
        _ = self.voice_bridge
        _ = (task, context)
        raise NotImplementedError("Studio 2.0 task dispatch is not implemented yet.")

    def _load_recoverable_tasks(self) -> list[TaskContext]:
        """Describe restart recovery input gathering for queued work.

        Returns:
            list[TaskContext]: Recoverable tasks discovered during startup.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        _ = load_recoverable_task_contexts()
        raise NotImplementedError("Studio 2.0 recovery loading is not implemented yet.")


def create_orchestrator() -> TaskOrchestrator:
    """Create the scheduler shell with future dependency wiring.

    Returns:
        TaskOrchestrator: Orchestrator shell with progress and bridge
        dependencies attached.
    """
    return TaskOrchestrator(
        progress_service=create_progress_service(),
        voice_bridge=create_voice_bridge(),
    )
