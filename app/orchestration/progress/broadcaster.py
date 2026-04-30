"""Progress broadcasting helpers.

This module stays transport-focused. Progress semantics live in
``app.orchestration.progress.service``.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

_PROGRESS_SINK: Callable[[dict[str, object], str], Any] | None = None


def configure_progress_broadcaster(sink: Callable[[dict[str, object], str], Any] | None) -> None:
    """Explicitly wire the outbound progress transport."""

    global _PROGRESS_SINK
    _PROGRESS_SINK = sink


def broadcast_progress(*, payload: dict[str, object], channel: str = "jobs") -> None:
    """Describe live progress event broadcasting to frontend listeners.

    Args:
        payload: Canonical live progress payload.
        channel: Broadcast channel name used by connected clients.

    The broadcaster does not decide whether an update is meaningful. That
    policy lives in the progress service so transport stays dumb.
    """
    sink = _PROGRESS_SINK
    if sink is None:
        return
    sink(payload, channel)
