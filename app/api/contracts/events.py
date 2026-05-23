"""Normalized websocket event contracts for Studio 2.0."""

from __future__ import annotations

import re
import sys
import time

if sys.version_info >= (3, 11):
    from typing import Literal, NotRequired, TypedDict
else:
    from typing import Literal, TypedDict
    from typing_extensions import NotRequired

StudioJobStatus = Literal["queued", "preparing", "running", "finalizing", "done", "failed", "cancelled"]
StudioJobClassification = Literal["job", "chapter", "segment"]
StudioJobEventScope = Literal["job", "queue", "chapter", "segment", "export", "voice_test", "voice_build"]
StudioEtaBasis = Literal["remaining_from_update", "total_from_start"]
TtsLogLineMarker = Literal["START_SYNTHESIS", "START_SEGMENT", "PROGRESS", "SEGMENT_SAVED", "raw"]


class StudioJobEvent(TypedDict, total=False):
    """Canonical normalized job event payload shared by backend and frontend."""

    type: Literal["studio_job_event"]
    source: NotRequired[str]
    classification: NotRequired[StudioJobClassification]
    job_id: str
    parent_job_id: NotRequired[str | None]
    scope: StudioJobEventScope
    status: StudioJobStatus
    progress: NotRequired[float | None]
    eta_seconds: NotRequired[int | None]
    estimated_end_at: NotRequired[float | None]
    eta_basis: NotRequired[StudioEtaBasis]
    eta_confidence: NotRequired[Literal["estimating", "stable", "recomputing"]]
    message: NotRequired[str | None]
    reason_code: NotRequired[str | None]
    updated_at: NotRequired[float | None]
    started_at: NotRequired[float | None]
    active_render_batch_id: NotRequired[str | None]
    active_render_batch_progress: NotRequired[float | None]
    active_segment_id: NotRequired[str | None]
    active_segment_progress: NotRequired[float | None]
    render_group_count: NotRequired[int | None]
    completed_render_groups: NotRequired[int | None]
    active_render_group_index: NotRequired[int | None]
    total_render_weight: NotRequired[int | None]
    completed_render_weight: NotRequired[int | None]
    active_render_group_weight: NotRequired[int | None]
    grouped_progress: NotRequired[float | None]


class TtsLogLineEvent(TypedDict, total=False):
    """Diagnostic raw TTS log event for correlating bridge output with websocket fan-out."""

    type: Literal["tts_log_line"]
    source: NotRequired[str]
    job_id: str
    project_id: NotRequired[str | None]
    chapter_id: NotRequired[str | None]
    line: str
    marker: TtsLogLineMarker
    sequence: int
    received_at: float


def classify_tts_log_line(line: str) -> TtsLogLineMarker:
    """Classify known TTS bridge marker lines without changing their raw text."""
    if "[START_SYNTHESIS]" in line:
        return "START_SYNTHESIS"
    if "[START_SEGMENT]" in line:
        return "START_SEGMENT"
    if "[PROGRESS]" in line:
        return "PROGRESS"
    if "[SEGMENT_SAVED]" in line:
        return "SEGMENT_SAVED"
    return "raw"


def build_tts_log_line_event(
    *,
    job_id: str,
    project_id: str | None,
    chapter_id: str | None,
    line: str,
    sequence: int,
    received_at: float,
    source: str | None = None,
) -> TtsLogLineEvent:
    """Build a diagnostic raw TTS log event payload."""
    event: TtsLogLineEvent = {
        "type": "tts_log_line",
        "job_id": str(job_id),
        "project_id": project_id,
        "chapter_id": chapter_id,
        "line": line.rstrip("\n"),
        "marker": classify_tts_log_line(line),
        "sequence": int(sequence),
        "received_at": float(received_at),
    }
    if source is not None:
        event["source"] = source
    return event


