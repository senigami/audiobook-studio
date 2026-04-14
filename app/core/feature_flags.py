"""Feature-flag boundary for Studio 2.0 migration.

This module centralizes cutover flags so migration behavior does not drift
into route handlers, workers, or UI-specific conditionals.

Known flags
-----------
USE_TTS_SERVER
    When true, the VoiceBridge routes synthesis through the TTS Server
    subprocess via HTTP instead of calling engine adapters in-process.
    The engine registry also caches responses from the TTS Server instead of
    importing engine classes directly.

    Set via environment: ``USE_TTS_SERVER=true`` or ``USE_TTS_SERVER=1``.
    Disabled by default during the Phase 5 migration.
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


def use_tts_server() -> bool:
    """Return True when the TTS Server synthesis path is enabled.

    Controlled by the ``USE_TTS_SERVER`` environment variable.  Disabled by
    default during the Phase 5 migration window so the legacy in-process path
    continues to work until it is explicitly cut over.

    Returns:
        bool: True when the TTS Server path should be used.
    """
    return _normalize_flag_value(os.getenv("USE_TTS_SERVER"))
