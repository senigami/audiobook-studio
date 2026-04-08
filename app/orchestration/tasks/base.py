"""StudioTask base contract.

Every queueable unit in Studio 2.0 should derive from this boundary so the
orchestrator can remain task-type agnostic.
"""


class StudioTask:
    """Placeholder task interface."""

    def validate(self) -> None:
        raise NotImplementedError

    def run(self):
        raise NotImplementedError

    def on_cancel(self) -> None:
        raise NotImplementedError

