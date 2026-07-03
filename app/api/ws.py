from __future__ import annotations
import asyncio
import logging
import sys
import threading
import time
from typing import List
from fastapi import WebSocket

from .contracts.events import (
    build_job_lifecycle_event,
    build_tts_log_event,
    build_queue_item_invalidated_event,
    build_queue_paused_event,
    build_voice_test_progress_event,
    build_chapter_lifecycle_event,
    build_segment_lifecycle_event,
    build_segment_progress_event,
    build_project_lifecycle_event,
    build_chapter_progress_event,
    build_queue_item_status_event,
)
from ..utils.render_trace import trace

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    def broadcast(self, message: dict):
        # We need to broadcast from a non-async context sometimes (jobs.py or db.py)
        # So we use the bridge approach or create a task
        from ..api.web import _main_loop
        if _main_loop[0] and not _main_loop[0].is_closed():
            _main_loop[0].call_soon_threadsafe(
                lambda: asyncio.create_task(self._send_to_all(message))
            )

    async def _send_to_all(self, message: dict):
        failed = []
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                failed.append(connection)

        for connection in failed:
            self.disconnect(connection)
            logger.debug("Dropped dead websocket connection while broadcasting")

manager = ConnectionManager()
_tts_log_line_sequences: dict[str, int] = {}
_tts_log_line_sequences_lock = threading.Lock()

_TERMINAL_STATUSES = {"done", "failed", "cancelled"}
_LATCH_REENTRY_STATUSES = {"queued", "preparing"}
_terminal_latched_jobs: set[str] = set()
_terminal_latch_lock = threading.RLock()


def _get_progress_service():
    """Resolve the boot-installed ProgressService singleton.

    Task 004 note: broadcast_job_updated uses raw ``time.time()`` at lines
    ~161 and ~573 (received_at / started_at fall-backs).  When Task 004 calls
    ``enrich`` from broadcast_job_updated, those clock-bearing fields MUST be
    routed through ``_get_progress_service().wall_clock`` for parity with the
    orchestrator path's injected clock (needed by the snapshot-equality gate in
    test_progress_contract_v140.py).
    """
    from app.orchestration.progress.service import get_progress_service  # noqa: PLC0415
    return get_progress_service()


def _terminal_latched(job_id: str, prev_status: str | None, new_status: str | None) -> bool:
    """True → drop all frames for this update (job already terminal, incoming
    status is not a legal re-entry). Mirrors the ProgressService._should_emit
    rule: prev terminal + curr not in {done, failed, cancelled, queued,
    preparing} → don't emit."""
    with _terminal_latch_lock:
        if new_status in _LATCH_REENTRY_STATUSES:
            _terminal_latched_jobs.discard(job_id)
            return False
        if new_status in _TERMINAL_STATUSES:
            _terminal_latched_jobs.add(job_id)
            return False
        if job_id in _terminal_latched_jobs:
            return True
        if prev_status in _TERMINAL_STATUSES:
            _terminal_latched_jobs.add(job_id)
            return True
        return False


def clear_terminal_latch(job_id: str | None = None) -> None:
    """Drop latch state for one job (removal/requeue) or all jobs (state reset)."""
    with _terminal_latch_lock:
        if job_id is None:
            _terminal_latched_jobs.clear()
        else:
            _terminal_latched_jobs.discard(job_id)


def _resolve_source(default: str) -> str:
    try:
        frame = sys._getframe(2)
    except (AttributeError, ValueError):
        return default
    module = frame.f_globals.get("__name__", "")
    function = frame.f_code.co_name
    if module and function:
        return f"{module}.{function}"
    return default


def _classify_job_payload(job: dict | None) -> str:
    if not isinstance(job, dict):
        return "job"
    explicit = job.get("classification")
    if explicit in {"job", "chapter", "segment"}:
        return str(explicit)
    if job.get("chapter_id") and job.get("active_segment_id"):
        return "chapter"
    if job.get("segment_ids"):
        return "segment"
    if job.get("chapter_id"):
        return "chapter"
    parent_id = job.get("parent_job_id")
    if parent_id and parent_id.startswith("job-"):
        return "segment"
    return "job"


def _next_tts_log_line_sequence(job_id: str) -> int:
    with _tts_log_line_sequences_lock:
        next_sequence = _tts_log_line_sequences.get(job_id, 0) + 1
        _tts_log_line_sequences[job_id] = next_sequence
        return next_sequence


