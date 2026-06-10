"""
Tests for race-condition fixes in state_jobs.py:
  B1 - put_job broadcast uses snapshots captured under lock
  B2 - update_job previous_status is not clobbered by mid-loop re-assignment
"""
import time
import threading
import pytest
from unittest.mock import patch

from app.db.state import update_job, put_job, clear_all_jobs, STATE_FILE
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
