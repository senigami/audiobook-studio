from __future__ import annotations

import signal
from contextlib import contextmanager


@contextmanager
def timeout_after(seconds: float, message: str | None = None):
    """Fail a test if it blocks longer than the allotted wall-clock seconds."""

    if seconds <= 0:
        yield
        return

    def _handler(signum, frame):  # noqa: ARG001
        raise TimeoutError(message or f"Test timed out after {seconds} seconds")

    previous_handler = signal.signal(signal.SIGALRM, _handler)
    signal.setitimer(signal.ITIMER_REAL, float(seconds))
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous_handler)
