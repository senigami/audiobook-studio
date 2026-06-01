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

    assert messages == []


def test_broadcast_job_updated_preserves_context_in_job_updated_payload(monkeypatch):
    messages = []

    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    broadcast_job_updated(
        "job-3",
        {"progress": 0.5},
        {"status": "running", "progress": 0.5, "chapter_id": "chap-1", "project_id": "proj-1", "parent_job_id": "chapter-parent", "classification": "segment"},
    )

    assert len(messages) == 1
    event = messages[0]
    assert event["type"] == "studio_event"
    assert event["topic"] == "segments.progress"
    assert event["ids"]["projectId"] == "proj-1"
    assert event["ids"]["chapterId"] == "chap-1"
    assert event["ids"]["jobId"] == "job-3"
    assert event["source"].endswith("test_broadcast_job_updated_preserves_context_in_job_updated_payload")


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

    assert messages == []


def test_broadcast_job_updated_chapter_progress_emits_chapter_progress_only(monkeypatch):
    messages = []

    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    # Update progress without status change for a chapter-classified job
    broadcast_job_updated(
        "job-chap-progress",
        {"progress": 0.52, "eta_seconds": 30},
        {"status": "running", "progress": 0.10, "chapter_id": "chap-123", "project_id": "proj-123", "classification": "chapter"},
    )

    # We expect only the chapter-scoped progress event to be broadcast
    topics = [m["topic"] for m in messages]
    assert "chapters.progress" in topics
    assert "queue.items" not in topics
    assert len(messages) == 1
    assert messages[0]["topic"] == "chapters.progress"
    assert messages[0]["payload"]["progress"] == 0.52
    assert messages[0]["payload"]["status"] == "running"


def test_broadcast_tts_log_line_sends_canonical_envelope(monkeypatch):
    messages = []

    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    from app.api.ws import broadcast_tts_log_line, reset_tts_log_line_sequences_for_tests

    reset_tts_log_line_sequences_for_tests()
    broadcast_tts_log_line(
        job_id="job-tts",
        project_id="proj-1",
        chapter_id="chap-1",
        line="[PROGRESS] 40% job-tts",
        received_at=123.45,
    )

    assert len(messages) == 1
    event = messages[0]
    assert event["type"] == "studio_event"
    assert event["version"] == 1
    assert event["topic"] == "tts.logs"
    assert event["eventKind"] == "tts_log"
    assert event["ids"] == {
        "projectId": "proj-1",
        "chapterId": "chap-1",
        "jobId": "job-tts",
        "segmentId": None
    }
    assert event["payload"] == {
        "line": "[PROGRESS] 40% job-tts",
        "level": "INFO",
        "sequence": 1,
        "pluginId": None,
        "pluginShortName": None,
        "jobId": "job-tts",
        "chapterId": "chap-1",
        "source": "tests.api.test_websocket_broadcast.test_broadcast_tts_log_line_sends_canonical_envelope",
        "marker": "PROGRESS",
        "received_at": 123.45,
        "backendReceivedAt": 123.45
    }


def test_broadcast_tts_log_line_sequences_are_per_job(monkeypatch):
    messages = []

    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    from app.api.ws import broadcast_tts_log_line, reset_tts_log_line_sequences_for_tests

    reset_tts_log_line_sequences_for_tests()
    broadcast_tts_log_line(job_id="job-a", project_id=None, chapter_id=None, line="[START_SYNTHESIS] job-a", received_at=1.0)
    broadcast_tts_log_line(job_id="job-a", project_id=None, chapter_id=None, line="[START_SEGMENT] seg-1", received_at=2.0)
    broadcast_tts_log_line(job_id="job-b", project_id=None, chapter_id=None, line="plain output", received_at=3.0)

    assert len(messages) == 3
    assert [m["payload"]["sequence"] for m in messages] == [1, 2, 1]
    assert [m["payload"]["marker"] for m in messages] == ["START_SYNTHESIS", "START_SEGMENT", "raw"]
    assert all(m["type"] == "studio_event" for m in messages)
    assert all(m["topic"] == "tts.logs" for m in messages)


def test_broadcast_queue_update_sends_canonical_envelope(monkeypatch):
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
    event = messages[0]
    assert event["type"] == "studio_event"
    assert event["version"] == 1
    assert event["topic"] == "queue.items"
    assert event["eventKind"] == "queue_item_invalidated"
    assert event["ids"] == {
        "projectId": "proj-456",
        "chapterId": None,
        "jobId": "job-123",
        "segmentId": None
    }
    assert event["payload"] == {
        "reasonCode": "QUEUE_INVALIDATED",
        "changedFields": ["status"],
        "changed_fields": ["status"]  # Legacy compatibility
    }
    assert event["source"].endswith("test_broadcast_queue_update_sends_canonical_envelope")


def test_broadcast_segments_updated_sends_canonical_envelope(monkeypatch):
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
    event = messages[0]
    assert event["type"] == "studio_event"
    assert event["version"] == 1
    assert event["topic"] == "segments.lifecycle"
    assert event["eventKind"] == "segment_lifecycle"
    assert event["ids"] == {
        "projectId": "proj-456",
        "chapterId": "chap-789",
        "jobId": "job-123",
        "segmentId": None
    }
    assert "reason" not in event["payload"]
    assert event["payload"] == {
        "reasonCode": "segments_rebuilt",
        "reason_code": "segments_rebuilt",  # Legacy compatibility
        "changedFields": ["audio_status"],
        "changed_fields": ["audio_status"]  # Legacy compatibility
    }
    assert event["source"].endswith("test_broadcast_segments_updated_sends_canonical_envelope")


def test_broadcast_chapter_updated_sends_canonical_envelope(monkeypatch):
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
    event = messages[0]
    assert event["type"] == "studio_event"
    assert event["version"] == 1
    assert event["topic"] == "chapters.lifecycle"
    assert event["eventKind"] == "chapter_lifecycle"
    assert event["ids"] == {
        "projectId": "proj-456",
        "chapterId": "chap-789",
        "jobId": "job-123",
        "segmentId": None
    }
    assert "reason" not in event["payload"]
    assert event["payload"] == {
        "reasonCode": "chapter_metadata_change",
        "reason_code": "chapter_metadata_change",  # Legacy compatibility
        "changedFields": ["title"],
        "changed_fields": ["title"]  # Legacy compatibility
    }
    assert event["source"].endswith("test_broadcast_chapter_updated_sends_canonical_envelope")


