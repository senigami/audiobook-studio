import pytest
import json
import io
import time
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

from app.orchestration.scheduler.orchestrator import TaskOrchestrator
from app.orchestration.tasks.sample_build import SampleBuildTask
from app.orchestration.tasks.sample_test import SampleTestTask
from app.db.speakers import get_speaker_settings


def test_voice_build_api_uses_real_orchestrator_submit(clean_db, voices_root, client, monkeypatch):
    """Exercises API -> BackgroundTasks -> TaskOrchestrator.submit for voice build."""
    profile_root = voices_root / "ApiOrchSpeaker"
    profile_root.mkdir(parents=True, exist_ok=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "ApiOrchSpeaker"}))
    profile_dir = profile_root / "Default"
    profile_dir.mkdir()
    (profile_dir / "profile.json").write_text(json.dumps({
        "variant_name": "Default",
        "engine": "xtts",
    }))

    mock_progress = MagicMock()
    mock_progress.reconcile.return_value = {"decision": "queue", "artifact_state": "missing"}
    mock_bridge = MagicMock()

    def fake_synthesize(req):
        out_path = Path(req["output_path"])
        out_path.write_text("synthetic audio")
        return {"status": "ok", "audio_path": str(out_path)}

    mock_bridge.synthesize.side_effect = fake_synthesize

    orchestrator = TaskOrchestrator(
        progress_service=mock_progress,
        voice_bridge=mock_bridge,
    )
    monkeypatch.setattr("app.api.routers.voices_actions.create_orchestrator", lambda: orchestrator)

    def fake_wav_to_mp3(in_wav, out_mp3):
        Path(out_mp3).write_text("fake mp3")
        return 0

    files = {"files": ("input.wav", io.BytesIO(b"fake wav"), "audio/wav")}
    with patch("app.engines.bridge.create_voice_bridge", return_value=mock_bridge), \
         patch("app.engines.audio_ops.wav_to_mp3", side_effect=fake_wav_to_mp3), \
         patch("app.engines.voice_engines.list_tts_engines", return_value=["xtts"]), \
         patch("app.engines.voice_engines.get_default_profile_engine", return_value="xtts"), \
         patch("app.orchestration.scheduler.orchestrator.reserve_task_resources", return_value={"admitted": True}), \
         patch("app.orchestration.scheduler.orchestrator.release_task_resources"), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None):
        response = client.post("/api/speaker-profiles/ApiOrchSpeaker/build", files=files)

    if not mock_bridge.synthesize.called:
        print(f"\n[DEBUG] response: {response.json()}")
        print(f"[DEBUG] mock_bridge calls: {mock_bridge.mock_calls}")
    assert response.status_code == 200
    assert mock_bridge.synthesize.called
    request = mock_bridge.synthesize.call_args.args[0]
    assert request["engine_id"] == "xtts"
    assert request["voice_profile_id"] == "ApiOrchSpeaker"
    assert request["script_text"]
    assert (profile_dir / "sample.mp3").exists()


def test_voice_build_orchestration_e2e(voices_root):
    # 1. Setup V2 voice profile
    profile_root = voices_root / "OrchSpeaker"
    profile_root.mkdir(parents=True, exist_ok=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "OrchSpeaker"}))
    profile_dir = profile_root / "Default"
    profile_dir.mkdir()
    (profile_dir / "profile.json").write_text(json.dumps({
        "variant_name": "Default", 
        "engine": "xtts"
    }))
    (profile_dir / "input.wav").write_text("audio data")

    # 2. Setup Orchestrator with mocked dependencies
    mock_progress = MagicMock()
    mock_bridge = MagicMock()

    # Mock bridge.synthesize to "produce" a wav file
    def fake_synthesize(req):
        out_path = Path(req["output_path"])
        out_path.write_text("synthetic audio")
        return {"status": "ok", "audio_path": str(out_path)}

    mock_bridge.synthesize.side_effect = fake_synthesize

    orchestrator = TaskOrchestrator(
        progress_service=mock_progress,
        voice_bridge=mock_bridge
    )

    # 3. Submit SampleBuildTask
    jid = f"build-{uuid.uuid4().hex[:8]}"
    output_path = profile_dir / "sample.mp3"

    task = SampleBuildTask(
        task_id=jid,
        speaker_profile="OrchSpeaker",
        engine_id="xtts",
        output_path=output_path,
        test_text="This is a test build.",
        voice_job_settings={"speed": 1.0}
    )

    # Run the orchestrator dispatch (simulate what submit() does but synchronously for test)
    # Actually orchestrator.submit() in Slice W is still largely synchronous or background-tasks based.
    # In orchestrator.py, submit() typically runs logic then dispatches.

    # We want to test that SampleBuildTask.run() works correctly when called via orchestrator or directly.
    # But specifically, we want to prove API -> Orchestrator path.

    def fake_wav_to_mp3(in_wav, out_mp3):
        Path(out_mp3).write_text("fake mp3")
        return 0

    with patch("app.orchestration.scheduler.orchestrator.create_orchestrator", return_value=orchestrator), \
         patch("app.engines.bridge.create_voice_bridge", return_value=mock_bridge), \
         patch("app.engines.audio_ops.wav_to_mp3", side_effect=fake_wav_to_mp3):

        # We simulate the task execution. In a real system, the orchestrator might use a worker or run it locally.
        # Studio 2.0 TaskOrchestrator currently runs tasks via its own dispatch.

        result = task.run()
        assert result.status == "completed", f"Task failed: {result.message}"

    # 4. Verify Side Effects
    assert output_path.exists()

    # Verify metadata update
    settings = get_speaker_settings("OrchSpeaker")
    assert settings["preview_test_text"] == "This is a test build."
    assert "input.wav" in settings["built_samples"]
    assert settings["preview_engine"] == "xtts"

