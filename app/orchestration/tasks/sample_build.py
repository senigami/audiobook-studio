"""Voice sample-build task scaffold."""

from .base import StudioTask, TaskContext, TaskResult


class SampleBuildTask(StudioTask):
    """Queueable task for reusable voice-sample generation."""

    def validate(self) -> None:
        """Validate sample-build inputs before scheduling."""
        raise NotImplementedError

    def describe(self) -> TaskContext:
        """Describe sample-build identity and ownership."""
        raise NotImplementedError

    def run(self) -> TaskResult:
        """Describe sample-build execution flow."""
        raise NotImplementedError

    def on_cancel(self) -> None:
        """Describe sample-build cleanup on cancellation."""
        raise NotImplementedError
