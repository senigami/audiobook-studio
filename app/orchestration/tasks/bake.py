"""Chapter bake task scaffold."""

from .base import StudioTask, TaskContext, TaskResult


class BakeTask(StudioTask):
    """Queueable task for full-chapter bake or rebuild flows."""

    def validate(self) -> None:
        """Validate bake-task inputs before scheduling."""
        raise NotImplementedError

    def describe(self) -> TaskContext:
        """Describe bake-task identity and ownership."""
        raise NotImplementedError

    def run(self) -> TaskResult:
        """Describe bake-task execution flow."""
        raise NotImplementedError

    def on_cancel(self) -> None:
        """Describe bake-task cleanup on cancellation."""
        raise NotImplementedError
