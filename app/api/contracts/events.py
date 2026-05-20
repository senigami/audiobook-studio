"""Normalized websocket event contracts for Studio 2.0."""

from __future__ import annotations

import sys
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
