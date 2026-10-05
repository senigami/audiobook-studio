"""Re-export shim — moved to ``studio_plugin_sdk._import_utils``.

Kept so existing importers (``app.tts_server.plugin_loader``,
``app.jobs.registry``) keep working with identical object identity
(plan 010 invariant 1).
"""

from __future__ import annotations

from studio_plugin_sdk._import_utils import ensure_plugin_package_hierarchy

__all__ = ["ensure_plugin_package_hierarchy"]
