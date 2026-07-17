"""Re-export shim — the plugin utilities moved to ``studio_plugin_sdk.plugin_utils``.

Kept so every existing ``app.studio_plugin_sdk.plugin_utils`` importer keeps
working with identical object identity (plan 010 invariant 1), including the
private module-state caches that tests reset (``_ctx_cache``,
``_settings_schema_cache``) — these are the SAME dict objects as the real
module's. New code should import from ``studio_plugin_sdk.plugin_utils``.
"""

from __future__ import annotations

from studio_plugin_sdk.plugin_utils import (
    _ctx_cache,
    _now,
    _settings_schema_cache,
    get_plugin_ctx,
    load_settings_schema,
    make_segment_output_handler,
)

__all__ = [
    "get_plugin_ctx",
    "load_settings_schema",
    "make_segment_output_handler",
    "_ctx_cache",
    "_settings_schema_cache",
    "_now",
]
