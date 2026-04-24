import pytest
import os
import json
import time
from pathlib import Path
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.web import app as fastapi_app
from app.db.core import init_db
from app.db.speakers import create_speaker

client = TestClient(fastapi_app)


@pytest.fixture(autouse=True)
def voices_root(tmp_path, monkeypatch):
    import app.config
    import app.web
    import app.api.routers.voices
    import app.jobs.speaker

    voices_dir = (tmp_path / "voices").resolve()
    monkeypatch.setattr(app.web, "VOICES_DIR", voices_dir)
    monkeypatch.setattr(app.config, "VOICES_DIR", voices_dir)
    monkeypatch.setattr(app.api.routers.voices, "VOICES_DIR", voices_dir)
    monkeypatch.setattr(app.jobs.speaker, "VOICES_DIR", voices_dir)
    return voices_dir


@pytest.fixture
def clean_db(tmp_path):
    db_path = tmp_path / "test_refinement.db"
    os.environ["DB_PATH"] = str(db_path)
    import app.db.core
    import importlib
    importlib.reload(app.db.core)
    init_db()
    yield
    if os.path.exists(db_path):
        os.unlink(db_path)

def test_variant_folder_naming(clean_db, voices_root):
    voices_dir = voices_root
    voices_dir.mkdir()

    # 1. Create a speaker
    sid = create_speaker("TestSpeaker")

    # 2. Create a variant for it
    response = client.post("/api/speaker-profiles", data={"speaker_id": sid, "variant_name": "Variant1"})
    assert response.status_code == 200
    name = response.json()["name"]

    # MUST use dash convention: "SpeakerName - VariantName"
    assert name == "TestSpeaker - Variant1"
    assert (voices_dir / "TestSpeaker - Variant1").exists()

def test_rename_unassigned_profile(clean_db, voices_root):
    voices_dir = voices_root
    voices_dir.mkdir()

    # 1. Create a profile folder manually (unassigned)
    profile_path = voices_dir / "OldUnassigned"
    profile_path.mkdir()
    (profile_path / "profile.json").write_text(json.dumps({"variant_name": "Old"}))

    # 2. Rename it via the profile-specific endpoint (which frontend now uses when ID is null)
    # The endpoint is POST /api/speaker-profiles/{name}/rename
    response = client.post("/api/speaker-profiles/OldUnassigned/rename", data={"new_name": "NewUnassigned"})
    assert response.status_code == 200

    assert (voices_dir / "NewUnassigned").exists()
    assert not (voices_dir / "OldUnassigned").exists()

def test_add_variant_to_unassigned(clean_db, voices_root):
    voices_dir = voices_root
    voices_dir.mkdir()

    # 1. Create an unassigned profile base
    (voices_dir / "FreshVoice").mkdir()

    # 2. Add a variant to it (sending speaker_id="FreshVoice" since it's unassigned)
    response = client.post("/api/speaker-profiles", data={"speaker_id": "FreshVoice", "variant_name": "Variant1"})
    assert response.status_code == 200
    name = response.json()["name"]

    # MUST use dash convention: "FreshVoice - Variant1"
    assert name == "FreshVoice - Variant1"
    assert (voices_dir / "FreshVoice - Variant1").exists()

    # Check metadata
    meta = json.loads((voices_dir / "FreshVoice - Variant1" / "profile.json").read_text())
    assert meta["speaker_id"] == "FreshVoice"
    assert meta["variant_name"] == "Variant1"

def test_rename_unassigned_profile_payload(clean_db, voices_root):
    voices_dir = voices_root
    voices_dir.mkdir()

    profile_path = voices_dir / "OldName"
    profile_path.mkdir()

    # Frontend was sending 'name' but backend expects 'new_name'
    # This test should pass after we fix the frontend or backend
    response = client.post("/api/speaker-profiles/OldName/rename", data={"new_name": "NewName"})
    assert response.status_code == 200
    assert (voices_dir / "NewName").exists()

