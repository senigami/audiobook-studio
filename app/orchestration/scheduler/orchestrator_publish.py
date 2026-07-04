"""Publish, context-to-job, and output-relay helpers for the Studio 2.0 TaskOrchestrator."""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable

from app.db.models import Job
from app.utils.render_trace import trace

if TYPE_CHECKING:
    from app.orchestration.tasks.base import StudioTask, TaskContext

logger = logging.getLogger(__name__)


class OrchestratorPublishMixin:
    """Publish, context-to-job, and output-relay helpers for TaskOrchestrator."""

    def _publish(
        self,
        *,
        context: TaskContext,
        status: str,
        progress: float | None = None,
        eta_seconds: int | None = None,
        active_segment_eta_seconds: int | None = None,
        eta_confidence: str | None = None,
        message: str | None = None,
        reason_code: str | None = None,
        waiting_reason: str | None = None,
        started_at: float | None = None,
        active_segment_id: str | None = None,
        active_segment_progress: float | None = None,
        render_group_count: int | None = None,
        completed_render_groups: int | None = None,
        active_render_group_index: int | None = None,
        total_render_weight: int | None = None,
        completed_render_weight: int | None = None,
        active_render_group_weight: int | None = None,
        grouped_progress: float | None = None,
        allow_progress_regression: bool = False,
        force: bool = False,
        indeterminate: bool | None = None,
        loading_elapsed_seconds: float | None = None,
        clear_eta: bool = False,
        active_segments_map: dict[str, dict] | None = None,
    ) -> None:
        # Derive char_count once from context payload (chapter-total chars for chapter jobs,
        # script_text length for single-unit synthesis/api tasks).  A pre-stashed integer
        # "char_count" key wins; otherwise we fall back to len(script_text).  We do NOT
        # query the DB here — the value is always available in the task payload.
        _payload = context.payload or {}
        _char_count: int | None = None
        _stashed = _payload.get("char_count")
        if isinstance(_stashed, int) and _stashed > 0:
            _char_count = _stashed
        else:
            _script = _payload.get("script_text") or _payload.get("test_text") or ""
            if _script:
                _char_count = len(str(_script)) or None
        """Publish a progress event through the ProgressService and sync with state."""
        state_status = "done" if status == "completed" else status
        if state_status == "finalizing":
            state_status = "running"

        # Resolve has_segment_support capability from engine
        has_segment_support = False
        if context.payload:
            engine_id = context.payload.get("engine_id") or context.payload.get("engine")
            if engine_id:
                from app.engines.behavior import uses_segment_orchestration, supports_segment_rendering
                has_segment_support = bool(
                    uses_segment_orchestration(engine_id) or supports_segment_rendering(engine_id)
                )

        # Stop 0% synthesis_progress from flipping status to running prematurely
        has_started = (started_at is not None)
        if not has_started:
            try:
                from app.db.state import get_jobs  # noqa: PLC0415
                existing_job = get_jobs().get(context.task_id)
                if existing_job and existing_job.started_at is not None:
                    has_started = True
            except Exception:
                pass

        # Zero progress is NOT used to infer "not started" — a running frame stays running
        # even at 0%. Loading/preparing is conveyed by explicit signals (SEGMENT_PENDING /
        # indeterminate), never by progress == 0.
        if has_started and state_status == "preparing":
            state_status = "running"
        state_progress = progress
        if state_progress is None:
            if state_status == "done":
                state_progress = 1.0
            else:
                # No task-reported progress yet: start at 0.0. Do not fabricate a
                # "finalizing ≈ 90%" placeholder for voice sample tasks — the bar
                # reflects real heartbeat progress or 0, never a made-up percentage.
                state_progress = 0.0
        # Safety: Do not emit eta_seconds=0 for active jobs; it's better to show no ETA than a false zero.
        if eta_seconds == 0 and state_status not in {"done", "failed", "cancelled"}:
            eta_seconds = None

        finished_at = time.time() if state_status in {"done", "failed", "cancelled"} else None
        updated_at = time.time()
        trace(
            "orchestrator.publish",
            job_id=context.task_id,
            project_id=context.project_id,
            chapter_id=context.chapter_id,
            status=state_status,
            progress=state_progress,
            eta_seconds=eta_seconds,
            active_segment_eta_seconds=active_segment_eta_seconds,
            eta_confidence=eta_confidence,
            reason_code=reason_code,
            message=message,
            started_at=started_at,
            active_segment_id=active_segment_id,
            active_segment_progress=active_segment_progress,
            force=force,
        )
        # Ephemeral fan-out children (W-PAR 008, Finding A) must never create a
        # durable Job row or trigger the job-list (queue.items/jobs.lifecycle/
        # chapters.progress) broadcasts — only the parent ChapterSynthesisTask
        # is the externally visible unit (INV-4). Without this, every call for
        # the same never-persisted synthetic task_id would keep hitting the
        # "first-seen" put_job branch below (no existing_job is ever found),
        # creating a fresh phantom row on every single progress tick.
        #
        # BUT: segment-scoped frames (segments.progress ticks + the prev→new
        # SEGMENT_SAVED transition frame) are multiplexed through this same
        # publish chokepoint and are keyed by the REAL segment id on the
        # frontend (setSegmentProgress in useJobs.ts) — the phantom job id was
        # never load-bearing for them. Suppressing the whole publish here
        # (review-ratchet finding, 2026-07-04) killed the live per-segment
        # progress bar for every fan-out chapter. So ephemeral contexts still
        # route through ProgressService.publish, which suppresses only the
        # job-scoped emissions (ephemeral=True), and we skip ALL durable
        # job-state writes (put_job/update_job) after it.
        ephemeral = bool(getattr(context, "ephemeral", False))

        try:
            # Sync with the persistent state.json for UI visibility and polling.
            # We import lazily to stay behind the state boundary.
            from app.db.state import get_jobs, put_job, update_job, Job  # noqa: PLC0415

            # Anti-Regression: If this is an update to an existing job, don't allow progress to regress
            # unless the status itself has regressed (e.g. requeued).
            existing_job = None if ephemeral else get_jobs().get(context.task_id)
            if existing_job and state_status == existing_job.status and state_progress is not None:
                if state_progress < (existing_job.progress or 0.0):
                    state_progress = existing_job.progress

            # Determine scope
            scope = "chapter"
            if context.task_type in {"sample_build", "sample_test", "voice_build", "voice_test"}:
                scope = "voice_test"
            elif context.payload and context.payload.get("segment_ids"):
                scope = "segment"

            # self.progress_service must be available on the target class
            self.progress_service.publish(
                job_id=context.task_id,
                status=state_status,
                scope=scope,
                parent_job_id=context.project_id,
                chapter_id=context.chapter_id,
                progress=state_progress,
                eta_seconds=eta_seconds,
                eta_confidence=eta_confidence,
                message=message,
                reason_code=reason_code,
                waiting_reason=waiting_reason,
                started_at=started_at,
                active_segment_id=active_segment_id,
                active_segment_progress=active_segment_progress,
                active_segment_eta_seconds=active_segment_eta_seconds,
                render_group_count=render_group_count,
                completed_render_groups=completed_render_groups,
                active_render_group_index=active_render_group_index,
                total_render_weight=total_render_weight,
                completed_render_weight=completed_render_weight,
                active_render_group_weight=active_render_group_weight,
                grouped_progress=grouped_progress,
                allow_progress_regression=allow_progress_regression,
                force=force,
                updated_at=updated_at,
                has_segment_support=has_segment_support,
                char_count=_char_count,
                indeterminate=indeterminate,
                loading_elapsed_seconds=loading_elapsed_seconds,
                ephemeral=ephemeral,
            )

            if ephemeral:
                # No durable job-state write for a synthetic fan-out child —
                # the segment-scoped frames above are its only output.
                return

            # Initialize job state if this is the first event (usually 'queued')
            if not existing_job:
                job = Job(
                    id=context.task_id,
                    engine=getattr(context, "task_type", "synthesis"),  # type: ignore[arg-type]
                    status=state_status,  # type: ignore[arg-type]
                    created_at=time.time(),
                    updated_at=updated_at,
                    started_at=started_at,
                    project_id=context.project_id,
                    chapter_id=context.chapter_id,
                    speaker_profile=context.payload.get("speaker_profile"),
                    progress=state_progress or 0.0,
                    finished_at=finished_at,
                    error=message if state_status == "failed" else None,
                    eta_seconds=eta_seconds,
                    eta_confidence=eta_confidence,
                    active_segment_id=active_segment_id,
                    active_segment_progress=active_segment_progress,
                    active_segment_eta_seconds=active_segment_eta_seconds,
                    active_segment_eta_basis="remaining_from_update" if active_segment_eta_seconds is not None else None,
                    active_segment_updated_at=updated_at if active_segment_eta_seconds is not None else None,
                    render_group_count=render_group_count,
                    completed_render_groups=completed_render_groups,
                    active_render_group_index=active_render_group_index,
                    total_render_weight=total_render_weight,
                    completed_render_weight=completed_render_weight,
                    active_render_group_weight=active_render_group_weight,
                    grouped_progress=grouped_progress,
                    has_segment_support=has_segment_support,
                    active_segments_map=active_segments_map,
                )
                put_job(job)
            else:
                updates: dict[str, object | None] = {
                    "status": state_status,
                    "progress": state_progress,
                    "message": message,
                    "reason_code": reason_code,
                    "updated_at": updated_at,
                    "active_segment_id": active_segment_id,
                    "active_segment_progress": active_segment_progress,
                    "active_segment_eta_seconds": active_segment_eta_seconds,
                    "active_segment_eta_basis": "remaining_from_update" if active_segment_eta_seconds is not None else None,
                    "active_segment_updated_at": updated_at if active_segment_eta_seconds is not None else None,
                    "render_group_count": render_group_count,
                    "completed_render_groups": completed_render_groups,
                    "active_render_group_index": active_render_group_index,
                    "total_render_weight": total_render_weight,
                    "completed_render_weight": completed_render_weight,
                    "active_render_group_weight": active_render_group_weight,
                    "grouped_progress": grouped_progress,
                    "has_segment_support": has_segment_support,
                }
                if active_segments_map is not None:
                    # W-PAR 003 (C2 contract): additive field (INV-1/INV-9) —
                    # only written when the caller actually has a concurrent-
                    # segment snapshot to report. Absent at cap=1 unless the
                    # caller opts in, so the existing single-active fields
                    # above are unaffected either way.
                    updates["active_segments_map"] = active_segments_map
                if eta_seconds is not None:
                    updates["eta_seconds"] = eta_seconds
                elif clear_eta:
                    updates["eta_seconds"] = None
                if eta_confidence is not None:
                    updates["eta_confidence"] = eta_confidence
                if started_at is not None:
                    updates["started_at"] = started_at
                if finished_at is not None:
                    updates["finished_at"] = finished_at
                if state_status == "failed":
                    updates["error"] = message or "Task failed."
                elif state_status == "done":
                    updates["error"] = None
                    # Ensure chapter-level audio is linked by propagating output filenames
                    output_path = context.payload.get("output_path")
                    if output_path:
                        from pathlib import Path
                        fname = Path(output_path).name
                        if fname.lower().endswith(".mp3"):
                            updates["output_mp3"] = fname
                        else:
                            updates["output_wav"] = fname
                update_job(context.task_id, force_broadcast=force, skip_studio_job_event=True, skip_job_updated=True, **updates)

        except Exception:
            logger.exception(
                "Failed to publish progress event for task %s (status=%s).",
                context.task_id,
                status,
            )

    def _context_to_job(self, context: TaskContext) -> Job:
        """Convert a TaskContext into a Job shim for the legacy handler registry."""
        payload = context.payload or {}
        engine_id = str(payload.get("engine_id") or payload.get("engine") or "")
        from app.engines.behavior import uses_segment_orchestration, supports_segment_rendering
        has_segment_support = bool(
            uses_segment_orchestration(engine_id) or supports_segment_rendering(engine_id)
        )
        return Job(
            id=context.task_id,
            engine=engine_id,
            kind=str(context.task_type),
            status="running",
            created_at=context.submitted_at or time.time(),
            project_id=context.project_id,
            chapter_id=context.chapter_id,
            chapter_file=str(payload.get("chapter_file") or Path(payload.get("output_path", "")).name),
            speaker_profile=payload.get("voice_profile_id") or payload.get("speaker_profile"),
            safe_mode=payload.get("safe_mode", True),
            make_mp3=payload.get("make_mp3", False),
            is_bake=payload.get("is_bake", False),
            force_rerender=bool(payload.get("force_rerender", False)),
            segment_ids=payload.get("segment_ids"),
            custom_title=payload.get("custom_title") or payload.get("book_title"),
            author_meta=payload.get("author") or payload.get("author_meta"),
            narrator_meta=payload.get("narrator") or payload.get("narrator_meta"),
            chapter_list=payload.get("chapters"),
            cover_path=str(payload.get("cover_path")) if payload.get("cover_path") else None,
            has_segment_support=has_segment_support,
        )

    def _relay_output_wrapper(self, task: StudioTask) -> Callable[[str], None]:
        """Return a callback that relays output lines to the orchestrator's log listener."""
        def on_output(line: str) -> None:
            if not line.strip():
                return
            # Use the task's internal relay if available
            relay = getattr(task, "_relay_output", None)
            if callable(relay):
                relay(line)
            else:
                # Fallback: broadcast directly to watchdog
                from app.engines.watchdog import get_watchdog
                wd = get_watchdog()
                if wd:
                    wd._broadcast_log(line, task_id=task.task_id)
        return on_output