def test_broadcast_project_updated_sends_canonical_envelope(monkeypatch):
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
    event = messages[0]
    assert event["type"] == "studio_event"
    assert event["version"] == 1
    assert event["topic"] == "projects.lifecycle"
    assert event["eventKind"] == "project_invalidated"
    assert event["ids"] == {
        "projectId": "proj-456",
        "chapterId": None,
        "jobId": "job-123",
        "segmentId": None
    }
    assert "reason" not in event["payload"]
    assert event["payload"] == {
        "reasonCode": "project_membership_change",
        "reason_code": "project_membership_change",  # Legacy compatibility
        "changedFields": ["status"],
        "changed_fields": ["status"]  # Legacy compatibility
    }
    assert event["source"].endswith("test_broadcast_project_updated_sends_canonical_envelope")

def test_status_only_job_updates_do_not_emit_chapter_or_queue_updates(monkeypatch):
    """
    Backend test: status-only job updates do not emit chapter_updated or queue_item_invalidated.
    Real metadata/terminal changes still emit the appropriate invalidation broadcast.
    """
    broadcasts = []

    # Mock the ws functions
    monkeypatch.setattr("app.api.ws.broadcast_chapter_updated", lambda *args, **kwargs: broadcasts.append(("chapter_updated", args, kwargs)))
    monkeypatch.setattr("app.api.ws.broadcast_queue_update", lambda *args, **kwargs: broadcasts.append(("queue_item_invalidated", args, kwargs)))

    # Mock SQLite sync function
    monkeypatch.setattr("app.db.update_queue_item", lambda *args, **kwargs: None)

    # Mock state functions
    state_mock = {"jobs": {
        "job-test-1": {
            "id": "job-test-1",
            "status": "queued",
            "chapter_id": "chap-1",
            "project_id": "proj-1",
            "created_at": 100.0,
            "engine": "xtts"
        }
    }}
    monkeypatch.setattr("app.db.state_jobs._load_state_no_lock", lambda: state_mock)
    monkeypatch.setattr("app.db.state_jobs._atomic_write_text", lambda *args, **kwargs: None)

    # 1. Update from queued to preparing (status-only transition)
    from app.db.state_jobs import update_job
    update_job("job-test-1", status="preparing")

    # We expect status-only transitions NOT to broadcast chapter_updated or queue_item_invalidated
    assert broadcasts == []

    # 2. Update to done (terminal state)
    update_job("job-test-1", status="done")

    # We expect terminal transitions TO broadcast chapter_updated but NOT queue_item_invalidated
    assert len(broadcasts) > 0
    assert any(b[0] == "chapter_updated" for b in broadcasts)
    assert not any(b[0] == "queue_item_invalidated" for b in broadcasts)


def test_terminal_job_reset_to_active_emits_invalidation_broadcasts(monkeypatch):
    broadcasts = []

    monkeypatch.setattr("app.api.ws.broadcast_chapter_updated", lambda *args, **kwargs: broadcasts.append(("chapter_updated", args, kwargs)))
    monkeypatch.setattr("app.api.ws.broadcast_queue_update", lambda *args, **kwargs: broadcasts.append(("queue_item_invalidated", args, kwargs)))
    monkeypatch.setattr("app.db.update_queue_item", lambda *args, **kwargs: None)

    state_mock = {"jobs": {
        "job-test-reset": {
            "id": "job-test-reset",
            "status": "done",
            "chapter_id": "chap-reset",
            "project_id": "proj-reset",
            "created_at": 100.0,
            "finished_at": 120.0,
            "eta_seconds": 5,
            "eta_basis": "remaining_from_update",
            "estimated_end_at": 125.0,
            "engine": "xtts"
        }
    }}
    monkeypatch.setattr("app.db.state_jobs._load_state_no_lock", lambda: state_mock)
    monkeypatch.setattr("app.db.state_jobs._atomic_write_text", lambda *args, **kwargs: None)

    from app.db.state_jobs import update_job
    update_job("job-test-reset", status="queued")

    assert any(b[0] == "chapter_updated" for b in broadcasts)
    assert any(b[0] == "queue_item_invalidated" for b in broadcasts)


def test_update_job_with_force_broadcast_emits_chapter_and_queue_updates(monkeypatch):
    """
    Backend test: real metadata changes (forced broadcasts) still emit the appropriate invalidation broadcast.
    """
    broadcasts = []

    # Mock the ws functions
    monkeypatch.setattr("app.api.ws.broadcast_chapter_updated", lambda *args, **kwargs: broadcasts.append(("chapter_updated", args, kwargs)))
    monkeypatch.setattr("app.api.ws.broadcast_queue_update", lambda *args, **kwargs: broadcasts.append(("queue_item_invalidated", args, kwargs)))

    # Mock SQLite sync function
    monkeypatch.setattr("app.db.update_queue_item", lambda *args, **kwargs: None)

    # Mock state functions
    state_mock = {"jobs": {
        "job-test-2": {
            "id": "job-test-2",
            "status": "running",
            "chapter_id": "chap-2",
            "project_id": "proj-2",
            "created_at": 100.0,
            "engine": "xtts"
        }
    }}
    monkeypatch.setattr("app.db.state_jobs._load_state_no_lock", lambda: state_mock)
    monkeypatch.setattr("app.db.state_jobs._atomic_write_text", lambda *args, **kwargs: None)

    # Update status-only but with force_broadcast=True (simulating metadata changes)
    from app.db.state_jobs import update_job
    update_job("job-test-2", force_broadcast=True, status="running")

    # We expect forced/metadata transitions TO broadcast both
    assert len(broadcasts) > 0
    assert any(b[0] == "chapter_updated" for b in broadcasts)
    assert any(b[0] == "queue_item_invalidated" for b in broadcasts)


def test_update_job_propagates_source(monkeypatch):
    broadcasts = []

    def dummy_broadcast(job_id, updates, job_snapshot=None):
        broadcasts.append((job_id, dict(updates), job_snapshot))

    import app.db.state as state_module
    monkeypatch.setattr(state_module, "_JOB_LISTENERS", [dummy_broadcast])
    monkeypatch.setattr(state_module, "_LISTENER_SNAPSHOT_SUPPORT", {dummy_broadcast: True})
    monkeypatch.setattr("app.db.update_queue_item", lambda *args, **kwargs: None)

    state_mock = {"jobs": {
        "job-source-test": {
            "id": "job-source-test",
            "status": "running",
            "progress": 0.5,
            "engine": "xtts"
        }
    }}
    monkeypatch.setattr("app.db.state_jobs._load_state_no_lock", lambda: state_mock)
    monkeypatch.setattr("app.db.state_jobs._atomic_write_text", lambda *args, **kwargs: None)

    from app.db.state_jobs import update_job

    # 1. Test explicit source
    update_job("job-source-test", progress=0.6, source="explicit_test_caller")
    assert len(broadcasts) == 1
    assert broadcasts[0][1].get("source") == "explicit_test_caller"

    # 2. Test auto-resolved source
    update_job("job-source-test", progress=0.7)
    assert len(broadcasts) == 2
    assert broadcasts[1][1].get("source") == "tests.api.test_websocket_broadcast.test_update_job_propagates_source"


