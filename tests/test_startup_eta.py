import pytest
from app.jobs.core import _estimate_seconds
from app.models import Job

def test_conservative_estimate_short_chapter():
    """A short 2-segment chapter should have a conservative ETA > 10s."""
    cps = 16.0
    text_chars = 100 # Very short
    # Naive chars/cps would be ~6.25s

    # 2 segment groups
    eta = _estimate_seconds(text_chars, cps, group_count=2)

    # base_eta (6) + group_overhead (2*3=6) + start_overhead (4) = 16s
    assert eta >= 15
    assert eta <= 18

def test_conservative_estimate_single_segment():
    """A single segment chapter should still have start overhead."""
    cps = 16.0
    text_chars = 160 # 10s base

    eta = _estimate_seconds(text_chars, cps, group_count=1)

    # base_eta (10) + group_overhead (3) + start_overhead (4) = 17s
    assert eta >= 16
    assert eta <= 18

def test_conservative_estimate_high_segment_count():
    """Overhead should scale with segment count."""
    cps = 16.0
    text_chars = 1600 # 100s base

    # 10 segments
    eta = _estimate_seconds(text_chars, cps, group_count=10)

    # base_eta (100) + group_overhead (10*3=30) + start_overhead (4) = 134s
    assert eta >= 130
    assert eta <= 140

def test_broadcast_job_updated_startup_contract(monkeypatch):
    """[START_SYNTHESIS] contract: running/0.0 + conservative ETA."""
    from app.api.ws import broadcast_job_updated
    import time

    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    job_id = "job-startup-test"
    now = time.time()

    broadcast_job_updated(
        job_id,
        {
            "status": "running",
            "progress": 0.0,
            "started_at": now,
            "eta_seconds": 25,
            "eta_basis": "remaining_from_update",
            "estimated_end_at": now + 25
        },
        {"status": "running", "progress": 0.0, "started_at": now}
    )

    # Assert normalized studio_job_event
    event = next(m for m in messages if m["type"] == "studio_job_event")
    assert event["status"] == "running"
    assert event["progress"] == 0.0
    assert event["eta_seconds"] == 25
    assert event["eta_basis"] == "remaining_from_update"
    assert "estimated_end_at" in event
