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
    Code-level constant: ``USE_TTS_SERVER_ENV``.

USE_STUDIO_ORCHESTRATOR
    When true, the 2.0 TaskOrchestrator handles scheduling, dispatch, and
    recovery.  When false (default), the legacy ``app.jobs`` worker loop runs.

    This flag is intentionally separate from ``USE_TTS_SERVER`` so engine
    transport rollout (HTTP vs in-process) can be tested independently of
    scheduler rollout.

    Set via environment: ``USE_STUDIO_ORCHESTRATOR=true``.
    Disabled by default during the Phase 5 migration.
    Code-level constant: ``USE_STUDIO_ORCHESTRATOR_ENV``.
"""

from __future__ import annotations

import os

USE_TTS_SERVER_ENV = "USE_TTS_SERVER"
USE_STUDIO_ORCHESTRATOR_ENV = "USE_STUDIO_ORCHESTRATOR"


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


def use_tts_server() -> bool:
    """Return True when the TTS Server synthesis path is enabled.

    Controlled by the ``USE_TTS_SERVER`` environment variable.  Defaults to
    True as of the Studio 2.0 release candidate.  Can be disabled by setting
    ``USE_TTS_SERVER=0``.

    Returns:
        bool: True when the TTS Server path should be used.
    """
    return is_feature_enabled(USE_TTS_SERVER_ENV, default=True)


def use_studio_orchestrator() -> bool:
    """Return True when the Studio 2.0 orchestrator is enabled.

    Controlled by the ``USE_STUDIO_ORCHESTRATOR`` environment variable.
    Defaults to True as of the Studio 2.0 release candidate.  Can be
    disabled by setting ``USE_STUDIO_ORCHESTRATOR=0``.

    This flag is independent of ``USE_TTS_SERVER`` — they can be enabled
    separately to allow independent testing and rollout.

    Returns:
        bool: True when the 2.0 orchestrator path should be used.
    """
    return is_feature_enabled(USE_STUDIO_ORCHESTRATOR_ENV, default=True)