def build_studio_job_event(
    *,
    job_id: str,
    status: StudioJobStatus,
    scope: StudioJobEventScope = "job",
    parent_job_id: str | None = None,
    progress: float | None = None,
    eta_seconds: int | None = None,
    estimated_end_at: float | None = None,
    eta_basis: StudioEtaBasis | None = None,
    eta_confidence: Literal["estimating", "stable", "recomputing"] | None = None,
    message: str | None = None,
    reason_code: str | None = None,
    updated_at: float | None = None,
    started_at: float | None = None,
    active_render_batch_id: str | None = None,
    active_render_batch_progress: float | None = None,
    active_segment_id: str | None = None,
    active_segment_progress: float | None = None,
    render_group_count: int | None = None,
    completed_render_groups: int | None = None,
    active_render_group_index: int | None = None,
    total_render_weight: int | None = None,
    completed_render_weight: int | None = None,
    active_render_group_weight: int | None = None,
    grouped_progress: float | None = None,
    classification: StudioJobClassification | None = None,
    source: str | None = None,
) -> StudioJobEvent:
    """Build a normalized job event payload."""

    event: StudioJobEvent = {
        "type": "studio_job_event",
        "job_id": str(job_id),
        "scope": scope,
        "status": status,
    }
    if parent_job_id is not None:
        event["parent_job_id"] = parent_job_id
    if progress is not None:
        event["progress"] = round(float(progress), 2)
    if eta_seconds is not None:
        event["eta_seconds"] = int(eta_seconds)
    if estimated_end_at is not None:
        event["estimated_end_at"] = float(estimated_end_at)
    if eta_basis is not None:
        event["eta_basis"] = eta_basis
    if eta_confidence is not None:
        event["eta_confidence"] = eta_confidence
    if message is not None:
        event["message"] = message
    if reason_code is not None:
        event["reason_code"] = reason_code
    if updated_at is not None:
        event["updated_at"] = updated_at
    if started_at is not None:
        event["started_at"] = started_at
    if active_render_batch_id is not None:
        event["active_render_batch_id"] = active_render_batch_id
    if active_render_batch_progress is not None:
        event["active_render_batch_progress"] = round(float(active_render_batch_progress), 2)
    if active_segment_id is not None:
        event["active_segment_id"] = active_segment_id
        if active_segment_progress is not None:
            event["active_segment_progress"] = round(float(active_segment_progress), 2)
    if render_group_count is not None:
        event["render_group_count"] = int(render_group_count)
    if completed_render_groups is not None:
        event["completed_render_groups"] = int(completed_render_groups)
    if active_render_group_index is not None:
        event["active_render_group_index"] = int(active_render_group_index)
    if total_render_weight is not None:
        event["total_render_weight"] = int(total_render_weight)
    if completed_render_weight is not None:
        event["completed_render_weight"] = int(completed_render_weight)
    if active_render_group_weight is not None:
        event["active_render_group_weight"] = int(active_render_group_weight)
    if grouped_progress is not None:
        event["grouped_progress"] = round(float(grouped_progress), 2)
    if classification is not None:
        event["classification"] = classification
    if source is not None:
        event["source"] = source
    return event


def is_studio_job_event(value: object) -> bool:
    """Return whether a value looks like a normalized studio job event."""

    if not isinstance(value, dict):
        return False
    return value.get("type") == "studio_job_event" and isinstance(value.get("job_id"), str) and isinstance(value.get("status"), str)


class StudioEventIds(TypedDict, total=False):
    projectId: NotRequired[str | None]
    chapterId: NotRequired[str | None]
    jobId: NotRequired[str | None]
    segmentId: NotRequired[str | None]


class StudioEventEnvelope(TypedDict, total=False):
    type: Literal["studio_event"]
    version: int
    topic: str
    eventKind: str
    source: str
    emittedAt: float
    pluginId: NotRequired[str | None]
    ids: StudioEventIds
    payload: dict


# --- Phase 1 Studio Event Broadcaster Helper Builders ---

CORE_TOPICS = {
    "queue.items",
    "chapters.lifecycle",
    "chapters.progress",
    "segments.lifecycle",
    "segments.progress",
    "tts.logs",
    "voice.test",
    "system.events",
    "projects.lifecycle",
}


def _resolve_source_path() -> str:
    """Helper to walk the stack and extract calling function namespace."""
    try:
        frame = sys._getframe(2)
        module = frame.f_globals.get("__name__", "")
        function = frame.f_code.co_name
        if module and function:
            return f"{module}.{function}"
        return "app.api.contracts.events"
    except Exception:
        return "app.api.contracts.events"


def build_studio_event(
    topic: str,
    event_kind: str,
    payload: dict,
    plugin_id: str | None = None,
    project_id: str | None = None,
    chapter_id: str | None = None,
    job_id: str | None = None,
    segment_id: str | None = None,
    source: str | None = None,
) -> dict:
    """Build a canonical studio_event envelope."""
    return {
        "type": "studio_event",
        "version": 1,
        "topic": topic,
        "eventKind": event_kind,
        "source": source or _resolve_source_path(),
        "emittedAt": time.time(),
        "pluginId": plugin_id,
        "ids": {
            "projectId": project_id,
            "chapterId": chapter_id,
            "jobId": job_id,
            "segmentId": segment_id
        },
        "payload": payload
    }


