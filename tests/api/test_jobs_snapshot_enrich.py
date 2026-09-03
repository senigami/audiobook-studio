"""Task 007 (PI6): jobs_snapshot hydration path emits §4A-enriched values.

Tests verify:
1. Snapshot rows carry numeric float eta_confidence (not absent/echoed).
2. Snapshot eta_confidence value-equals what the live enrich path produces for
   the same job state (same ring samples seeded via publish() live frames).
3. PI8 no-mutation: calling enrich(..., sample=False) in the snapshot path must
   NOT mutate the per-job ETA ring (_eta_rings) or monotonic floor
   (_last_progress_by_job).  This is the key safety guarantee — snapshots must
   not poison live state.

R1 revert-check:
  Before the Task 007 wiring in web.py, the jobs_snapshot handler sends raw
  asdict(job) without calling enrich().  The snapshot row therefore carries
  whatever eta_confidence the Job dataclass stores (a string like "stable" or
  None), NOT the §4A float computed by the singleton.

  To verify redness: comment out the enrich(..., sample=False) block added to
  web.py; rerun this file; test_snapshot_confidence_is_numeric will fail
  because the row carries None or a string.

Mock boundaries (R2): only the websocket transport sink (send_json captured via
TestClient WS) and the monotonic/wall clock injected into the installed
singleton.  The ProgressService internals and state-store are NOT mocked.
"""

from __future__ import annotations

import copy
import time

import pytest
from fastapi.testclient import TestClient

from app.api.web import app
from app.db.models import Job
from app.db.state import clear_all_jobs, put_job
from app.orchestration.progress.eta import EtaSampleRing
from app.orchestration.progress.service import (
    ProgressService,
    create_progress_service,
    get_progress_service,
    reset_progress_service,
    set_progress_service,
)
from app.orchestration.progress.eta import estimate_eta_seconds


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_clock_injected_service():
    """Build a deterministic ProgressService; install as singleton.

    Returns (svc, broadcaster_events, wall_now, monotonic_now).
    """
    events: list[tuple[dict, str]] = []
    wall_now = {"value": 1000.0}
    monotonic_now = {"value": 5000.0}

    def wall_clock() -> float:
        return wall_now["value"]

    def monotonic_clock() -> float:
        return monotonic_now["value"]

    def broadcaster(*, payload: dict, channel: str) -> None:
        events.append((payload, channel))

    svc = ProgressService(
        reconcile_fn=lambda **kwargs: kwargs,
        eta_fn=estimate_eta_seconds,
        broadcaster=broadcaster,
        wall_clock=wall_clock,
        monotonic_clock=monotonic_clock,
        max_silence_seconds=10.0,
    )
    return svc, events, wall_now, monotonic_now


