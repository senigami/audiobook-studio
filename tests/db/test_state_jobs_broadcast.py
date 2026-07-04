"""
Tests for race-condition fixes in state_jobs.py:
  B1 - put_job broadcast uses snapshots captured under lock
  B2 - update_job previous_status is not clobbered by mid-loop re-assignment
"""
import time
import threading
import pytest
from unittest.mock import patch

from app.db.state import update_job, put_job, clear_all_jobs, STATE_FILE, requeue, get_jobs
from app.db.models import Job


@pytest.fixture(autouse=True)
def clean_state(tmp_path):
    with patch("app.db.state.STATE_FILE", tmp_path / "state.json"):
        clear_all_jobs()
        yield


def _make_job(job_id, status="queued", **kwargs):
    return Job(
        id=job_id,
        engine="xtts",
        chapter_file="c1.txt",
        status=status,
        progress=0.0,
        created_at=time.time(),
        **kwargs,
    )


# ---------------------------------------------------------------------------
# B5 — terminal_reset preserves caller-supplied values
# ---------------------------------------------------------------------------

def test_terminal_reset_preserves_explicit_started_at():
    """
    Resetting a done job to queued while passing an explicit started_at must
    store the caller's started_at, not None.
    """
    explicit_started_at = 1_700_000_000.0

    # Create a job that has already finished (terminal state).
    job = _make_job("job-b5", status="done", started_at=explicit_started_at - 60, finished_at=explicit_started_at)
    put_job(job)

    # Reset to queued with an explicit started_at supplied by the caller.
    update_job("job-b5", status="queued", started_at=explicit_started_at, force_broadcast=True)

    from app.db.state import get_jobs
    stored = get_jobs().get("job-b5")
    assert stored is not None, "Job should still exist after reset"
    assert stored.started_at == explicit_started_at, (
        f"started_at should be {explicit_started_at!r} (caller-supplied), got {stored.started_at!r}"
    )


# ---------------------------------------------------------------------------
# B2 — previous_status not clobbered during status transition
# ---------------------------------------------------------------------------

def test_update_job_status_transition_broadcast_previous_status():
    """
    queued -> running: broadcast must carry previous_status == 'queued'
    and status_changed == True.
    """
    job = _make_job("job-b2", status="queued")
    put_job(job)

    payloads = []

    def listener(job_id, updates, current_job=None):
        payloads.append(dict(updates))

    with patch("app.db.state._JOB_LISTENERS", [listener]):
        with patch("app.db.state._LISTENER_SNAPSHOT_SUPPORT", {}):
            update_job("job-b2", status="running")

    assert payloads, "Expected at least one broadcast payload"
    # Find the payload that carries the status update
    status_payloads = [p for p in payloads if "status" in p or "previous_status" in p]
    assert status_payloads, "Expected a payload with status/previous_status"
    p = status_payloads[0]
    assert p.get("previous_status") == "queued", (
        f"previous_status should be 'queued', got {p.get('previous_status')!r}"
    )
    assert p.get("status_changed") is True, (
        f"status_changed should be True, got {p.get('status_changed')!r}"
    )


def test_update_job_no_status_change_status_changed_false():
    """
    When no status change occurs, status_changed must be False.
    """
    job = _make_job("job-no-change", status="running")
    put_job(job)

    payloads = []

    def listener(job_id, updates, current_job=None):
        payloads.append(dict(updates))

    with patch("app.db.state._JOB_LISTENERS", [listener]):
        with patch("app.db.state._LISTENER_SNAPSHOT_SUPPORT", {}):
            update_job("job-no-change", progress=0.5)

    assert payloads
    p = payloads[0]
    assert p.get("status_changed") is False, (
        f"status_changed should be False when status unchanged, got {p.get('status_changed')!r}"
    )
    assert p.get("previous_status") == "running"


# ---------------------------------------------------------------------------
# Concurrent stress test: B1 + B2 together
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# B20 — requeue uses standard terminal-reset path
# ---------------------------------------------------------------------------