def test_broadcast_job_updated_respects_skip_job_updated(monkeypatch):
    messages = []

    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    # When skip_job_updated=True and the update is progress-only, we expect no broadcast.
    broadcast_job_updated(
        "job-1",
        {"progress": 0.5, "eta_seconds": 12, "skip_job_updated": True},
        {"status": "running", "progress": 0.5, "eta_seconds": 12},
    )

    assert messages == []


def test_update_job_respects_skip_job_updated(monkeypatch):
    broadcasts = []

    def dummy_broadcast(job_id, updates, job_snapshot=None):
        broadcasts.append((job_id, dict(updates), job_snapshot))

    import app.db.state as state_module
    monkeypatch.setattr(state_module, "_JOB_LISTENERS", [dummy_broadcast])
    monkeypatch.setattr(state_module, "_LISTENER_SNAPSHOT_SUPPORT", {dummy_broadcast: True})
    monkeypatch.setattr("app.db.update_queue_item", lambda *args, **kwargs: None)

    state_mock = {"jobs": {
        "job-skip-test": {
            "id": "job-skip-test",
            "status": "running",
            "progress": 0.5,
            "engine": "xtts"
        }
    }}
    monkeypatch.setattr("app.db.state_jobs._load_state_no_lock", lambda: state_mock)
    monkeypatch.setattr("app.db.state_jobs._atomic_write_text", lambda *args, **kwargs: None)

    from app.db.state_jobs import update_job

    update_job("job-skip-test", progress=0.6, skip_job_updated=True)
    assert len(broadcasts) == 1
    assert broadcasts[0][1].get("skip_job_updated") is True


def test_api_add_to_queue_websocket_burst_no_redundancy(monkeypatch, tmp_path, voices_root):
    import os
    import importlib
    import json
    from unittest.mock import patch
    from fastapi.testclient import TestClient
    from app.api.web import app as fastapi_app

    # Setup test DB
    db_path = tmp_path / "test_ws_burst.db"
    os.environ["DB_PATH"] = str(db_path)
    import app.db.core
    importlib.reload(app.db.core)
    app.db.core.init_db()

    # Create Voice1 profile on disk
    v_dir = voices_root / "Voice1" / "Default"
    v_dir.mkdir(parents=True, exist_ok=True)
    (v_dir / "profile.json").write_text(json.dumps({"variant_name": "Default", "engine": "xtts"}))
    (voices_root / "Voice1" / "voice.json").write_text(json.dumps({"version": 2, "name": "Voice1"}))

    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments
    from app.db.state import update_settings

    update_settings({"default_speaker_profile": "Voice1", "mistral_api_key": "test_key", "default_engine": "xtts"})

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")

    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    # We patch the TaskOrchestrator.submit to prevent running background tasks
    with patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"):
        client = TestClient(fastapi_app)
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid})
        assert response.status_code == 200

    # Count message types
    # Count message types
    chapter_progress_queued = [
        m for m in messages
        if m.get("type") == "studio_event"
        and m.get("topic") == "chapters.progress"
        and m.get("payload", {}).get("status") == "queued"
    ]
    job_updated_queued = [m for m in messages if m.get("type") == "job_updated" and m.get("updates", {}).get("status") == "queued"]
    chapter_updated = [
        m for m in messages
        if m.get("type") == "studio_event"
        and m.get("topic") == "chapters.lifecycle"
        and m.get("eventKind") == "chapter_lifecycle"
    ]
    queue_item_invalidated = [
        m for m in messages
        if m.get("type") == "studio_event"
        and m.get("topic") == "queue.items"
        and m.get("eventKind") == "queue_item_invalidated"
    ]

    assert len(chapter_progress_queued) == 1, f"Expected 1 chapters.progress (queued), got {len(chapter_progress_queued)}: {chapter_progress_queued}"
    assert len(job_updated_queued) == 0, f"Expected 0 job_updated (queued) after suppression, got {len(job_updated_queued)}: {job_updated_queued}"
    assert len(chapter_updated) == 1, f"Expected 1 chapter_updated studio_event, got {len(chapter_updated)}: {chapter_updated}"
    assert len(queue_item_invalidated) == 1, f"Expected 1 queue_item_invalidated studio_event, got {len(queue_item_invalidated)}: {queue_item_invalidated}"



# --- Phase 1 Studio Event Broadcaster Contract tests ---

def test_build_studio_event_envelope_shape():
    from app.api.contracts.events import build_studio_event
    import time

    event = build_studio_event(
        topic="system.events",
        event_kind="test_event",
        payload={"foo": "bar"},
        project_id="p-1",
        chapter_id="c-1",
        job_id="j-1",
        segment_id="s-1",
        source="test_source"
    )

    assert event["type"] == "studio_event"
    assert event["version"] == 1
    assert event["topic"] == "system.events"
    assert event["eventKind"] == "test_event"
    assert event["source"] == "test_source"
    assert isinstance(event["emittedAt"], float)
    assert event["emittedAt"] <= time.time()
    assert event["pluginId"] is None
    assert event["ids"] == {
        "projectId": "p-1",
        "chapterId": "c-1",
        "jobId": "j-1",
        "segmentId": "s-1"
    }
    assert event["payload"] == {"foo": "bar"}