def build_tts_log_event(
    line: str,
    level: str,
    sequence: int,
    plugin_id: str | None = None,
    job_id: str | None = None,
    chapter_id: str | None = None,
    project_id: str | None = None,
    received_at: float | None = None,
    source: str | None = None,
) -> dict:
    """Build a tts.logs topic envelope."""
    resolved_source = source or _resolve_source_path()
    payload = {
        "line": line.rstrip("\n"),
        "level": level,
        "sequence": int(sequence),
        "pluginId": plugin_id,
        "jobId": job_id,
        "chapterId": chapter_id,
        "source": resolved_source,
        "marker": classify_tts_log_line(line),
        "received_at": received_at,  # Legacy compatibility
        "backendReceivedAt": received_at,  # camelCase variant
    }
    return build_studio_event(
        topic="tts.logs",
        event_kind="tts_log",
        payload=payload,
        plugin_id=plugin_id,
        project_id=project_id,
        chapter_id=chapter_id,
        job_id=job_id,
        source=resolved_source
    )


def build_queue_item_status_event(
    job_id: str,
    status: str,
    progress: float,
    eta_seconds: int | None = None,
    message: str | None = None,
    reason_code: str | None = None,
    classification: str = "job",
) -> dict:
    """Build a queue.items status envelope."""
    payload = {
        "status": status,
        "progress": round(float(progress), 2),
        "etaSeconds": eta_seconds,
        "message": message,
        "reasonCode": reason_code,
        "classification": classification,
        "changedFields": None
    }
    return build_studio_event(
        topic="queue.items",
        event_kind="queue_item_status",
        payload=payload,
        job_id=job_id,
        source=_resolve_source_path()
    )


def build_queue_item_invalidated_event(
    reason: str,
    changed_fields: list[str],
    job_id: str | None = None,
    project_id: str | None = None,
    source: str | None = None,
) -> dict:
    """Build a queue.items invalidated envelope."""
    payload = {
        "status": "queued",
        "progress": 0.0,
        "etaSeconds": None,
        "message": reason,
        "reasonCode": "queue_invalidated",
        "classification": "job",
        "changedFields": changed_fields,
        "changed_fields": changed_fields,  # Legacy compatibility
    }
    return build_studio_event(
        topic="queue.items",
        event_kind="queue_item_invalidated",
        payload=payload,
        project_id=project_id,
        job_id=job_id,
        source=source or _resolve_source_path()
    )


def build_queue_paused_event(paused: bool, source: str | None = None) -> dict:
    """Build a queue.items paused envelope."""
    payload = {
        "status": "queued",
        "progress": 0.0,
        "etaSeconds": None,
        "message": "Queue pause status changed",
        "reasonCode": "queue_paused",
        "classification": "job",
        "changedFields": ["paused"],
        "paused": paused,
        "changed_fields": ["paused"],  # Legacy compatibility
    }
    return build_studio_event(
        topic="queue.items",
        event_kind="queue_paused",
        payload=payload,
        source=source or _resolve_source_path()
    )


def build_chapter_progress_event(
    chapter_id: str,
    status: str,
    progress: float,
    grouped_progress: float | None = None,
    eta_seconds: int | None = None,
    message: str | None = None,
    reason_code: str | None = None,
    render_group_count: int | None = None,
    completed_render_groups: int | None = None,
    job_id: str | None = None,
    project_id: str | None = None,
    source: str | None = None,
) -> dict:
    """Build a chapters.progress topic envelope."""
    payload = {
        "status": status,
        "progress": round(float(progress), 2),
        "groupedProgress": round(float(grouped_progress), 2) if grouped_progress is not None else None,
        "etaSeconds": eta_seconds,
        "message": message,
        "reasonCode": reason_code,
        "renderGroupCount": render_group_count,
        "completedRenderGroups": completed_render_groups,
        # Legacy compatibility duplicate fields
        "grouped_progress": round(float(grouped_progress), 2) if grouped_progress is not None else None,
        "eta_seconds": eta_seconds,
        "reason_code": reason_code,
        "render_group_count": render_group_count,
        "completed_render_groups": completed_render_groups,
    }
    resolved_source = source or _resolve_source_path()
    return build_studio_event(
        topic="chapters.progress",
        event_kind="chapter_progress",
        payload=payload,
        project_id=project_id,
        chapter_id=chapter_id,
        job_id=job_id,
        source=resolved_source
    )



def build_segment_progress_event(
    segment_id: str,
    status: str,
    progress: float,
    segment_index: int | None = None,
    segment_count: int | None = None,
    message: str | None = None,
    reason_code: str | None = None,
    job_id: str | None = None,
    chapter_id: str | None = None,
    project_id: str | None = None,
    source: str | None = None,
    eta_seconds: int | None = None,
) -> dict:
    """Build a segments.progress topic envelope."""
    payload = {
        "status": status,
        "progress": round(float(progress), 2),
        "segmentIndex": segment_index,
        "segmentCount": segment_count,
        "message": message,
        "reasonCode": reason_code,
        "reason_code": reason_code,  # Legacy compatibility
        "activeSegmentId": segment_id,
        "activeSegmentProgress": round(float(progress), 2),
        "active_segment_id": segment_id,
        "active_segment_progress": round(float(progress), 2),
        "etaSeconds": eta_seconds,
        "eta_seconds": eta_seconds,
    }
    return build_studio_event(
        topic="segments.progress",
        event_kind="segment_progress",
        payload=payload,
        project_id=project_id,
        chapter_id=chapter_id,
        job_id=job_id,
        segment_id=segment_id,
        source=source or _resolve_source_path()
    )



