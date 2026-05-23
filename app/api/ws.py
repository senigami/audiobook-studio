from __future__ import annotations
import asyncio
import logging
import sys
import threading
import time
from typing import List
from fastapi import WebSocket

from .contracts.events import (
    build_studio_job_event,
    build_tts_log_line_event,
    build_queue_item_invalidated_event,
    build_queue_paused_event,
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
    if job.get("parent_job_id"):
        return "segment"
    if job.get("chapter_id"):
        return "chapter"
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
) -> None:
    payload = build_tts_log_line_event(
        job_id=job_id,
        project_id=project_id,
        chapter_id=chapter_id,
        line=line,
        sequence=_next_tts_log_line_sequence(job_id),
        received_at=received_at if received_at is not None else time.time(),
        source=source or _resolve_source("app.api.ws.broadcast_tts_log_line"),
    )
    trace(
        "ws.broadcast_tts_log_line",
        job_id=job_id,
        project_id=project_id,
        chapter_id=chapter_id,
        marker=payload["marker"],
        sequence=payload["sequence"],
    )
    manager.broadcast(payload)

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
    payload = {
        "type": "segments_updated",
        "chapter_id": chapter_id,
        "source": source or _resolve_source("app.api.ws.broadcast_segments_updated"),
    }
    if reason is not None:
        payload["reason"] = reason
    if job_id is not None:
        payload["job_id"] = job_id
    if project_id is not None:
        payload["project_id"] = project_id
    if changed_fields is not None:
        payload["changed_fields"] = changed_fields
    manager.broadcast(payload)


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
    payload = {
        "type": "chapter_updated",
        "chapter_id": chapter_id,
        "source": source or _resolve_source("app.api.ws.broadcast_chapter_updated"),
    }
    if reason is not None:
        payload["reason"] = reason
    if job_id is not None:
        payload["job_id"] = job_id
    if project_id is not None:
        payload["project_id"] = project_id
    if changed_fields is not None:
        payload["changed_fields"] = changed_fields
    manager.broadcast(payload)


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
    payload = {
        "type": "project_updated",
        "project_id": project_id,
        "source": source or _resolve_source("app.api.ws.broadcast_project_updated"),
    }
    if reason is not None:
        payload["reason"] = reason
    if job_id is not None:
        payload["job_id"] = job_id
    if changed_fields is not None:
        payload["changed_fields"] = changed_fields
    manager.broadcast(payload)

def broadcast_pause_state(paused: bool, source: str | None = None):
    event = build_queue_paused_event(
        paused=paused,
        source=source or _resolve_source("app.api.ws.broadcast_pause_state"),
    )
    broadcast_studio_event(event)

def broadcast_job_updated(job_id: str, updates: dict, current_job: dict | None = None, source: str | None = None):
    skip_studio_job_event = False
    skip_job_updated = False
    source_from_updates = None
    if updates:
        skip_studio_job_event = updates.pop("skip_studio_job_event", False)
        skip_job_updated = updates.pop("skip_job_updated", False)
        source_from_updates = updates.pop("source", None)

    source = source or source_from_updates
    merged = dict(current_job or {})
    merged.update(updates or {})
    merged.pop("skip_studio_job_event", None)
    merged.pop("skip_job_updated", None)
    merged.pop("source", None)
    classification = _classify_job_payload(merged)
    merged["classification"] = classification

    status = str(merged.get("status") or "queued")
    message = None
    if status in ("failed", "cancelled"):
        message = merged.get("error") or updates.get("error")
    if not message:
        message = updates.get("message") or updates.get("log")
    normalized = build_studio_job_event(
        job_id=job_id,
        status=status,
        scope="job",
        parent_job_id=merged.get("parent_job_id"),
        progress=merged.get("progress"),
        eta_seconds=updates.get("eta_seconds"),
        eta_basis=updates.get("eta_basis"),
        estimated_end_at=updates.get("estimated_end_at"),
        message=message,
        reason_code=merged.get("reason_code"),
        updated_at=merged.get("updated_at"),
        started_at=merged.get("started_at"),
        active_render_batch_id=merged.get("active_render_batch_id"),
        active_render_batch_progress=merged.get("active_render_batch_progress"),
        active_segment_id=merged.get("active_segment_id"),
        active_segment_progress=merged.get("active_segment_progress"),
        render_group_count=merged.get("render_group_count"),
        completed_render_groups=merged.get("completed_render_groups"),
        active_render_group_index=merged.get("active_render_group_index"),
        total_render_weight=merged.get("total_render_weight"),
        completed_render_weight=merged.get("completed_render_weight"),
        active_render_group_weight=merged.get("active_render_group_weight"),
        grouped_progress=merged.get("grouped_progress"),
        classification=classification,
        source=source or _resolve_source("app.api.ws.broadcast_job_updated"),
    )
    trace(
        "ws.broadcast_job_updated",
        job_id=job_id,
        updates=updates,
        current_job=current_job,
        normalized_event=normalized,
    )
    if not skip_studio_job_event:
        manager.broadcast(normalized)
    if not skip_job_updated:
        manager.broadcast({
            "type": "job_updated",
            "job_id": job_id,
            "updates": merged,
            "classification": classification,
            "source": source or _resolve_source("app.api.ws.broadcast_job_updated"),
        })


def broadcast_segment_progress(job_id: str, chapter_id: str | None, segment_id: str, progress: float, source: str | None = None):
    manager.broadcast({
        "type": "segment_progress",
        "job_id": job_id,
        "chapter_id": chapter_id,
        "segment_id": segment_id,
        "progress": progress,
        "source": source or _resolve_source("app.api.ws.broadcast_segment_progress"),
    })

def broadcast_test_progress(name: str, progress: float, started_at: float = None, source: str | None = None):
    manager.broadcast({
        "type": "test_progress",
        "name": name,
        "progress": progress,
        "started_at": started_at,
        "source": source or _resolve_source("app.api.ws.broadcast_test_progress"),
    })


def broadcast_studio_event(event: dict) -> None:
    """Websocket transport facade for canonical studio_event envelopes."""
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
