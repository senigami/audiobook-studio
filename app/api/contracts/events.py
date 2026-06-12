"""Normalized websocket event contracts for Studio 2.0."""

from __future__ import annotations

import re
import sys
import time
from enum import Enum

if sys.version_info >= (3, 11):
    from typing import Literal, NotRequired, TypedDict
else:
    from typing import Literal, TypedDict
    from typing_extensions import NotRequired

class JobLifecycleCommand(str, Enum):
    JOB_QUEUED = "JOB_QUEUED"
    JOB_PREPARING = "JOB_PREPARING"
    START_SYNTHESIS = "START_SYNTHESIS"
    START_SEGMENT = "START_SEGMENT"
    SEGMENT_PENDING = "SEGMENT_PENDING"
    SEGMENT_PROGRESS = "SEGMENT_PROGRESS"
    SEGMENT_SAVED = "SEGMENT_SAVED"
    JOB_RESET_TO_ACTIVE = "JOB_RESET_TO_ACTIVE"
    JOB_FINALIZING = "JOB_FINALIZING"
    JOB_DONE = "JOB_DONE"
    JOB_FAILED = "JOB_FAILED"
    QUEUE_INVALIDATED = "QUEUE_INVALIDATED"

JOB_LIFECYCLE_COMMANDS = {
    JobLifecycleCommand.JOB_QUEUED,
    JobLifecycleCommand.JOB_PREPARING,
    JobLifecycleCommand.START_SYNTHESIS,
    JobLifecycleCommand.JOB_RESET_TO_ACTIVE,
    JobLifecycleCommand.JOB_FINALIZING,
    JobLifecycleCommand.JOB_DONE,
    JobLifecycleCommand.JOB_FAILED,
    JobLifecycleCommand.QUEUE_INVALIDATED,
    "JOB_QUEUED",
    "JOB_PREPARING",
    "START_SYNTHESIS",
    "JOB_RESET_TO_ACTIVE",
    "JOB_FINALIZING",
    "JOB_DONE",
    "JOB_FAILED",
    "QUEUE_INVALIDATED",
}

COMMAND_TOPIC_SCOPES = {
    "jobs.lifecycle": JOB_LIFECYCLE_COMMANDS,
    "queue.items": {
        JobLifecycleCommand.JOB_QUEUED,
        JobLifecycleCommand.JOB_PREPARING,
        JobLifecycleCommand.START_SYNTHESIS,
        JobLifecycleCommand.JOB_RESET_TO_ACTIVE,
        JobLifecycleCommand.JOB_FINALIZING,
        JobLifecycleCommand.JOB_DONE,
        JobLifecycleCommand.JOB_FAILED,
        JobLifecycleCommand.QUEUE_INVALIDATED,
        # Allow string versions
        "JOB_QUEUED",
        "JOB_PREPARING",
        "START_SYNTHESIS",
        "JOB_RESET_TO_ACTIVE",
        "JOB_FINALIZING",
        "JOB_DONE",
        "JOB_FAILED",
        "QUEUE_INVALIDATED",
    },
    "chapters.progress": {
        JobLifecycleCommand.JOB_PREPARING,
        JobLifecycleCommand.START_SYNTHESIS,
        # Segment-capable engines publish START_SEGMENT at each render-group start;
        # chapter progress frames surface it so the UI can show the phase reason.
        # SEGMENT_PENDING is the announce-time frame (before engine confirmation).
        JobLifecycleCommand.START_SEGMENT,
        JobLifecycleCommand.SEGMENT_PENDING,
        JobLifecycleCommand.JOB_RESET_TO_ACTIVE,
        JobLifecycleCommand.JOB_FINALIZING,
        JobLifecycleCommand.JOB_DONE,
        JobLifecycleCommand.JOB_FAILED,
        # Allow string versions
        "JOB_PREPARING",
        "START_SYNTHESIS",
        "START_SEGMENT",
        "SEGMENT_PENDING",
        "JOB_RESET_TO_ACTIVE",
        "JOB_FINALIZING",
        "JOB_DONE",
        "JOB_FAILED",
    },
    "segments.progress": {
        JobLifecycleCommand.START_SEGMENT,
        JobLifecycleCommand.SEGMENT_PENDING,
        JobLifecycleCommand.SEGMENT_PROGRESS,
        JobLifecycleCommand.SEGMENT_SAVED,
        # Allow string versions
        "START_SEGMENT",
        "SEGMENT_PENDING",
        "SEGMENT_PROGRESS",
        "SEGMENT_SAVED",
    },
}

