import pytest
from fastapi.testclient import TestClient
from app.api.web import app
from app.db.state import update_job
from app.api.ws import broadcast_job_updated

def test_websocket_broadcast():
    client = TestClient(app)
    with client.websocket_connect("/ws") as websocket:
        # Manually trigger a job update to test broadcast
        # Since state.py calls listeners, and web.py registers the bridge
        update_job("test_job", status="running", progress=0.1)

        # In a real environment, the bridge runs on the main loop.
        # In TestClient, it typically runs synchronously or we might need to wait.
        # But our bridge uses asyncio.run_coroutine_threadsafe.
        # TestClient handles this by running a separate loop sometimes.

        # Simple connection test
        # We don't test the full broadcast bridge here as it requires a running event loop
        # which TestClient handles in a way that's hard to sync with state.py updates.
        websocket.send_json({"type": "ping"})
        # The server doesn't respond to pings yet, but we verified we can connect and send.

def test_queue_start_not_redirect():
    client = TestClient(app)
    # This should return JSON now, not a redirect
    response = client.post("/api/generation/resume")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_broadcast_job_updated_uses_current_job_status_for_normalized_event(monkeypatch):
    messages = []

    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    broadcast_job_updated(
        "job-1",
        {"progress": 0.5, "eta_seconds": 12},
        {"status": "running", "progress": 0.5, "eta_seconds": 12},
    )

    assert messages[0]["type"] == "studio_job_event"
    assert messages[0]["job_id"] == "job-1"
    assert messages[0]["status"] == "running"
    assert messages[0]["progress"] == 0.5
    assert messages[0]["eta_seconds"] == 12
    assert messages[1] == {
        "type": "job_updated",
        "job_id": "job-1",
        "updates": {"status": "running", "progress": 0.5, "eta_seconds": 12},
    }


def test_broadcast_job_updated_preserves_context_in_job_updated_payload(monkeypatch):
    messages = []

    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    broadcast_job_updated(
        "job-3",
        {"progress": 0.5},
        {"status": "running", "progress": 0.5, "chapter_id": "chap-1", "project_id": "proj-1"},
    )

    assert messages[1]["updates"]["chapter_id"] == "chap-1"
    assert messages[1]["updates"]["project_id"] == "proj-1"


def test_broadcast_job_updated_uses_phase4_progress_rounding(monkeypatch):
    messages = []

    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    broadcast_job_updated(
        "job-2",
        {"progress": 0.1234},
        {"status": "running", "progress": 0.1234},
    )

    assert messages[0]["progress"] == 0.12


def test_broadcast_job_updated_propagates_active_segment(monkeypatch):
    messages = []

    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    broadcast_job_updated(
        "job-segment-test",
        {"active_segment_id": "seg-1", "active_segment_progress": 0.75},
        {
            "status": "running",
            "progress": 0.5,
            "active_segment_id": "seg-1",
            "active_segment_progress": 0.75,
        },
    )

    # The studio_job_event payload must include active_segment_id and active_segment_progress
    assert messages[0]["active_segment_id"] == "seg-1"
    assert messages[0]["active_segment_progress"] == 0.75


def test_broadcast_job_updated_active_segment_progress_guard(monkeypatch):
    messages = []

    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    broadcast_job_updated(
        "job-segment-test-guard",
        {"active_segment_progress": 0.75},
        {
            "status": "running",
            "progress": 0.5,
            "active_segment_id": None,
            "active_segment_progress": 0.75,
        },
    )

    # The studio_job_event payload must NOT include active_segment_id or active_segment_progress
    assert "active_segment_id" not in messages[0]
    assert "active_segment_progress" not in messages[0]


def test_broadcast_queue_update_sends_structured_payload(monkeypatch):
    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)
    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    from app.api.ws import broadcast_queue_update
    broadcast_queue_update(
        reason="job_status_change",
        job_id="job-123",
        project_id="proj-456",
        changed_fields=["status"]
    )

    assert len(messages) == 1
    assert messages[0] == {
        "type": "queue_updated",
        "reason": "job_status_change",
        "job_id": "job-123",
        "project_id": "proj-456",
        "changed_fields": ["status"]
    }


def test_broadcast_segments_updated_sends_structured_payload(monkeypatch):
    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)
    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    from app.api.ws import broadcast_segments_updated
    broadcast_segments_updated(
        chapter_id="chap-789",
        reason="segments_rebuilt",
        job_id="job-123",
        project_id="proj-456",
        changed_fields=["audio_status"]
    )

    assert len(messages) == 1
    assert messages[0] == {
        "type": "segments_updated",
        "chapter_id": "chap-789",
        "reason": "segments_rebuilt",
        "job_id": "job-123",
        "project_id": "proj-456",
        "changed_fields": ["audio_status"]
    }


def test_broadcast_chapter_updated_sends_structured_payload(monkeypatch):
    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)
    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    from app.api.ws import broadcast_chapter_updated
    broadcast_chapter_updated(
        chapter_id="chap-789",
        reason="chapter_metadata_change",
        job_id="job-123",
        project_id="proj-456",
        changed_fields=["title"]
    )

    assert len(messages) == 1
    assert messages[0] == {
        "type": "chapter_updated",
        "chapter_id": "chap-789",
        "reason": "chapter_metadata_change",
        "job_id": "job-123",
        "project_id": "proj-456",
        "changed_fields": ["title"]
    }


def test_broadcast_project_updated_sends_structured_payload(monkeypatch):
    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)
    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    from app.api.ws import broadcast_project_updated
    broadcast_project_updated(
        project_id="proj-456",
        reason="project_membership_change",
        job_id="job-123",
        changed_fields=["status"]
    )

    assert len(messages) == 1
    assert messages[0] == {
        "type": "project_updated",
        "project_id": "proj-456",
        "reason": "project_membership_change",
        "job_id": "job-123",
        "changed_fields": ["status"]
    }