def _seed_live_frames(svc: ProgressService, job_id: str, wall_now: dict, monotonic_now: dict) -> None:
    """Drive two live publish() calls so the per-job ETA ring has samples."""
    svc.publish(
        job_id=job_id,
        status="running",
        progress=0.2,
        eta_seconds=80,
        char_count=1000,
    )
    wall_now["value"] += 10.0
    monotonic_now["value"] += 10.0
    svc.publish(
        job_id=job_id,
        status="running",
        progress=0.4,
        eta_seconds=60,
        char_count=1000,
        force=True,
    )
    wall_now["value"] += 5.0
    monotonic_now["value"] += 5.0


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _reset_state():
    """Reset singleton and in-memory job state before and after each test."""
    reset_progress_service()
    clear_all_jobs()
    yield
    reset_progress_service()
    clear_all_jobs()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestJobsSnapshotEnrich:
    """jobs_snapshot handler must emit §4A-enriched values on each row.

    R1 revert-check: before Task 007 wiring, snapshot rows carry raw asdict(job)
    without enrich().  eta_confidence in the Job model defaults to a string or
    None (never a float), so test_snapshot_confidence_is_numeric fails.
    """

    @pytest.mark.timeout(10)
    def test_snapshot_confidence_is_numeric_for_running_job(self):
        """Each running job row in jobs_snapshot must carry a float eta_confidence.

        Pre-wiring (R1 red): row["eta_confidence"] is None or a string (the raw
        Job.eta_confidence field from asdict).
        Post-wiring (R1 green): enrich(..., sample=False) replaces it with a
        §4A.2 float.
        """
        job_id = "snap-conf-running"
        svc, events, wall_now, monotonic_now = _make_clock_injected_service()
        set_progress_service(svc)

        # Seed ring state via live frames.
        _seed_live_frames(svc, job_id, wall_now, monotonic_now)

        # Install a matching Job in the state store so the snapshot finds it.
        put_job(Job(
            id=job_id,
            engine="tts_xtts",
            status="running",
            progress=0.4,
            eta_seconds=60,
            created_at=time.time(),
        ))

        with TestClient(app).websocket_connect("/ws") as ws:
            ws.send_json({"type": "jobs_snapshot_request"})
            data = ws.receive_json()

        row = next((j for j in data["jobs"] if j["id"] == job_id), None)
        assert row is not None, f"Expected job {job_id} in snapshot"

        conf = row.get("eta_confidence")
        assert isinstance(conf, float), (
            f"Snapshot eta_confidence must be a float after enrich(), got {type(conf)}: {conf!r}. "
            "Pre-wiring: the raw Job.eta_confidence is None/string, not a §4A.2 float."
        )
        assert 0.0 <= conf <= 1.0, f"eta_confidence out of [0,1]: {conf}"

    @pytest.mark.timeout(10)
    def test_snapshot_confidence_equals_live_frame_value(self):
        """Snapshot eta_confidence must value-equal a fresh enrich(..., sample=False) call.

        This verifies that the snapshot path and the live enrich path use the SAME
        ring state and produce the same §4A.2 metric — no "jump" on reconnect.

        R1 revert-check: pre-wiring, the snapshot returns the raw Job field (None
        or string).  A live enrich call on the same state returns a float.  They
        differ, confirming the snapshot path bypassed §4A math.
        """
        job_id = "snap-eq-live"
        svc, events, wall_now, monotonic_now = _make_clock_injected_service()
        set_progress_service(svc)

        # Seed ring state via two live frames.
        _seed_live_frames(svc, job_id, wall_now, monotonic_now)

        put_job(Job(
            id=job_id,
            engine="tts_xtts",
            status="running",
            progress=0.4,
            eta_seconds=60,
            created_at=time.time(),
        ))

        # Capture what a fresh enrich(sample=False) produces NOW (before the snapshot).
        live_payload = {
            "status": "running",
            "progress": 0.4,
            "eta_seconds": 60,
            "updated_at": wall_now["value"],
        }
        live_enriched = svc.enrich(job_id, live_payload, sample=False)
        expected_conf = live_enriched.get("eta_confidence")
        assert isinstance(expected_conf, float), "Sanity: live enrich must produce float confidence"

        # Request the snapshot — must carry the same value.
        with TestClient(app).websocket_connect("/ws") as ws:
            ws.send_json({"type": "jobs_snapshot_request"})
            data = ws.receive_json()

        row = next((j for j in data["jobs"] if j["id"] == job_id), None)
        assert row is not None

        snap_conf = row.get("eta_confidence")
        assert isinstance(snap_conf, float), (
            f"Snapshot row must carry float eta_confidence, got {type(snap_conf)}: {snap_conf!r}"
        )

        # Value-equality: both paths read from the same ring → same §4A.2 output.
        assert snap_conf == pytest.approx(expected_conf, abs=0.02), (
            f"Snapshot eta_confidence {snap_conf} must match live enrich value {expected_conf}. "
            "A gap here means the snapshot path bypassed §4A math."
        )

    @pytest.mark.timeout(10)
    def test_snapshot_enrich_does_not_mutate_ring_or_floor(self):
        """PI8 no-mutation guarantee: the snapshot handler must not push to the
        ETA ring or advance the monotonic floor.

        This proves that sample=False is truly read-only — multiple reconnects
        (snapshot requests) must not inflate confidence or change ring membership.

        R1 revert-check: if the handler called enrich(..., sample=True) by mistake
        (or used publish()), the ring would grow and _last_progress_by_job would
        be stamped.  The post-count assertions would fail.
        """
        job_id = "snap-nomut"
        svc, events, wall_now, monotonic_now = _make_clock_injected_service()
        set_progress_service(svc)

        # Seed ring state via two live frames.
        _seed_live_frames(svc, job_id, wall_now, monotonic_now)

        put_job(Job(
            id=job_id,
            engine="tts_xtts",
            status="running",
            progress=0.4,
            eta_seconds=60,
            created_at=time.time(),
        ))

        # Capture ring state BEFORE snapshot.
        ring_before: EtaSampleRing = svc._eta_rings.get(job_id, EtaSampleRing())
        ring_len_before = len(ring_before)
        ring_samples_before = list(ring_before._samples)  # copy of internal samples
        floor_before = svc._last_progress_by_job.get(job_id)
        last_sample_ts_before = svc._eta_last_sample_time.get(job_id)

        # Request the snapshot — this is the hydration call under test.
        with TestClient(app).websocket_connect("/ws") as ws:
            ws.send_json({"type": "jobs_snapshot_request"})
            ws.receive_json()

        # Assert ring is UNCHANGED (no samples pushed by the snapshot).
        ring_after: EtaSampleRing = svc._eta_rings.get(job_id, EtaSampleRing())
        ring_len_after = len(ring_after)
        ring_samples_after = list(ring_after._samples)

        assert ring_len_after == ring_len_before, (
            f"Snapshot enrich must not push to ETA ring. "
            f"Ring grew from {ring_len_before} → {ring_len_after} samples."
        )
        assert ring_samples_after == ring_samples_before, (
            "Snapshot enrich must not mutate ring contents (sample=False is read-only)."
        )

        # Assert monotonic floor is UNCHANGED.
        floor_after = svc._last_progress_by_job.get(job_id)
        assert floor_after == floor_before, (
            f"Snapshot enrich must not advance monotonic floor. "
            f"Floor changed from {floor_before} → {floor_after}."
        )

        # Assert last sample timestamp is UNCHANGED.
        last_sample_ts_after = svc._eta_last_sample_time.get(job_id)
        assert last_sample_ts_after == last_sample_ts_before, (
            f"Snapshot enrich must not stamp _eta_last_sample_time. "
            f"Timestamp changed from {last_sample_ts_before} → {last_sample_ts_after}."
        )

    @pytest.mark.timeout(10)
    def test_snapshot_non_running_job_does_not_crash(self):
        """Non-running (terminal/queued) jobs in the snapshot must not raise."""
        for status in ("done", "failed", "queued"):
            jid = f"snap-{status}"
            put_job(Job(
                id=jid,
                engine="tts_xtts",
                status=status,
                progress=1.0 if status == "done" else 0.0,
                created_at=time.time(),
            ))

        svc, _, _, _ = _make_clock_injected_service()
        set_progress_service(svc)

        with TestClient(app).websocket_connect("/ws") as ws:
            ws.send_json({"type": "jobs_snapshot_request"})
            data = ws.receive_json()

        assert data["type"] == "jobs_snapshot"
        # No crash is the contract; non-running jobs may carry None confidence.