def test_default_variant_resolution(clean_db, voices_root):
    import app.jobs.speaker
    voices_dir = voices_root
    voices_dir.mkdir()
    app.jobs.speaker.VOICES_DIR = voices_dir

    # 1. Create speaker in DB
    sid = create_speaker("Old Man")

    # 2. Create a variant folder (but don't set it as default in DB)
    variant_path = voices_dir / "Old Man - Angry"
    variant_path.mkdir()
    (variant_path / "sample.wav").write_text("dummy")

    # 3. Resolve "Old Man" (the speaker name)
    # Expected: it should find "Old Man - Angry" because it starts with "Old Man"
    from app.jobs.speaker import get_speaker_wavs
    res = get_speaker_wavs("Old Man")
    assert res is not None
    assert "Old Man - Angry" in res

    resolved_dir = app.jobs.speaker.get_voice_profile_dir("Old Man")
    assert resolved_dir == (voices_dir / "Old Man - Angry").resolve()


def test_voice_output_exists_for_voice_engine():
    """_output_exists must return True for voice_build/voice_test to prevent reconcile loop."""
    from app.jobs.reconcile import _output_exists
    # These should return True so reconcile does NOT re-queue done voice jobs
    assert _output_exists("voice_build", "")
    assert _output_exists("voice_test", "")
    # xtts with no file still returns False (existing behavior)
    assert not _output_exists("xtts", "")


def test_reconcile_does_not_requeue_voice_jobs(clean_db, tmp_path):
    """Done voice_build/voice_test jobs must NOT be reset to queued by reconcile."""
    from app.state import put_job, get_jobs
    from app.models import Job
    from app.jobs.reconcile import cleanup_and_reconcile

    jid = "build-test-reconcile"
    j = Job(
        id=jid,
        engine="voice_build",
        speaker_profile="TestVoice",
        chapter_file="",
        status="done",
        created_at=time.time(),
        finished_at=time.time()  # finished just now -> not stale yet
    )
    put_job(j)

    cleanup_and_reconcile()

    # Voice job should still be 'done', NOT reset to 'queued'
    result = get_jobs().get(jid)
    assert result is not None
    assert result.status == "done", f"Expected 'done' but got '{result.status}' — reconcile incorrectly requeued a voice job!"


def test_assign_profile_to_different_speaker(clean_db, voices_root):
    """Assigning a profile to a different speaker renames the folder correctly."""
    voices_dir = voices_root
    voices_dir.mkdir()

    # Create two speakers
    sid_dracula = create_speaker("Dracula")
    create_speaker("Narrator")

    # Create a profile folder for Dracula
    (voices_dir / "Dracula - Calm").mkdir()
    (voices_dir / "Dracula - Calm" / "profile.json").write_text(
        json.dumps({"speaker_id": sid_dracula, "variant_name": "Calm"})
    )

    # Get Narrator's speaker ID
    sid_narrator = create_speaker.__module__  # just need another speaker ID
    narr = [s for s in client.get("/api/speakers").json() if s["name"] == "Narrator"]
    sid_narrator = narr[0]["id"]

    # Reassign "Dracula - Calm" to Narrator
    response = client.post(
        "/api/speaker-profiles/Dracula%20-%20Calm/assign",
        data={"speaker_id": sid_narrator}
    )
    assert response.status_code == 200, response.text
    new_name = response.json()["new_profile_name"]
    assert new_name == "Narrator - Calm"
    assert (voices_dir / "Narrator - Calm").exists()
    assert not (voices_dir / "Dracula - Calm").exists()


def test_worker_does_not_skip_voice_builds():
    """The worker must NOT skip voice_build/voice_test jobs even though _output_exists returns True."""
    from app.jobs.reconcile import _output_exists
    # The reconcile function returns True for voice engines (prevents requeue loop)
    assert _output_exists("voice_build", "") is True
    # But the worker must NOT use this to skip the job — verify the worker code has the exclusion
    import inspect
    import app.jobs.worker as w_mod
    src = inspect.getsource(w_mod.worker_loop)
    assert 'j.engine not in ("voice_build", "voice_test")' in src, \
        "worker_loop must exclude voice engines from the output-exists skip check"


def test_build_clears_sample_wav(clean_db, voices_root):
    """Calling the build endpoint should delete an existing sample.wav."""
    voices_dir = voices_root
    voices_dir.mkdir(parents=True, exist_ok=True)

    # 1. Create a profile, a raw sample, and a sample.wav preview file
    profile_path = voices_dir / "TestBuilder"
    profile_path.mkdir()
    raw_sample_path = profile_path / "raw_sample.wav"
    raw_sample_path.write_text("raw content")
    sample_path = profile_path / "sample.wav"
    sample_path.write_text("old content")
    assert raw_sample_path.exists()
    assert sample_path.exists()

    # 2. Call build
    response = client.post("/api/speaker-profiles/TestBuilder/build")
    assert response.status_code == 200

    # 3. Verify sample.wav is GONE but the raw training sample remains
    assert not sample_path.exists(), "sample.wav should have been deleted by the build endpoint"
    assert raw_sample_path.exists(), "raw samples should remain available for the build job"


