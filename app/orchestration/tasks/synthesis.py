"""Standard synthesis task scaffold."""

from .base import StudioTask, TaskContext, TaskResult


class SynthesisTask(StudioTask):
    """Queueable synthesis task for one render batch or synthesis unit."""

    def validate(self) -> None:
        """Validate synthesis-task inputs before scheduling."""
        raise NotImplementedError

    def describe(self) -> TaskContext:
        """Describe synthesis-task identity and parent ownership."""
        raise NotImplementedError

    def run(self) -> TaskResult:
        """Describe synthesis-task execution after resource reservation."""
        raise NotImplementedError

    def on_cancel(self) -> None:
        """Describe synthesis-task cleanup on cancellation."""
        raise NotImplementedError