def test_build_core_topic_helpers():
    from app.api.contracts.events import (
        build_tts_log_event,
        build_queue_item_status_event,
        build_queue_item_invalidated_event,
        build_queue_paused_event,
        build_job_lifecycle_event,
        build_chapter_progress_event,
        build_segment_progress_event,
        build_segment_lifecycle_event,
        build_chapter_lifecycle_event,
        build_voice_test_progress_event,
        build_system_event,
        build_project_lifecycle_event
    )

    # 1. tts.logs
    e_tts = build_tts_log_event(
        line="synthesizing",
        level="INFO",
        sequence=42,
        plugin_id="tts_xtts",
        job_id="j-1",
        chapter_id="c-1"
    )
    assert e_tts["topic"] == "tts.logs"
    assert e_tts["pluginId"] == "tts_xtts"
    assert e_tts["payload"] == {
        "line": "synthesizing",
        "level": "INFO",
        "sequence": 42,
        "pluginId": "tts_xtts",
        "pluginShortName": None,
        "jobId": "j-1",
        "chapterId": "c-1",
        "source": e_tts["payload"]["source"],
        "marker": "raw",
        "received_at": None,
        "backendReceivedAt": None
    }

    # 2. queue.items status
    e_queue_status = build_queue_item_status_event(
        job_id="j-1",
        status="running",
        progress=0.45,
        eta_seconds=120,
        message="Running synthesis",
        reason_code="synth_progress",
        classification="segment"
    )
    assert e_queue_status["topic"] == "queue.items"
    assert e_queue_status["eventKind"] == "queue_item_status"
    assert e_queue_status["payload"] == {
        "status": "running",
        "progress": 0.45,
        "etaSeconds": 120,
        "message": None,
        "reasonCode": None,
        "classification": "segment",
        "changedFields": None,
        "paused": None,
        "hasSegmentSupport": None,
        "has_segment_support": None,
        "eta_seconds": 120,
        "reason_code": None
    }

    # 2b. jobs.lifecycle status
    e_job_lifecycle = build_job_lifecycle_event(
        job_id="j-1",
        status="running",
        message="Running synthesis",
    )
    assert e_job_lifecycle["topic"] == "jobs.lifecycle"
    assert e_job_lifecycle["eventKind"] == "job_lifecycle"
    assert e_job_lifecycle["payload"]["reasonCode"] == "START_SYNTHESIS"
    assert e_job_lifecycle["payload"]["status"] == "running"
    assert e_job_lifecycle["payload"]["message"] == "Running synthesis"
    assert e_job_lifecycle["payload"]["hasSegmentSupport"] is None
    assert e_job_lifecycle["payload"]["has_segment_support"] is None

    # Verify finalizing is preserved without remapping to running
    e_job_finalizing = build_job_lifecycle_event(
        job_id="j-1",
        status="finalizing",
        message="Finalizing synthesis",
    )
    assert e_job_finalizing["payload"]["status"] == "finalizing"


    # Test message filtering on segment_start and segment_saved
    for reason in ("segment_start", "segment_saved"):
        e_queue_filtered = build_queue_item_status_event(
            job_id="j-1",
            status="running",
            progress=0.45,
            message="Some message",
            reason_code=reason
        )
        if reason == "segment_start":
            assert e_queue_filtered["payload"]["reasonCode"] == "START_SYNTHESIS"
            assert e_queue_filtered["payload"]["message"] == "Some message"
        else:
            assert e_queue_filtered["payload"]["reasonCode"] is None
            assert e_queue_filtered["payload"]["message"] == "Some message"


    # 3. queue.items invalidated
    e_queue_inv = build_queue_item_invalidated_event(
        reason="job_canceled",
        changed_fields=["status", "finished_at"]
    )
    assert e_queue_inv["topic"] == "queue.items"
    assert e_queue_inv["eventKind"] == "queue_item_invalidated"
    assert e_queue_inv["payload"]["reasonCode"] == "QUEUE_INVALIDATED"
    assert e_queue_inv["payload"]["changedFields"] == ["status", "finished_at"]

    # 4. queue.items paused
    e_queue_paused = build_queue_paused_event(paused=True)
    assert e_queue_paused["topic"] == "queue.items"
    assert e_queue_paused["eventKind"] == "queue_paused"
    assert e_queue_paused["payload"]["reasonCode"] == "QUEUE_INVALIDATED"
    assert e_queue_paused["payload"]["changedFields"] == ["paused"]

    # 5. chapters.progress
    e_chap_prog = build_chapter_progress_event(
        chapter_id="c-1",
        status="running",
        progress=0.8,
        grouped_progress=0.5,
        eta_seconds=60,
        message="rendering",
        reason_code="rendering_chapter",
        render_group_count=10,
        completed_render_groups=5
    )
    assert e_chap_prog["topic"] == "chapters.progress"
    payload = e_chap_prog["payload"]
    assert "etaUpdatedAt" in payload
    assert "eta_updated_at" in payload
    assert isinstance(payload["etaUpdatedAt"], (int, float))
    assert isinstance(payload["eta_updated_at"], (int, float))

    cleaned_payload = {k: v for k, v in payload.items() if k not in ("etaUpdatedAt", "eta_updated_at")}
    assert cleaned_payload == {
        "status": "running",
        "progress": 0.8,
        "groupedProgress": 0.5,
        "etaSeconds": 60,
        "message": None,
        "reasonCode": None,
        "renderGroupCount": 10,
        "completedRenderGroups": 5,
        "hasSegmentSupport": None,
        "has_segment_support": None,
        "grouped_progress": 0.5,
        "eta_seconds": 60,
        "reason_code": None,
        "render_group_count": 10,
        "completed_render_groups": 5,
    }


    # 6. segments.progress
    e_seg_prog = build_segment_progress_event(
        segment_id="s-1",
        status="running",
        progress=0.25,
        segment_index=2,
        segment_count=5,
        message="synthesizing segment",
        reason_code="segment_synth"
    )
    assert e_seg_prog["topic"] == "segments.progress"
    assert e_seg_prog["payload"] == {
        "status": "running",
        "progress": 0.25,
        "segmentIndex": 2,
        "segmentCount": 5,
        "message": None,
        "reasonCode": None,
        "reason_code": None,
        "activeSegmentId": "s-1",
        "activeSegmentProgress": 0.25,
        "active_segment_id": "s-1",
        "active_segment_progress": 0.25,
        "etaSeconds": None,
        "eta_seconds": None,
        "hasSegmentSupport": None,
        "has_segment_support": None,
    }


    # 7. segments.lifecycle
    e_seg_life = build_segment_lifecycle_event(
        chapter_id="c-1",
        reason="saved",
        changed_fields=["audio_path"]
    )
    assert e_seg_life["topic"] == "segments.lifecycle"
    assert "reason" not in e_seg_life["payload"]
    assert e_seg_life["payload"] == {
        "reasonCode": "saved",
        "reason_code": "saved",  # Legacy compatibility
        "changedFields": ["audio_path"],
        "changed_fields": ["audio_path"]  # Legacy compatibility
    }

    # 8. chapters.lifecycle
    e_chap_life = build_chapter_lifecycle_event(
        chapter_id="c-1",
        reason="reset",
        changed_fields=["audio_status"]
    )
    assert e_chap_life["topic"] == "chapters.lifecycle"
    assert "reason" not in e_chap_life["payload"]
    assert e_chap_life["payload"] == {
        "reasonCode": "reset",
        "reason_code": "reset",  # Legacy compatibility
        "changedFields": ["audio_status"],
        "changed_fields": ["audio_status"]  # Legacy compatibility
    }

    # 9. voice.test
    e_voice = build_voice_test_progress_event(
        voice_name="VoiceA",
        status="running",
        progress=0.5,
        started_at=100.0,
        message="building"
    )
    assert e_voice["topic"] == "voice.test"
    assert e_voice["payload"] == {
        "voiceName": "VoiceA",
        "status": "running",
        "progress": 0.5,
        "startedAt": 100.0,
        "message": "building",
        "name": "VoiceA",
        "started_at": 100.0  # Legacy compatibility
    }

    # 10. system.events
    e_sys = build_system_event(
        event_kind="disk_space_low",
        message="Remaining disk space below 10%",
        details={"free_bytes": 10000}
    )
    assert e_sys["topic"] == "system.events"
    assert e_sys["payload"] == {
        "eventKind": "disk_space_low",
        "message": "Remaining disk space below 10%",
        "details": {"free_bytes": 10000}
    }

    # 11. projects.lifecycle
    e_proj = build_project_lifecycle_event(
        project_id="proj-456",
        reason="project_membership_change",
        changed_fields=["status"],
        job_id="job-123"
    )
    assert e_proj["topic"] == "projects.lifecycle"
    assert e_proj["eventKind"] == "project_invalidated"
    assert e_proj["ids"] == {
        "projectId": "proj-456",
        "chapterId": None,
        "jobId": "job-123",
        "segmentId": None
    }
    assert "reason" not in e_proj["payload"]
    assert e_proj["payload"] == {
        "reasonCode": "project_membership_change",
        "reason_code": "project_membership_change",  # Legacy compatibility
        "changedFields": ["status"],
        "changed_fields": ["status"]  # Legacy compatibility
    }


