"""Effective per-engine concurrency cap resolution (W-PAR task 007).

Surfaces the cap-default-1 toggle as a real Studio setting rather than a
manifest-only field. Follows the same settings-then-env fallback pattern as
``app.orchestration.scheduler.policies.get_priority_mode``.

Settings
--------
``tts_parallel_cap`` (int, default 1)
    Global concurrency cap applied to every engine that does not have a more
    specific per-engine override.

``tts_engine_caps`` (dict[str, int], default ``{}``)
    Per-engine cap overrides, keyed by ``engine_id``. Takes precedence over
    ``tts_parallel_cap`` for that engine.

Environment fallback
---------------------
``TTS_PARALLEL_CAP`` and ``TTS_ENGINE_CAPS`` (JSON dict) are read when the
corresponding setting is absent from the settings store — the same
settings-then-env precedence used by ``TTS_API_PRIORITY`` / ``api_priority_mode``.

Note: ``app.db.state_settings._normalize_settings`` always materializes a
default value for ``tts_parallel_cap`` (``1``) once it has run, so in
practice — exactly like ``api_priority_mode`` / ``TTS_API_PRIORITY`` — the env
var is a true fallback only before ``state.json`` has ever been normalized
(e.g. a bare/fresh install, or a caller passing an explicit sparse
``settings=`` dict in tests). Raising the cap in a running Studio instance
always goes through the Settings API (``update_settings``), not the env var.

Effective cap resolution (INV-5: no engine-ID branching — the same function
runs for every engine_id)
--------------------------------------------------------------------------
``effective_cap = min(requested_cap, manifest_max)``

where ``requested_cap`` is the per-engine override if present, else the
global cap, else 1.  The manifest's ``behavior.max_concurrent_workers`` is
always the ceiling — a Studio setting can only LOWER the cap below the
manifest maximum, never raise it above (INV-5, plugin-author authority).
"""

from __future__ import annotations

import json
import os
from typing import Any, Mapping

DEFAULT_GLOBAL_CAP = 1


def _read_settings() -> dict[str, Any]:
    try:
        from app.db.state import get_settings  # noqa: PLC0415

        return dict(get_settings() or {})
    except Exception:
        return {}


def get_global_parallel_cap(settings: Mapping[str, Any] | None = None) -> int:
    """Return the global ``TTS_PARALLEL_CAP`` (settings, then env, then default 1)."""
    resolved_settings = dict(settings) if settings is not None else _read_settings()

    raw = resolved_settings.get("tts_parallel_cap")
    if raw is not None:
        try:
            return max(1, int(raw))
        except (TypeError, ValueError):
            pass

    env_raw = os.environ.get("TTS_PARALLEL_CAP")
    if env_raw is not None:
        try:
            return max(1, int(env_raw))
        except (TypeError, ValueError):
            pass

    return DEFAULT_GLOBAL_CAP


def get_engine_caps(settings: Mapping[str, Any] | None = None) -> dict[str, int]:
    """Return the per-engine cap override map (settings, then env, then ``{}``)."""
    resolved_settings = dict(settings) if settings is not None else _read_settings()

    raw = resolved_settings.get("tts_engine_caps")
    if isinstance(raw, dict) and raw:
        return _coerce_engine_caps(raw)

    env_raw = os.environ.get("TTS_ENGINE_CAPS")
    if env_raw:
        try:
            parsed = json.loads(env_raw)
        except (TypeError, ValueError):
            parsed = None
        if isinstance(parsed, dict):
            return _coerce_engine_caps(parsed)

    return {}


def _coerce_engine_caps(raw: Mapping[str, Any]) -> dict[str, int]:
    caps: dict[str, int] = {}
    for key, value in raw.items():
        try:
            caps[str(key)] = max(1, int(value))
        except (TypeError, ValueError):
            continue
    return caps


def resolve_effective_cap(
    *,
    engine_id: str,
    manifest_max: int,
    settings: Mapping[str, Any] | None = None,
) -> int:
    """Resolve the effective concurrency cap for ``engine_id``.

    Enforcement order (INV-5 — one code path for every engine_id, no
    engine-ID branching on behavior; ``engine_id`` is used only as a dict key):
    1. Per-engine override (``tts_engine_caps[engine_id]``), if present.
    2. Otherwise the global cap (``tts_parallel_cap`` / ``TTS_PARALLEL_CAP``),
       default 1.
    3. Clamped to ``manifest_max`` (``behavior.max_concurrent_workers``) —
       the manifest is always the ceiling; a Studio setting can only lower
       the effective cap, never raise it above what the plugin author
       declared safe.

    Args:
        engine_id: Concrete engine identifier (used as a dict key only).
        manifest_max: The engine manifest's declared
            ``behavior.max_concurrent_workers`` (≥ 1).
        settings: Optional pre-loaded settings dict (tests / callers that
            already hold a snapshot). When omitted, reads the live settings
            store.

    Returns:
        int: Effective cap, always ``>= 1`` and ``<= manifest_max``.
    """
    resolved_settings = dict(settings) if settings is not None else _read_settings()
    manifest_ceiling = max(1, int(manifest_max))

    engine_caps = get_engine_caps(resolved_settings)
    requested_cap = engine_caps.get(engine_id)
    if requested_cap is None:
        requested_cap = get_global_parallel_cap(resolved_settings)

    return max(1, min(requested_cap, manifest_ceiling))
