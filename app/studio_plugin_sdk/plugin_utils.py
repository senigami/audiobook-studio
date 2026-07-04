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

from app.studio_plugin_sdk.context import StudioPluginContext

_ctx_cache: dict[str, StudioPluginContext] = {}


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
