"""Progress broadcasting helpers."""


def broadcast_progress(*, payload: dict[str, object], channel: str = "jobs") -> None:
    """Describe live progress event broadcasting to frontend listeners.

    Args:
        payload: Canonical live progress payload.
        channel: Broadcast channel name used by connected clients.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = (payload, channel)
    raise NotImplementedError