LEGACY_TO_CANONICAL = {
    "queued": "JOB_QUEUED",
    "preparing": "JOB_PREPARING",
    "synthesis_start": "START_SYNTHESIS",
    "segment_start": "START_SEGMENT",
    "synthesis_progress": "SEGMENT_PROGRESS",
    "segment_saved": "SEGMENT_SAVED",
    "job_reset_to_active": "JOB_RESET_TO_ACTIVE",
    "finalizing": "JOB_FINALIZING",
    "done": "JOB_DONE",
    "completed": "JOB_DONE",
    "failed": "JOB_FAILED",
    "cancelled": "JOB_FAILED",
    "queue_paused": "QUEUE_INVALIDATED",
    "queue_update": "QUEUE_INVALIDATED",
    "queue_item_invalidated": "QUEUE_INVALIDATED",
}

SEGMENT_SCOPED_COMMANDS = {
    JobLifecycleCommand.START_SEGMENT,
    JobLifecycleCommand.SEGMENT_PROGRESS,
    JobLifecycleCommand.SEGMENT_SAVED,
    "START_SEGMENT",
    "SEGMENT_PROGRESS",
    "SEGMENT_SAVED",
    "segment_start",
    "synthesis_progress",
    "segment_saved",
}

def is_command_allowed_for_topic(command: str | None, topic: str) -> bool:
    if not command:
        return True
    allowed_commands = COMMAND_TOPIC_SCOPES.get(topic)
    if allowed_commands is None:
        return True
    return command in allowed_commands

def normalize_to_canonical_command(
    reason_code: str | None,
    status: str | None = None,
    has_segment_support: bool = False
) -> str | None:
    canonical = None
    if reason_code:
        try:
            canonical = JobLifecycleCommand(reason_code).value
        except ValueError:
            pass
        if not canonical:
            canonical = LEGACY_TO_CANONICAL.get(reason_code)
        if not canonical:
            canonical = reason_code
    elif status:
        status_map = {
            "queued": "JOB_QUEUED",
            "preparing": "JOB_PREPARING",
            "finalizing": "JOB_FINALIZING",
            "done": "JOB_DONE",
            "completed": "JOB_DONE",
            "failed": "JOB_FAILED",
            "cancelled": "JOB_FAILED",
        }
        canonical = status_map.get(status)

    if not has_segment_support and canonical:
        if canonical in ("START_SEGMENT", "segment_start"):
            return "START_SYNTHESIS"
        elif canonical in ("SEGMENT_PROGRESS", "synthesis_progress", "SEGMENT_SAVED", "segment_saved"):
            return None

    return canonical


def compute_progress_confidence(
    status: str | None,
    progress: float | None,
    active_render_group_weight: int | None = None,
    reason_code: str | None = None,
) -> float | None:
    if not status:
        return None
    if progress == 0:
        return 1.0
    if status in ("done", "failed", "cancelled", "finalizing"):
        return 1.0
    if progress is None:
        return None

    chunk_char_limit = 3000
    coverage_ratio = 1.0
    if active_render_group_weight is not None and active_render_group_weight > 0:
        coverage_ratio = max(0.0, min(float(active_render_group_weight) / chunk_char_limit, 1.0))

    return float(coverage_ratio * max(0.0, min(float(progress), 1.0)))


StudioJobStatus = Literal["queued", "preparing", "running", "finalizing", "done", "failed", "cancelled"]
StudioJobClassification = Literal["job", "chapter", "segment"]
StudioJobEventScope = Literal["job", "queue", "chapter", "segment", "export", "voice_test", "voice_build"]
StudioEtaBasis = Literal["remaining_from_update", "total_from_start"]
TtsLogLineMarker = Literal["START_SYNTHESIS", "START_SEGMENT", "PROGRESS", "SEGMENT_SAVED", "raw"]


def classify_tts_log_line(line: str, engine_id: str | None = None) -> str:
    """Classify known TTS bridge marker lines without changing their raw text."""
    if engine_id:
        try:
            from app.engines.behavior import match_timing_marker
            matched = match_timing_marker(engine_id, line)
            if matched:
                return matched
        except Exception:
            pass

    if "[START_SYNTHESIS]" in line:
        return "START_SYNTHESIS"
    if "[START_SEGMENT]" in line:
        return "START_SEGMENT"
    if "[PROGRESS]" in line:
        return "PROGRESS"
    if "[SEGMENT_SAVED]" in line:
        return "SEGMENT_SAVED"
    return "raw"





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


class JobLifecyclePayload(TypedDict, total=False):
    status: StudioJobStatus
    reasonCode: NotRequired[str | None]
    reason_code: NotRequired[str | None]
    message: NotRequired[str | None]
    startedAt: NotRequired[float | None]
    started_at: NotRequired[float | None]
    updatedAt: NotRequired[float | None]
    updated_at: NotRequired[float | None]
    hasSegmentSupport: NotRequired[bool | None]
    has_segment_support: NotRequired[bool | None]
    parentJobId: NotRequired[str | None]
    parent_job_id: NotRequired[str | None]


