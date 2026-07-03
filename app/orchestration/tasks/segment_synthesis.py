"""Parent/child chapter fan-out for Studio 2.0 (W-PAR task 002).

``ChapterSynthesisTask`` is the durable parent (INV-4: one job per chapter,
sole DB/UI/recovery unit). It fans one ephemeral ``SegmentSynthesisTask``
child per chunk group (from ``app.domain.chunk_groups.build_chunk_groups``)
into a bounded ``ThreadPoolExecutor``. Children are admitted under the
per-engine-class counting semaphores from task 001 (``reserve_task_resources``
/ ``_manifest_resource_claim``) — no engine-ID branching (INV-5): the
semaphore key and cap are always derived from the manifest resource block for
the child's own engine.

With ``max_concurrent_workers=1`` (the default), the parent's own
``ThreadPoolExecutor`` bound plus the per-engine-class semaphore both admit
exactly one child at a time — fan-out of 1, serial, byte-identical to today
(INV-1). Per-segment ``_dispatch`` state isolation (timing/marker scalars) is
explicitly out of scope for this task (task 003, R-A); this task only
establishes the fan-out structure and is not yet wired into the live
mixed-handler marker pipeline or the orchestrator's ``submit()`` path.
"""

from __future__ import annotations

import threading
import time
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable

from app.orchestration.scheduler.resources import ResourceClaim
from app.orchestration.tasks.base import StudioTask, TaskContext, TaskResult
from app.orchestration.tasks.synthesis import _manifest_resource_claim
# Single source of truth for the active_segments_map emission gate (C2
# contract) — flipped on in orchestrator_helpers.py (W-PAR 008).
from app.orchestration.scheduler.orchestrator_helpers import _EMIT_ACTIVE_SEGMENTS_MAP

logger = logging.getLogger(__name__)

# W-PAR 005: stuck-segment heartbeat stall threshold. A child that has not
# ticked its heartbeat within this many seconds is flagged `stalled` in the
# chapter-level progress payload (`stalled_segments`) — flag only, never
# auto-killed; the cancel path remains the sole kill surface (INV-7).
SEGMENT_STALL_TIMEOUT_SECONDS = 60.0

# W-PAR 005 (owner directive 2026-07-03): a failed segment (bridge error or
# failed artifact validation) is requeued exactly once. A second failure is
# permanent — it must not block sibling segments or retry a third time.
MAX_SEGMENT_ATTEMPTS = 2