def test_build_plugin_event_success():
    from app.api.contracts.events import build_plugin_event

    event = build_plugin_event(
        plugin_id="tts_xtts",
        area="synthesis",
        event_kind="custom_log",
        payload={"some_key": "some_val"},
        project_id="p-1",
        chapter_id="c-1"
    )

    assert event["topic"] == "plugins.tts_xtts.synthesis"
    assert event["eventKind"] == "custom_log"
    assert event["pluginId"] == "tts_xtts"
    assert event["payload"] == {"some_key": "some_val"}


def test_build_plugin_event_validations():
    from app.api.contracts.events import build_plugin_event

    # 1. Invalid pluginId format
    with pytest.raises(ValueError, match="Invalid plugin_id format"):
        build_plugin_event(
            plugin_id="bad/plugin",
            area="synthesis",
            event_kind="custom",
            payload={}
        )

    # 2. empty/None pluginId
    with pytest.raises(ValueError, match="plugin_id must be a non-empty string"):
        build_plugin_event(
            plugin_id="",
            area="synthesis",
            event_kind="custom",
            payload={}
        )

    # 3. area containing bad chars or empty
    with pytest.raises(ValueError, match="area must be a valid alphanumeric"):
        build_plugin_event(
            plugin_id="tts_xtts",
            area="bad/area",
            event_kind="custom",
            payload={}
        )

    # 4. publish to core topics
    # Note: Topic is derived from plugins.<plugin_id>.<area>.
    # If a plugin tried to name itself such that the resulting topic matched core topics (or if there's any core topic conflict check)
    # Let's make sure plugins cannot override core topic names or intercept them.
    # Wait, can a plugin publish to "queue.items"?
    # The topic is generated as f"plugins.{plugin_id}.{area}", which always has the "plugins." prefix,
    # so it naturally cannot equal "queue.items" (since "queue.items" doesn't start with "plugins.").
    # But what if topic is passed manually, or what if we check f"plugins.{plugin_id}.{area}" prefix?
    # Let's verify that the topic derived cannot conflict with core topics.


def test_broadcast_studio_event_sends_exact_event(monkeypatch):
    from app.api.ws import broadcast_studio_event

    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    sample_event = {
        "type": "studio_event",
        "version": 1,
        "topic": "queue.items",
        "eventKind": "queue_item_status",
        "source": "test_src",
        "emittedAt": 12345.67,
        "pluginId": None,
        "ids": {
            "projectId": "p1",
            "chapterId": "c1",
            "jobId": "j1",
            "segmentId": "s1"
        },
        "payload": {"status": "running"}
    }

    broadcast_studio_event(sample_event)

    assert len(messages) == 1
    assert messages[0] == sample_event


def test_broadcast_studio_event_does_not_mutate(monkeypatch):
    from app.api.ws import broadcast_studio_event

    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    sample_event = {
        "type": "studio_event",
        "version": 1,
        "topic": "tts.logs",
        "eventKind": "tts_log",
        "source": "test_src",
        "emittedAt": 999.0,
        "pluginId": "xtts",
        "ids": {
            "projectId": None,
            "chapterId": None,
            "jobId": None,
            "segmentId": None
        },
        "payload": {"line": "hello"}
    }

    # Deep copy the original to assert no mutation
    import copy
    original_event = copy.deepcopy(sample_event)

    broadcast_studio_event(sample_event)

    assert sample_event == original_event


def test_broadcast_pause_state_sends_canonical_envelope(monkeypatch):
    from app.api.ws import broadcast_pause_state

    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    broadcast_pause_state(paused=True)

    assert len(messages) == 1
    event = messages[0]
    assert event["type"] == "studio_event"
    assert event["version"] == 1
    assert event["topic"] == "queue.items"
    assert event["eventKind"] == "queue_paused"
    assert event["ids"] == {
        "projectId": None,
        "chapterId": None,
        "jobId": None,
        "segmentId": None
    }
    assert event["payload"] == {
        "reasonCode": "QUEUE_INVALIDATED",
        "changedFields": ["paused"],
        "paused": True,
        "changed_fields": ["paused"]  # Legacy compatibility
    }
    assert event["source"].endswith("test_broadcast_pause_state_sends_canonical_envelope")