def reset_tts_log_line_sequences_for_tests() -> None:
    with _tts_log_line_sequences_lock:
        _tts_log_line_sequences.clear()


def broadcast_tts_log_line(
    *,
    job_id: str,
    project_id: str | None,
    chapter_id: str | None,
    line: str,
    received_at: float | None = None,
    source: str | None = None,
    plugin_id: str | None = None,
    plugin_short_name: str | None = None,
) -> None:
    resolved_source = source or _resolve_source("app.api.ws.broadcast_tts_log_line")
    event = build_tts_log_event(
        line=line,
        level="INFO",
        sequence=_next_tts_log_line_sequence(job_id),
        plugin_id=plugin_id,
        job_id=job_id,
        chapter_id=chapter_id,
        project_id=project_id,
        received_at=received_at if received_at is not None else time.time(),
        source=resolved_source,
        plugin_short_name=plugin_short_name,
    )
    trace(
        "ws.broadcast_tts_log_line",
        job_id=job_id,
        project_id=project_id,
        chapter_id=chapter_id,
        marker=event["payload"]["marker"],
        sequence=event["payload"]["sequence"],
    )
    broadcast_studio_event(event)

def broadcast_queue_update(
    reason: str | None = None,
    job_id: str | None = None,
    project_id: str | None = None,
    changed_fields: list[str] | None = None,
    source: str | None = None,
):
    trace(
        "ws.broadcast_queue_update",
        reason=reason,
        job_id=job_id,
        project_id=project_id,
        changed_fields=changed_fields
    )
    event = build_queue_item_invalidated_event(
        reason=reason or "Queue update",
        changed_fields=changed_fields or [],
        job_id=job_id,
        project_id=project_id,
        source=source or _resolve_source("app.api.ws.broadcast_queue_update"),
    )
    broadcast_studio_event(event)


def broadcast_segments_updated(
    chapter_id: str,
    reason: str | None = None,
    job_id: str | None = None,
    project_id: str | None = None,
    changed_fields: list[str] | None = None,
    source: str | None = None,
):
    trace(
        "ws.broadcast_segments_updated",
        chapter_id=chapter_id,
        reason=reason,
        job_id=job_id,
        project_id=project_id,
        changed_fields=changed_fields
    )
    event = build_segment_lifecycle_event(
        chapter_id=chapter_id,
        reason=reason or "segments_updated",
        changed_fields=changed_fields or [],
        project_id=project_id,
        job_id=job_id,
        source=source or _resolve_source("app.api.ws.broadcast_segments_updated"),
    )
    broadcast_studio_event(event)


def broadcast_chapter_updated(
    chapter_id: str,
    reason: str | None = None,
    job_id: str | None = None,
    project_id: str | None = None,
    changed_fields: list[str] | None = None,
    source: str | None = None,
):
    trace(
        "ws.broadcast_chapter_updated",
        chapter_id=chapter_id,
        reason=reason,
        job_id=job_id,
        project_id=project_id,
        changed_fields=changed_fields
    )
    event = build_chapter_lifecycle_event(
        chapter_id=chapter_id,
        reason=reason or "chapter_updated",
        changed_fields=changed_fields or [],
        project_id=project_id,
        job_id=job_id,
        source=source or _resolve_source("app.api.ws.broadcast_chapter_updated"),
    )
    broadcast_studio_event(event)


def broadcast_project_updated(
    project_id: str,
    reason: str | None = None,
    job_id: str | None = None,
    changed_fields: list[str] | None = None,
    source: str | None = None,
):
    trace(
        "ws.broadcast_project_updated",
        project_id=project_id,
        reason=reason,
        job_id=job_id,
        changed_fields=changed_fields
    )
    event = build_project_lifecycle_event(
        project_id=project_id,
        reason=reason or "project_updated",
        changed_fields=changed_fields or [],
        job_id=job_id,
        source=source or _resolve_source("app.api.ws.broadcast_project_updated"),
    )
    broadcast_studio_event(event)

def broadcast_pause_state(paused: bool, source: str | None = None):
    event = build_queue_paused_event(
        paused=paused,
        source=source or _resolve_source("app.api.ws.broadcast_pause_state"),
    )
    broadcast_studio_event(event)

