"""Feature-flag boundary for Studio 2.0 migration.

This module will centralize cutover flags so migration behavior does not drift
into route handlers, workers, or UI-specific conditionals.
"""


def is_feature_enabled(flag_name: str) -> bool:
    """Describe feature-flag lookup for Studio 2.0 migration cutovers.

    Args:
        flag_name: Stable flag identifier requested by backend or frontend
            wiring.

    Returns:
        bool: Whether the named feature flag is enabled.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = flag_name
    raise NotImplementedError
