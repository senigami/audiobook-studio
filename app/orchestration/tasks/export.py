"""Export task scaffold."""

from .base import StudioTask, TaskContext, TaskResult


class ExportTask(StudioTask):
    """Queueable task for project or audiobook export assembly."""

    def validate(self) -> None:
        """Validate export-task inputs before scheduling."""
        raise NotImplementedError

    def describe(self) -> TaskContext:
        """Describe export-task identity and ownership."""
        raise NotImplementedError

    def run(self) -> TaskResult:
        """Describe export-task execution flow."""
        raise NotImplementedError

    def on_cancel(self) -> None:
        """Describe export-task cleanup on cancellation."""
        raise NotImplementedError
