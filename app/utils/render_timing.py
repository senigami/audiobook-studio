"""Shared segment-render timing math.

Used by both `app.tts_server.server` (which computes these fields once, in
the ``/synthesize`` HTTP response) and
`app.orchestration.scheduler.orchestrator_helpers` (which reads that response
and records a performance sample). Living here — outside both
`app.tts_server` and `app.orchestration` — keeps neither side importing the
other's internals across the two-process boundary (see
`design-docs/specs/system-architecture.md`).

Note: `model_load_seconds` is intentionally NOT included here. The two
call sites compute it with different absent-data defaults (server.py leaves
it `None` when there's no engine-activity timestamp; orchestrator_helpers
defaults it to `0.0` for older/partial timing payloads) — that divergence
predates this extraction and is preserved rather than silently unified.
"""

from __future__ import annotations

from typing import Any


def get_timing_val(obj: Any, key: str) -> Any:
    """Read `key` from a timing payload that may arrive as a dict or an object."""
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def derive_segment_timing_fields(
    *,
    chapter_render_started_at: float,
    chapter_render_completed_at: float,
    segments: list[dict[str, float]],
) -> tuple[float, float, float]:
    """Derive (synthesis_duration_seconds, sum_segment_render_seconds,
    inter_group_overhead_seconds) from raw chapter/segment render timestamps.

    `segments` must already be normalized to a list of dicts with
    non-None `render_started_at`/`render_completed_at` pairs. Callers must
    confirm `chapter_render_started_at`/`chapter_render_completed_at` are
    not None before calling.
    """
    synthesis_duration_seconds = chapter_render_completed_at - chapter_render_started_at

    if segments:
        # float() casts are defensive (matches server.py's original behavior) —
        # a no-op for the usual time.time() float timestamps, but guards against
        # a caller passing e.g. int/Decimal timestamps.
        sum_segment_render_seconds = sum(
            max(0.0, float(s["render_completed_at"]) - float(s["render_started_at"]))
            for s in segments
        )
        first_segment_start = min(float(s["render_started_at"]) for s in segments)
        last_segment_end = max(float(s["render_completed_at"]) for s in segments)
        inter_group_overhead_seconds = max(0.0, (last_segment_end - first_segment_start) - sum_segment_render_seconds)
    else:
        sum_segment_render_seconds = synthesis_duration_seconds
        inter_group_overhead_seconds = 0.0

    return synthesis_duration_seconds, sum_segment_render_seconds, inter_group_overhead_seconds