class SegmentSynthesisTask:
    """Ephemeral child unit: one chunk group's synthesis bridge call.

    Not persisted to the DB (INV-4) — in-memory only, owned by its parent
    ``ChapterSynthesisTask`` for the lifetime of one fan-out. Carries
    ``parent_task_id`` and the chunk-group dict produced by
    ``build_chunk_groups`` (``character_id``, ``profile_name``, ``engine``,
    ``segments``, ``text_parts``, ``text_length``).

    Admitted to its engine-class semaphore (derived from
    ``_manifest_resource_claim(self.engine_id)``, task 001) before its bridge
    call; releases the slot afterwards regardless of outcome.
    """

    def __init__(
        self,
        *,
        task_id: str,
        parent_task_id: str,
        engine_id: str,
        group: dict[str, Any],
        stop_event: threading.Event,
        bridge_call: Callable[["SegmentSynthesisTask"], TaskResult] | None = None,
        resource_claim: ResourceClaim | None = None,
        segment_order: int = 0,
        attempt: int = 1,
        parent_context: dict[str, Any] | None = None,
    ) -> None:
        self.task_id = task_id
        self.parent_task_id = parent_task_id
        self.engine_id = engine_id
        self.group = group
        self.stop_event = stop_event
        self._bridge_call = bridge_call
        self.resource_claim = resource_claim or _manifest_resource_claim(engine_id)
        # W-PAR 008: chapter-scoped context the real bridge_call needs to
        # build a synthetic per-group task (project/chapter id, voice
        # profile, safe_mode, pre-loaded lexicon entries). Unset for tests
        # that inject their own bridge_call and never need it.
        self._parent_context = parent_context or {}
        # INV-2 (W-PAR 005): manuscript order key — the parent's stitch
        # barrier sorts completed children by this, never by completion
        # order. Defaults to the group's leader segment's DB `segment_order`
        # when available, else the fan-out index the caller supplies.
        self.segment_order = segment_order
        # Retry-once policy (owner directive 2026-07-03): 1 = first attempt,
        # 2 = the single permitted retry. A third attempt never happens.
        self.attempt = attempt
        # Stuck-segment heartbeat (W-PAR 005): monotonic timestamp updated on
        # admission and on completion; a parent-side monitor compares this
        # against SEGMENT_STALL_TIMEOUT_SECONDS to flag (never kill) a hung
        # child stuck anywhere in `run()` — including inside a dead-worker
        # `_acquire_worker` wait (004 residual).
        self.last_heartbeat: float = time.monotonic()
        self.stalled: bool = False
        # W-PAR 008: True once this child's run() has returned (any terminal
        # status). Lets the parent's active_segments_map aggregation exclude
        # resolved children without reaching into ThreadPoolExecutor futures.
        self.finished: bool = False
        # W-PAR 008 (review fix): True once run() has actually been entered.
        # Children queued behind the parent's ThreadPoolExecutor bound have
        # NOT started — the active_segments_map must not report them as
        # in-flight (presence means "genuinely active", per the C2 contract),
        # so the aggregation requires `started and not finished`.
        self.started: bool = False

    def validate(self) -> None:
        """Validate the child payload before admission.

        Raises:
            ValueError: When required fields are missing.
        """
        if not self.task_id:
            raise ValueError("task_id is required")
        if not self.parent_task_id:
            raise ValueError("parent_task_id is required")
        if not self.engine_id:
            raise ValueError("engine_id is required")
        if not self.group:
            raise ValueError("group is required")

    def run(self) -> TaskResult:
        """Acquire the engine-class slot, invoke the bridge call, release.

        Returns:
            TaskResult: ``"cancelled"`` if the shared stop signal is already
            set before admission or the bridge call observes it; otherwise
            the bridge call's result (default stub: ``"completed"``).
        """
        from app.orchestration.scheduler.resources import (  # noqa: PLC0415
            reserve_task_resources,
            release_task_resources,
        )
        from app.orchestration.scheduler.orchestrator_helpers import _claim_to_dict  # noqa: PLC0415

        self.started = True
        self.last_heartbeat = time.monotonic()

        if self.stop_event.is_set():
            return TaskResult(status="cancelled", message="Cancelled before dispatch.")

        claim_dict = _claim_to_dict(self.resource_claim)
        claim_dict["task_id"] = self.task_id

        # Wait for a freed admission slot rather than failing fast on denial
        # (bug found via live-engine testing, W-PAR 008, 2026-07-03). A
        # denial here commonly means a SIBLING child of the SAME chapter
        # fan-out — not unrelated external work — currently holds the
        # engine-class semaphore slot. `_run_child_with_retry`'s one
        # permitted retry fires instantly with no backoff, so treating a
        # denial as an immediate `retriable=True` failure meant the retry
        # almost always re-hit the same still-busy slot and failed again,
        # permanently — observed live as 3-of-4 concurrent children failing
        # within single-digit milliseconds against the real XTTS engine.
        # Mirrors `orchestrator.submit()`'s own outer admission loop
        # (orchestrator.py), which already waits rather than fails on denial
        # for the single-task path.
        while True:
            if self.stop_event.is_set():
                return TaskResult(status="cancelled", message="Cancelled while waiting for a resource slot.")
            reservation = reserve_task_resources(task_type="synthesis", resource_claims=claim_dict)
            if reservation.get("admitted", True):
                break
            # Refresh the heartbeat while queued so the stall monitor doesn't
            # flag a child that's healthily waiting its turn as stalled.
            self.last_heartbeat = time.monotonic()
            if self.stop_event.wait(timeout=0.5):
                return TaskResult(status="cancelled", message="Cancelled while waiting for a resource slot.")

        try:
            if self.stop_event.is_set():
                return TaskResult(status="cancelled", message="Cancelled after admission.")

            if self._bridge_call is not None:
                result = self._bridge_call(self)
            else:
                # Default stub bridge call — real bridge routing for standard
                # engines is wired in a follow-on task (003 XTTS unification /
                # mixed-handler routing); this task establishes fan-out structure.
                result = TaskResult(status="completed")
            self.last_heartbeat = time.monotonic()
            self.stalled = False
            return result
        finally:
            release_task_resources(task_id=self.task_id, resource_claims=claim_dict)
            self.finished = True


