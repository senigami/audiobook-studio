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
explicitly out of scope for this task (task 003, R-A).

``ChapterSynthesisTask``/``SegmentSynthesisTask`` are live: W-PAR parallel
render shipped 2026-07-06 and this is the task instantiated on the
orchestrator's ``submit()`` path (see
``app/api/routers/generation_shared.py``).
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
      chapters. ``skip_registry_dispatch = True`` is what actually enforces
      this: it makes ``_dispatch_segment`` skip its legacy per-engine
      registry-handler lookup (step 1) so an engine that still has one
      registered (xtts, voxtral) can't silently swallow this child before
      the bridge routing ever runs — that registry handler has no concept of
      "render only my one group" and would redo the whole chapter's
      remaining work per child (escaped defect, fixed 2026-07-05).
    """

    source: str = "ui"
    skip_registry_dispatch: bool = True

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
        on_segment_tick: Callable[..., None] | None = None,
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
        # Event-driven live active_segments_map (2026-07-05, escaped defect
        # fix): threaded from the parent ChapterSynthesisTask's
        # _on_child_segment_tick via _parent_context so this child's own
        # already-rate-limited progress ticks (published through
        # _dispatch_segment -> orchestrator_publish._publish, which already
        # ≥1%-gates via ProgressService) ALSO update the parent's live map —
        # no new timer/thread/join lifecycle needed. None for any caller that
        # doesn't wire it (e.g. direct tests), which is a silent no-op.
        self.on_segment_tick = on_segment_tick
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
            "on_segment_tick": self.on_segment_tick,
        }
        return TaskContext(
            task_id=self.task_id,
            task_type="synthesis",
            project_id=self.project_id,
            chapter_id=self.chapter_id,
            source=self.source,
            submitted_at=self.submitted_at,
            payload=payload,
            ephemeral=True,
        )

    def run(self) -> TaskResult:
        """Local-execution path — ONLY reached for ``engine_id == "mixed"``.

        Calls ``render_one_group`` directly (owner ruling, R1): no
        chapter-terminal job-status writes, no stitch, no chapter-wide DB
        rebuild — exactly the isolated per-group work this synthetic task
        exists to trigger.
        """
        from tts_engines.tts_mixed.handler import render_one_group  # noqa: PLC0415

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

        ``language`` is hardcoded to ``"en"`` and ``is_bake`` to ``False``
        here intentionally — this task type never handles non-English
        segments or bake renders. See also the other two
        ``to_bridge_request`` builders, which cover different task shapes:
        ``app/orchestration/tasks/synthesis.py`` (full chapter/book render,
        with project lexicon substitution and ``render_batch_id``) and
        ``app/orchestration/tasks/api_synthesis.py`` (external
        ``/api/v1/tts`` gateway request, with ``caller_id`` attribution).
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
        on_segment_tick = parent_ctx.get("on_segment_tick")

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
            on_segment_tick=on_segment_tick,
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
        # Chapter-level admission gate (issue #228) — without this the
        # orchestrator's ``_claim_to_dict(getattr(task, "resource_claim", None))``
        # sees no claim at all, and an empty ``engine_class`` skips every gate
        # in ``reserve_task_resources`` including the global backstop, so
        # chapters were being admitted completely unconditionally. Uses its
        # OWN engine-class pool, separate from the segment-level one, so a
        # chapter can never deadlock against its own children at cap=1.
        self.resource_claim = ResourceClaim.chapter_admission()
        self.submitted_at = time.monotonic()
        self.stop_event = threading.Event()
        self._progress_service: Any = None
        # Stashed by orchestrator_helpers._publish_chapter_dispatch_eta (duck-typed,
        # no import back into that module) before task.run() — the full calibrated
        # chapter-wide ETA computed once at dispatch, used by _publish_progress to
        # derive a decaying remaining-time estimate as groups complete (2026-07-07
        # fix). None when no calibration existed at dispatch (no-fabrication).
        self._dispatch_eta_seconds: int | None = None
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
        # Event-driven live active_segments_map (2026-07-05, escaped defect
        # fix): the authoritative, continuously-updated source of truth for
        # "what's genuinely rendering right now", keyed by REAL segment id.
        # Updated incrementally by _on_child_segment_tick — called from each
        # child's OWN dispatch thread at its existing per-tick publish site
        # (already ≥1%-gated by ProgressService), guarded by the SAME
        # _children_lock used elsewhere in this class. Replaces the previous
        # approach of re-deriving "in-flight" from child.started/child.finished
        # at completion-boundary call sites only, which was structurally
        # always empty (the just-finished child is excluded, the next hasn't
        # started) — this is exactly why segments never highlighted and
        # progress never animated smoothly regardless of concurrency level.
        self._live_segments_map: dict[str, dict] = {}
        self._live_segments_map_last_published: dict[str, dict] | None = None

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
        """Return a snapshot of the C2 ``active_segments_map`` — real,
        continuously-updated per-child progress (2026-07-05, escaped defect
        fix), sourced from ``self._live_segments_map`` (maintained
        incrementally by ``_on_child_segment_tick``), NOT re-derived from
        ``child.started``/``child.finished`` at this call's own invocation
        time. The old approach only ever sampled at group-completion
        boundaries (inside the ``as_completed`` loop) — at that exact instant
        the just-finished child was already excluded and the next hadn't
        started, so it was structurally always empty regardless of
        concurrency level. Returns ``None`` when nothing is in flight so a
        frame with no concurrent context stays additive-only (INV-1).
        """
        if not _EMIT_ACTIVE_SEGMENTS_MAP:
            return None
        with self._children_lock:
            return dict(self._live_segments_map) or None

    # Reason codes that mean "not genuinely rendering yet" even though the
    # child's own status already reads "running" — mirrors the frontend's own
    # `isActiveJobPreparing` contract (useStudioChapter.ts).
    _PREPARING_REASON_CODES = frozenset({"SEGMENT_PENDING", "LOADING_MODEL"})

    def _segment_char_count(self, segment_id: str | None) -> int | None:
        """Return a real segment's OWN character count, looked up by its
        ``segment_id`` from the in-memory chunk groups this render's children
        were built from (task 008).

        Deliberately never reads a render-group's combined ``text_length``
        (``group["text_length"]``/``_child_char_len``) — a group can merge
        several contiguous manuscript segments up to the engine's chunk
        limit (``build_chunk_groups``), so using the group total here would
        silently inflate every segment folded into a multi-segment group to
        the group's combined length, which is exactly the fabricated-looking
        data this task's own risk note (R-G) forbids. Returns ``None`` when
        ``segment_id`` isn't found (e.g. no children built yet, or a caller
        without chapter-fan-out context) so entries stay additive-only.
        """
        if not segment_id:
            return None
        # Snapshot under the same lock that guards mutation of self._children
        # (the retry-once swap in _run_child_with_retry can append a retry
        # child mid-iteration) — iterating the live list unlocked can raise
        # "list changed size during iteration" at tts_parallel_cap>1.
        with self._children_lock:
            children = list(self._children)
        for child in children:
            for segment in (child.group or {}).get("segments") or []:
                if segment.get("id") == segment_id:
                    return len(segment.get("text_content") or "") or None
        return None

    def _on_child_segment_tick(
        self, *, segment_id: str | None, status: str | None, progress: float | None, eta_seconds: int | None,
        reason_code: str | None = None, final: bool = False,
    ) -> None:
        """Update the live active_segments_map from a child's own progress
        tick (2026-07-05, escaped defect fix) — the event-driven replacement
        for a polling timer. Called from the CHILD's own dispatch thread, at
        the exact point it already publishes its per-tick progress via
        ``orchestrator_publish._publish`` (already ≥1%-gated by
        ``ProgressService`` — see that gate's own emit discipline; this
        callback adds no new flood risk, it rides an existing rate limit).

        Thread-safe for N concurrent children at cap>1: the shared dict
        mutation and diff computation happen under ``self._children_lock``
        (the SAME lock already guarding ``self._children`` elsewhere in this
        class); the ``update_job`` call itself happens OUTSIDE the lock (I/O
        should never happen while holding a lock another thread needs) and
        is naturally serialized by ``app.db.state``'s own internal
        ``_STATE_LOCK``. A cancelled status, or a non-final failed status
        (still eligible for the retry-once policy), REMOVES the entry — a
        segment that did not finish must not keep showing as "rendering". A
        successful (done/completed) status instead LEAVES a transient
        ``phase="done"`` marker (2026-07-07 fix, escaped defect) — see the
        ``is_success`` branch below for why.

        ``final=True`` (task 008, R-G): marks this call as the authoritative
        terminal outcome for the segment — set ONLY by the ``as_completed``
        loop below, after ``_run_child_with_retry`` has already exhausted the
        one permitted retry. A ``status="failed"`` tick with ``final=True``
        therefore represents a genuinely, permanently failed segment and
        writes (never pops) a ``phase="failed"`` entry so the frontend can
        show it as failed rather than silently vanishing from the map. A
        non-final ``"failed"`` (e.g. a marker-driven tick during the FIRST
        attempt, before the retry-once policy has had a chance to run) still
        pops — writing ``phase="failed"`` at that point would be premature
        (this project's progress-no-fabrication principle forbids
        half-implemented/fabricated-looking status).

        Every entry also carries a best-effort ``char_count`` (task 008),
        looked up per-segment via ``_segment_char_count`` — never the
        render-group's combined ``text_length`` (see that method's docstring
        for why).
        """
        if not _EMIT_ACTIVE_SEGMENTS_MAP or not segment_id:
            return
        is_success = status in {"done", "completed"}
        is_final_failure = final and status == "failed"
        terminal = is_success or status in {"failed", "cancelled"}
        char_count = self._segment_char_count(segment_id)
        changed = False
        with self._children_lock:
            if is_success:
                # Owner report, 2026-07-07: a just-completed segment's text
                # went gray instead of staying lit. Root cause: popping the
                # entry here removes the ONLY live signal that the segment
                # finished; ScriptView's `isReady` (the class that keeps text
                # lit) is driven purely by the DB-backed `span.status`, which
                # the frontend only refetches on mount/queue-submit/terminal
                # chapter events — never mid-render — so for the whole gap
                # between "popped from this map" and "chapter fully done and
                # refetched," the segment matched neither `isRendering` nor
                # `isReady` and fell through to the default muted/gray class.
                # A transient "done" entry (excluded from both the
                # rendering-phase and preparing-phase derived sets already,
                # since both filter on `entry.phase`) gives the frontend a
                # live signal to treat it as ready without waiting on a
                # refetch; `_clear_active_segments_map` wipes the whole map
                # at the render's terminal outcome regardless.
                entry = {"phase": "done", "progress": 1.0, "eta_seconds": 0}
                if char_count is not None:
                    entry["char_count"] = char_count
                if self._live_segments_map.get(segment_id) != entry:
                    self._live_segments_map[segment_id] = entry
                    changed = True
            elif is_final_failure:
                entry = {
                    "phase": "failed",
                    "progress": round(progress or 0.0, 2),
                    "eta_seconds": eta_seconds,
                }
                if char_count is not None:
                    entry["char_count"] = char_count
                if self._live_segments_map.get(segment_id) != entry:
                    self._live_segments_map[segment_id] = entry
                    changed = True
            elif terminal:
                changed = self._live_segments_map.pop(segment_id, None) is not None
            else:
                # Quantize to 0.01 (matching ProgressService's own ≥1%
                # convention, see min_progress_delta) so sub-1% engine ticks
                # don't trigger a state.json rewrite on every call.
                # Thread the child's real preparing-ness into phase so a
                # segment still loading/announcing surfaces as "preparing"
                # here too — mirrors orchestrator_helpers.py's marker-parsing
                # path, which already does this for its own per-child
                # active_segments_map kwarg (discarded for ephemeral
                # children; this aggregate map is the one that survives).
                # Two distinct sub-phases both count as "preparing": the
                # LOADING_MODEL cold-load window (status genuinely
                # "preparing") and the per-segment SEGMENT_PENDING announce
                # (status is already "running" by then — engine warm, this
                # segment just not yet engine-confirmed — conveyed only via
                # reason_code, never status).
                is_preparing = status == "preparing" or reason_code in self._PREPARING_REASON_CODES
                entry = {
                    "phase": "preparing" if is_preparing else "rendering",
                    "progress": round(progress or 0.0, 2),
                    "eta_seconds": eta_seconds,
                }
                if char_count is not None:
                    entry["char_count"] = char_count
                if self._live_segments_map.get(segment_id) != entry:
                    self._live_segments_map[segment_id] = entry
                    changed = True
            if changed:
                snapshot = dict(self._live_segments_map)
                if snapshot == self._live_segments_map_last_published:
                    changed = False
                else:
                    self._live_segments_map_last_published = snapshot
        if not changed:
            return
        try:
            from app.db.state import update_job  # noqa: PLC0415
            # skip_job_updated=True: emits the chapters.progress frame
            # (now carrying active_segments_map, live-events.md 1.9.x) but
            # skips the queue.items frame AND the ETA-velocity sample
            # (ws.py's `_enrich_sample = not skip_job_updated`) — a map-only
            # tick must never corrupt the §4A confidence ring with a
            # same-progress sample between real group completions.
            update_job(self.task_id, active_segments_map=snapshot, skip_job_updated=True)
        except Exception:
            logger.warning(
                "ChapterSynthesisTask %s: failed to publish live segment tick.",
                self.task_id, exc_info=True,
            )

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
        with self._children_lock:
            self._live_segments_map.clear()
            self._live_segments_map_last_published = {}
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

    def _grouped_progress(self, *, done_chars: int, total_chars: int) -> float | None:
        """Size-weighted, order-independent completion ratio (W-PAR
        enable-gate) for the ``grouped_progress`` kwarg that already threads
        through to the frontend's ``groupedProgress`` field (see
        ``app.api.contracts.events`` / ``progress/service.py``).

        Weighted from each child's in-memory ``group["text_length"]`` (set by
        ``build_chunk_groups``) rather than a DB re-query, so it reflects
        completed SIZE regardless of the order children resolve in — a large
        segment finishing first correctly reports a large jump, and a small
        segment finishing first correctly reports a small one. Returns
        ``None`` when there is no size information to weight by (e.g. all
        groups reported zero length), so callers fall back to the count-based
        ``progress`` value only.
        """
        if total_chars <= 0:
            return None
        return round(done_chars / total_chars, 2)

    def _live_chapter_eta_seconds(self, *, status: str, decay_fraction: float | None) -> int | None:
        """Decay the dispatch-time chapter ETA by real completed work.

        Escaped defect (2026-07-07): the chapter ETA never counted down
        through a real render — ``_publish_progress`` never computed or
        passed an ``eta_seconds`` at all, so every "running" frame carried
        ``eta_seconds=None`` while the durable job row stayed frozen at
        whatever ``_publish_chapter_dispatch_eta`` wrote once, before
        rendering even started; every later ``_on_child_segment_tick`` tick
        then re-broadcast that stale snapshot verbatim for the rest of the
        render (it only ever writes ``active_segments_map``, never refreshing
        status/progress/eta_seconds).

        Reuses the SAME calibrated dispatch-time estimate (no new calibration
        lookup, no fabricated live throughput) and decays it by
        ``decay_fraction`` — the size-weighted ``grouped_progress`` when
        available, else the plain group-count ``progress`` — consistent with
        the calibration-based, no-fabrication design (progress-presentation.md
        B10/1.7.1): this is still "an honest historical estimate," now
        correctly applied to the REMAINING work instead of the whole chapter
        on every tick.
        """
        dispatch_eta = self._dispatch_eta_seconds
        if dispatch_eta is None:
            return None
        if status in ("completed", "done", "failed", "cancelled"):
            return 0
        fraction = min(max(decay_fraction or 0.0, 0.0), 1.0)
        return max(0, int(round(dispatch_eta * (1.0 - fraction))))

    def _publish_progress(
        self, *, completed: int, total: int, status: str = "running",
        done_chars: int | None = None, total_chars: int | None = None,
    ) -> None:
        if total <= 0:
            return
        progress = round(completed / total, 2)
        grouped_progress = None
        if done_chars is not None and total_chars is not None:
            grouped_progress = self._grouped_progress(done_chars=done_chars, total_chars=total_chars)
        eta_seconds = self._live_chapter_eta_seconds(
            status=status, decay_fraction=grouped_progress if grouped_progress is not None else progress,
        )
        service = self._resolve_progress_service()
        active_segments_map = self._current_active_segments_map()
        try:
            service.publish(
                job_id=self.task_id,
                status=status,
                chapter_id=self.chapter_id,
                parent_job_id=self.project_id,
                progress=progress,
                grouped_progress=grouped_progress,
                eta_seconds=eta_seconds,
                message=f"Rendered {completed}/{total} segment group(s).",
                reason_code="segment_group_completed" if status == "running" else "synthesis_ok",
                # `total`/`completed` here ARE the real chunk-group (render-batch)
                # counts (`total = len(children)` in run(), one child per
                # `build_chunk_groups` group) — the same numbers `progress` is
                # derived from. Without these, the frontend's real-batch-count
                # display (#231) falls back to the raw per-sentence segment
                # count for every chapter dispatched through this parallel
                # fan-out path (escaped defect, 2026-08-26).
                render_group_count=total,
                completed_render_groups=completed,
            )
        except Exception:
            logger.warning(
                "ChapterSynthesisTask %s: failed to publish progress.", self.task_id, exc_info=True
            )

        # Durable refresh (2026-07-07 fix): _on_child_segment_tick's frequent
        # active_segments_map-only writes merge against whatever is CURRENTLY
        # persisted on the job row (app/db/state_jobs.py#update_job only
        # touches fields it's explicitly given). Without this write, the row
        # stays frozen at _publish_chapter_dispatch_eta's one-time dispatch
        # snapshot forever, and every one of those far-more-frequent ticks
        # re-broadcasts that stale status/progress/eta_seconds verbatim.
        # skip_job_updated=True: service.publish() above already emitted the
        # authoritative chapters.progress/queue.items frames for this same
        # tick — this call's only job is to keep the ROW current for later
        # reads, not to broadcast a second time.
        try:
            from app.db.state import update_job  # noqa: PLC0415
            update_kwargs: dict[str, Any] = {"status": status, "progress": progress}
            if eta_seconds is not None:
                # Only write a REAL decayed value. An explicit eta_seconds=None
                # is not a no-op at the state layer: update_job treats it as
                # "clear all ETA metadata" AND skips its own observed-progress
                # projection for the call — so passing None here (the
                # no-calibration case) would wipe the projection-derived ETA
                # the state layer maintains from this task's real progress
                # between group boundaries, making the countdown flicker out
                # at every boundary frame. No dispatch calibration → simply
                # don't touch the field (review fix, 2026-07-07).
                update_kwargs["eta_seconds"] = eta_seconds
            if active_segments_map is not None:
                # active_segments_map bypasses ProgressService.publish (which does
                # not carry this field — see orchestrator_publish.py's own direct
                # state write for the single-dispatch-unit case) and is written
                # straight to job state, mirroring that same pattern.
                update_kwargs["active_segments_map"] = active_segments_map
            update_job(self.task_id, skip_job_updated=True, **update_kwargs)
        except Exception:
            logger.warning(
                "ChapterSynthesisTask %s: failed to refresh job state.",
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
                    "on_segment_tick": self._on_child_segment_tick,
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

        # Size-weighted, order-independent completion (W-PAR enable-gate):
        # each child's own in-memory `group["text_length"]` (set by
        # build_chunk_groups) is the source of truth — no dependency on
        # mid-render DB status-write timing, and correct regardless of which
        # order children resolve in.
        def _child_char_len(c: SegmentSynthesisTask) -> int:
            return int((c.group or {}).get("text_length") or 0)

        def _leader_id(c: SegmentSynthesisTask) -> str | None:
            segs = (c.group or {}).get("segments") or []
            return segs[0]["id"] if segs else None

        total_chars = sum(_child_char_len(c) for c in children)
        done_chars = 0

        monitor_stop = self._start_heartbeat_monitor()
        try:
            with ThreadPoolExecutor(
                max_workers=self.max_concurrent_workers,
                thread_name_prefix=f"chapter-{self.task_id}",
            ) as pool:
                futures = {pool.submit(self._run_child_with_retry, child): child for child in children}

                # Publish "running" as soon as the fan-out dispatches, not
                # only once the first group COMPLETES (escaped defect,
                # 2026-07-06 debug session): without this, the parent job's
                # own `status` stayed "preparing" for the entire first
                # group's render — the Chapter Editor header reads
                # `job.status === 'preparing'` directly, so it showed
                # "Preparing" the whole time even though children were
                # visibly rendering underneath via active_segments_map.
                self._publish_progress(
                    completed=0, total=total, status="running",
                    done_chars=0, total_chars=total_chars,
                )

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

                    # Live map hygiene (2026-07-05, escaped defect fix): a
                    # resolved child (any outcome) must stop showing as
                    # "rendering" immediately — not every terminal transition
                    # necessarily arrives via a marker tick (e.g. a bridge
                    # exception with no final SEGMENT_PROGRESS line), so this
                    # explicit terminal tick is authoritative, independent of
                    # whatever _on_child_segment_tick calls happened during
                    # the render. It MUST carry the child's REAL outcome
                    # (review fix, 2026-07-07): a completed child leaves the
                    # transient "done" marker; a cancelled child pops; a
                    # failed child now (task 008) writes a "failed" entry
                    # instead — a hardcoded "done" here would light a
                    # permanently-failed segment as successfully finished for
                    # the rest of the render. ``final=True``: this is the
                    # authoritative post-retry outcome (the as_completed
                    # future only resolves once `_run_child_with_retry` has
                    # already exhausted the one permitted retry), so a
                    # "failed" status here is genuinely permanent, not a
                    # premature first-attempt failure.
                    self._on_child_segment_tick(
                        segment_id=_leader_id(final_child), status=result.status, progress=1.0, eta_seconds=None,
                        final=True,
                    )

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
                    done_chars += _child_char_len(final_child)
                    if result.output_path:
                        stitch_entries.append((final_child.segment_order, result.output_path))
                    self._publish_progress(
                        completed=completed, total=total, status="running",
                        done_chars=done_chars, total_chars=total_chars,
                    )
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

        self._publish_progress(
            completed=total, total=total, status="completed",
            done_chars=total_chars, total_chars=total_chars,
        )
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
