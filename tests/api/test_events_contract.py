"""Contract tests for app.api.contracts.events envelope builders."""

from app.api.contracts.events import (
    build_chapter_progress_event,
    build_segment_progress_event,
)


def test_chapter_progress_event_preserves_start_segment_reason_code():
    """chapters.progress must surface START_SEGMENT so the UI can show phase reasons.

    For segment-capable engines (has_segment_support=True) the orchestrator publishes
    reason_code="START_SEGMENT" at each render-group start; the allowlist must not
    null it out of the chapters.progress payload.
    """
    event = build_chapter_progress_event(
        chapter_id="ch-1",
        status="running",
        progress=0.1,
        reason_code="START_SEGMENT",
        has_segment_support=True,
        confidence=0.1,
    )
    assert event["payload"]["reasonCode"] == "START_SEGMENT"


def test_chapter_progress_event_preserves_start_synthesis_reason_code():
    event = build_chapter_progress_event(
        chapter_id="ch-1",
        status="running",
        progress=0.0,
        reason_code="START_SYNTHESIS",
        has_segment_support=True,
        confidence=1.0,
    )
    assert event["payload"]["reasonCode"] == "START_SYNTHESIS"


def test_chapter_progress_event_passes_segment_pending():
    """SEGMENT_PENDING must pass through chapters.progress unstripped."""
    event = build_chapter_progress_event(
        chapter_id="ch-1",
        status="running",
        progress=0.1,
        reason_code="SEGMENT_PENDING",
        has_segment_support=True,
        confidence=0.1,
    )
    assert event["payload"]["reasonCode"] == "SEGMENT_PENDING"


def test_segment_progress_event_passes_segment_pending():
    """SEGMENT_PENDING must pass through segments.progress unstripped."""
    event = build_segment_progress_event(
        segment_id="seg-1",
        status="running",
        progress=0.0,
        reason_code="SEGMENT_PENDING",
        has_segment_support=True,
    )
    assert event["payload"]["reasonCode"] == "SEGMENT_PENDING"