def test_voice_test_orchestration_e2e(voices_root):
    # 1. Setup V2 voice profile
    profile_root = voices_root / "TestSpeaker"
    profile_root.mkdir(parents=True, exist_ok=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "TestSpeaker"}))
    profile_dir = profile_root / "Default"
    profile_dir.mkdir()
    (profile_dir / "profile.json").write_text(json.dumps({
        "variant_name": "Default", 
        "engine": "voxtral"
    }))

    mock_bridge = MagicMock()
    mock_bridge.synthesize.return_value = {"status": "ok", "audio_path": "ignored"}

    output_path = profile_dir / "sample.mp3"
    output_path.write_text("pre-existing") # So wav_to_mp3 check passes

    task = SampleTestTask(
        task_id="test-123",
        speaker_profile="TestSpeaker",
        engine_id="voxtral",
        output_path=output_path,
        test_text="Testing 1 2 3",
        voice_job_settings={"model": "large"}
    )

    def fake_wav_to_mp3(in_wav, out_mp3):
        Path(out_mp3).write_text("fake mp3")
        return 0

    with patch("app.engines.bridge.create_voice_bridge", return_value=mock_bridge), \
         patch("app.engines.audio_ops.wav_to_mp3", side_effect=fake_wav_to_mp3):
        result = task.run()
        assert result.status == "completed"

    settings = get_speaker_settings("TestSpeaker")
    assert settings["preview_test_text"] == "Testing 1 2 3"
    assert settings["preview_model"] == "large"


def test_sample_tasks_expose_script_text_alias():
    """Sample tasks must expose test_text under script_text for XTTS dispatch."""
    from app.orchestration.tasks.sample_build import SampleBuildTask
    from app.orchestration.tasks.sample_test import SampleTestTask

    build_task = SampleBuildTask(
        task_id="build-1",
        speaker_profile="VoiceA",
        engine_id="xtts",
        output_path=Path("/tmp/sample.mp3"),
        test_text="Build text",
    )
    test_task = SampleTestTask(
        task_id="test-1",
        speaker_profile="VoiceA",
        engine_id="xtts",
        output_path=Path("/tmp/sample.mp3"),
        test_text="Test text",
    )

    assert build_task.script_text == "Build text"
    assert build_task.describe().payload["script_text"] == "Build text"
    assert test_task.script_text == "Test text"
    assert test_task.describe().payload["script_text"] == "Test text"


def test_voice_build_fails_when_no_engine(clean_db, voices_root):
    from app.orchestration.tasks.sample_build import SampleBuildTask
    from app.jobs.worker_voice import handle_voice_job
    from unittest.mock import patch

    # 1. Test validate() raises ValueError
    task = SampleBuildTask(
        task_id="build-1",
        speaker_profile="OrchSpeaker",
        engine_id="",
        output_path=Path("sample.mp3"),
        test_text="This is a test build."
    )
    with pytest.raises(ValueError):
        task.validate()

    # 2. Test handle_voice_job fails via _mark_queue_failed
    # Set up voice profile without engine in settings
    profile_root = voices_root / "NoEngineSpeaker"
    profile_root.mkdir(parents=True, exist_ok=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "NoEngineSpeaker"}))
    profile_dir = profile_root / "Default"
    profile_dir.mkdir()
    (profile_dir / "profile.json").write_text(json.dumps({
        "variant_name": "Default"
    }))

    # We mock _mark_queue_failed to see if it is called
    with patch("app.jobs.worker_voice._mark_queue_failed") as mock_fail, \
         patch("app.engines.voice_engines.get_default_profile_engine", return_value=""):

        class DummyJob:
            def __init__(self):
                self.speaker_profile = "NoEngineSpeaker"
                self.engine = "voice_build"

        dummy_job = DummyJob()
        handle_voice_job("job-123", dummy_job, lambda msg: None, lambda: False)

        assert mock_fail.called
        assert "no tts engine" in mock_fail.call_args[0][1].lower()