class _SyntheticSegmentTask(StudioTask):
    """One-group synthetic task used ONLY to reuse ``_dispatch_segment``'s
    per-segment timing/marker/load isolation (W-PAR 003, INV-6) for a single
    concurrent child (W-PAR 008, the enable-gate).

    Not submitted through ``orchestrator.submit()`` — constructed directly by
    ``make_dispatch_segment_bridge_call``'s closure and passed straight to
    ``orchestrator._dispatch_segment(task=..., context=...)``. Its
    ``script`` is always a ONE-element list (the shape produced by
    ``app.domain.chunk_groups.build_script_entry_for_group``), so
    ``_dispatch_segment``'s weight/progress math is naturally scoped to this
    one group (confirmed safe — W-PAR 008 phase 1 finding (c)).

    Routing (owner ruling, W-PAR 008 R1):
    - ``engine_id == "mixed"``: ``prefers_local_execution`` is True, and
      ``run()`` calls ``render_one_group`` directly — NOT
      ``handle_mixed_job`` (which does chapter-terminal/stitch work that must
      never fire per-child) and NOT the old ``SynthesisTask.run()``
      indirection.
    - Any other engine (e.g. ``xtts``): ``prefers_local_execution`` is False
      and ``to_bridge_request()`` returns a bridge request built from the
      one-group script entry, so ``_dispatch_segment`` routes it through
      ``self.voice_bridge.synthesize()`` exactly like today's single-engine
      chapters.
    """

    source: str = "ui"

    def __init__(
        self,
        *,
        task_id: str,
        engine_id: str,
        chapter_id: str,
        project_id: str | None,
        script_entry: dict[str, Any],
        chapter_dir: Any,
        safe_mode: bool = True,
        voice_profile_id: str | None = None,
        lexicon_entries: list | None = None,
        stop_event: threading.Event | None = None,
    ) -> None:
        self.task_id = task_id
        self.engine_id = engine_id
        self.chapter_id = chapter_id
        self.project_id = project_id
        self.script_entry = script_entry
        self.chapter_dir = chapter_dir
        self.safe_mode = safe_mode
        self.voice_profile_id = voice_profile_id
        self.lexicon_entries = lexicon_entries
        self.script = [script_entry]
        self.output_path = script_entry.get("save_path", "")
        self.submitted_at = time.monotonic()
        self._cancelled = False
        # Shared with the parent ChapterSynthesisTask (and this child's own
        # SegmentSynthesisTask) — self._cancelled alone is never set by a
        # real chapter-level cancel (nothing calls THIS object's on_cancel();
        # the orchestrator only calls the PARENT task's on_cancel()). Checking
        # the shared stop_event here closes that gap for any child that
        # hasn't started its render yet when cancel() fires.
        self._stop_event = stop_event
        # Set by the caller (make_dispatch_segment_bridge_call) after
        # construction — the original chunk-group dict this script entry was
        # built from (render_one_group needs the full group, not just the
        # flattened script-entry shape).
        self.group: dict[str, Any] | None = None

    def _is_cancelled(self) -> bool:
        return self._cancelled or bool(self._stop_event is not None and self._stop_event.is_set())

    def validate(self) -> None:
        if not self.task_id:
            raise ValueError("task_id is required")
        if not self.engine_id:
            raise ValueError("engine_id is required")

    @property
    def is_marker_driven(self) -> bool:
        return True

    @property
    def prefers_local_execution(self) -> bool:
        return self.engine_id == "mixed"

    def describe(self) -> TaskContext:
        payload: dict[str, Any] = {
            "engine_id": self.engine_id,
            "output_path": self.output_path,
            "voice_profile_id": self.voice_profile_id,
            "script": self.script,
            "scope": "job",
        }
        return TaskContext(
            task_id=self.task_id,
            task_type="synthesis",
            project_id=self.project_id,
            chapter_id=self.chapter_id,
            source=self.source,
            submitted_at=self.submitted_at,
            payload=payload,
        )

    def run(self) -> TaskResult:
        """Local-execution path — ONLY reached for ``engine_id == "mixed"``.

        Calls ``render_one_group`` directly (owner ruling, R1): no
        chapter-terminal job-status writes, no stitch, no chapter-wide DB
        rebuild — exactly the isolated per-group work this synthetic task
        exists to trigger.
        """
        from plugins.tts_mixed.handler import render_one_group  # noqa: PLC0415

        if self.group is None:
            return TaskResult(status="failed", message="Synthetic segment task has no group payload.")

        result = render_one_group(
            self.group,
            self.chapter_dir,
            self._relay_output,
            self._is_cancelled,
            self.task_id,
            self.safe_mode,
            chapter_id=self.chapter_id,
            lexicon_entries=self.lexicon_entries,
        )
        if result.status == "completed":
            return TaskResult(
                status="completed",
                output_path=str(result.output_path) if result.output_path else None,
            )
        return TaskResult(status=result.status, message=result.message)

    def on_cancel(self) -> None:
        self._cancelled = True
        if self.engine_id != "mixed":
            from app.engines.bridge import create_voice_bridge  # noqa: PLC0415
            bridge = create_voice_bridge()
            bridge.cancel(self.task_id)

    def to_bridge_request(self) -> dict[str, Any] | None:
        """Bridge-routed path — reached for any non-mixed engine (e.g. xtts).

        Builds the request straight from the one-group script entry (already
        lexicon-substituted/sanitized by ``build_script_entry_for_group``).
        """
        if self.engine_id == "mixed":
            return None

        entry = self.script_entry
        return {
            "engine_id": self.engine_id,
            "script_text": entry.get("text", ""),
            "output_path": entry.get("save_path", ""),
            "project_id": self.project_id,
            "chapter_id": self.chapter_id,
            "voice_profile_id": self.voice_profile_id,
            "reference_audio_path": entry.get("speaker_wav"),
            "language": "en",
            "source": self.source,
            "is_bake": False,
            "segment_ids": entry.get("ids"),
            "safe_mode": self.safe_mode,
            "task_id": self.task_id,
            "script": self.script,
            **({"voice_profile_dir": entry["voice_profile_dir"]} if entry.get("voice_profile_dir") else {}),
        }

    def _relay_output(self, line: str) -> None:
        from app.engines.watchdog import get_watchdog  # noqa: PLC0415
        wd = get_watchdog()
        if wd:
            wd._broadcast_log(line, task_id=self.task_id)


