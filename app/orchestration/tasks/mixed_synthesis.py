"""Mixed-engine synthesis task scaffold."""

from .base import StudioTask, TaskContext, TaskResult


class MixedSynthesisTask(StudioTask):
    """Queueable task for chapters that require multiple engine passes."""

    def validate(self) -> None:
        """Validate mixed-synthesis inputs before scheduling."""
        raise NotImplementedError

    def describe(self) -> TaskContext:
        """Describe mixed-synthesis identity and ownership."""
        raise NotImplementedError

    def run(self) -> TaskResult:
        """Describe mixed-synthesis execution flow."""
        raise NotImplementedError

    def on_cancel(self) -> None:
        """Describe mixed-synthesis cleanup on cancellation."""
        raise NotImplementedError