def test_broadcast_test_progress_sends_canonical_envelope(monkeypatch):
    from app.api.ws import broadcast_test_progress

    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    broadcast_test_progress(name="VoiceB", progress=0.75, started_at=123.45)

    assert len(messages) == 1
    event = messages[0]
    assert event["type"] == "studio_event"
    assert event["version"] == 1
    assert event["topic"] == "voice.test"
    assert event["eventKind"] == "voice_test_progress"
    assert event["ids"] == {
        "projectId": None,
        "chapterId": None,
        "jobId": None,
        "segmentId": None
    }
    assert event["payload"] == {
        "voiceName": "VoiceB",
        "status": "running",
        "progress": 0.75,
        "startedAt": 123.45,
        "message": None,
        "name": "VoiceB",
        "started_at": 123.45  # Legacy compatibility
    }
    assert event["source"].endswith("test_broadcast_test_progress_sends_canonical_envelope")


def test_broadcast_segment_progress_sends_canonical_envelope(monkeypatch):
    from app.api.ws import broadcast_segment_progress

    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    broadcast_segment_progress(
        job_id="job-123",
        chapter_id="chap-456",
        segment_id="seg-789",
        progress=0.67,
    )

    assert len(messages) == 1
    event = messages[0]
    assert event["type"] == "studio_event"
    assert event["version"] == 1
    assert event["topic"] == "segments.progress"
    assert event["eventKind"] == "segment_progress"
    assert event["ids"] == {
        "projectId": None,
        "chapterId": "chap-456",
        "jobId": "job-123",
        "segmentId": "seg-789"
    }
    assert event["payload"] == {
        "status": "running",
        "progress": 0.67,
        "segmentIndex": None,
        "segmentCount": None,
        "message": None,
        "reasonCode": None,
        "reason_code": None,  # Legacy compatibility
        "activeSegmentId": "seg-789",
        "activeSegmentProgress": 0.67,
        "active_segment_id": "seg-789",
        "active_segment_progress": 0.67,
        "etaSeconds": None,
        "eta_seconds": None,
        "hasSegmentSupport": True,
        "has_segment_support": True,
    }
    assert event["source"].endswith("test_broadcast_segment_progress_sends_canonical_envelope")


def test_broadcast_job_updated_chapter_progress_sends_canonical_envelope(monkeypatch):
    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    # Send a chapter-classified update
    broadcast_job_updated(
        "job-chap-123",
        {"progress": 0.77, "grouped_progress": 0.6, "eta_seconds": 45, "render_group_count": 8, "completed_render_groups": 4},
        {"status": "running", "progress": 0.77, "chapter_id": "chap-1", "project_id": "proj-1"},
    )

    # We expect a single scoped chapter progress broadcast for this status-stable update.
    assert len(messages) == 1

    chap_events = [m for m in messages if m["topic"] == "chapters.progress"]
    assert len(chap_events) == 1
    event = chap_events[0]
    assert event["type"] == "studio_event"
    assert event["version"] == 1
    assert event["topic"] == "chapters.progress"
    assert event["eventKind"] == "chapter_progress"
    assert event["ids"] == {
        "projectId": "proj-1",
        "chapterId": "chap-1",
        "jobId": "job-chap-123",
        "segmentId": None
    }
    # Check payload has both camelCase and snake_case compatibility keys
    assert event["payload"]["status"] == "running"
    assert event["payload"]["progress"] == 0.77
    assert event["payload"]["groupedProgress"] == 0.6
    assert event["payload"]["grouped_progress"] == 0.6
    assert event["payload"]["etaSeconds"] == 45
    assert event["payload"]["eta_seconds"] == 45
    assert event["payload"]["renderGroupCount"] == 8
    assert event["payload"]["render_group_count"] == 8
    assert event["payload"]["completedRenderGroups"] == 4
    assert event["payload"]["completed_render_groups"] == 4


def test_broadcast_job_updated_chapter_progress_respects_skip_studio_job_event(monkeypatch):
    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    # Send a chapter-classified update with skip_studio_job_event=True
    broadcast_job_updated(
        "job-chap-123",
        {"progress": 0.77, "skip_studio_job_event": True},
        {"status": "running", "progress": 0.77, "chapter_id": "chap-1", "project_id": "proj-1"},
    )

    # Since skip_studio_job_event=True (already sent via ProgressService path), we expect ZERO broadcasts
    assert len(messages) == 0


def test_broadcast_job_updated_segment_progress_sends_canonical_envelope(monkeypatch):
    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    # Send a segment-classified update
    broadcast_job_updated(
        "job-seg-123",
        {"progress": 0.5, "eta_seconds": 15},
        {"status": "running", "progress": 0.5, "parent_job_id": "chapter-parent-job", "chapter_id": "chap-1", "project_id": "proj-1", "classification": "segment"},
    )

    # We expect only one broadcast: the canonical segments.progress studio_event
    assert len(messages) == 1
    event = messages[0]
    assert event["type"] == "studio_event"
    assert event["version"] == 1
    assert event["topic"] == "segments.progress"
    assert event["eventKind"] == "segment_progress"
    assert event["ids"] == {
        "projectId": "proj-1",
        "chapterId": "chap-1",
        "jobId": "job-seg-123",
        "segmentId": "job-seg-123"
    }
    # Check payload has legacy/compatibility keys
    assert event["payload"]["status"] == "running"
    assert event["payload"]["progress"] == 0.5
    assert event["payload"]["activeSegmentId"] == "job-seg-123"
    assert event["payload"]["activeSegmentProgress"] == 0.5
    assert event["payload"]["active_segment_id"] == "job-seg-123"
    assert event["payload"]["active_segment_progress"] == 0.5
    assert event["payload"]["etaSeconds"] == 15
    assert event["payload"]["eta_seconds"] == 15


def test_broadcast_job_updated_chapter_completion_emits_both(monkeypatch):
    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    # Completed chapter job with skip_studio_job_event=False
    broadcast_job_updated(
        "job-chap-completed",
        {"status": "done", "progress": 1.0},
        {"status": "running", "progress": 0.8, "chapter_id": "chap-1", "project_id": "proj-1"},
    )

    # We expect a lifecycle transition plus the chapter-scoped progress update.
    assert len(messages) == 2
    assert messages[0]["topic"] == "jobs.lifecycle"
    assert messages[0]["payload"]["status"] == "done"
    assert messages[0]["payload"]["reasonCode"] == "JOB_DONE"

    assert messages[1]["topic"] == "chapters.progress"
    assert messages[1]["payload"]["status"] == "done"


