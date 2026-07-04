"""Shared plugin context factory.

Extracted from the ~13-line lazy-singleton block (module-global instance +
dual-import try/except) that was duplicated verbatim across 9 plugin
handler modules (xtts, voxtral, mixed) — see
``design-docs/plans/active/simplification/06_plugin_consolidation.md`` PL-1.

Each plugin module hardcodes exactly one ``engine_id`` and expects a single
shared ``StudioPluginContext`` instance for that engine, lazily created on
first use and reused thereafter. ``get_plugin_ctx`` preserves that exact
semantic but keys the cache by ``engine_id`` so unrelated engines never
collide on the same cached instance.

**Import discipline**: this module is part of ``app.studio_plugin_sdk``,
so it can import ``StudioPluginContext`` directly — no dual-import
try/except is needed here (that dance existed in plugin modules only to
handle the ``studio_plugin_sdk`` vs ``app.studio_plugin_sdk`` alias
registered by ``plugin_loader.py``). Building the cache itself has no
import-time side effects, per ``modular_architecture.md``: the dict starts
empty and instances are constructed only on first ``get_plugin_ctx`` call.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from app.studio_plugin_sdk.context import StudioPluginContext

logger = logging.getLogger(__name__)

_ctx_cache: dict[str, StudioPluginContext] = {}
_settings_schema_cache: dict[Path, dict[str, object]] = {}


def get_plugin_ctx(engine_id: str) -> StudioPluginContext:
    """Return the shared ``StudioPluginContext`` for ``engine_id``.

    Lazily constructs one ``StudioPluginContext`` per distinct ``engine_id``
    and caches it for the lifetime of the process; subsequent calls with the
    same ``engine_id`` return the same instance. Different ``engine_id``
    values never share an instance.
    """
    ctx = _ctx_cache.get(engine_id)
    if ctx is None:
        ctx = StudioPluginContext(engine_id)
        _ctx_cache[engine_id] = ctx
    return ctx


def load_settings_schema(schema_path: Path, *, engine_name: str) -> dict[str, object]:
    """Load and cache an engine's ``settings_schema.json``.

    Extracted from an identical ``_load_settings_schema()`` duplicated in
    every plugin's ``studio/app_adapter.py`` (see PL-3). Cached per
    ``schema_path`` so distinct engines never share a cache entry. Returns
    an empty dict (rather than raising) when the file is missing or
    malformed, logging a warning with ``engine_name`` for diagnostics.
    """
    cached = _settings_schema_cache.get(schema_path)
    if cached is not None:
        return cached
    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("Failed to load %s settings schema from %s: %s", engine_name, schema_path, exc)
        return {}
    _settings_schema_cache[schema_path] = schema
    return schema
