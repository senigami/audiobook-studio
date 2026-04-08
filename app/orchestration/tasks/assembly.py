"""Audiobook assembly task scaffold."""

from .base import StudioTask, TaskContext, TaskResult


class AssemblyTask(StudioTask):
    """Queueable task for final audiobook assembly and packaging."""

    def validate(self) -> None:
        """Validate assembly-task inputs before scheduling."""
        raise NotImplementedError

    def describe(self) -> TaskContext:
        """Describe assembly-task identity and ownership."""
        raise NotImplementedError

    def run(self) -> TaskResult:
        """Describe assembly-task execution flow."""
        raise NotImplementedError

    def on_cancel(self) -> None:
        """Describe assembly-task cleanup on cancellation."""
        raise NotImplementedError
