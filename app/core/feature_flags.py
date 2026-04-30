"""Feature-flag helpers that remain for unrelated non-cutover gates.

Studio 2.0 no longer uses runtime flags to switch between legacy and 2.0
execution paths. This module only keeps the generic environment helper used by
independent flags such as ``USE_V2_ENGINE_BRIDGE``.
"""

from __future__ import annotations

import os


def _normalize_flag_value(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    normalized = str(value).strip().lower()
    if not normalized:
        return default
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def is_feature_enabled(flag_name: str, default: bool = False) -> bool:
    """Describe feature-flag lookup for Studio 2.0 migration cutovers.

    Args:
        flag_name: Stable flag identifier requested by backend or frontend
            wiring.
        default: Default value if the environment variable is not set.

    Returns:
        bool: Whether the named feature flag is enabled.

    """
    normalized_flag = str(flag_name or "").strip()
    if not normalized_flag:
        return False
    val = os.getenv(normalized_flag)
    return _normalize_flag_value(val, default)