def broadcast_job_updated(job_id: str, updates: dict, current_job: dict | None = None, source: str | None = None):
    skip_studio_job_event = False
    skip_job_updated = False
    terminal_reset = False
    previous_status = None
    status_changed_flag = None
    source_from_updates = None
    if updates:
        skip_studio_job_event = updates.pop("skip_studio_job_event", False)
        skip_job_updated = updates.pop("skip_job_updated", False)
        terminal_reset = updates.pop("terminal_reset", False)
        previous_status = updates.pop("previous_status", None)
        status_changed_flag = updates.pop("status_changed", None)
        source_from_updates = updates.pop("source", None)

    source = source or source_from_updates
    merged = dict(current_job or {})
    merged.update(updates or {})
    merged.pop("skip_studio_job_event", None)
    merged.pop("skip_job_updated", None)
    merged.pop("source", None)
    classification = _classify_job_payload(merged)
    merged["classification"] = classification

    # Detect status changes and segment completion transition
    prev_status = previous_status if previous_status is not None else (current_job.get("status") if current_job else None)
    new_status = updates.get("status", merged.get("status")) if updates else merged.get("status")
    status_changed = bool(status_changed_flag) if status_changed_flag is not None else (prev_status != new_status)

    if terminal_reset:
        clear_terminal_latch(job_id)
    if _terminal_latched(job_id, prev_status, new_status):
        logger.debug("Dropped post-terminal frame for job %s (status=%s)", job_id, new_status)
        return

    # Task 004: enrich merged with §4A confidence/ETA fields via the singleton.
    # Must happen AFTER the terminal-latch check and BEFORE any builder calls.
    # Clock-bearing fields (estimated_end_at, eta_updated_at) come from enrich()
    # which uses the singleton's injected clock — do NOT clobber them with raw time.time().
    #
    # FIX 1: enrich sample-mode is gated by skip_job_updated.
    # - skip_job_updated=True  → Path A (orchestrated): the orchestrator already
    #   pushed a velocity sample via ProgressService.publish.  Call enrich with
    #   sample=False so we still get enriched confidence/ETA values (needed by
    #   chapter-progress builders on callers like put_job that have
    #   skip_studio_job_event=False) WITHOUT pushing a second sample that would
    #   corrupt the ring maturity factor / CV.
    # - skip_job_updated=False → Path B (direct / non-orchestrated): call
    #   enrich(sample=True) to push a velocity sample and drive §4A confidence.
    _enriched_confidence: float | None = None
    _enriched_eta_seconds: int | None = None
    _enriched_eta_basis: str | None = None
    _enriched_estimated_end_at: float | None = None
    _enriched_grouped_progress: float | None = None
    _enrich_sample = not skip_job_updated  # FIX 1: only push sample on Path B
    try:
        _ps = _get_progress_service()
        _enrich_payload = dict(merged)
        _ps.enrich(job_id, _enrich_payload, sample=_enrich_sample)
        _enriched_confidence = _enrich_payload.get("eta_confidence")
        _enriched_eta_seconds = _enrich_payload.get("eta_seconds")
        _enriched_eta_basis = _enrich_payload.get("eta_basis")
        _enriched_estimated_end_at = _enrich_payload.get("estimated_end_at")
        _enriched_grouped_progress = _enrich_payload.get("grouped_progress")
    except Exception:
        # FIX 5: on enrich failure, set a safe floor so the fail-loud builder
        # contract holds.  Terminal frames get 1.0; live frames get BASE_FLOOR.
        new_status_for_floor = merged.get("status", "")
        if new_status_for_floor in {"done", "failed", "cancelled"}:
            _enriched_confidence = 1.0
        else:
            try:
                from app.orchestration.progress.eta import BASE_FLOOR  # noqa: PLC0415
                _enriched_confidence = BASE_FLOOR
            except Exception:
                _enriched_confidence = 0.2

    prev_active_segment_id = current_job.get("active_segment_id") if current_job else None
    new_active_segment_id = updates.get("active_segment_id", merged.get("active_segment_id")) if updates else merged.get("active_segment_id")

    inferred_has_segment_support = any(
        value is not None
        for value in (
            merged.get("active_segment_id"),
            merged.get("active_segment_progress"),
            merged.get("active_segment_eta_seconds"),
        )
    ) or classification == "segment"

    if not skip_studio_job_event and (status_changed or prev_status is None or terminal_reset):
        lifecycle_event = build_job_lifecycle_event(
            job_id=job_id,
            status=str(merged.get("status") or "queued"),
            reason_code=merged.get("reason_code"),
            message=merged.get("message") or updates.get("message") or updates.get("log"),
            project_id=merged.get("project_id") or merged.get("parent_job_id"),
            chapter_id=merged.get("chapter_id"),
            parent_job_id=merged.get("parent_job_id"),
            source=source or _resolve_source("app.api.ws.broadcast_job_updated"),
            started_at=merged.get("started_at"),
            updated_at=merged.get("updated_at"),
            has_segment_support=inferred_has_segment_support,
            confidence=_enriched_confidence,
        )
        broadcast_studio_event(lifecycle_event)

    # W-PAR 003 (R-F): this block infers a single segment's completion from the
    # active_segment_id TRANSITION (prev -> new). It is correct and remains the
    # live emission path at cap=1/N=1 fan-out (INV-1) — the orchestrator only
    # ever tracks one active segment per chapter task today, so "transition"
    # and "this segment's own validated completion" are the same event. This
    # is NOT sufficient once fan-out > 1 is wired (task 005/enable-gate): with
    # N concurrent children there is no single prev->next handoff, and each
    # child's own SEGMENT_SAVED must drive its own scoped event independently.
    # Preserve exactly: failed/cancelled statuses map the segment's own status
    # through (not force "done"); only a clean completion is inferred as
    # SEGMENT_SAVED/"done".
    if prev_active_segment_id and prev_active_segment_id != new_active_segment_id:
        if not skip_studio_job_event:
            status = str(merged.get("status") or "running")
            seg_status = status if status in ("failed", "cancelled") else "done"
            seg_progress = 1.0
            seg_reason_code = "SEGMENT_SAVED" if seg_status == "done" else merged.get("reason_code")
            seg_index = current_job.get("active_render_group_index") or current_job.get("segment_index")
            seg_count = current_job.get("render_group_count") or current_job.get("segment_count")

            event = build_segment_progress_event(
                segment_id=prev_active_segment_id,
                status=seg_status,
                progress=seg_progress,
                segment_index=seg_index,
                segment_count=seg_count,
                message=updates.get("message") or updates.get("log") or merged.get("message"),
                reason_code=seg_reason_code,
                job_id=job_id,
                chapter_id=merged.get("chapter_id"),
                project_id=merged.get("project_id") or merged.get("parent_job_id"),
                source=source or _resolve_source("app.api.ws.broadcast_job_updated"),
                eta_seconds=None,
                has_segment_support=True,
            )
            broadcast_studio_event(event)

    def _emit_queue_item_status_frame() -> None:
        """Emit the queue.items status frame for this transition.

        queue.items is the sole row authority on the frontend (live-events.md
        §"Queue row authority"); every queue-visible status transition MUST be
        mirrored here or queue rows freeze at their last snapshot status.
        """
        q_status = str(merged.get("status") or "queued")
        q_message = merged.get("message") or updates.get("message") or updates.get("log")
        if q_status in ("failed", "cancelled"):
            q_message = merged.get("error") or updates.get("error") or q_message
        q_event = build_queue_item_status_event(
            job_id=job_id,
            status=q_status,
            progress=merged.get("progress") or 0.0,
            eta_seconds=_enriched_eta_seconds if _enriched_eta_seconds is not None else (updates.get("eta_seconds") or merged.get("eta_seconds")),
            message=q_message,
            reason_code=merged.get("reason_code"),
            classification="job",
            project_id=merged.get("project_id") or merged.get("parent_job_id"),
            chapter_id=merged.get("chapter_id"),
            started_at=merged.get("started_at"),
            completed_at=(merged.get("finished_at") or merged.get("completed_at")) if q_status in ("done", "failed", "cancelled") else None,
            custom_title=merged.get("custom_title"),
            engine=merged.get("engine"),
            produced_audio_length=merged.get("produced_audio_length") or merged.get("audio_length_seconds"),
            produced_chars=merged.get("produced_chars"),
            produced_segment_count=merged.get("produced_segment_count"),
            source=source or _resolve_source("app.api.ws.broadcast_job_updated"),
            confidence=_enriched_confidence,
            # W-PAR 003 (C2 contract): additive-only field (INV-1/INV-9) — absent
            # unless the orchestrator actually published a concurrent-segment
            # snapshot via `_publish(active_segments_map=...)`.
            active_segments_map=merged.get("active_segments_map"),
        )
        broadcast_studio_event(q_event)

    if classification == "chapter":
        if not skip_studio_job_event:
            status = str(merged.get("status") or "queued")
            message = None
            if status in ("failed", "cancelled"):
                message = merged.get("error") or updates.get("error")
            if not message:
                message = updates.get("message") or updates.get("log")

            if new_active_segment_id is not None:
                seg_p = merged.get("active_segment_progress")
                if seg_p is None:
                    seg_p = 0.0
                seg_index = merged.get("active_render_group_index") or merged.get("segment_index")
                seg_count = merged.get("render_group_count") or merged.get("segment_count")

                seg_event = build_segment_progress_event(
                    segment_id=new_active_segment_id,
                    status=status,
                    progress=seg_p,
                    segment_index=seg_index,
                    segment_count=seg_count,
                    message=message,
                    reason_code=merged.get("reason_code"),
                    job_id=job_id,
                    chapter_id=merged.get("chapter_id"),
                    project_id=merged.get("project_id") or merged.get("parent_job_id"),
                    source=source or _resolve_source("app.api.ws.broadcast_job_updated"),
                    eta_seconds=(
                        updates.get("active_segment_eta_seconds")
                        if updates.get("active_segment_eta_seconds") is not None
                        else merged.get("active_segment_eta_seconds")
                    ),
                    has_segment_support=True,
                    confidence=_enriched_confidence,
                )
                broadcast_studio_event(seg_event)

            event = build_chapter_progress_event(
                chapter_id=merged.get("chapter_id") or "",
                status=status,
                progress=merged.get("progress") or 0.0,
                grouped_progress=_enriched_grouped_progress if _enriched_grouped_progress is not None else merged.get("grouped_progress"),
                eta_seconds=_enriched_eta_seconds if _enriched_eta_seconds is not None else (updates.get("eta_seconds") or merged.get("eta_seconds")),
                message=message,
                reason_code=merged.get("reason_code"),
                render_group_count=merged.get("render_group_count"),
                completed_render_groups=merged.get("completed_render_groups"),
                job_id=job_id,
                project_id=merged.get("project_id"),
                source=source or _resolve_source("app.api.ws.broadcast_job_updated"),
                confidence=_enriched_confidence,
            )
            broadcast_studio_event(event)
        if not skip_job_updated and (status_changed or terminal_reset):
            _emit_queue_item_status_frame()
        return

    if classification == "segment":
        if not skip_studio_job_event:
            status = str(merged.get("status") or "running")
            message = None
            if status in ("failed", "cancelled"):
                message = merged.get("error") or updates.get("error")
            if not message:
                message = updates.get("message") or updates.get("log")

            event = build_segment_progress_event(
                segment_id=merged.get("active_segment_id") or merged.get("segment_id") or job_id,
                status=status,
                progress=merged.get("progress") or 0.0,
                segment_index=merged.get("active_render_group_index") or merged.get("segment_index"),
                segment_count=merged.get("render_group_count") or merged.get("segment_count"),
                message=message,
                reason_code=merged.get("reason_code"),
                job_id=job_id,
                chapter_id=merged.get("chapter_id"),
                project_id=merged.get("project_id") or merged.get("parent_job_id"),
                source=source or _resolve_source("app.api.ws.broadcast_job_updated"),
                eta_seconds=_enriched_eta_seconds if _enriched_eta_seconds is not None else (
                    updates.get("active_segment_eta_seconds")
                    if updates.get("active_segment_eta_seconds") is not None
                    else (
                        merged.get("active_segment_eta_seconds")
                        if merged.get("active_segment_eta_seconds") is not None
                        else (updates.get("eta_seconds") or merged.get("eta_seconds"))
                    )
                ),
                has_segment_support=True,
                confidence=_enriched_confidence,
            )
            broadcast_studio_event(event)
        if not skip_job_updated and (status_changed or terminal_reset):
            _emit_queue_item_status_frame()
        return

    if classification == "job":
        if not skip_studio_job_event and not skip_job_updated:
            prev_status = previous_status if previous_status is not None else (current_job.get("status") if current_job else None)
            new_status = updates.get("status", merged.get("status")) if updates else merged.get("status")
            status_changed = prev_status != new_status

            prev_progress = current_job.get("progress") if current_job else None
            new_progress = updates.get("progress", merged.get("progress")) if updates else merged.get("progress")
            progress_changed = prev_progress != new_progress

            prev_eta = current_job.get("eta_seconds") if current_job else None
            new_eta = updates.get("eta_seconds", merged.get("eta_seconds")) if updates else merged.get("eta_seconds")
            eta_changed = prev_eta != new_eta
            display_fields_changed = any(
                updates.get(field) is not None
                for field in (
                    "custom_title",
                    "engine",
                    "started_at",
                    "finished_at",
                    "completed_at",
                    "audio_length_seconds",
                    "produced_audio_length",
                    "produced_chars",
                    "produced_segment_count",
                )
            )

            if status_changed or progress_changed or eta_changed or updates.get("force_broadcast") or display_fields_changed:
                status = str(merged.get("status") or "queued")
                event = build_queue_item_status_event(
                    job_id=job_id,
                    status=status,
                    progress=merged.get("progress") or 0.0,
                    eta_seconds=_enriched_eta_seconds if _enriched_eta_seconds is not None else (updates.get("eta_seconds") or merged.get("eta_seconds")),
                    message=updates.get("message") or updates.get("log") or merged.get("message"),
                    reason_code=merged.get("reason_code"),
                    classification="job",
                    project_id=merged.get("project_id"),
                    chapter_id=merged.get("chapter_id"),
                    started_at=merged.get("started_at"),
                    completed_at=merged.get("finished_at") or merged.get("completed_at"),
                    custom_title=merged.get("custom_title"),
                    engine=merged.get("engine"),
                    produced_audio_length=merged.get("produced_audio_length") or merged.get("audio_length_seconds"),
                    produced_chars=merged.get("produced_chars"),
                    produced_segment_count=merged.get("produced_segment_count"),
                    source=source or _resolve_source("app.api.ws.broadcast_job_updated"),
                    confidence=_enriched_confidence,
                )
                broadcast_studio_event(event)
        return