def test_voice_build_worker_exports_mp3_preview(clean_db, voices_root):
    """Voice build jobs should leave a reusable sample.mp3 and remove the temp sample.wav."""
    from app.jobs.worker import worker_loop
    from app.models import Job

    voices_dir = voices_root
    profile_dir = voices_dir / "TestBuilt"
    profile_dir.mkdir(parents=True, exist_ok=True)

    sample_wav = profile_dir / "sample.wav"
    sample_mp3 = profile_dir / "sample.mp3"

    q = MagicMock()
    q.get.side_effect = ["test-build", Exception("StopLoop")]

    job = Job(
        id="test-build",
        engine="voice_build",
        speaker_profile="TestBuilt",
        status="queued",
        created_at=time.time(),
        chapter_file="",
    )

    def fake_xtts_generate(*args, **kwargs):
        out_wav = kwargs["out_wav"]
        Path(out_wav).write_text("wav preview")
        return 0

    def fake_wav_to_mp3(in_wav, out_mp3, on_output=None, cancel_check=None):
        Path(out_mp3).write_text("mp3 preview")
        return 0

    with patch("app.config.VOICES_DIR", voices_dir), \
         patch("app.jobs.worker.get_jobs", return_value={"test-build": job}), \
         patch("app.jobs.worker.update_job"), \
         patch("app.jobs.worker.get_performance_metrics", return_value={"xtts_cps": 10.0, "audiobook_speed_multiplier": 1.0}), \
         patch("app.jobs.worker.get_speaker_settings", return_value={"speed": 1.0, "test_text": "Hello"}), \
         patch("app.jobs.worker.get_speaker_wavs", return_value="ref.wav"), \
         patch("app.jobs.worker.get_voice_profile_dir", return_value=profile_dir), \
         patch("app.engines.xtts_generate", side_effect=fake_xtts_generate), \
         patch("app.jobs.worker.wav_to_mp3", side_effect=fake_wav_to_mp3):

        try:
            worker_loop(q)
        except Exception as e:
            if str(e) != "StopLoop":
                raise

    assert sample_mp3.exists()
    assert not sample_wav.exists()


def test_voice_build_worker_uses_bridge_when_flag_enabled_for_xtts_profiles(clean_db, voices_root, monkeypatch):
    from app.jobs.worker import worker_loop
    from app.models import Job

    voices_dir = voices_root
    profile_dir = voices_dir / "BridgeXTTS"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "sample.wav").write_text("ref wav")

    sample_wav = profile_dir / "sample.wav"
    sample_mp3 = profile_dir / "sample.mp3"
    q = MagicMock()
    q.get.side_effect = ["test-bridge-xtts", Exception("StopLoop")]

    job = Job(
        id="test-bridge-xtts",
        engine="voice_build",
        speaker_profile="BridgeXTTS",
        status="queued",
        created_at=time.time(),
        chapter_file="",
    )

    def fake_synthesize(request):
        assert request["engine_id"] == "xtts"
        assert request["voice_profile_id"] == "BridgeXTTS"
        assert request["output_path"] == str(sample_wav)
        assert request["output_format"] == "wav"
        sample_wav.write_text("wav preview")
        return {"status": "ok", "audio_path": str(sample_wav)}

    def fake_wav_to_mp3(in_wav, out_mp3, on_output=None, cancel_check=None):
        Path(out_mp3).write_text("mp3 preview")
        return 0

    monkeypatch.setenv("USE_V2_ENGINE_BRIDGE", "1")

    with patch("app.config.VOICES_DIR", voices_dir), \
         patch("app.jobs.worker.get_jobs", return_value={"test-bridge-xtts": job}), \
         patch("app.jobs.worker.update_job"), \
         patch("app.jobs.worker.get_performance_metrics", return_value={"xtts_cps": 10.0, "audiobook_speed_multiplier": 1.0}), \
         patch("app.jobs.worker.get_speaker_settings", return_value={"engine": "xtts", "speed": 1.0, "test_text": "Hello"}), \
         patch("app.jobs.worker.get_speaker_wavs", return_value="ref.wav"), \
         patch("app.jobs.worker.get_voice_profile_dir", return_value=profile_dir), \
         patch("app.jobs.worker.create_voice_bridge") as mock_bridge_factory, \
         patch("app.jobs.worker.wav_to_mp3", side_effect=fake_wav_to_mp3):

        mock_bridge = MagicMock()
        mock_bridge.synthesize.side_effect = fake_synthesize
        mock_bridge_factory.return_value = mock_bridge

        try:
            worker_loop(q)
        except Exception as e:
            if str(e) != "StopLoop":
                raise

    assert sample_mp3.exists()
    assert not sample_wav.exists()
    mock_bridge.synthesize.assert_called_once()