class TestQueueSnapshotPath:
    """Queue REST snapshot: api_get_queue() merges live job state and enriches running rows.

    The /api/processing_queue endpoint calls _merge_live_queue_job(item, job)
    which copies fields from the live Job object into the queue row dict, then
    for running/in-flight rows that carry a progress value, calls
    svc.enrich(jid, item, sample=False) so the row surfaces numeric eta_confidence
    and contract ETA fields matching live frames.

    PI6 contract:
    - RUNNING rows with a progress value get enrich(sample=False) applied.
    - QUEUED / DONE / status-only rows (no progress in flight) are left as-is.
    - sample=False guarantees no mutation of the live ETA ring or monotonic floor.

    R1 revert-check:
      Before the PI6 wiring in queue.py, running queue rows carry whatever
      eta_confidence was last stored in the Job model (a string or None), NOT
      the §4A float.  test_running_queue_row_carries_numeric_confidence will fail
      because the row lacks a float eta_confidence.

      To verify redness: remove the enrich block added to api_get_queue() in
      queue.py; rerun; test_running_queue_row_carries_numeric_confidence fails
      because item["eta_confidence"] is None/string.
    """

    @pytest.mark.timeout(10)
    def test_queue_endpoint_returns_200_without_enrich_crash(self):
        """GET /api/processing_queue succeeds without crashing (unenriched path).

        No-regression: the endpoint must not crash regardless of queue content.
        """
        from fastapi.testclient import TestClient
        client = TestClient(app)
        response = client.get("/api/processing_queue")
        # May return 200 with an empty list when no queue items exist.
        assert response.status_code == 200
        items = response.json()
        assert isinstance(items, list)

    @pytest.mark.timeout(10)
    def test_running_queue_row_carries_numeric_confidence(self):
        """PI6: a RUNNING queue row must carry a float eta_confidence after hydration.

        Drive two live publish() frames so the ETA ring has samples, then call
        GET /api/processing_queue and assert the running row's eta_confidence is
        a §4A float in [0, 1].

        R1 revert-check: remove the enrich block from api_get_queue() → the row
        carries None or a string from the raw Job model (never a float).
        """
        from fastapi.testclient import TestClient
        from app.db.queue import upsert_queue_row, update_queue_item

        job_id = "queue-pi6-running"
        svc, events, wall_now, monotonic_now = _make_clock_injected_service()
        set_progress_service(svc)

        # Seed the ETA ring with two live frames.
        _seed_live_frames(svc, job_id, wall_now, monotonic_now)

        # Install a matching Job in state and a queue row in the DB.
        put_job(Job(
            id=job_id,
            engine="tts_xtts",
            status="running",
            progress=0.4,
            eta_seconds=60,
            created_at=time.time(),
        ))
        upsert_queue_row(job_id, project_id=None, chapter_id=None, status="queued", engine="tts_xtts")
        update_queue_item(job_id, "running")

        client = TestClient(app)
        response = client.get("/api/processing_queue")
        assert response.status_code == 200

        row = next((item for item in response.json() if item["id"] == job_id), None)
        assert row is not None, f"Expected job {job_id} in queue response"
        assert row["status"] == "running"

        conf = row.get("eta_confidence")
        assert isinstance(conf, float), (
            f"Running queue row must carry float eta_confidence after PI6 enrich, "
            f"got {type(conf)}: {conf!r}.  Pre-wiring: raw Job.eta_confidence is "
            "None/string, confirming the enrich block was bypassed."
        )
        assert 0.0 <= conf <= 1.0, f"eta_confidence out of [0, 1]: {conf}"

    @pytest.mark.timeout(10)
    def test_queued_row_without_ring_is_unaffected(self):
        """PI6 safety: a QUEUED row (progress=0, no ring) must not crash and must
        not have a forced eta_confidence.

        The PI6 condition (status in {running, preparing, finalizing} AND progress
        is not None) excludes QUEUED rows, so enrich is never called on them.
        """
        from fastapi.testclient import TestClient
        from app.db.queue import upsert_queue_row

        job_id = "queue-pi6-queued"
        svc, events, wall_now, monotonic_now = _make_clock_injected_service()
        set_progress_service(svc)

        # Install a QUEUED job — no ring, no live frames.
        put_job(Job(
            id=job_id,
            engine="tts_xtts",
            status="queued",
            progress=0.0,
            eta_seconds=None,
            created_at=time.time(),
        ))
        upsert_queue_row(job_id, project_id=None, chapter_id=None, status="queued", engine="tts_xtts")

        client = TestClient(app)
        response = client.get("/api/processing_queue")
        assert response.status_code == 200, "Queue endpoint must not crash on QUEUED row"

        row = next((item for item in response.json() if item["id"] == job_id), None)
        assert row is not None, f"Expected job {job_id} in queue response"
        assert row["status"] == "queued"

        # eta_confidence must NOT be a forced BASE_FLOOR float — QUEUED rows are
        # excluded from the PI6 enrich path.  The raw Job model carries None (or
        # a string) for eta_confidence; a float here would mean enrich was called.
        conf = row.get("eta_confidence")
        assert not isinstance(conf, float), (
            f"QUEUED row must not have a forced float eta_confidence from enrich, got {conf!r}"
        )
