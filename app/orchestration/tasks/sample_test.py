"""Voice sample-test task scaffold."""

from .base import StudioTask, TaskContext, TaskResult


class SampleTestTask(StudioTask):
    """Queueable task for one-off preview or voice-test execution."""

    def validate(self) -> None:
        """Validate sample-test inputs before scheduling."""
        raise NotImplementedError

    def describe(self) -> TaskContext:
        """Describe sample-test identity and ownership."""
        raise NotImplementedError

    def run(self) -> TaskResult:
        """Describe sample-test execution flow."""
        raise NotImplementedError

    def on_cancel(self) -> None:
        """Describe sample-test cleanup on cancellation."""
        raise NotImplementedError