def test_voice_build_worker_moves_bridge_output_when_path_differs(clean_db, voices_root, monkeypatch):
    from app.jobs.worker import worker_loop
    from app.models import Job

    voices_dir = voices_root
    profile_dir = voices_dir / "BridgeMoveXTTS"
    profile_dir.mkdir(parents=True, exist_ok=True)

    sample_wav = profile_dir / "sample.wav"
    sample_mp3 = profile_dir / "sample.mp3"
    bridge_output = voices_dir / "tmp" / "bridge-output.wav"
    bridge_output.parent.mkdir(parents=True, exist_ok=True)
    bridge_output.write_text("wav preview")
    q = MagicMock()
    q.get.side_effect = ["test-bridge-move-xtts", Exception("StopLoop")]

    job = Job(
        id="test-bridge-move-xtts",
        engine="voice_build",
        speaker_profile="BridgeMoveXTTS",
        status="queued",
        created_at=time.time(),
        chapter_file="",
    )

    def fake_synthesize(request):
        assert request["output_path"] == str(sample_wav)
        return {"status": "ok", "audio_path": str(bridge_output)}

    def fake_wav_to_mp3(in_wav, out_mp3, on_output=None, cancel_check=None):
        Path(out_mp3).write_text("mp3 preview")
        return 0

    monkeypatch.setenv("USE_V2_ENGINE_BRIDGE", "1")

    with patch("app.config.VOICES_DIR", voices_dir), \
         patch("app.jobs.worker.get_jobs", return_value={"test-bridge-move-xtts": job}), \
         patch("app.jobs.worker.update_job"), \
         patch("app.jobs.worker.get_performance_metrics", return_value={"xtts_cps": 10.0, "audiobook_speed_multiplier": 1.0}), \
         patch("app.jobs.worker.get_speaker_settings", return_value={"engine": "xtts", "speed": 1.0, "test_text": "Hello"}), \
         patch("app.jobs.worker.get_speaker_wavs", return_value="ref.wav"), \
         patch("app.jobs.worker.get_voice_profile_dir", return_value=profile_dir), \
         patch("app.jobs.worker.create_voice_bridge") as mock_bridge_factory, \
         patch("app.jobs.worker.shutil.move") as mock_move, \
         patch("app.jobs.worker.wav_to_mp3", side_effect=fake_wav_to_mp3):

        mock_bridge = MagicMock()
        mock_bridge.synthesize.side_effect = fake_synthesize
        mock_bridge_factory.return_value = mock_bridge

        try:
            worker_loop(q)
        except Exception as e:
            if str(e) != "StopLoop":
                raise

    mock_move.assert_called_once_with(str(bridge_output), str(sample_wav))
    assert sample_mp3.exists()


