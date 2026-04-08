"""Export repair task scaffold."""

from .base import StudioTask, TaskContext, TaskResult


class ExportRepairTask(StudioTask):
    """Queueable task for export backfill, repair, or missing-output recovery."""

    def validate(self) -> None:
        """Validate export-repair inputs before scheduling."""
        raise NotImplementedError

    def describe(self) -> TaskContext:
        """Describe export-repair identity and ownership."""
        raise NotImplementedError

    def run(self) -> TaskResult:
        """Describe export-repair execution flow."""
        raise NotImplementedError

    def on_cancel(self) -> None:
        """Describe export-repair cleanup on cancellation."""
        raise NotImplementedError