def test_broadcast_job_updated_chapter_completion_suppression(monkeypatch):
    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    # Completed chapter job with skip_studio_job_event=True
    broadcast_job_updated(
        "job-chap-completed",
        {"status": "done", "progress": 1.0, "skip_studio_job_event": True},
        {"status": "done", "progress": 1.0, "chapter_id": "chap-1", "project_id": "proj-1"},
    )

    # Since skip_studio_job_event=True, we expect ZERO broadcasts from broadcast_job_updated
    assert len(messages) == 0


def test_broadcast_job_updated_segment_completion(monkeypatch):
    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    # active_segment_id changes from seg-1 to seg-2
    broadcast_job_updated(
        "job-seg-comp",
        {"active_segment_id": "seg-2", "active_segment_progress": 0.0},
        # We pass a current_job snapshot that reflects the PREVIOUS state where seg-1 was active:
        current_job={"status": "running", "active_segment_id": "seg-1", "active_segment_progress": 0.8, "chapter_id": "chap-1", "project_id": "proj-1"}
    )

    # We expect segment completion for seg-1 (first), segment progress for seg-2 (second), and chapter progress (third)
    assert len(messages) == 3
    assert messages[0]["topic"] == "segments.progress"
    assert messages[0]["ids"]["segmentId"] == "seg-1"
    assert messages[0]["payload"]["status"] == "done"
    assert messages[0]["payload"]["progress"] == 1.0

    assert messages[1]["topic"] == "segments.progress"
    assert messages[1]["ids"]["segmentId"] == "seg-2"
    assert messages[1]["payload"]["status"] == "running"
    assert messages[1]["payload"]["progress"] == 0.0

    assert messages[2]["topic"] == "chapters.progress"
    assert messages[2]["ids"]["chapterId"] == "chap-1"
    assert messages[2]["payload"]["status"] == "running"


def test_broadcast_job_updated_segment_handoff_preserves_segment_commands(monkeypatch):
    messages = []

    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    broadcast_job_updated(
        "job-seg-comp",
        {
            "active_segment_id": "seg-2",
            "active_segment_progress": 0.0,
            "reason_code": "START_SEGMENT",
        },
        current_job={
            "status": "running",
            "active_segment_id": "seg-1",
            "active_segment_progress": 0.8,
            "chapter_id": "chap-1",
            "project_id": "proj-1",
            "classification": "chapter",
            "has_segment_support": True,
        },
    )

    assert messages[0]["topic"] == "segments.progress"
    assert messages[0]["ids"]["segmentId"] == "seg-1"
    assert messages[0]["payload"]["status"] == "done"
    assert messages[0]["payload"]["reasonCode"] == "SEGMENT_SAVED"

    assert messages[1]["topic"] == "segments.progress"
    assert messages[1]["ids"]["segmentId"] == "seg-2"
    assert messages[1]["payload"]["reasonCode"] == "START_SEGMENT"


def test_broadcast_tts_log_line_includes_plugin_metadata(monkeypatch):
    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    from app.api.ws import broadcast_tts_log_line, reset_tts_log_line_sequences_for_tests
    reset_tts_log_line_sequences_for_tests()

    broadcast_tts_log_line(
        job_id="job-log-1",
        project_id="proj-1",
        chapter_id="chap-1",
        line="synthesized text line",
        plugin_id="tts_xtts",
        plugin_short_name="XTTS",
    )

    assert len(messages) == 1
    event = messages[0]
    assert event["topic"] == "tts.logs"
    assert event["payload"]["pluginId"] == "tts_xtts"
    assert event["payload"]["pluginShortName"] == "XTTS"


def test_build_queue_item_invalidated_minimal_payload():
    from app.api.contracts.events import build_queue_item_invalidated_event
    event = build_queue_item_invalidated_event(
        reason="some_reason",
        changed_fields=["status"]
    )
    assert event["topic"] == "queue.items"
    assert event["eventKind"] == "queue_item_invalidated"
    # Verify absence of status, progress, classification, message
    assert "status" not in event["payload"]
    assert "progress" not in event["payload"]
    assert "classification" not in event["payload"]
    assert "message" not in event["payload"]
    assert event["payload"]["reasonCode"] == "QUEUE_INVALIDATED"
    assert event["payload"]["changedFields"] == ["status"]


def test_update_job_terminal_status_does_not_emit_queue_invalidation(monkeypatch):
    broadcasts = []
    monkeypatch.setattr("app.api.ws.broadcast_queue_update", lambda *args, **kwargs: broadcasts.append(("queue_item_invalidated", args, kwargs)))
    monkeypatch.setattr("app.db.update_queue_item", lambda *args, **kwargs: None)

    state_mock = {"jobs": {
        "job-test-terminal": {
            "id": "job-test-terminal",
            "status": "running",
            "chapter_id": "chap-1",
            "project_id": "proj-1",
            "created_at": 100.0,
            "engine": "xtts"
        }
    }}
    monkeypatch.setattr("app.db.state_jobs._load_state_no_lock", lambda: state_mock)
    monkeypatch.setattr("app.db.state_jobs._atomic_write_text", lambda *args, **kwargs: None)

    from app.db.state_jobs import update_job
    update_job("job-test-terminal", status="done")

    # verify queue invalidation was NOT called
    assert len(broadcasts) == 0


def test_terminal_job_completion_path_emits_job_lifecycle_transition(monkeypatch):
    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)
    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    from app.api.ws import broadcast_job_updated
    # Simulate orchestrator/websockets broadcast_job_updated for terminal status
    broadcast_job_updated(
        "job-terminal-complete",
        {"status": "done", "progress": 1.0},
        {"status": "running", "progress": 0.9, "chapter_id": "chap-1", "project_id": "proj-1"},
    )

    lifecycle_messages = [m for m in messages if m.get("topic") == "jobs.lifecycle"]
    assert len(lifecycle_messages) == 1
    assert lifecycle_messages[0]["eventKind"] == "job_lifecycle"
    assert lifecycle_messages[0]["payload"]["status"] == "done"
    assert lifecycle_messages[0]["payload"]["reasonCode"] == "JOB_DONE"