class JobLifecycleLiveEvent(TypedDict, total=False):
    topic: Literal["jobs.lifecycle"]
    category: Literal["job"]
    eventKind: Literal["job_lifecycle"]


# --- Phase 1 Studio Event Broadcaster Helper Builders ---

CORE_TOPICS = {
    "jobs.lifecycle",
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
    plugin_short_name: str | None = None,
) -> dict:
    """Build a tts.logs topic envelope."""
    resolved_source = source or _resolve_source_path()
    payload = {
        "line": line.rstrip("\n"),
        "level": level,
        "sequence": int(sequence),
        "pluginId": plugin_id,
        "pluginShortName": plugin_short_name,
        "jobId": job_id,
        "chapterId": chapter_id,
        "source": resolved_source,
        "marker": classify_tts_log_line(line, plugin_id),
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


def build_job_lifecycle_event(
    job_id: str,
    status: str,
    reason_code: str | None = None,
    message: str | None = None,
    project_id: str | None = None,
    chapter_id: str | None = None,
    parent_job_id: str | None = None,
    source: str | None = None,
    started_at: float | None = None,
    updated_at: float | None = None,
    has_segment_support: bool | None = None,
    confidence: float | None = None,
) -> dict:
    """Build a jobs.lifecycle envelope with global job state only."""
    mapped_status = status
    canonical_command = normalize_to_canonical_command(reason_code, status, has_segment_support)
    if canonical_command is None:
        lifecycle_status_map = {
            "queued": "JOB_QUEUED",
            "preparing": "JOB_PREPARING",
            "running": "START_SYNTHESIS",
            "finalizing": "JOB_FINALIZING",
            "done": "JOB_DONE",
            "completed": "JOB_DONE",
            "failed": "JOB_FAILED",
            "cancelled": "JOB_FAILED",
        }
        canonical_command = lifecycle_status_map.get(status)
    if not is_command_allowed_for_topic(canonical_command, "jobs.lifecycle"):
        canonical_command = None

    resolved_updated_at = float(updated_at if updated_at is not None else time.time())
    payload = {
        "status": mapped_status,
        "reasonCode": canonical_command,
        "message": message,
        "startedAt": started_at,
        "updatedAt": resolved_updated_at,
        "hasSegmentSupport": has_segment_support,
        "parentJobId": parent_job_id,
    }
    return build_studio_event(
        topic="jobs.lifecycle",
        event_kind="job_lifecycle",
        payload=payload,
        project_id=project_id,
        chapter_id=chapter_id,
        job_id=job_id,
        source=source or _resolve_source_path(),
    )


def build_queue_item_status_event(
    job_id: str,
    status: str,
    progress: float,
    eta_seconds: int | None = None,
    message: str | None = None,
    reason_code: str | None = None,
    classification: str = "job",
    project_id: str | None = None,
    chapter_id: str | None = None,
    started_at: float | None = None,
    completed_at: float | None = None,
    custom_title: str | None = None,
    engine: str | None = None,
    produced_audio_length: float | None = None,
    produced_chars: int | None = None,
    produced_segment_count: int | None = None,
    source: str | None = None,
    paused: bool | None = None,
    has_segment_support: bool | None = None,
    confidence: float | None = None,
) -> dict:
    """Build a queue.items status envelope."""
    canonical_command = normalize_to_canonical_command(reason_code, status, has_segment_support)
    if not is_command_allowed_for_topic(canonical_command, "queue.items"):
        canonical_command = None
        message = None

    resolved_confidence = confidence
    if resolved_confidence is None:
        resolved_confidence = compute_progress_confidence(
            status=status,
            progress=progress,
            reason_code=canonical_command,
        )
    payload = {
        "status": status,
        "progress": round(float(progress), 2),
        "etaSeconds": eta_seconds,
        "message": message,
        "reasonCode": canonical_command,
        "classification": classification,
        "changedFields": None,
        "paused": paused,
        "hasSegmentSupport": has_segment_support,
        "confidence": resolved_confidence,
        "startedAt": started_at,
        "completedAt": completed_at,
        "customTitle": custom_title,
        "engine": engine,
        "producedAudioLength": produced_audio_length,
        "producedChars": produced_chars,
        "producedSegmentCount": produced_segment_count,
    }
    resolved_source = source or _resolve_source_path()
    return build_studio_event(
        topic="queue.items",
        event_kind="queue_item_status",
        payload=payload,
        project_id=project_id,
        chapter_id=chapter_id,
        job_id=job_id,
        source=resolved_source
    )



def build_queue_item_invalidated_event(
    reason: str,
    changed_fields: list[str],
    job_id: str | None = None,
    project_id: str | None = None,
    source: str | None = None,
) -> dict:
    """Build a queue.items invalidated envelope."""
    canonical_command = normalize_to_canonical_command(reason) or "QUEUE_INVALIDATED"
    if canonical_command not in COMMAND_TOPIC_SCOPES["queue.items"]:
        canonical_command = "QUEUE_INVALIDATED"
    payload = {
        "reasonCode": canonical_command,
        "changedFields": changed_fields,
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
        "reasonCode": "QUEUE_INVALIDATED",
        "changedFields": ["paused"],
        "paused": paused,
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
    updated_at: float | None = None,
    message: str | None = None,
    reason_code: str | None = None,
    render_group_count: int | None = None,
    completed_render_groups: int | None = None,
    job_id: str | None = None,
    project_id: str | None = None,
    source: str | None = None,
    has_segment_support: bool | None = None,
    eta_updated_at: float | None = None,
    confidence: float | None = None,
) -> dict:
    """Build a chapters.progress topic envelope."""
    canonical_command = normalize_to_canonical_command(reason_code, status, has_segment_support)
    if not is_command_allowed_for_topic(canonical_command, "chapters.progress"):
        canonical_command = None
        message = None

    resolved_eta_seconds = eta_seconds
    if status in ("done", "failed", "cancelled"):
        resolved_eta_seconds = None

    resolved_eta_updated_at = None
    if resolved_eta_seconds is not None and resolved_eta_seconds > 0:
        resolved_eta_updated_at = eta_updated_at if eta_updated_at is not None else (updated_at if updated_at is not None else time.time())

    resolved_confidence = confidence
    if resolved_confidence is None:
        resolved_confidence = compute_progress_confidence(
            status=status,
            progress=progress,
            reason_code=canonical_command,
        )
    payload = {
        "status": status,
        "progress": round(float(progress), 2),
        "groupedProgress": round(float(grouped_progress), 2) if grouped_progress is not None else None,
        "etaSeconds": resolved_eta_seconds,
        "message": message,
        "reasonCode": canonical_command,
        "renderGroupCount": render_group_count,
        "completedRenderGroups": completed_render_groups,
        "hasSegmentSupport": has_segment_support,
        "confidence": resolved_confidence,
    }
    if resolved_eta_updated_at is not None:
        payload["etaUpdatedAt"] = resolved_eta_updated_at
    if updated_at is not None:
        payload["updatedAt"] = updated_at
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
    parent_job_id: str | None = None,
    eta_seconds: int | None = None,
    updated_at: float | None = None,
    has_segment_support: bool | None = None,
    eta_updated_at: float | None = None,
    confidence: float | None = None,
) -> dict:
    """Build a segments.progress topic envelope."""
    canonical_command = normalize_to_canonical_command(reason_code, status, has_segment_support)
    if not is_command_allowed_for_topic(canonical_command, "segments.progress"):
        canonical_command = None
        message = None

    resolved_eta_seconds = eta_seconds
    if status in ("done", "failed", "cancelled"):
        resolved_eta_seconds = None

    resolved_eta_updated_at = None
    if resolved_eta_seconds is not None and resolved_eta_seconds > 0:
        resolved_eta_updated_at = eta_updated_at if eta_updated_at is not None else (updated_at if updated_at is not None else time.time())

    rounded_progress = round(float(progress), 2)
    resolved_confidence = confidence
    if resolved_confidence is None:
        resolved_confidence = compute_progress_confidence(
            status=status,
            progress=progress,
            reason_code=canonical_command,
        )
    payload = {
        "status": status,
        "progress": rounded_progress,
        "segmentIndex": segment_index,
        "segmentCount": segment_count,
        "message": message,
        "reasonCode": canonical_command,
        "activeSegmentId": segment_id,
        "activeSegmentProgress": rounded_progress,
        "etaSeconds": resolved_eta_seconds,
        "hasSegmentSupport": has_segment_support,
        "confidence": resolved_confidence,
    }
    if resolved_eta_updated_at is not None:
        payload["etaUpdatedAt"] = resolved_eta_updated_at
    if updated_at is not None:
        payload["updatedAt"] = updated_at
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
    canonical_command = normalize_to_canonical_command(reason) or reason
    payload = {
        "reasonCode": canonical_command,
        "changedFields": changed_fields,
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
    canonical_command = normalize_to_canonical_command(reason) or reason
    payload = {
        "reasonCode": canonical_command,
        "changedFields": changed_fields,
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
    canonical_command = normalize_to_canonical_command(reason) or reason
    payload = {
        "reasonCode": canonical_command,
        "changedFields": changed_fields,
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
    job_id: str,
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
    }
    return build_studio_event(
        topic="voice.test",
        event_kind="voice_test_progress",
        payload=payload,
        job_id=job_id,
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
