"""Normalized websocket event contracts for Studio 2.0."""

from __future__ import annotations

from typing import Literal, NotRequired, TypedDict

StudioJobStatus = Literal["queued", "preparing", "running", "finalizing", "done", "failed", "cancelled"]
StudioJobEventScope = Literal["job", "queue", "chapter", "segment", "export", "voice_test", "voice_build"]
StudioEtaBasis = Literal["remaining_from_update", "total_from_start"]


class StudioJobEvent(TypedDict, total=False):
    """Canonical normalized job event payload shared by backend and frontend."""

    type: Literal["studio_job_event"]
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
    return event


def is_studio_job_event(value: object) -> bool:
    """Return whether a value looks like a normalized studio job event."""

    if not isinstance(value, dict):
        return False
    return value.get("type") == "studio_job_event" and isinstance(value.get("job_id"), str) and isinstance(value.get("status"), str)