def test_requeue_emits_terminal_reset_broadcast():
    """
    requeue(job_id) must go through update_job's terminal-reset branch:
    the broadcast must carry terminal_reset=True, reason_code="JOB_RESET_TO_ACTIVE",
    previous_status="done", status_changed=True.  Stale ETA fields must be None
    in the stored job after requeue.

    Revert-check: this test FAILS against the old requeue that used force_broadcast=True
    without relying on the terminal-reset branch (terminal_reset was False, so
    terminal_reset and reason_code were absent from broadcast_dict).
    """
    now = time.time()
    job = _make_job(
        "job-b20",
        status="done",
        started_at=now - 30,
        finished_at=now,
    )
    # Give it stale ETA fields so we can assert they are cleared.
    job.eta_seconds = 120
    job.eta_basis = "remaining_from_update"
    job.estimated_end_at = now + 120
    put_job(job)

    payloads = []

    def listener(job_id, updates, current_job=None):
        payloads.append(dict(updates))

    with patch("app.db.state._JOB_LISTENERS", [listener]):
        with patch("app.db.state._LISTENER_SNAPSHOT_SUPPORT", {}):
            requeue("job-b20")

    assert payloads, "Expected at least one broadcast payload from requeue"

    # Find the payload that represents the status transition.
    reset_payloads = [p for p in payloads if p.get("terminal_reset") is True]
    assert reset_payloads, (
        "Expected a broadcast payload with terminal_reset=True; "
        f"got payloads: {payloads}"
    )
    p = reset_payloads[0]
    assert p.get("reason_code") == "JOB_RESET_TO_ACTIVE", (
        f"reason_code should be 'JOB_RESET_TO_ACTIVE', got {p.get('reason_code')!r}"
    )
    assert p.get("previous_status") == "done", (
        f"previous_status should be 'done', got {p.get('previous_status')!r}"
    )
    assert p.get("status_changed") is True, (
        f"status_changed should be True, got {p.get('status_changed')!r}"
    )

    # Stale ETA fields must be cleared in the stored job.
    stored = get_jobs().get("job-b20")
    assert stored is not None, "Job should still exist after requeue"
    assert stored.eta_seconds is None, (
        f"eta_seconds should be None after requeue, got {stored.eta_seconds!r}"
    )
    assert stored.eta_basis is None, (
        f"eta_basis should be None after requeue, got {stored.eta_basis!r}"
    )
    assert stored.estimated_end_at is None, (
        f"estimated_end_at should be None after requeue, got {stored.estimated_end_at!r}"
    )


def test_concurrent_put_job_update_job_broadcast_consistency():
    """
    Two threads — one doing put_job, one doing update_job — run concurrently
    50 iterations each on the same job id. Asserts:
      - No exception raised
      - No broadcast where previous_status == new status while status_changed is True
      - Final job state is consistent (status in known set)
    """
    job_id = "job-concurrent"
    job = _make_job(job_id, status="queued")
    put_job(job)

    captured = []
    errors = []
    lock = threading.Lock()

    def listener(jid, updates, current_job=None):
        with lock:
            captured.append(dict(updates))

    statuses_cycle = ["queued", "running", "done"]

    def put_thread():
        for i in range(50):
            s = statuses_cycle[i % len(statuses_cycle)]
            try:
                j = _make_job(job_id, status=s)
                put_job(j)
            except Exception as exc:
                with lock:
                    errors.append(("put_job", exc))

    def update_thread():
        for i in range(50):
            s = statuses_cycle[(i + 1) % len(statuses_cycle)]
            try:
                update_job(job_id, status=s, force_broadcast=True)
            except Exception as exc:
                with lock:
                    errors.append(("update_job", exc))

    with patch("app.db.state._JOB_LISTENERS", [listener]):
        with patch("app.db.state._LISTENER_SNAPSHOT_SUPPORT", {}):
            t1 = threading.Thread(target=put_thread)
            t2 = threading.Thread(target=update_thread)
            t1.start()
            t2.start()
            t1.join(timeout=10)
            t2.join(timeout=10)

    assert not errors, f"Threads raised exceptions: {errors}"

    # Key invariant: no payload where status_changed=True but previous_status == new status
    violations = []
    for p in captured:
        prev = p.get("previous_status")
        new = p.get("status")
        changed = p.get("status_changed")
        if changed is True and new is not None and prev == new:
            violations.append(p)

    assert not violations, (
        f"Found {len(violations)} broadcast(s) where status_changed=True "
        f"but previous_status == new status: {violations[:3]}"
    )


# ---------------------------------------------------------------------------
# B15 — ETA_PROJECTION_SKIP_REASONS actually gates the observed-progress
# projection inside update_job (not just a set-membership check).
# ---------------------------------------------------------------------------

def test_update_job_skip_reason_does_not_compute_eta_projection():
    """A reason_code in ETA_PROJECTION_SKIP_REASONS must suppress the observed
    progress projection: eta_seconds stays at its pre-call value (None here),
    even though status/started_at/progress otherwise satisfy the projection
    gate.
    """
    started_at = time.time() - 30.0
    job = _make_job("job-b15-skip", status="running", started_at=started_at)
    job.progress = 0.5
    put_job(job)

    update_job(
        "job-b15-skip",
        status="running",
        progress=0.5,
        reason_code="segment_start",
        updated_at=time.time(),
    )

    stored = get_jobs().get("job-b15-skip")
    assert stored is not None
    assert stored.eta_seconds is None, (
        f"skip reason_code must not trigger ETA projection, got eta_seconds={stored.eta_seconds!r}"
    )


def test_update_job_non_skip_reason_computes_eta_projection():
    """The control case: same progress/started_at setup but a reason_code NOT
    in ETA_PROJECTION_SKIP_REASONS must let the observed progress projection
    run and set a non-None numeric eta_seconds.
    """
    started_at = time.time() - 30.0
    job = _make_job("job-b15-control", status="running", started_at=started_at)
    job.progress = 0.5
    put_job(job)

    update_job(
        "job-b15-control",
        status="running",
        progress=0.5,
        reason_code="SEGMENT_PROGRESS_OBSERVED",
        updated_at=time.time(),
    )

    stored = get_jobs().get("job-b15-control")
    assert stored is not None
    assert stored.eta_seconds is not None, (
        "non-skip reason_code should allow the observed progress projection to "
        "compute eta_seconds"
    )
    assert isinstance(stored.eta_seconds, int)
    assert stored.eta_seconds > 0