def build_segment_lifecycle_event(
    chapter_id: str,
    reason: str,
    changed_fields: list[str],
    project_id: str | None = None,
    job_id: str | None = None,
    source: str | None = None,
) -> dict:
    """Build a segments.lifecycle topic envelope."""
    payload = {
        "reason": reason,
        "changedFields": changed_fields,
        "changed_fields": changed_fields,  # Legacy compatibility
    }
    return build_studio_event(
        topic="segments.lifecycle",
        event_kind="segment_lifecycle",
        payload=payload,
        project_id=project_id,
        chapter_id=chapter_id,
        job_id=job_id,
        source=source or _resolve_source_path()
    )


def build_chapter_lifecycle_event(
    chapter_id: str,
    reason: str,
    changed_fields: list[str],
    project_id: str | None = None,
    job_id: str | None = None,
    source: str | None = None,
) -> dict:
    """Build a chapters.lifecycle topic envelope."""
    payload = {
        "reason": reason,
        "changedFields": changed_fields,
        "changed_fields": changed_fields,  # Legacy compatibility
    }
    return build_studio_event(
        topic="chapters.lifecycle",
        event_kind="chapter_lifecycle",
        payload=payload,
        project_id=project_id,
        chapter_id=chapter_id,
        job_id=job_id,
        source=source or _resolve_source_path()
    )


def build_project_lifecycle_event(
    project_id: str,
    reason: str,
    changed_fields: list[str],
    job_id: str | None = None,
    source: str | None = None,
) -> dict:
    """Build a projects.lifecycle topic envelope."""
    payload = {
        "reason": reason,
        "changedFields": changed_fields,
        "changed_fields": changed_fields,  # Legacy compatibility
    }
    return build_studio_event(
        topic="projects.lifecycle",
        event_kind="project_invalidated",
        payload=payload,
        project_id=project_id,
        job_id=job_id,
        source=source or _resolve_source_path()
    )


def build_voice_test_progress_event(
    voice_name: str,
    status: str,
    progress: float,
    started_at: float,
    message: str | None = None,
    source: str | None = None,
) -> dict:
    """Build a voice.test topic envelope."""
    payload = {
        "voiceName": voice_name,
        "status": status,
        "progress": round(float(progress), 2),
        "startedAt": float(started_at),
        "message": message,
        "name": voice_name,
        "started_at": float(started_at),  # Legacy compatibility
    }
    return build_studio_event(
        topic="voice.test",
        event_kind="voice_test_progress",
        payload=payload,
        source=source or _resolve_source_path()
    )


def build_system_event(
    event_kind: str,
    message: str,
    details: dict,
) -> dict:
    """Build a system.events topic envelope."""
    payload = {
        "eventKind": event_kind,
        "message": message,
        "details": details
    }
    return build_studio_event(
        topic="system.events",
        event_kind=event_kind,
        payload=payload,
        source=_resolve_source_path()
    )


def build_plugin_event(
    plugin_id: str,
    area: str,
    event_kind: str,
    payload: dict,
    project_id: str | None = None,
    chapter_id: str | None = None,
    job_id: str | None = None,
    segment_id: str | None = None,
) -> dict:
    """Build a plugin-private namespaced topic envelope under plugins.<plugin_id>.<area>."""
    if not plugin_id or not isinstance(plugin_id, str):
        raise ValueError("plugin_id must be a non-empty string")
    if not re.match(r"^[a-zA-Z0-9_-]+$", plugin_id):
        raise ValueError(f"Invalid plugin_id format: {plugin_id}")
    if not area or not isinstance(area, str):
        raise ValueError("area must be a non-empty string")
    if not re.match(r"^[a-zA-Z0-9_-]+$", area):
        raise ValueError(f"area must be a valid alphanumeric or hyphenated/underscored string, got: {area}")

    topic = f"plugins.{plugin_id}.{area}"
    if topic in CORE_TOPICS:
        raise ValueError(f"Plugin topic cannot conflict with core topic: {topic}")

    return build_studio_event(
        topic=topic,
        event_kind=event_kind,
        payload=payload,
        plugin_id=plugin_id,
        project_id=project_id,
        chapter_id=chapter_id,
        job_id=job_id,
        segment_id=segment_id,
        source=_resolve_source_path()
    )