def broadcast_segment_progress(job_id: str, chapter_id: str | None, segment_id: str, progress: float, source: str | None = None):
    # Option B (Task 004): this direct broadcaster carries its own ``progress`` and
    # is OUTSIDE the §4A enriched-confidence contract — no chapter/char_count/ETA
    # semantics here.  Do NOT route through enrich().
    # Task 005: the upcoming fail-loud confidence guard MUST be scoped to
    # chapter/queue job-progress frames only and MUST NOT fire on this broadcaster.
    with _terminal_latch_lock:
        if job_id in _terminal_latched_jobs:
            logger.debug("Dropped post-terminal segment progress for job %s (segment %s)", job_id, segment_id)
            return
    event = build_segment_progress_event(
        segment_id=segment_id,
        status="running",
        progress=progress,
        job_id=job_id,
        chapter_id=chapter_id,
        source=source or _resolve_source("app.api.ws.broadcast_segment_progress"),
        has_segment_support=True,
    )
    broadcast_studio_event(event)

def broadcast_test_progress(name: str, progress: float, started_at: float = None, job_id: str = None, source: str | None = None):
    # Option B (Task 004): this direct broadcaster carries its own ``progress`` and
    # is OUTSIDE the §4A enriched-confidence contract — voice-test frames have no
    # chapter/char_count/ETA semantics.  Do NOT route through enrich() and do NOT
    # add a confidence param to build_voice_test_progress_event.
    # Task 005: the upcoming fail-loud confidence guard MUST be scoped to
    # chapter/queue job-progress frames only and MUST NOT fire on this broadcaster.
    if not job_id:
        raise ValueError("broadcast_test_progress requires job_id")
    event = build_voice_test_progress_event(
        voice_name=name,
        status="running",
        progress=progress,
        started_at=started_at if started_at is not None else time.time(),
        job_id=job_id,
        source=source or _resolve_source("app.api.ws.broadcast_test_progress"),
    )
    broadcast_studio_event(event)


def broadcast_studio_event(event: dict) -> None:
    """Websocket transport facade for canonical studio_event envelopes."""
    from ..utils.socket_trace import trace_outbound_socket_frame
    trace_outbound_socket_frame(event)

    ids = event.get("ids", {})
    trace(
        "ws.broadcast_studio_event",
        topic=event.get("topic"),
        event_kind=event.get("eventKind"),
        job_id=ids.get("jobId"),
        project_id=ids.get("projectId"),
        chapter_id=ids.get("chapterId"),
        segment_id=ids.get("segmentId"),
        plugin_id=event.get("pluginId"),
    )
    manager.broadcast(event)
