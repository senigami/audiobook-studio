"""Re-export shim — the SDK context moved to ``studio_plugin_sdk.context``.

Kept so every existing ``app.studio_plugin_sdk.context`` importer keeps
working with identical object identity (plan 010 invariant 1). New code
should import from ``studio_plugin_sdk.context`` directly.
"""

from __future__ import annotations

from studio_plugin_sdk.context import (
    MAX_SEGMENT_DURATION_SECONDS,
    JobResult,
    JobSpec,
    StudioPluginContext,
    _is_valid_segment_artifact,
    _validated_wav_duration_seconds,
)

__all__ = [
    "MAX_SEGMENT_DURATION_SECONDS",
    "JobSpec",
    "JobResult",
    "StudioPluginContext",
    "_validated_wav_duration_seconds",
    "_is_valid_segment_artifact",
]
