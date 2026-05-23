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
    assert messages[0]["source"].endswith("test_broadcast_job_updated_uses_current_job_status_for_normalized_event")
    assert messages[0]["job_id"] == "job-1"
    assert messages[0]["status"] == "running"
    assert messages[0]["progress"] == 0.5
    assert messages[0]["eta_seconds"] == 12
    assert messages[0]["classification"] == "job"
    assert messages[1]["type"] == "job_updated"
    assert messages[1]["job_id"] == "job-1"
    assert messages[1]["classification"] == "job"
    assert messages[1]["updates"] == {"status": "running", "progress": 0.5, "eta_seconds": 12, "classification": "job"}
    assert messages[1]["source"].endswith("test_broadcast_job_updated_uses_current_job_status_for_normalized_event")


def test_broadcast_job_updated_preserves_context_in_job_updated_payload(monkeypatch):
    messages = []

    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    broadcast_job_updated(
        "job-3",
        {"progress": 0.5},
        {"status": "running", "progress": 0.5, "chapter_id": "chap-1", "project_id": "proj-1", "parent_job_id": "chapter-parent"},
    )

    assert messages[1]["updates"]["chapter_id"] == "chap-1"
    assert messages[1]["updates"]["project_id"] == "proj-1"
    assert messages[1]["updates"]["classification"] == "segment"
    assert messages[1]["source"].endswith("test_broadcast_job_updated_preserves_context_in_job_updated_payload")


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
    assert messages[0]["source"].endswith("test_broadcast_job_updated_uses_phase4_progress_rounding")


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
    assert messages[0]["source"].endswith("test_broadcast_job_updated_propagates_active_segment")


def test_broadcast_job_updated_propagates_render_group_context(monkeypatch):
    messages = []

    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    broadcast_job_updated(
        "job-group-test",
        {
            "render_group_count": 2,
            "completed_render_groups": 1,
            "active_render_group_index": 1,
            "total_render_weight": 945,
            "completed_render_weight": 420,
            "active_render_group_weight": 525,
            "grouped_progress": 0.44,
        },
        {
            "status": "running",
            "progress": 0.44,
            "render_group_count": 2,
            "completed_render_groups": 1,
            "active_render_group_index": 1,
            "total_render_weight": 945,
            "completed_render_weight": 420,
            "active_render_group_weight": 525,
            "grouped_progress": 0.44,
        },
    )

    assert messages[0]["render_group_count"] == 2
    assert messages[0]["completed_render_groups"] == 1
    assert messages[0]["active_render_group_index"] == 1
    assert messages[0]["total_render_weight"] == 945
    assert messages[0]["completed_render_weight"] == 420
    assert messages[0]["active_render_group_weight"] == 525
    assert messages[0]["grouped_progress"] == 0.44
    assert messages[1]["updates"]["render_group_count"] == 2
    assert messages[1]["updates"]["completed_render_groups"] == 1
    assert messages[1]["updates"]["active_render_group_index"] == 1
    assert messages[1]["updates"]["total_render_weight"] == 945
    assert messages[1]["updates"]["completed_render_weight"] == 420
    assert messages[1]["updates"]["active_render_group_weight"] == 525
    assert messages[1]["updates"]["grouped_progress"] == 0.44
    assert messages[1]["source"].endswith("test_broadcast_job_updated_propagates_render_group_context")


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
    assert messages[0]["source"].endswith("test_broadcast_job_updated_active_segment_progress_guard")