def test_voice_build_worker_uses_bridge_when_flag_enabled_for_voxtral_profiles(clean_db, voices_root, monkeypatch):
    from app.jobs.worker import worker_loop
    from app.models import Job

    voices_dir = voices_root
    profile_dir = voices_dir / "BridgeVoxtral"
    profile_dir.mkdir(parents=True, exist_ok=True)
    reference_wav = profile_dir / "reference.wav"
    reference_wav.write_text("ref wav")
    sample_wav = profile_dir / "sample.wav"
    sample_mp3 = profile_dir / "sample.mp3"
    q = MagicMock()
    q.get.side_effect = ["test-bridge-voxtral", Exception("StopLoop")]

    job = Job(
        id="test-bridge-voxtral",
        engine="voice_build",
        speaker_profile="BridgeVoxtral",
        status="queued",
        created_at=time.time(),
        chapter_file="",
    )

    def fake_synthesize(request):
        assert request["engine_id"] == "voxtral"
        assert request["voice_profile_id"] == "BridgeVoxtral"
        assert request["voice_asset_id"] == "voice-123"
        assert request["reference_sample"] == "reference.wav"
        assert request["output_path"] == str(sample_wav)
        sample_wav.write_text("wav preview")
        return {"status": "ok", "audio_path": str(sample_wav)}

    def fake_wav_to_mp3(in_wav, out_mp3, on_output=None, cancel_check=None):
        Path(out_mp3).write_text("mp3 preview")
        return 0

    monkeypatch.setenv("USE_V2_ENGINE_BRIDGE", "1")

    with patch("app.config.VOICES_DIR", voices_dir), \
         patch("app.jobs.worker.get_jobs", return_value={"test-bridge-voxtral": job}), \
         patch("app.jobs.worker.update_job"), \
         patch("app.jobs.worker.get_performance_metrics", return_value={"xtts_cps": 10.0, "audiobook_speed_multiplier": 1.0}), \
         patch(
             "app.jobs.worker.get_speaker_settings",
             return_value={
                 "engine": "voxtral",
                 "speed": 1.0,
                 "test_text": "Hello",
                 "voxtral_voice_id": "voice-123",
                 "voxtral_model": "voxtral-mini-tts-2603",
                 "reference_sample": "reference.wav",
             },
         ), \
         patch("app.jobs.worker.get_speaker_wavs", return_value=str(reference_wav)), \
         patch("app.jobs.worker.get_voice_profile_dir", return_value=profile_dir), \
         patch("app.jobs.worker.create_voice_bridge") as mock_bridge_factory, \
         patch("app.jobs.worker.wav_to_mp3", side_effect=fake_wav_to_mp3):

        mock_bridge = MagicMock()
        mock_bridge.synthesize.side_effect = fake_synthesize
        mock_bridge_factory.return_value = mock_bridge

        try:
            worker_loop(q)
        except Exception as e:
            if str(e) != "StopLoop":
                raise

    assert sample_mp3.exists()
    assert not sample_wav.exists()
    mock_bridge.synthesize.assert_called_once()


def test_voice_build_worker_uses_voxtral_for_voxtral_profiles(clean_db, voices_root):
    from app.jobs.worker import worker_loop
    from app.models import Job

    voices_dir = voices_root
    profile_dir = voices_dir / "TestVoxtral"
    profile_dir.mkdir(parents=True, exist_ok=True)

    sample_wav = profile_dir / "sample.wav"
    sample_mp3 = profile_dir / "sample.mp3"

    q = MagicMock()
    q.get.side_effect = ["test-voxtral-build", Exception("StopLoop")]

    job = Job(
        id="test-voxtral-build",
        engine="voice_build",
        speaker_profile="TestVoxtral",
        status="queued",
        created_at=time.time(),
        chapter_file="",
    )

    def fake_voxtral_generate(*args, **kwargs):
        out_wav = kwargs["out_wav"]
        Path(out_wav).write_text("wav preview")
        return 0

    def fake_wav_to_mp3(in_wav, out_mp3, on_output=None, cancel_check=None):
        Path(out_mp3).write_text("mp3 preview")
        return 0

    with patch("app.config.VOICES_DIR", voices_dir), \
         patch("app.jobs.worker.get_jobs", return_value={"test-voxtral-build": job}), \
         patch("app.jobs.worker.update_job"), \
         patch("app.jobs.worker.get_performance_metrics", return_value={"xtts_cps": 10.0, "audiobook_speed_multiplier": 1.0}), \
         patch(
             "app.jobs.worker.get_speaker_settings",
             return_value={
                 "engine": "voxtral",
                 "test_text": "Hello",
                 "voxtral_voice_id": "voice_123",
                 "voxtral_model": "voxtral-tts",
                 "reference_sample": None,
             },
         ), \
         patch("app.jobs.worker.get_speaker_wavs", return_value=None), \
         patch("app.jobs.worker.get_voice_profile_dir", return_value=profile_dir), \
         patch("app.jobs.worker.voxtral_generate", side_effect=fake_voxtral_generate), \
         patch("app.jobs.worker.wav_to_mp3", side_effect=fake_wav_to_mp3):

        try:
            worker_loop(q)
        except Exception as e:
            if str(e) != "StopLoop":
                raise

    assert sample_mp3.exists()
    assert not sample_wav.exists()
