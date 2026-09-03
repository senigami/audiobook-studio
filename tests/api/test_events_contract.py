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


def test_chapter_progress_event_carries_active_segments_map():
    """chapters.progress must carry active_segments_map when the producer has one.

    R1: before this fix, build_chapter_progress_event had no active_segments_map
    parameter at all — the field could never reach a chapters.progress frame no
    matter how often the backend wrote it to job state, so live per-segment
    highlighting during a chapter fan-out render was structurally impossible.
    build_queue_item_status_event already supports this field (queue.items); this
    pins the same support on chapters.progress.
    """
    event = build_chapter_progress_event(
        chapter_id="ch-1",
        status="running",
        progress=0.5,
        confidence=1.0,
        active_segments_map={"seg-1": {"phase": "rendering", "progress": 0.4, "eta_seconds": 12}},
    )
    assert event["payload"]["active_segments_map"] == {
        "seg-1": {"phase": "rendering", "progress": 0.4, "eta_seconds": 12}
    }


def test_chapter_progress_event_omits_active_segments_map_when_absent():
    """Absent active_segments_map must not appear in the payload at all (additive-only, INV-1/INV-9)."""
    event = build_chapter_progress_event(
        chapter_id="ch-1",
        status="running",
        progress=0.5,
        confidence=1.0,
    )
    assert "active_segments_map" not in event["payload"]


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
