"""Task orchestrator for Studio 2.0.

This is the Studio 2.0 task orchestration layer: a real implementation of
submit(), recover(), and cancel() that uses reconciliation as the source
of truth.

Ownership model
---------------
- The orchestrator owns **job execution lifecycle**: submit, cancel, recover,
  dispatch, and progress publication.
- The watchdog owns **TTS Server process lifecycle**: spawn, heartbeat, restart.
- The VoiceBridge owns **engine routing**: HTTP vs in-process.

These responsibilities must not bleed into each other.

Orchestration boundaries
------------------------
Studio 2.0 jobs are handled here and must not enter the ``app.jobs`` worker
loop. Compatibility adapters are explicit and removable; the orchestrator
must not silently depend on internal background worker or loop behavior.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Optional

from app.engines.bridge import create_voice_bridge
from app.orchestration.progress.service import create_progress_service, get_progress_service
from app.orchestration.tasks.base import StudioTask, TaskContext, TaskResult

from .policies import choose_next_task
from .recovery import load_recoverable_task_contexts
from .resources import reserve_task_resources, release_task_resources

from .orchestrator_helpers import OrchestratorHelpersMixin, _claim_to_dict

logger = logging.getLogger(__name__)

# Boundary enforced by tests/orchestration/test_import_boundaries.py: this module must not
# depend on the legacy app.jobs package (worker/core submodules) or app.db.queue directly.
# Upstream callers are app.api.routers.{queue,projects,chapters}; downstream deps are
# StudioTask, the progress service, scheduler resources/recovery/policies, and VoiceBridge.


class TaskOrchestrator(OrchestratorHelpersMixin):
    """Studio 2.0 task orchestrator.

    Handles scheduling, dispatch, reconciliation, recovery, cancellation,
    and progress publication for all Studio 2.0 tasks.

    All progress events flow through the injected ``ProgressService``.
    All synthesis requests flow through the injected ``VoiceBridge``.
    Neither is accessed directly — both are injectable for testing.
    """

    def __init__(self, *, progress_service, voice_bridge):
        self.progress_service = progress_service
        self.voice_bridge = voice_bridge
        # Active task registry: task_id → StudioTask
        self._active: dict[str, StudioTask] = {}
        # Waiting task registry: task_id → (StudioTask, stop_event). Populated
        # BEFORE a task enters the resource-admission wait loop in submit() so
        # cancel() can find and stop it while it is still waiting for a slot
        # (COR-B-2) — before that fix, a task spinning in admission was in
        # neither registry, so a concurrent cancel() returned False and the
        # caller's fallback (a bare `update_job(status="cancelled")`) never
        # actually stopped the task: once a slot freed, submit() admitted and
        # dispatched a full render of the "cancelled" job anyway.
        self._waiting: dict[str, tuple[StudioTask, threading.Event]] = {}
        # Guards both registries above — submit()'s admission loop and
        # cancel() must observe/mutate them atomically (no lock existed on
        # self._active before; this is the first thing that needed one).
        self._registry_lock = threading.Lock()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def submit(self, task: StudioTask) -> str:
        """Submit a task through the orchestrator.

        Submission flow:
        1. Validate the task payload.
        2. Publish ``queued`` event.
        3. Reconcile: call Phase 4 reconciliation per batch in scope.
           - ``can_reuse=True``  → publish skip/reuse event, do not dispatch.
           - ``artifact_state="stale"``  → publish rerender event, dispatch.
           - ``artifact_state="missing"`` → dispatch as new work.
        4. Reserve resources (admission control).
        5. Publish ``preparing → running`` transition.
        6. Dispatch to VoiceBridge.
        7. Publish ``finalizing → completed`` or ``→ failed``.

        Args:
            task: Any ``StudioTask`` subclass.

        Returns:
            str: The task ID used by queue and progress surfaces.

        Raises:
            ValueError: If task validation fails.
            RuntimeError: If resources cannot be reserved.
        """
        # Step 1 — validate
        try:
            task.validate()
        except Exception as exc:
            raise ValueError(f"Task validation failed for {getattr(task, 'task_id', '?')}: {exc}") from exc

        context = task.describe()
        task_id = context.task_id

        # Step 2 — publish queued
        self._publish(
            context=context,
            status="queued",
            message="Task accepted, reconciling batches.",
            reason_code="submitted",
        )

        # Step 3 — reconcile per batch
        reconcile_result = self._reconcile_task(context)
        decision = reconcile_result.get("decision", "queue")

        if decision == "reuse":
            # All batches are already valid — nothing to render.
            self._publish(
                context=context,
                status="completed",
                progress=1.0,
                message="All artifacts are current — no synthesis required.",
                reason_code="artifact_reused",
            )
            logger.info("Task %s: all artifacts valid, skipped dispatch.", task_id)
            return task_id

        if decision == "rerender":
            self._publish(
                context=context,
                status="preparing",
                message="Stale artifacts detected — scheduling rerender.",
                reason_code="artifact_stale",
            )
        else:
            # "queue" — new work
            self._publish(
                context=context,
                status="preparing",
                message="Preparing synthesis resources.",
                reason_code="new_work",
            )

        # Step 4 — reserve resources
        claim_dict = _claim_to_dict(getattr(task, "resource_claim", None))
        claim_dict["task_id"] = task_id  # needed by GpuAdmissionGate

        # Register the task as "waiting" BEFORE entering the admission loop so a
        # concurrent cancel() can find and stop it while it spins here (COR-B-2).
        stop_event = threading.Event()
        with self._registry_lock:
            self._waiting[task_id] = (task, stop_event)

        admitted = False
        try:
            while True:
                if stop_event.is_set() or self._is_task_cancelled_in_db(task_id):
                    logger.info(
                        "Task %s: cancelled while waiting for resource admission — not dispatching.",
                        task_id,
                    )
                    return task_id

                reservation = reserve_task_resources(
                    task_type=context.task_type,
                    resource_claims=claim_dict,
                )
                if reservation.get("admitted", True):
                    admitted = True
                    break

                waiting_reason = reservation.get("waiting_reason", "Resources unavailable.")
                if waiting_reason == "Orchestrator is paused.":
                    self._publish(
                        context=context,
                        status="waiting_for_resources",
                        waiting_reason=waiting_reason,
                    )
                    logger.warning("Task %s: resource admission failed: %s", task_id, waiting_reason)
                    return task_id

                logger.info("Task %s waiting for resources: %s", task_id, waiting_reason)
                # Event.wait (not time.sleep) so a cancel() arriving mid-wait is
                # observed immediately instead of after the full poll interval.
                stop_event.wait(1.0)
        finally:
            # Atomic waiting→active handoff (COR-B-2): pop from `_waiting` and
            # insert into `_active` under a SINGLE lock hold, re-checking
            # stop_event inside it. This closes the gap where the task would
            # otherwise sit in NEITHER registry (between a separate pop and a
            # separate insert) while holding a reserved slot — a cancel()
            # landing there returned False and let the caller's fallback
            # resurrect a render we were about to dispatch.
            with self._registry_lock:
                self._waiting.pop(task_id, None)
                if admitted and stop_event.is_set():
                    # Cancelled in the admission→active window: don't activate;
                    # released below (outside the lock).
                    admitted = False
                elif admitted:
                    self._active[task_id] = task

        if not admitted:
            # We reserved a slot but a cancel() landed before we could activate
            # (stop_event set during the handoff): release it and never
            # dispatch. The not-admitted early exits above already returned
            # inside the try without reserving anything.
            release_task_resources(task_id=task_id, resource_claims=claim_dict)
            logger.info(
                "Task %s: cancelled at the moment resources were admitted; releasing without dispatch.",
                task_id,
            )
            return task_id

        # Step 6 — dispatch
        max_attempts = 3
        attempt = 0
        result = TaskResult(status="failed", message="Unknown error")

        while attempt < max_attempts:
            attempt += 1
            try:
                result = self._dispatch(task=task, context=context)
                if result.status == "completed":
                    break

                # Check if it's a retriable error (e.g. infrastructure failure)
                if not getattr(result, "retriable", False):
                    break

                if attempt < max_attempts:
                    logger.warning(
                        "Task %s: retriable failure (attempt %d/%d): %s. Retrying in 2s...",
                        task_id, attempt, max_attempts, result.message
                    )
                    time.sleep(2.0)
                else:
                    logger.error(
                        "Task %s: retriable failure exceeded max attempts (%d).",
                        task_id, max_attempts
                    )
            except Exception as exc:
                logger.exception("Task %s: unexpected dispatch exception.", task_id)
                result = TaskResult(status="failed", message=str(exc))
                break

        # Final cleanup - always release resources after all attempts
        release_task_resources(task_id=task_id, resource_claims=claim_dict)
        with self._registry_lock:
            self._active.pop(task_id, None)

        if result.status == "completed":
            self._publish(
                context=context,
                status="completed",
                progress=1.0,
                message="Task completed successfully.",
                reason_code="synthesis_ok",
                force=True,
            )
            self._emit_chapter_peaks_sidecar(context)
            self._emit_chapter_timing_sidecar(context)
        else:
            reason_code = "synthesis_error_retriable" if getattr(result, "retriable", False) else "synthesis_error"
            self._publish(
                context=context,
                status="failed",
                message=result.message or "Task failed.",
                reason_code=reason_code,
                force=True,
            )

        return task_id

    def _emit_chapter_peaks_sidecar(self, context: TaskContext) -> None:
        """Proactively write the waveform peaks sidecar for a just-finalized chapter.

        Fired at the single engine-agnostic completion point in ``submit()`` so
        it covers BOTH the XTTS remote-synthesis path and the local ``mixed``
        path without branching on engine id (the only discriminators used are
        ``task_type`` and the reconciliation ``scope``). Long chapters (above
        the browser-decode duration cap) can then show the waveform tape
        immediately instead of waiting for lazy first-request generation by the
        ``GET .../assets/peaks`` route (audio-player spec §5.4).

        Scope guard:
        - only chapter synthesis (``task_type == "synthesis"``,
          ``scope == "chapter"``) — never segment re-renders (scope ``"job"``)
          nor the book-level assembly m4b (a different ``task_type``);
        - only the canonical chapter WAV (``output_path`` ending in ``.wav``).

        Best-effort and non-blocking: this must never fail, delay, or regress a
        render. Every failure — a None compute result or any exception — is
        logged and swallowed; the render outcome is already published above.
        """
        try:
            if context.task_type != "synthesis":
                return
            payload = context.payload or {}
            if payload.get("scope") != "chapter":
                return
            output_path = payload.get("output_path")
            if not output_path:
                return
            from pathlib import Path  # noqa: PLC0415
            wav_path = Path(output_path)
            if wav_path.suffix.lower() != ".wav":
                return
            from app.engines.audio_ops import ensure_peaks_sidecar  # noqa: PLC0415
            ensure_peaks_sidecar(wav_path)
        except Exception:
            logger.warning(
                "Peaks sidecar emission failed for task %s (non-fatal).",
                getattr(context, "task_id", "?"),
                exc_info=True,
            )

    def _emit_chapter_timing_sidecar(self, context: TaskContext) -> None:
        """Proactively write the reader-sync timing sidecar for a just-finalized
        chapter (synced-reader Task 4).

        Sibling of ``_emit_chapter_peaks_sidecar``, fired at the same single
        engine-agnostic completion point in ``submit()`` so it covers the XTTS
        remote-synthesis path, the local ``mixed`` path, and crash-recovery
        re-submits alike, without branching on engine id
        (``design-docs/plans/active/synced_reader/01-findings.md`` §1-4).

        The ordered chunk-group list is rebuilt fresh here from the same
        ``get_chapter_segments`` + ``build_chunk_groups`` call every
        finalization path already makes before stitching, keyed by each
        group's leader segment id (the same id used for its on-disk WAV
        filename), so the timing sidecar can never disagree with what was
        actually stitched.

        Scope guard: identical to ``_emit_chapter_peaks_sidecar`` — only
        chapter synthesis (``task_type == "synthesis"``, ``scope ==
        "chapter"``), only the canonical chapter WAV (``output_path`` ending
        in ``.wav``).

        Best-effort and non-blocking: this must never fail, delay, or regress
        a render. Every failure — missing group audio, a
        ``TimingReconciliationError`` drift beyond tolerance, or any other
        exception — is logged and swallowed; the render outcome is already
        published above.
        """
        try:
            if context.task_type != "synthesis":
                return
            payload = context.payload or {}
            if payload.get("scope") != "chapter":
                return
            output_path = payload.get("output_path")
            if not output_path:
                return
            from pathlib import Path  # noqa: PLC0415
            chapter_wav_path = Path(output_path)
            if chapter_wav_path.suffix.lower() != ".wav":
                return

            chapter_id = context.chapter_id
            project_id = context.project_id
            if not chapter_id or not project_id:
                return

            from app.core.config import get_chapter_dir  # noqa: PLC0415
            from app.db.chapters import get_chapter  # noqa: PLC0415
            from app.db.segments import get_chapter_segments  # noqa: PLC0415
            from app.domain.chunk_groups import build_chunk_groups, group_wav_path  # noqa: PLC0415
            from app.domain.chapters.timing_generator import (  # noqa: PLC0415
                build_chapter_timing,
                write_timing_sidecar,
            )

            segments = get_chapter_segments(chapter_id)
            voice_profile_id = payload.get("voice_profile_id")
            groups = build_chunk_groups(segments, voice_profile_id)

            chapter_dir = get_chapter_dir(project_id, chapter_id)
            ordered_groups = [
                {
                    "group_id": group["segments"][0]["id"],
                    "wav_path": group_wav_path(chapter_dir, group),
                    "segment_ids": [s["id"] for s in group["segments"]],
                }
                for group in groups
            ]

            chapter = get_chapter(chapter_id)
            audio_generated_at = chapter.get("audio_generated_at") if chapter else None
            if audio_generated_at is None:
                return

            timing = build_chapter_timing(
                chapter_id, chapter_wav_path, ordered_groups, audio_generated_at
            )
            if timing is None:
                return

            sidecar_path = chapter_wav_path.with_suffix(".timing.json")
            write_timing_sidecar(sidecar_path, timing)
        except Exception:
            logger.warning(
                "Timing sidecar emission failed for task %s (non-fatal).",
                getattr(context, "task_id", "?"),
                exc_info=True,
            )

    def recover(self, contexts: Optional[list] = None) -> list[str]:
        """Recover interrupted Studio 2.0 jobs after a restart.

        Recovery flow:
        1. Discover interrupted jobs via ``load_recoverable_task_contexts()``
           (or use the pre-snapshotted ``contexts`` list if supplied).
        2. For each recovered context, call Phase 4 reconciliation per batch.
        3. Reuse already-valid artifacts — do NOT re-render them.
        4. Resume only unresolved work.
        5. Publish recovery-specific progress transitions.

        Args:
            contexts: Pre-snapshotted list of ``TaskContext`` objects to recover.
                When *None* (the default), ``load_recoverable_task_contexts()``
                is called internally.  Pass a pre-snapshotted list when the
                caller must capture recoverable contexts *before* reconciliation
                clears the DB rows (startup recovery).

        Returns:
            list[str]: Task IDs of jobs that were recovered and resumed.
        """
        recovered_ids: list[str] = []

        if contexts is None:
            contexts = load_recoverable_task_contexts()
        if not contexts:
            return recovered_ids

        logger.info("Recovery: found %d interrupted task(s).", len(contexts))

        for context in contexts:
            task_id = context.task_id
            prior_status = context.payload.get("_recovered_from_status", "unknown")

            # Resolve has_segment_support capability from engine
            has_segment_support = False
            if context.payload:
                engine_id = context.payload.get("engine_id") or context.payload.get("engine")
                if engine_id:
                    from app.engines.behavior import uses_segment_orchestration, supports_segment_rendering
                    has_segment_support = bool(
                        uses_segment_orchestration(engine_id) or supports_segment_rendering(engine_id)
                    )

            # Publish recovery reset event — allow progress regression because we
            # are explicitly resetting state from a previous run.
            self.progress_service.publish(
                job_id=task_id,
                status="preparing",
                parent_job_id=context.project_id,
                chapter_id=context.chapter_id,
                message=f"Recovering from interrupted {prior_status} state.",
                reason_code="recovery_resumed",
                allow_progress_regression=True,
                force=True,
                has_segment_support=has_segment_support,
            )

            # Reconcile this job's work scope against current artifacts.
            reconcile_result = self._reconcile_task(context)
            decision = reconcile_result.get("decision", "queue")

            if decision == "reuse":
                # All batches are still valid — complete without re-rendering.
                self.progress_service.publish(
                    job_id=task_id,
                    status="completed",
                    progress=1.0,
                    parent_job_id=context.project_id,
                    chapter_id=context.chapter_id,
                    message="All artifacts already valid — recovery complete without re-synthesis.",
                    reason_code="recovery_reused",
                    force=True,
                    has_segment_support=has_segment_support,
                )
                logger.info("Recovery: task %s — all artifacts valid, skipped.", task_id)
                recovered_ids.append(task_id)
                continue

            # Unresolved work remains — re-queue with recovery priority.
            self.progress_service.publish(
                job_id=task_id,
                status="queued",
                parent_job_id=context.project_id,
                chapter_id=context.chapter_id,
                message="Unresolved batches re-queued after recovery. Resuming...",
                reason_code="recovery_requeued",
                allow_progress_regression=True,
                force=True,
                has_segment_support=has_segment_support,
            )
            logger.info(
                "Recovery: task %s — decision=%s, re-queued %d unresolved batch(es).",
                task_id,
                decision,
                reconcile_result.get("unresolved_count", 0),
            )

            # Reconstruct and re-submit for execution.
            try:
                task = self._reconstruct_task(context)
                if task:
                    import threading
                    # We run submission in a background thread so recovery doesn't block boot.
                    threading.Thread(
                        target=self.submit,
                        args=(task,),
                        daemon=True,
                        name=f"recovery-{task_id}"
                    ).start()
                    logger.info("Recovery: task %s — submission triggered in background.", task_id)
                else:
                    logger.warning("Recovery: task %s — could not reconstruct task object; skipping submission.", task_id)
            except Exception:
                logger.exception("Recovery: task %s — failed to trigger re-submission.", task_id)

            recovered_ids.append(task_id)

        return recovered_ids

    def _reconstruct_task(self, context: TaskContext) -> StudioTask | None:
        """Internal helper to reconstruct a StudioTask from a context."""
        task_type = context.task_type

        try:
            if task_type == "api_synthesis":
                from app.orchestration.tasks.api_synthesis import ApiSynthesisTask
                return ApiSynthesisTask.from_task_context(context)
            elif task_type == "synthesis":
                payload = context.payload or {}
                engine_id = payload.get("engine_id") or payload.get("engine") or ""
                from app.engines.behavior import uses_segment_orchestration
                if context.chapter_id and uses_segment_orchestration(engine_id):
                    chapter_task = self._reconstruct_chapter_task_from_context(context)
                    if chapter_task is not None:
                        return chapter_task
                from app.orchestration.tasks.synthesis import SynthesisTask
                return SynthesisTask.from_task_context(context)
            elif task_type == "assembly":
                from app.orchestration.tasks.assembly import AssemblyTask
                return AssemblyTask.from_task_context(context)
            elif task_type == "sample_build":
                from app.orchestration.tasks.sample_build import SampleBuildTask
                return SampleBuildTask.from_task_context(context)
            elif task_type == "sample_test":
                from app.orchestration.tasks.sample_test import SampleTestTask
                return SampleTestTask.from_task_context(context)
            # Add other task types as needed...
        except Exception:
            logger.exception("Failed to reconstruct task of type %s", task_type)

        return None

    def _reconstruct_chapter_task_from_context(self, context: TaskContext) -> StudioTask | None:
        """Reconstruct a ``ChapterSynthesisTask`` from a recovered (bare)
        ``TaskContext`` (W-PAR 008 — the enable-gate's recovery path).

        The recovered payload is a raw ``processing_queue`` row (see
        ``load_recoverable_task_contexts``) — it carries no ``script``, so the
        chapter's chunk-group script is rebuilt fresh from the DB here (the
        same way the live submission path builds it via
        ``build_script_entry_for_group``), never trusted from the stale
        payload. ``needs_render_fn``/``resolve_existing_output_fn`` wire
        ``_group_needs_render``/its matching path resolver (INV-8) so only
        the N-K unfinished segments are resubmitted and the K already-valid
        segments still reach the stitch barrier (W-PAR 008 bug fix).

        Returns ``None`` (falling back to the caller's ``SynthesisTask`` path)
        on any resolution failure — fail-safe, never raises.
        """
        payload = context.payload or {}
        chapter_id = context.chapter_id
        project_id = context.project_id or payload.get("project_id")
        engine_id = payload.get("engine_id") or payload.get("engine") or ""
        if not chapter_id or not project_id or not engine_id:
            return None
        if payload.get("segment_ids"):
            # Review fix (W-PAR 008): a segment-scoped render ("generate
            # these specific segments") is NOT a chapter fan-out — recovering
            # it as a ChapterSynthesisTask would re-render every unfinished
            # group in the whole chapter AND stitch/overwrite the chapter WAV
            # (handle_mixed_job's segment_ids path deliberately renders only
            # the target groups and never stitches). Fall back to the
            # sequential SynthesisTask recovery path, which preserves
            # segment_ids semantics via from_task_context.
            return None

        try:
            from app.core.config import get_chapter_dir
            from app.db.chapters import get_chapter
            from app.db.segments import get_chapter_segments
            from app.orchestration.tasks.segment_synthesis import (
                ChapterSynthesisTask,
                make_dispatch_segment_bridge_call,
            )
            from tts_engines.tts_mixed.handler import _group_needs_render, _group_ready_audio_path

            chapter_row = get_chapter(chapter_id) or {}
            voice_profile_id = payload.get("voice_profile_id") or chapter_row.get("speaker_profile_name")
            chapter_dir = get_chapter_dir(project_id, chapter_id)
            segments = get_chapter_segments(chapter_id)

            def needs_render_fn(group: dict) -> bool:
                return _group_needs_render(group, chapter_dir)

            def resolve_existing_output_fn(group: dict) -> str | None:
                existing = _group_ready_audio_path(group, chapter_dir)
                return str(existing) if existing else None

            audio_filename = payload.get("chapter_file") or f"{chapter_id}.wav"
            from pathlib import Path
            output_path = str(chapter_dir / f"{Path(str(audio_filename)).stem}.wav")

            chapter_task = ChapterSynthesisTask(
                task_id=context.task_id,
                engine_id=engine_id,
                chapter_id=chapter_id,
                project_id=project_id,
                output_path=output_path,
                script=segments,
                voice_profile_id=voice_profile_id,
                max_concurrent_workers=1,
                safe_mode=bool(payload.get("safe_mode", True)),
                needs_render_fn=needs_render_fn,
                resolve_existing_output_fn=resolve_existing_output_fn,
            )

            def stitch_fn(paths: list[str]) -> None:
                self._stitch_recovered_chapter(
                    context=context,
                    chapter_dir=chapter_dir,
                    output_path=Path(output_path),
                    segment_paths=[Path(p) for p in paths],
                )

            chapter_task._stitch_fn = stitch_fn
            chapter_task._bridge_call = make_dispatch_segment_bridge_call(self)
            return chapter_task
        except Exception:
            logger.exception(
                "Recovery: failed to reconstruct ChapterSynthesisTask for chapter %s (task %s).",
                chapter_id, context.task_id,
            )
            return None

    def _stitch_recovered_chapter(self, *, context: TaskContext, chapter_dir, output_path, segment_paths) -> None:
        """Stitch callback for a recovered ``ChapterSynthesisTask`` — mirrors
        the sequential mixed handler's terminal stitch/persist block
        (``handle_mixed_job`` L473-513), scoped to fire exactly once via the
        parent's own INV-2 barrier rather than per-group.
        """
        from tts_engines.tts_mixed.handler import stitch_segments, _persist_mixed_chapter_output
        from app.db.state import update_job

        rc = stitch_segments(chapter_dir, segment_paths, output_path, lambda _line: None, lambda: False)
        if rc != 0 or not output_path.exists():
            # Raise-on-failure contract (review fix, W-PAR 008): the parent
            # task converts this into a failed TaskResult — silently
            # returning here let a recovered chapter finish as "completed"
            # with no stitched chapter WAV on disk.
            logger.warning(
                "Recovery: stitch failed (rc=%s) for chapter %s (task %s).",
                rc, context.chapter_id, context.task_id,
            )
            raise RuntimeError(f"Stitching failed (rc={rc}).")

        if context.chapter_id:
            try:
                from app.db import get_connection, update_segments_status_bulk
                with get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ?", (context.chapter_id,))
                    sids = [row["id"] for row in cursor.fetchall()]
                    update_segments_status_bulk(sids, context.chapter_id, "done")
            except Exception:
                logger.exception("Recovery: failed to mark segments done for chapter %s.", context.chapter_id)

            _persist_mixed_chapter_output(context.task_id, context.chapter_id, output_path)

        try:
            update_job(context.task_id, status="done", finished_at=time.time(), progress=1.0, output_wav=output_path.name)
        except Exception:
            logger.exception("Recovery: failed to write terminal job status for task %s.", context.task_id)

    def _is_task_cancelled_in_db(self, task_id: str) -> bool:
        """Secondary, defense-in-depth check for the admission wait loop.

        A caller that fails to reach ``cancel()`` in time (e.g. a stale race
        outside this orchestrator) may still write ``status="cancelled"``
        directly to the job row. Fail-open on any error — this is a belt-
        and-suspenders check alongside the ``stop_event`` registry, not the
        primary cancellation signal.
        """
        try:
            from app.db.state import get_jobs  # noqa: PLC0415
            job = get_jobs().get(task_id)
            return bool(job) and getattr(job, "status", None) == "cancelled"
        except Exception:
            return False

    def cancel(self, task_id: str) -> bool:
        """Cancel a scheduled or running task.

        Cancel flow:
        1. Look up the task — either already dispatched (``_active``) or
           still spinning in ``submit()``'s resource-admission wait loop
           (``_waiting``, COR-B-2). A waiting task is signalled via its
           ``stop_event`` so ``submit()`` stops admitting it instead of
           dispatching once a slot frees.
        2. Publish ``cancelling`` transition.
        3. Call ``task.on_cancel()`` to release task-level resources.
        4. Release scheduler resources (only if resources were actually
           reserved — a still-waiting task never acquired a slot).
        5. Publish ``cancelled`` terminal event.

        Args:
            task_id: Stable task identifier to cancel.

        Returns:
            bool: True if the task was found and cancelled, False if not found.
        """
        task: StudioTask | None = None
        resources_reserved = False
        with self._registry_lock:
            task = self._active.pop(task_id, None)
            if task is not None:
                resources_reserved = True
            else:
                waiting_entry = self._waiting.pop(task_id, None)
                if waiting_entry is not None:
                    task, stop_event = waiting_entry
                    stop_event.set()

        if task is None:
            logger.warning("cancel(%s): task not found in active or waiting registry.", task_id)
            return False

        context = task.describe()

        # Publish cancelling transition.
        self._publish(
            context=context,
            status="cancelling",
            message="Cancellation requested.",
            reason_code="user_cancel",
            force=True,
        )

        # Allow the task to clean up its own resources.
        try:
            task.on_cancel()
        except Exception:
            logger.exception("Task %s: on_cancel() raised an exception.", task_id)

        # Synchronously detach the task's engine-log listener so straggler output
        # from the not-yet-stopped subprocess (progress frames, [SEGMENT_SAVED]
        # re-marks) stops reaching the orchestrator the moment we cancel — before a
        # caller (e.g. the chapter reset route) clears segment state. on_cancel()
        # has already set the task's cancel flag, so the in-dispatch guards also
        # drop any line that races this unregister.
        _listener = getattr(task, "_log_listener", None)
        _wd = getattr(task, "_watchdog", None)
        if _listener is not None and _wd is not None:
            try:
                _wd.unregister_log_listener(_listener)
            except Exception:
                logger.exception("Task %s: failed to unregister log listener on cancel.", task_id)

        # Release any scheduler resources held by this task — only meaningful
        # for a task found in the ACTIVE registry. A task still waiting for
        # resource admission never acquired a slot (submit()'s own admission
        # loop notices stop_event and releases/skips instead), so there is
        # nothing to release here for it.
        if resources_reserved:
            claim_dict = _claim_to_dict(getattr(task, "resource_claim", None))
            claim_dict["task_id"] = task_id
            release_task_resources(task_id=task_id, resource_claims=claim_dict)

        # Terminal cancellation event.
        self._publish(
            context=context,
            status="cancelled",
            message="Task cancelled.",
            reason_code="cancelled_ok",
            force=True,
        )
        logger.info("Task %s cancelled.", task_id)
        return True


_GLOBAL_ORCHESTRATOR = None

def create_orchestrator() -> TaskOrchestrator:
    """Create the TaskOrchestrator with production dependency wiring.

    Returns:
        TaskOrchestrator: Ready for use by API route handlers and boot sequence.
    """
    global _GLOBAL_ORCHESTRATOR
    if _GLOBAL_ORCHESTRATOR is None:
        _GLOBAL_ORCHESTRATOR = TaskOrchestrator(
            progress_service=get_progress_service(),
            voice_bridge=create_voice_bridge(),
        )
    return _GLOBAL_ORCHESTRATOR
