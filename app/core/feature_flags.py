"""Feature-flag boundary for Studio 2.0 migration.

This module will centralize cutover flags so migration behavior does not drift
into route handlers, workers, or UI-specific conditionals.
"""

from __future__ import annotations

import os


def _normalize_flag_value(value: str | None) -> bool:
    normalized = str(value or "").strip().lower()
    return normalized in {"1", "true", "yes", "on"}


def is_feature_enabled(flag_name: str) -> bool:
    """Describe feature-flag lookup for Studio 2.0 migration cutovers.

    Args:
        flag_name: Stable flag identifier requested by backend or frontend
            wiring.

    Returns:
        bool: Whether the named feature flag is enabled.

    """
    normalized_flag = str(flag_name or "").strip()
    if not normalized_flag:
        return False
    return _normalize_flag_value(os.getenv(normalized_flag))
