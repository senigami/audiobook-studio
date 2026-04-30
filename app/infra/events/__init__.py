"""Internal event bus boundaries for Studio 2.0."""


def publish_internal_event(*, event_name: str, payload: dict[str, object]) -> None:
    """Describe backend-only event publication between app layers.

    Args:
        event_name: Stable internal event identifier.
        payload: Event payload forwarded between infrastructure consumers.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = (event_name, payload)
    raise NotImplementedError