def make_dispatch_segment_bridge_call(orchestrator: Any) -> Callable[[SegmentSynthesisTask], TaskResult]:
    """Return the real ``bridge_call`` for ``SegmentSynthesisTask`` children
    (W-PAR 008, the enable-gate).

    Each child renders by constructing a synthetic single-group task +
    matching ``TaskContext`` and calling ``orchestrator._dispatch_segment``
    once — reusing ALL of its existing per-segment timing/marker/load
    isolation (W-PAR 003, INV-6) and engine routing (local execution for
    ``mixed`` via ``render_one_group``; bridge routing via
    ``orchestrator.voice_bridge`` for everything else). Safe to call
    concurrently from N threads (the parent's ``ThreadPoolExecutor``) because
    ``_dispatch_segment`` is closure-pure per call.

    Args:
        orchestrator: The live ``TaskOrchestrator`` (or any object exposing
            the same ``_dispatch_segment`` method — e.g. a test harness mixin).

    Returns:
        Callable[[SegmentSynthesisTask], TaskResult]: Suitable for
        ``ChapterSynthesisTask(bridge_call=...)``.
    """

    def _bridge_call(child: SegmentSynthesisTask) -> TaskResult:
        from app.domain.chunk_groups import build_script_entry_for_group  # noqa: PLC0415
        from app.core.config import get_chapter_dir  # noqa: PLC0415

        parent_ctx = getattr(child, "_parent_context", None) or {}
        project_id = parent_ctx.get("project_id")
        chapter_id = parent_ctx.get("chapter_id")
        voice_profile_id = parent_ctx.get("voice_profile_id")
        safe_mode = parent_ctx.get("safe_mode", True)
        lexicon_entries = parent_ctx.get("lexicon_entries")

        chapter_dir = get_chapter_dir(project_id, chapter_id) if project_id and chapter_id else None
        script_entry = build_script_entry_for_group(
            child.group, chapter_dir, default_profile=voice_profile_id, safe_mode=safe_mode,
        )

        synthetic = _SyntheticSegmentTask(
            task_id=child.task_id,
            engine_id=child.engine_id,
            chapter_id=chapter_id,
            project_id=project_id,
            script_entry=script_entry,
            chapter_dir=chapter_dir,
            safe_mode=safe_mode,
            voice_profile_id=voice_profile_id,
            lexicon_entries=lexicon_entries,
            stop_event=child.stop_event,
        )
        synthetic.group = child.group

        segment_result = orchestrator._dispatch_segment(task=synthetic, context=synthetic.describe())
        result = segment_result.task_result
        if result.status == "completed" and not result.output_path:
            # _dispatch_segment's bridge-routed path (non-mixed engines)
            # doesn't set output_path on the returned TaskResult — the
            # stitch barrier needs it, so fall back to the script entry's
            # known save_path on success.
            result = TaskResult(
                status=result.status,
                message=result.message,
                retriable=result.retriable,
                timing=result.timing,
                output_path=script_entry.get("save_path"),
            )
        return result

    return _bridge_call


