"""Queue row must update on progress advances, not only status changes.

Symptom: the global queue row froze at 0% during a render and snapped to done.
queue.items is the frontend's row progress authority, but ProgressService.publish
only emitted queue_item_status inside `if status_changed or previous is None:` —
so a progress-only frame (status unchanged) produced a chapters.progress overlay
but never refreshed the authoritative queue row.

R1 revert-check: before the fix, the progress-only second publish emits NO
queue.items event and these assertions FAIL. After it, every emit-gated frame
(already ≥1% throttled by _claim_emit_slot) refreshes the queue row.
R4: no sleeps — synchronous publishes with an injected clock.
"""

from __future__ import annotations

from app.orchestration.progress.service import ProgressService
from app.orchestration.progress.eta import estimate_eta_seconds


def _make_service():
    events: list[tuple[dict, str]] = []
    wall = {"v": 100.0}
    mono = {"v": 500.0}

    svc = ProgressService(
        reconcile_fn=lambda **kw: kw,
        eta_fn=estimate_eta_seconds,
        broadcaster=lambda *, payload, channel: events.append((payload, channel)),
        wall_clock=lambda: wall["v"],
        monotonic_clock=lambda: mono["v"],
        max_silence_seconds=10.0,
    )
    return svc, events, wall, mono


def _queue_events(events):
    return [p for p, _ in events if p.get("topic") == "queue.items"]


def test_progress_only_advance_emits_queue_item_status():
    svc, events, _, mono = _make_service()

    # First running frame (previous is None) — emits a queue row event.
    svc.publish(
        job_id="job-q", status="running", scope="chapter", chapter_id="chap-1",
        parent_job_id="proj-1", progress=0.1, eta_seconds=50, updated_at=100.0,
    )
    q_after_first = len(_queue_events(events))
    assert q_after_first >= 1, "first frame must emit a queue.items event"

    # Progress-only advance: SAME status 'running', no status change.
    mono["v"] += 5.0  # advance monotonic clock so the emit gate is not silence-throttled
    svc.publish(
        job_id="job-q", status="running", scope="chapter", chapter_id="chap-1",
        parent_job_id="proj-1", progress=0.5, eta_seconds=20, updated_at=105.0,
    )
    q_after_second = len(_queue_events(events))

    assert q_after_second > q_after_first, (
        "a progress-only advance (status unchanged) must still emit a queue.items "
        "event so the global queue row updates mid-render"
    )
    last_q = _queue_events(events)[-1]
    assert last_q["payload"]["progress"] == 0.5
    assert last_q["payload"]["status"] == "running"


def test_eta_only_frame_does_not_re_emit_queue_row():
    """A same-percent frame (only the ETA changed) must NOT re-emit queue.items —
    that re-anchors the frontend lane and ratchets/jitters the displayed percent.
    The displayed percent changes only on real progress or status changes."""
    svc, events, _, mono = _make_service()

    svc.publish(
        job_id="job-eta", status="running", scope="chapter", chapter_id="chap-1",
        parent_job_id="proj-1", progress=0.30, eta_seconds=40, updated_at=100.0,
    )
    q_before = len(_queue_events(events))

    # Same progress (0.30), only the ETA moved (40 → 20) → must not touch the row.
    mono["v"] += 5.0
    svc.publish(
        job_id="job-eta", status="running", scope="chapter", chapter_id="chap-1",
        parent_job_id="proj-1", progress=0.30, eta_seconds=20, updated_at=105.0,
    )

    assert len(_queue_events(events)) == q_before, (
        "an ETA-only (same-percent) frame must not re-emit the queue row"
    )