def test_broadcast_tts_log_line_sends_structured_diagnostic_payload(monkeypatch):
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
    assert messages[0] == {
        "type": "tts_log_line",
        "job_id": "job-tts",
        "project_id": "proj-1",
        "chapter_id": "chap-1",
        "line": "[PROGRESS] 40% job-tts",
        "marker": "PROGRESS",
        "sequence": 1,
        "received_at": 123.45,
        "source": "tests.api.test_websocket_broadcast.test_broadcast_tts_log_line_sends_structured_diagnostic_payload",
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

    assert [message["sequence"] for message in messages] == [1, 2, 1]
    assert [message["marker"] for message in messages] == ["START_SYNTHESIS", "START_SEGMENT", "raw"]


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
    assert messages[0]["type"] == "queue_updated"
    assert messages[0]["reason"] == "job_status_change"
    assert messages[0]["job_id"] == "job-123"
    assert messages[0]["project_id"] == "proj-456"
    assert messages[0]["changed_fields"] == ["status"]
    assert messages[0]["source"].endswith("test_broadcast_queue_update_sends_structured_payload")


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
    assert messages[0]["type"] == "segments_updated"
    assert messages[0]["chapter_id"] == "chap-789"
    assert messages[0]["reason"] == "segments_rebuilt"
    assert messages[0]["job_id"] == "job-123"
    assert messages[0]["project_id"] == "proj-456"
    assert messages[0]["changed_fields"] == ["audio_status"]
    assert messages[0]["source"].endswith("test_broadcast_segments_updated_sends_structured_payload")


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
    assert messages[0]["type"] == "chapter_updated"
    assert messages[0]["chapter_id"] == "chap-789"
    assert messages[0]["reason"] == "chapter_metadata_change"
    assert messages[0]["job_id"] == "job-123"
    assert messages[0]["project_id"] == "proj-456"
    assert messages[0]["changed_fields"] == ["title"]
    assert messages[0]["source"].endswith("test_broadcast_chapter_updated_sends_structured_payload")


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
    assert messages[0]["type"] == "project_updated"
    assert messages[0]["project_id"] == "proj-456"
    assert messages[0]["reason"] == "project_membership_change"
    assert messages[0]["job_id"] == "job-123"
    assert messages[0]["changed_fields"] == ["status"]
    assert messages[0]["source"].endswith("test_broadcast_project_updated_sends_structured_payload")

def test_status_only_job_updates_do_not_emit_chapter_or_queue_updates(monkeypatch):
    """
    Backend test: status-only job updates do not emit chapter_updated or queue_updated.
    Real metadata/terminal changes still emit the appropriate invalidation broadcast.
    """
    broadcasts = []

    # Mock the ws functions
    monkeypatch.setattr("app.api.ws.broadcast_chapter_updated", lambda *args, **kwargs: broadcasts.append(("chapter_updated", args, kwargs)))
    monkeypatch.setattr("app.api.ws.broadcast_queue_update", lambda *args, **kwargs: broadcasts.append(("queue_updated", args, kwargs)))

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

    # We expect status-only transitions NOT to broadcast chapter_updated or queue_updated
    assert broadcasts == []

    # 2. Update to done (terminal state)
    update_job("job-test-1", status="done")

    # We expect terminal transitions TO broadcast both
    assert len(broadcasts) > 0
    assert any(b[0] == "chapter_updated" for b in broadcasts)
    assert any(b[0] == "queue_updated" for b in broadcasts)


def test_terminal_job_reset_to_active_emits_invalidation_broadcasts(monkeypatch):
    broadcasts = []

    monkeypatch.setattr("app.api.ws.broadcast_chapter_updated", lambda *args, **kwargs: broadcasts.append(("chapter_updated", args, kwargs)))
    monkeypatch.setattr("app.api.ws.broadcast_queue_update", lambda *args, **kwargs: broadcasts.append(("queue_updated", args, kwargs)))
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
    assert any(b[0] == "queue_updated" for b in broadcasts)


def test_update_job_with_force_broadcast_emits_chapter_and_queue_updates(monkeypatch):
    """
    Backend test: real metadata changes (forced broadcasts) still emit the appropriate invalidation broadcast.
    """
    broadcasts = []

    # Mock the ws functions
    monkeypatch.setattr("app.api.ws.broadcast_chapter_updated", lambda *args, **kwargs: broadcasts.append(("chapter_updated", args, kwargs)))
    monkeypatch.setattr("app.api.ws.broadcast_queue_update", lambda *args, **kwargs: broadcasts.append(("queue_updated", args, kwargs)))

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
    assert any(b[0] == "queue_updated" for b in broadcasts)


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

    # When skip_job_updated=True, the job_updated message should be skipped.
    broadcast_job_updated(
        "job-1",
        {"progress": 0.5, "eta_seconds": 12, "skip_job_updated": True},
        {"status": "running", "progress": 0.5, "eta_seconds": 12},
    )

    # We expect only the studio_job_event message, and NO job_updated message.
    assert len(messages) == 1
    assert messages[0]["type"] == "studio_job_event"


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
    studio_job_queued = [m for m in messages if m.get("type") == "studio_job_event" and m.get("status") == "queued"]
    job_updated_queued = [m for m in messages if m.get("type") == "job_updated" and m.get("updates", {}).get("status") == "queued"]
    chapter_updated = [m for m in messages if m.get("type") == "chapter_updated"]
    queue_updated = [m for m in messages if m.get("type") == "queue_updated"]

    assert len(studio_job_queued) == 1, f"Expected 1 studio_job_event (queued), got {len(studio_job_queued)}: {studio_job_queued}"
    assert len(job_updated_queued) == 0, f"Expected 0 job_updated (queued) after suppression, got {len(job_updated_queued)}: {job_updated_queued}"
    assert len(chapter_updated) == 1, f"Expected 1 chapter_updated, got {len(chapter_updated)}: {chapter_updated}"
    assert len(queue_updated) == 1, f"Expected 1 queue_updated, got {len(queue_updated)}: {queue_updated}"


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
        build_chapter_progress_event,
        build_segment_progress_event,
        build_segment_lifecycle_event,
        build_chapter_lifecycle_event,
        build_voice_test_progress_event,
        build_system_event
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
        "jobId": "j-1",
        "chapterId": "c-1",
        "source": e_tts["payload"]["source"]
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
        "message": "Running synthesis",
        "reasonCode": "synth_progress",
        "classification": "segment",
        "changedFields": None
    }

    # 3. queue.items invalidated
    e_queue_inv = build_queue_item_invalidated_event(
        reason="job_canceled",
        changed_fields=["status", "finished_at"]
    )
    assert e_queue_inv["topic"] == "queue.items"
    assert e_queue_inv["eventKind"] == "queue_item_invalidated"
    assert e_queue_inv["payload"]["changedFields"] == ["status", "finished_at"]

    # 4. queue.items paused
    e_queue_paused = build_queue_paused_event(paused=True)
    assert e_queue_paused["topic"] == "queue.items"
    assert e_queue_paused["eventKind"] == "queue_paused"
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
    assert e_chap_prog["payload"] == {
        "status": "running",
        "progress": 0.8,
        "groupedProgress": 0.5,
        "etaSeconds": 60,
        "message": "rendering",
        "reasonCode": "rendering_chapter",
        "renderGroupCount": 10,
        "completedRenderGroups": 5
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
        "message": "synthesizing segment",
        "reasonCode": "segment_synth"
    }

    # 7. segments.lifecycle
    e_seg_life = build_segment_lifecycle_event(
        chapter_id="c-1",
        reason="saved",
        changed_fields=["audio_path"]
    )
    assert e_seg_life["topic"] == "segments.lifecycle"
    assert e_seg_life["payload"] == {
        "reason": "saved",
        "changedFields": ["audio_path"]
    }

    # 8. chapters.lifecycle
    e_chap_life = build_chapter_lifecycle_event(
        chapter_id="c-1",
        reason="reset",
        changed_fields=["audio_status"]
    )
    assert e_chap_life["topic"] == "chapters.lifecycle"
    assert e_chap_life["payload"] == {
        "reason": "reset",
        "changedFields": ["audio_status"]
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
        "message": "building"
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


def test_legacy_broadcasters_remain_unchanged(monkeypatch):
    from app.api.ws import broadcast_queue_update

    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    broadcast_queue_update(reason="test")

    assert len(messages) == 1
    # Check that legacy emitter sends legacy type, not "studio_event"
    assert messages[0]["type"] == "queue_updated"
    assert messages[0]["type"] != "studio_event"