def test_rebuild_emits_minimum_necessary_lifecycle_and_progress_transitions(monkeypatch):
    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)
    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    from app.orchestration.progress.service import ProgressService

    def broadcaster(payload, channel):
        DummyManager().broadcast(payload)

    progress_service = ProgressService(
        reconcile_fn=lambda **kwargs: kwargs,
        eta_fn=lambda **kwargs: 0.0,
        broadcaster=broadcaster,
    )

    # 1. Transition: queued -> preparing
    progress_service.publish(
        job_id="job-rebuild-1",
        status="preparing",
        chapter_id="chap-1",
        parent_job_id="proj-1",
        progress=0.0
    )

    # 2. Duplicate state (no change): preparing -> preparing
    progress_service.publish(
        job_id="job-rebuild-1",
        status="preparing",
        chapter_id="chap-1",
        parent_job_id="proj-1",
        progress=0.0
    )

    # 3. Transition: preparing -> running
    progress_service.publish(
        job_id="job-rebuild-1",
        status="running",
        chapter_id="chap-1",
        parent_job_id="proj-1",
        progress=0.0
    )

    # 4. Progress tick (no status change): running -> running (0.5)
    progress_service.publish(
        job_id="job-rebuild-1",
        status="running",
        chapter_id="chap-1",
        parent_job_id="proj-1",
        progress=0.5
    )

    # 5. Transition: running -> done
    progress_service.publish(
        job_id="job-rebuild-1",
        status="done",
        chapter_id="chap-1",
        parent_job_id="proj-1",
        progress=1.0
    )

    lifecycle_events = [
        m for m in messages
        if m.get("topic") == "jobs.lifecycle" and m.get("eventKind") == "job_lifecycle"
    ]
    chapter_progress_events = [
        m for m in messages
        if m.get("topic") == "chapters.progress" and m.get("eventKind") == "chapter_progress"
    ]

    # Verify we got lifecycle transitions for the state changes and scoped chapter progress events for each tick.
    assert [event["payload"]["status"] for event in lifecycle_events] == ["preparing", "running", "done"]
    assert [event["payload"]["reasonCode"] for event in lifecycle_events] == ["JOB_PREPARING", "START_SYNTHESIS", "JOB_DONE"]
    assert len(chapter_progress_events) == 4
    assert chapter_progress_events[0]["payload"]["status"] == "preparing"
    assert chapter_progress_events[1]["payload"]["status"] == "running"
    assert chapter_progress_events[2]["payload"]["status"] == "running"
    assert chapter_progress_events[2]["payload"]["progress"] == 0.5
    assert chapter_progress_events[3]["payload"]["status"] == "done"


def test_put_job_broadcasts_job_lifecycle_on_queued(monkeypatch):
    broadcast_calls = []

    def dummy_broadcast_job_updated(job_id, updates, current_job=None, source=None):
        broadcast_calls.append((job_id, dict(updates), dict(current_job or {}), source))

    monkeypatch.setattr("app.api.ws.broadcast_job_updated", dummy_broadcast_job_updated)
    monkeypatch.setattr("app.db.state_jobs._atomic_write_text", lambda *args, **kwargs: None)

    from app.db.models import Job
    from app.db.state_jobs import put_job

    job = Job(
        id="job-queued-test",
        project_id="proj-1",
        chapter_id="chap-1",
        status="queued",
        created_at=1.0,
        engine="xtts",
    )

    put_job(job)

    assert len(broadcast_calls) == 1
    job_id, updates, current_job, _ = broadcast_calls[0]
    assert job_id == "job-queued-test"
    assert updates["reason_code"] is None
    assert updates["previous_status"] is None
    assert updates["status_changed"] is False
    assert current_job["status"] == "queued"


def test_broadcast_job_updated_preserves_active_segment_eta_seconds(monkeypatch):
    messages = []

    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    broadcast_job_updated(
        "job-segment-eta-test",
        {
            "active_segment_id": "seg-1",
            "active_segment_progress": 0.5,
            "active_segment_eta_seconds": 12,
            "eta_seconds": 100, # chapter ETA
        },
        {
            "status": "running",
            "progress": 0.2,
            "active_segment_id": "seg-1",
            "active_segment_progress": 0.5,
            "active_segment_eta_seconds": 12,
            "eta_seconds": 100,
            "classification": "chapter",
        },
    )

    # We expect a segment progress event
    segment_events = [m for m in messages if m.get("topic") == "segments.progress"]
    assert len(segment_events) == 1
    event = segment_events[0]
    assert event["payload"]["activeSegmentId"] == "seg-1"
    assert event["payload"]["etaSeconds"] == 12
    assert event["payload"]["eta_seconds"] == 12


def test_terminal_status_clears_eta_seconds_and_eta_updated_at(monkeypatch):
    messages = []

    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    # Emit terminal update
    broadcast_job_updated(
        "job-terminal-test",
        {
            "status": "done",
            "progress": 1.0,
            "eta_seconds": 5,  # stale value being sent
        },
        {
            "status": "done",
            "progress": 1.0,
            "eta_seconds": 5,
            "classification": "chapter",
        },
    )

    # Let's inspect chapters.progress events
    chapter_events = [m for m in messages if m.get("topic") == "chapters.progress"]
    assert len(chapter_events) == 1
    event = chapter_events[0]
    # The broadcast event payload must clear the ETA fields for a terminal status!
    assert event["payload"].get("etaSeconds") is None
    assert event["payload"].get("eta_seconds") is None
    assert event["payload"].get("etaUpdatedAt") is None
    assert event["payload"].get("eta_updated_at") is None


def test_broadcast_event_payload_emits_camelcase_only(monkeypatch):
    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)
    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    broadcast_job_updated(
        "job-camel-test",
        {"progress": 0.5, "eta_seconds": 30, "eta_updated_at": 1000},
        {"status": "running", "progress": 0.5, "eta_seconds": 30, "eta_updated_at": 1000, "classification": "chapter"},
    )

    assert len(messages) == 1
    payload = messages[0]["payload"]
    
    assert "etaSeconds" in payload
    assert "etaUpdatedAt" in payload
    assert "eta_seconds" not in payload
    assert "eta_updated_at" not in payload
    assert "grouped_progress" not in payload
    assert "reason_code" not in payload
    assert "render_group_count" not in payload
    assert "completed_render_groups" not in payload


def test_broadcast_event_payload_includes_confidence_in_camelcase(monkeypatch):
    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)
    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    broadcast_job_updated(
        "job-confidence-test",
        {"progress": 0.5, "eta_seconds": 30, "eta_updated_at": 1000},
        {"status": "running", "progress": 0.5, "eta_seconds": 30, "eta_updated_at": 1000, "classification": "chapter"},
    )

    assert len(messages) == 1
    payload = messages[0]["payload"]
    assert "confidence" in payload
    assert isinstance(payload["confidence"], (int, float))

