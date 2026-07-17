"""Re-export shim — the SDK exception hierarchy moved to ``studio_plugin_sdk.errors``.

Kept so every existing ``app.studio_plugin_sdk.errors`` importer keeps working
with identical object identity (plan 010 invariant 1). New code should import
from ``studio_plugin_sdk.errors`` directly.
"""

from __future__ import annotations

from studio_plugin_sdk.errors import BridgeError, StudioException, ValidationError

__all__ = [
    "StudioException",
    "BridgeError",
    "ValidationError",
]
