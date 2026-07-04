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
from typing import Any, Callable

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


def load_settings_schema(schema_path: Path, *, engine_name: str, cache: bool = True) -> dict[str, object]:
    """Load an engine's ``settings_schema.json``, optionally cached per ``schema_path``.

    Extracted from an identical-looking ``_load_settings_schema()`` duplicated in every plugin's
    ``studio/app_adapter.py`` (see PL-3) — but the two originals were NOT behaviorally identical:
    xtts's was ``@lru_cache(maxsize=1)`` (loaded once, cached forever), voxtral's had no cache at
    all (re-read on every call, so schema edits took effect live without a restart). ``cache``
    defaults to ``True`` to preserve xtts's original behavior at its call site; voxtral's call site
    passes ``cache=False`` to preserve its original live-reload behavior. Returns an empty dict
    (rather than raising) when the file is missing or malformed, logging a warning with
    ``engine_name`` for diagnostics — malformed reads are never cached, so a fixed file is picked
    up on the next call either way.
    """
    if cache:
        cached = _settings_schema_cache.get(schema_path)
        if cached is not None:
            return cached
    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("Failed to load %s settings schema from %s: %s", engine_name, schema_path, exc)
        return {}
    if cache:
        _settings_schema_cache[schema_path] = schema
    return schema


# ---------------------------------------------------------------------------
# make_segment_output_handler — PL-2
# ---------------------------------------------------------------------------
#
# Extracted from four near-identical ``on_output`` closures (``bake_on_output``
# / ``gen_on_output`` / ``seg_on_output``) duplicated across xtts and voxtral's
# ``studio/bake.py`` and ``studio/segments.py`` — see
# ``design-docs/plans/active/simplification/06_plugin_consolidation.md`` PL-2.
#
# Before unifying, every marker branch of all four originals was enumerated
# (docs/checklists/code-review.md "Suppressing or Gating a Shared Chokepoint")
# to confirm this factory reproduces each plugin's exact behavior rather than
# averaging them. Two real (not cosmetic) differences were found beyond the
# progress formula and are preserved via explicit parameters, never inferred
# from engine_id:
#
#   1. xtts's bake/segments closures mutate job-object tracking attributes
#      (``j.completed_render_groups`` / ``j.active_render_group_index``) in
#      addition to calling ``update_job_fn``; voxtral's closures never touch
#      those attributes. -> ``on_group_completed`` / ``on_group_started``
#      hooks, no-ops by default, so a plugin that doesn't pass them gets
#      exactly voxtral's original (no mutation) behavior.
#   2. voxtral's ``segments.py`` [SEGMENT_SAVED] branch does NOT call
#      ``update_job_fn`` at all (it only writes segment rows and increments
#      the completed-group counter) — every other original does. ->
#      ``emit_on_save`` (default True) set to False only at that one call
#      site so this asymmetry survives instead of being silently unified.
#
# The I17 cancel-guard (`"[SEGMENT_SAVED]" in line and not cancel_check()`) is
# reproduced byte-for-byte and is NOT configurable — it must stay identical
# for every caller of this factory.