class ChapterSynthesisTask(StudioTask):
    """Durable parent: the sole DB/UI/recovery unit for a chapter render.

    Fans one ephemeral ``SegmentSynthesisTask`` per chunk group (from
    ``build_chunk_groups``) into a bounded ``ThreadPoolExecutor``. Waits for
    all children, aggregates weighted progress, and republishes chapter-level
    progress via the injected/looked-up progress service (≥1% gating is
    enforced by ``ProgressService.publish`` itself).

    With ``max_concurrent_workers=1`` (default) children run serially —
    byte-identical to today (INV-1).
    """

    source: str = "ui"
    # W-PAR 008 (R4, owner ruling): the parent renders nothing itself — it
    # only fans out children, each of which independently reuses
    # `_dispatch_segment`. `orchestrator_helpers._dispatch` checks this flag
    # to bypass `_dispatch_segment` for the PARENT and call `run()` directly,
    # avoiding an idle log_listener registration and a spurious
    # "Loading voice model…" frame for a task with no engine markers of its
    # own. `prefers_local_execution` is therefore irrelevant for this class.
    is_chapter_fanout: bool = True

    def __init__(
        self,
        *,
        task_id: str,
        engine_id: str,
        chapter_id: str,
        project_id: str | None = None,
        output_path: str = "",
        script: list[dict[str, Any]] | None = None,
        voice_profile_id: str | None = None,
        max_concurrent_workers: int = 1,
        safe_mode: bool = True,
        bridge_call: Callable[[SegmentSynthesisTask], TaskResult] | None = None,
        needs_render_fn: Callable[[dict[str, Any]], bool] | None = None,
        resolve_existing_output_fn: Callable[[dict[str, Any]], str | None] | None = None,
        stitch_fn: Callable[[list[str]], None] | None = None,
    ) -> None:
        self.task_id = task_id
        self.engine_id = engine_id
        self.chapter_id = chapter_id
        self.project_id = project_id
        self.output_path = output_path
        self.script = script or []
        self.voice_profile_id = voice_profile_id
        self.max_concurrent_workers = max(1, int(max_concurrent_workers))
        self.safe_mode = safe_mode
        self._bridge_call = bridge_call
        self.submitted_at = time.monotonic()
        self.stop_event = threading.Event()
        self._progress_service: Any = None
        # Loaded once per chapter render (zero-impact when empty) and handed
        # to each child's real bridge_call via `_parent_context` — mirrors
        # the sequential mixed handler's single lexicon load per chapter.
        self._lexicon_entries: list = []
        if project_id:
            try:
                from app.db.lexicon import get_lexicon  # noqa: PLC0415
                self._lexicon_entries = get_lexicon(project_id) or []
            except Exception:
                logger.warning(
                    "ChapterSynthesisTask %s: failed to load lexicon for project %s; "
                    "proceeding without substitution.", task_id, project_id, exc_info=True,
                )
        # INV-8 (W-PAR 005): optional predicate — when supplied, a group is
        # excluded from the fan-out if this returns False (artifact already
        # validated, e.g. via `_group_needs_render`). Recovery wires this so
        # only the N-K unfinished segments are resubmitted; live/UI-originated
        # submissions leave this unset (render everything requested).
        self._needs_render_fn = needs_render_fn
        # Companion to `_needs_render_fn` (bug fix, W-PAR 008): resolves the
        # EXISTING validated output path for a group `_needs_render_fn`
        # excluded from the fan-out. Without this, a skipped (already-done)
        # group's audio never entered the stitch barrier's collected paths —
        # a silent chapter-truncation bug on any K-of-N recovery resume
        # (the already-completed K segments would be missing from the final
        # stitched WAV). Required whenever `needs_render_fn` is supplied;
        # unset (None) is only safe when `needs_render_fn` is also unset.
        self._resolve_existing_output_fn = resolve_existing_output_fn
        # INV-2 (W-PAR 005): optional stitch callback invoked exactly once,
        # after ALL children have produced results, with output paths sorted
        # by manuscript order (never completion order). Left unset when the
        # caller does its own stitching (e.g. today's sequential mixed
        # handler, which rebuilds from the DB post-loop). CONTRACT (review
        # fix, W-PAR 008): raise on stitch failure — run() converts the raise
        # into a failed TaskResult; a swallowed failure would let the chapter
        # complete as "done" with no stitched WAV.
        self._stitch_fn = stitch_fn
        # Stuck-segment heartbeat (W-PAR 005): populated by `run()` once
        # children are constructed so a monitor (or tests) can inspect
        # `last_heartbeat`/`stalled` per child without reaching into the
        # executor's internals.
        self._children: list[SegmentSynthesisTask] = []
        # Guards ALL reads/mutations of self._children — the retry-once swap
        # (_run_child_with_retry, one call per ThreadPoolExecutor worker),
        # the heartbeat monitor thread's iteration, and the progress-publish
        # path's active_segments_map aggregation (W-PAR 008) all touch this
        # same list concurrently. Without the lock, a retry's
        # index()-then-assign (or its except-ValueError append) can race a
        # concurrent iterator and raise "list changed size during iteration",
        # or two retries can interleave their index()/assign steps and drop
        # a swap.
        self._children_lock = threading.Lock()
        # Segment ids that failed twice (permanent failure) — recorded so
        # siblings/completion logic never resubmits them a third time.
        self.permanently_failed_segment_ids: list[str] = []

    # ------------------------------------------------------------------
    # StudioTask contract
    # ------------------------------------------------------------------

    def validate(self) -> None:
        """Validate the parent task payload before scheduler admission.

        Raises:
            ValueError: When required fields are missing.
        """
        if not self.task_id:
            raise ValueError("task_id is required")
        if not self.chapter_id:
            raise ValueError("chapter_id is required for a chapter render")
        if not self.engine_id:
            raise ValueError("engine_id is required")

    def describe(self) -> TaskContext:
        """Return the identifying metadata needed for scheduling."""
        payload: dict[str, Any] = {
            "engine_id": self.engine_id,
            "output_path": self.output_path,
            "voice_profile_id": self.voice_profile_id,
            "script": self.script,
            "scope": "chapter",
        }
        return TaskContext(
            task_id=self.task_id,
            task_type="synthesis",
            project_id=self.project_id,
            chapter_id=self.chapter_id,
            source=self.source,
            submitted_at=self.submitted_at,
            payload=payload,
        )

    def _resolve_progress_service(self):
        if self._progress_service is not None:
            return self._progress_service
        from app.orchestration.progress.service import get_progress_service  # noqa: PLC0415
        return get_progress_service()

    def _current_active_segments_map(self) -> dict[str, dict] | None:
        """Build the C2 ``active_segments_map`` snapshot from THIS parent's
        currently in-flight children (W-PAR 008 — genuine multi-entry
        aggregation, now that real concurrent fan-out exists).

        One entry per child that has started and not yet resolved, keyed by
        the child's REAL segment/leader id (``group["segments"][0]["id"]``)
        — never the synthetic per-child ``task_id`` — matching the C2
        contract shape: ``{phase, progress, eta_seconds, reason_code?,
        indeterminate?}``. Returns ``None`` when there is nothing in flight
        (e.g. before any child starts, or after all have resolved) so a
        frame with no concurrent context stays additive-only (INV-1).
        """
        if not _EMIT_ACTIVE_SEGMENTS_MAP:
            return None
        with self._children_lock:
            snapshot = list(self._children)
        entries: dict[str, dict] = {}
        for child in snapshot:
            if not child.started or child.finished:
                # Not yet admitted to the pool (queued) or already resolved —
                # neither is "actively rendering" (review fix, W-PAR 008).
                continue
            leader_id = child.group["segments"][0]["id"] if child.group.get("segments") else child.task_id
            entries[leader_id] = {
                "phase": "rendering",
                "progress": 0.0,
                "eta_seconds": None,
            }
        return entries or None

    def _clear_active_segments_map(self) -> None:
        """Write an explicit EMPTY ``active_segments_map`` to job state.

        Called once when the fan-out reaches any terminal outcome (review
        fix, W-PAR 008). ``_current_active_segments_map`` returns ``None``
        when nothing is in flight, and ``None`` is deliberately skipped by
        every publish path — so without this explicit ``{}`` write the last
        mid-render snapshot (non-empty, phase ``rendering``) would persist in
        job state and ride every terminal frame, leaving the frontend's
        map-branch highlighting segments as rendering on a finished job.
        """
        if not _EMIT_ACTIVE_SEGMENTS_MAP:
            return
        try:
            from app.db.state import update_job  # noqa: PLC0415
            # force_broadcast: the stitch_fn may have already written the
            # terminal "done" status (mirroring handle_mixed_job); without
            # the force flag, update_job's terminal guard silently drops
            # this clear and the stale map still rides terminal frames.
            update_job(self.task_id, force_broadcast=True, active_segments_map={})
        except Exception:
            logger.warning(
                "ChapterSynthesisTask %s: failed to clear active_segments_map.",
                self.task_id, exc_info=True,
            )

    def _publish_progress(self, *, completed: int, total: int, status: str = "running") -> None:
        if total <= 0:
            return
        progress = round(completed / total, 2)
        service = self._resolve_progress_service()
        active_segments_map = self._current_active_segments_map()
        try:
            service.publish(
                job_id=self.task_id,
                status=status,
                chapter_id=self.chapter_id,
                parent_job_id=self.project_id,
                progress=progress,
                message=f"Rendered {completed}/{total} segment group(s).",
                reason_code="segment_group_completed" if status == "running" else "synthesis_ok",
            )
        except Exception:
            logger.warning(
                "ChapterSynthesisTask %s: failed to publish progress.", self.task_id, exc_info=True
            )

        if active_segments_map is not None:
            # active_segments_map bypasses ProgressService.publish (which does
            # not carry this field — see orchestrator_publish.py's own direct
            # state write for the single-dispatch-unit case) and is written
            # straight to job state, mirroring that same pattern.
            try:
                from app.db.state import update_job  # noqa: PLC0415
                update_job(self.task_id, active_segments_map=active_segments_map)
            except Exception:
                logger.warning(
                    "ChapterSynthesisTask %s: failed to write active_segments_map.",
                    self.task_id, exc_info=True,
                )

    def _build_groups(self) -> list[dict[str, Any]]:
        """Build chunk groups from the parent's script (no DB access needed
        when ``self.script`` is already populated by the caller)."""
        from app.domain.chunk_groups import build_chunk_groups  # noqa: PLC0415
        return build_chunk_groups(self.script, self.voice_profile_id)

    def _fan_out_chapter(self) -> tuple[list[SegmentSynthesisTask], list[tuple[int, str]]]:
        """Construct one ``SegmentSynthesisTask`` per chunk group that still
        needs rendering (INV-8), plus the stitch entries for groups skipped
        because they were already valid.

        When ``self._needs_render_fn`` is set (recovery path), groups whose
        artifact already validates are excluded from the fan-out entirely —
        the K already-done segments are reused as-is, never re-submitted.
        Live/UI submissions (``_needs_render_fn`` unset) fan out every group,
        matching today's behavior byte-for-byte (INV-1).

        Bug fix (W-PAR 008): a skipped (already-valid) group must still
        contribute its existing output path to the stitch barrier — otherwise
        a K-of-N recovery resume silently drops the K already-completed
        segments from the final stitched chapter WAV (they never became
        children, so their paths never reached ``stitch_entries`` in
        ``run()``). ``self._resolve_existing_output_fn`` resolves that path
        for each skipped group; when it is unset (or returns ``None``) the
        skipped group contributes no stitch entry, same as before this fix —
        callers that pass ``needs_render_fn`` MUST also pass
        ``resolve_existing_output_fn`` to stitch correctly.

        Does not submit — kept as a separate step so tests and callers can
        inspect the child list before dispatch.

        Returns:
            tuple: ``(children, skip_stitch_entries)`` where
            ``skip_stitch_entries`` is a list of ``(segment_order, path)``
            tuples for groups excluded from the fan-out.
        """
        groups = self._build_groups()
        children: list[SegmentSynthesisTask] = []
        skip_stitch_entries: list[tuple[int, str]] = []
        for index, group in enumerate(groups):
            leader = group["segments"][0] if group.get("segments") else {}
            segment_order = leader.get("segment_order", index)
            if self._needs_render_fn is not None and not self._needs_render_fn(group):
                if self._resolve_existing_output_fn is not None:
                    existing_path = self._resolve_existing_output_fn(group)
                    if existing_path:
                        skip_stitch_entries.append((segment_order, existing_path))
                continue
            engine_id = group.get("engine") or self.engine_id
            child = SegmentSynthesisTask(
                task_id=f"{self.task_id}-seg-{index}",
                parent_task_id=self.task_id,
                engine_id=engine_id,
                group=group,
                stop_event=self.stop_event,
                bridge_call=self._bridge_call,
                segment_order=segment_order,
                parent_context={
                    "project_id": self.project_id,
                    "chapter_id": self.chapter_id,
                    "voice_profile_id": self.voice_profile_id,
                    "safe_mode": self.safe_mode,
                    "lexicon_entries": self._lexicon_entries,
                },
            )
            children.append(child)
        return children, skip_stitch_entries

    def _start_heartbeat_monitor(self) -> threading.Event:
        """Start a daemon monitor thread that flags children stuck past
        ``SEGMENT_STALL_TIMEOUT_SECONDS`` (W-PAR 005, stuck-segment heartbeat).

        Flag-only: never cancels or kills a child (INV-7 remains the sole
        kill surface). Returns the stop event the caller must set to end the
        monitor thread when the fan-out completes.
        """
        monitor_stop = threading.Event()

        def _tick() -> None:
            while not monitor_stop.wait(timeout=1.0):
                now = time.monotonic()
                with self._children_lock:
                    snapshot = list(self._children)
                for child in snapshot:
                    child.stalled = (now - child.last_heartbeat) > SEGMENT_STALL_TIMEOUT_SECONDS

        thread = threading.Thread(
            target=_tick, name=f"chapter-{self.task_id}-heartbeat", daemon=True
        )
        thread.start()
        self._heartbeat_stop = monitor_stop
        self._heartbeat_thread = thread
        return monitor_stop

    @property
    def stalled_segments(self) -> list[str]:
        """Segment (child) task ids currently past the stall threshold.

        Surfaced on the chapter-level progress payload as ``stalled_segments``
        once wired by the caller/enable-gate (008). Cleared automatically the
        next time the child's heartbeat ticks.
        """
        with self._children_lock:
            snapshot = list(self._children)
        return [child.task_id for child in snapshot if child.stalled]

    def _run_child_with_retry(self, child: SegmentSynthesisTask) -> tuple[SegmentSynthesisTask, TaskResult]:
        """Run ``child``; on a non-retriable-but-failed/invalid outcome that
        is not the child's second attempt, run a fresh replacement child once
        (owner directive 2026-07-03: retry-once policy). Returns the child
        that ultimately produced the returned result (the replacement, if a
        retry happened) so stitch/heartbeat bookkeeping stays on the right
        object.
        """
        try:
            result = child.run()
        except Exception as exc:
            logger.exception(
                "ChapterSynthesisTask %s: child %s raised unexpectedly.", self.task_id, child.task_id
            )
            result = TaskResult(status="failed", message=str(exc))

        if result.status == "cancelled" or self.stop_event.is_set():
            return child, result

        if result.status == "completed":
            return child, result

        # Failed (bridge error or, once wired, artifact-validation failure).
        if child.attempt >= MAX_SEGMENT_ATTEMPTS:
            # Second failure is permanent — no third attempt, siblings unaffected.
            self.permanently_failed_segment_ids.append(child.task_id)
            return child, result

        logger.warning(
            "ChapterSynthesisTask %s: segment %s failed on attempt %d; requeuing once (retry-once policy).",
            self.task_id, child.task_id, child.attempt,
        )
        retry_child = SegmentSynthesisTask(
            task_id=child.task_id,
            parent_task_id=child.parent_task_id,
            engine_id=child.engine_id,
            group=child.group,
            stop_event=child.stop_event,
            bridge_call=child._bridge_call,
            resource_claim=child.resource_claim,
            segment_order=child.segment_order,
            attempt=child.attempt + 1,
            parent_context=child._parent_context,
        )
        # Swap the bookkeeping entry so the heartbeat monitor and stitch
        # barrier observe the retry's state, not the failed original's.
        with self._children_lock:
            try:
                idx = self._children.index(child)
                self._children[idx] = retry_child
            except ValueError:
                self._children.append(retry_child)

        try:
            retry_result = retry_child.run()
        except Exception as exc:
            logger.exception(
                "ChapterSynthesisTask %s: retried segment %s raised unexpectedly.",
                self.task_id, retry_child.task_id,
            )
            retry_result = TaskResult(status="failed", message=str(exc))

        if retry_result.status != "completed" and retry_result.status != "cancelled":
            self.permanently_failed_segment_ids.append(retry_child.task_id)

        return retry_child, retry_result

    def run(self) -> TaskResult:
        """Fan out chunk groups into bounded-concurrency children, aggregate
        progress, and wait for completion (cancellation-aware).

        Returns:
            TaskResult: ``"completed"`` if all children complete cleanly,
            ``"cancelled"`` if the stop event fires before/while children run,
            ``"failed"`` if any (non-retriable, twice-failed) child fails.

        INV-2 (stitch barrier): output paths from validated completions are
        collected and sorted by ``segment_order`` (manuscript order), never
        completion order, before the optional ``self._stitch_fn`` callback
        fires exactly once after every child future has been joined. Paths
        for groups ``_fan_out_chapter`` excluded as already-valid (INV-8,
        recovery K-of-N resume) are seeded into this same collection so a
        partially-recovered chapter's stitched WAV still contains every
        segment, not just the ones re-rendered in this invocation.

        Retry-once (owner directive 2026-07-03): a failing child is requeued
        exactly once; a second failure is permanent (recorded in
        ``self.permanently_failed_segment_ids``) and does not block siblings
        — the chapter still completes (as failed-with-partial) once every
        other child has resolved; stitch is skipped when any segment is
        permanently failed.
        """
        children, stitch_entries = self._fan_out_chapter()
        self._children = list(children)
        total = len(children)
        if total == 0:
            # Bug fix (W-PAR 008): even with nothing left to render (e.g. a
            # full-reuse K-of-N recovery resume where every group already
            # validated), the already-known-good paths collected by
            # `_fan_out_chapter` must still reach the stitch barrier —
            # otherwise a fully-recovered chapter would never (re)produce its
            # stitched WAV at all.
            if self._stitch_fn is not None and stitch_entries:
                ordered_paths = [path for _, path in sorted(stitch_entries, key=lambda entry: entry[0])]
                try:
                    self._stitch_fn(ordered_paths)
                except Exception as exc:
                    logger.exception(
                        "ChapterSynthesisTask %s: stitch failed on full-reuse path.", self.task_id
                    )
                    return TaskResult(status="failed", message=f"Stitching failed: {exc}")
            self._clear_active_segments_map()
            return TaskResult(status="completed", message="No segment groups to render.")

        completed = 0
        had_failure = False
        failure_message: str | None = None

        monitor_stop = self._start_heartbeat_monitor()
        try:
            with ThreadPoolExecutor(
                max_workers=self.max_concurrent_workers,
                thread_name_prefix=f"chapter-{self.task_id}",
            ) as pool:
                futures = {pool.submit(self._run_child_with_retry, child): child for child in children}

                # Consume each child's result AS IT COMPLETES (review fix,
                # W-PAR 008): the parent's chapter-level progress and
                # active_segments_map must advance while siblings are still
                # rendering, not in a burst after everything has finished
                # (the previous ALL_COMPLETED barrier froze the parent job at
                # 0% for the whole render). INV-7 is preserved: this loop
                # blocks until EVERY future (including its one permitted
                # retry) has resolved before any terminal/stitch work below,
                # and the ThreadPoolExecutor context join backstops it.
                for future in as_completed(futures):
                    try:
                        final_child, result = future.result()
                    except Exception as exc:
                        logger.exception(
                            "ChapterSynthesisTask %s: child raised unexpectedly.", self.task_id
                        )
                        final_child, result = futures[future], TaskResult(status="failed", message=str(exc))

                    if result.status == "cancelled" or self.stop_event.is_set():
                        # Cancellation observed — do not count this child as
                        # completed and do not publish a terminal write here;
                        # the caller's cancel() path owns the terminal event.
                        continue

                    if result.status != "completed":
                        had_failure = True
                        failure_message = result.message or failure_message
                        continue

                    completed += 1
                    if result.output_path:
                        stitch_entries.append((final_child.segment_order, result.output_path))
                    self._publish_progress(completed=completed, total=total, status="running")
        finally:
            monitor_stop.set()
            # Terminal map hygiene (review fix, W-PAR 008): the last mid-render
            # publish can leave a non-empty active_segments_map in job state;
            # nothing else ever clears it for the parent, so terminal frames
            # (completed/failed/cancelled) would carry stale "rendering"
            # entries forever. An explicit empty map (not None — None is
            # skipped by the publish path and never reaches the frontend)
            # clears both job state and the frontend overlay.
            self._clear_active_segments_map()

        if self.stop_event.is_set():
            return TaskResult(status="cancelled", message="Chapter render cancelled.")

        if had_failure:
            # A twice-failed segment must not block siblings, but stitch is
            # skipped (partial chapter) — the caller decides how to surface
            # the permanently-failed segment ids for UI red-state.
            return TaskResult(status="failed", message=failure_message or "One or more segment groups failed.")

        if self._stitch_fn is not None and stitch_entries:
            ordered_paths = [path for _, path in sorted(stitch_entries, key=lambda entry: entry[0])]
            try:
                self._stitch_fn(ordered_paths)
            except Exception as exc:
                # Review fix (W-PAR 008): a failed stitch must fail the
                # chapter — previously a stitch_fn that swallowed its own
                # failure let run() return "completed" and the orchestrator's
                # terminal publish overwrote the failure with "done" even
                # though no chapter WAV exists. The stitch_fn contract is now
                # raise-on-failure; this converts it to a failed TaskResult.
                logger.exception("ChapterSynthesisTask %s: stitch failed.", self.task_id)
                return TaskResult(status="failed", message=f"Stitching failed: {exc}")

        self._publish_progress(completed=total, total=total, status="completed")
        return TaskResult(status="completed", message="Chapter render completed.")

    def cancel(self) -> None:
        """Signal all children to stop via the shared ``stop_event``.

        Children poll ``self.stop_event`` before and during their bridge
        call; ``run()`` joins all in-flight futures (via the
        ``ThreadPoolExecutor`` context manager) before returning, so no
        child writes after cancellation is observed (INV-7).
        """
        self.stop_event.set()

    def on_cancel(self) -> None:
        """StudioTask contract hook — delegates to ``cancel()``."""
        self.cancel()