def make_segment_output_handler(
    *,
    on_output: Callable[[str], None],
    cancel_check: Callable[[], bool],
    path_to_group: dict[str, list[dict[str, Any]]],
    update_seg: Callable[..., Any],
    completed_groups: list[int],
    total_groups: int,
    update_job_fn: Callable[..., Any],
    jid: str,
    progress_formula: Callable[..., dict[str, Any]],
    on_group_completed: Callable[[int], None] | None = None,
    on_group_started: Callable[[int], None] | None = None,
    emit_on_save: bool = True,
) -> Callable[[str], None]:
    """Return an ``on_output`` closure that parses the shared segment markers.

    Parses ``[SEGMENT_SAVED]``, ``[START_SEGMENT]``, and ``[PROGRESS]`` lines
    emitted by a plugin's synthesis subprocess, identically to the four
    original closures this factory replaces. Every marker always forwards
    the raw ``line`` to ``on_output`` first, exactly as the originals did.

    Args:
        on_output: The outer job's line sink; always called first, for every line.
        cancel_check: I17 cancel predicate. ``[SEGMENT_SAVED]`` writes are
            dropped when this returns True at the moment the marker arrives —
            this guard is fixed behavior, not configurable per caller.
        path_to_group: Maps an absolute saved-file path (as emitted by the
            engine) to its list of segment dicts.
        update_seg: Segment DB writer, called as
            ``update_seg(segment_id, audio_status="done", audio_file_path=..., audio_generated_at=...)``
            for every segment in a completed group.
        completed_groups: Single-element mutable list (``[offset]``) used as
            the shared counter cell so the closure can mutate it in place —
            matches every original's ``completed_groups[0]`` idiom.
        total_groups: Total group count for this render (denominator).
        update_job_fn: The handler facade's ``update_job`` (e.g. ``h.update_job``).
        jid: Job id forwarded to every ``update_job_fn`` call.
        progress_formula: ``(completed, total, active_segment_progress, *, active_index) -> dict``.
            Must return a dict containing at least ``"progress"``; any
            additional keys (e.g. xtts's ``grouped_progress`` /
            ``completed_render_groups`` tracking fields from
            ``_group_display_updates``) are merged into the ``update_job_fn``
            call untouched. This is the one intentional per-plugin
            substitution point (linear vs. weighted curve) — it must not
            branch on engine_id internally.
        on_group_completed: Optional hook invoked with the new
            ``completed_groups[0]`` value right after a `[SEGMENT_SAVED]`
            increments it (before the corresponding ``update_job_fn`` call).
            Use this for job-object attribute mutations xtts's originals
            performed; omit (default no-op) to match voxtral's originals.
        on_group_started: Same shape as ``on_group_completed`` but invoked
            from `[START_SEGMENT]` with the about-to-become-active group
            index, before the corresponding ``update_job_fn`` call.
        emit_on_save: When False, the `[SEGMENT_SAVED]` branch still writes
            segment rows and increments ``completed_groups[0]`` but skips the
            ``update_job_fn`` call entirely — matches voxtral segments.py's
            original asymmetry (its bake.py counterpart uses the default
            True). Never set based on engine_id; it exists because this one
            original call site genuinely did not emit progress on save.

    Returns:
        The ``on_output`` closure to pass as the synthesis call's ``on_output``.
    """

    def _handler_on_output(line: str) -> None:
        on_output(line)

        # I17 lost-update guard: a cancelled render must not write segment
        # 'done' state. A chapter reset clears segments to 'unprocessed', and
        # a straggler [SEGMENT_SAVED] from the not-yet-stopped engine would
        # otherwise resurrect audio_status='done' and make the next render
        # reuse stale audio. (Mirrors the standard_handler chapter_on_output
        # guard / I17.) Fixed for every caller — not a per-plugin knob.
        if "[SEGMENT_SAVED]" in line and not cancel_check():
            saved_path = line.split("[SEGMENT_SAVED]")[1].strip()
            group_segs = path_to_group.get(saved_path)
            if group_segs:
                seg_filename = Path(saved_path).name
                for seg in group_segs:
                    update_seg(
                        seg["id"],
                        audio_status="done",
                        audio_file_path=seg_filename,
                        audio_generated_at=_now(),
                    )
                completed_groups[0] += 1
                if on_group_completed is not None:
                    on_group_completed(completed_groups[0])
                if emit_on_save:
                    kwargs = progress_formula(completed_groups[0], total_groups, 0.0, active_index=0)
                    update_job_fn(
                        jid,
                        active_segment_id=None,
                        active_segment_progress=0.0,
                        skip_studio_job_event=True,
                        skip_job_updated=True,
                        **kwargs,
                    )

        if "[START_SEGMENT]" in line:
            asid = line.split("[START_SEGMENT]")[1].strip()
            active_index = min(completed_groups[0] + 1, total_groups)
            if on_group_started is not None:
                on_group_started(active_index)
            kwargs = progress_formula(completed_groups[0], total_groups, 0.0, active_index=active_index)
            update_job_fn(
                jid,
                force_broadcast=True,
                active_segment_id=asid,
                active_segment_progress=0.0,
                skip_studio_job_event=True,
                skip_job_updated=True,
                **kwargs,
            )

        if "[PROGRESS]" in line:
            try:
                p_str = line.split("[PROGRESS]")[1].split("%")[0].strip()
                segment_progress = float(p_str) / 100.0
                active_index = min(completed_groups[0] + 1, total_groups)
                kwargs = progress_formula(completed_groups[0], total_groups, segment_progress, active_index=active_index)
                update_job_fn(
                    jid,
                    force_broadcast=True,
                    active_segment_progress=segment_progress,
                    skip_studio_job_event=True,
                    skip_job_updated=True,
                    **kwargs,
                )
            except Exception:
                logger.warning("Failed to parse [PROGRESS] line: %r", line, exc_info=True)

    return _handler_on_output


def _now() -> float:
    """Module-level alias for ``time.time`` — kept patchable for tests."""
    import time  # noqa: PLC0415
    return time.time()
