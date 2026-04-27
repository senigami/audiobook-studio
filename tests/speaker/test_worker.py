import time
from pathlib import Path
from unittest.mock import MagicMock, patch

def test_worker_does_not_skip_voice_builds():
    """The worker must NOT skip voice_build/voice_test jobs even though _output_exists returns True."""
    from app.jobs.reconcile import _output_exists
    # The reconcile function returns True for voice engines (prevents requeue loop)
    assert _output_exists("voice_build", "") is True
    # But the worker must NOT use this to skip the job
    import inspect
    import app.jobs.worker as w_mod
    src = inspect.getsource(w_mod.worker_loop)
    assert 'j.engine not in ("voice_build", "voice_test")' in src, \
        "worker_loop must exclude voice engines from the output-exists skip check"

def test_build_clears_sample_wav(clean_db, voices_root, client):
    """Calling the build endpoint should delete an existing sample.wav."""
    voices_dir = voices_root

    # 1. Create a profile, a raw sample, and a sample.wav preview file
    profile_path = voices_dir / "TestBuilder"
    profile_path.mkdir(parents=True, exist_ok=True)
    (profile_path / "profile.json").write_text("{}")
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
         patch("app.jobs.worker_voice.get_speaker_settings", return_value={"speed": 1.0, "test_text": "Hello"}), \
         patch("app.jobs.worker_voice.get_speaker_wavs", return_value="ref.wav"), \
         patch("app.jobs.worker_voice.get_voice_profile_dir", return_value=profile_dir), \
         patch("app.engines.xtts_generate", side_effect=fake_xtts_generate), \
         patch("app.jobs.worker_voice.wav_to_mp3", side_effect=fake_wav_to_mp3):

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
         patch("app.jobs.worker_voice.get_speaker_settings", return_value={"engine": "xtts", "speed": 1.0, "test_text": "Hello"}), \
         patch("app.jobs.worker_voice.get_speaker_wavs", return_value="ref.wav"), \
         patch("app.jobs.worker_voice.get_voice_profile_dir", return_value=profile_dir), \
         patch("app.jobs.worker_voice.create_voice_bridge") as mock_bridge_factory, \
         patch("app.jobs.worker_voice.wav_to_mp3", side_effect=fake_wav_to_mp3):

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
         patch("app.jobs.worker_voice.get_speaker_settings", return_value={"engine": "xtts", "speed": 1.0, "test_text": "Hello"}), \
         patch("app.jobs.worker_voice.get_speaker_wavs", return_value="ref.wav"), \
         patch("app.jobs.worker_voice.get_voice_profile_dir", return_value=profile_dir), \
         patch("app.jobs.worker_voice.create_voice_bridge") as mock_bridge_factory, \
         patch("app.jobs.worker_voice.shutil.move") as mock_move, \
         patch("app.jobs.worker_voice.wav_to_mp3", side_effect=fake_wav_to_mp3):

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
         patch(
             "app.jobs.worker_voice.get_speaker_settings",
             return_value={
                 "engine": "voxtral",
                 "speed": 1.0,
                 "test_text": "Hello",
                 "voxtral_voice_id": "voice-123",
                 "voxtral_model": "voxtral-mini-tts-2603",
                 "reference_sample": "reference.wav",
             },
         ), \
         patch("app.jobs.worker_voice.get_speaker_wavs", return_value=str(reference_wav)), \
         patch("app.jobs.worker_voice.get_voice_profile_dir", return_value=profile_dir), \
         patch("app.jobs.worker_voice.create_voice_bridge") as mock_bridge_factory, \
         patch("app.jobs.worker_voice.wav_to_mp3", side_effect=fake_wav_to_mp3):

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
         patch(
             "app.jobs.worker_voice.get_speaker_settings",
             return_value={
                 "engine": "voxtral",
                 "test_text": "Hello",
                 "voxtral_voice_id": "voice_123",
                 "voxtral_model": "voxtral-tts",
                 "reference_sample": None,
             },
         ), \
         patch("app.jobs.worker_voice.get_speaker_wavs", return_value=None), \
         patch("app.jobs.worker_voice.get_voice_profile_dir", return_value=profile_dir), \
         patch("app.jobs.worker_voice.voxtral_generate", side_effect=fake_voxtral_generate), \
         patch("app.jobs.worker_voice.wav_to_mp3", side_effect=fake_wav_to_mp3):

        try:
            worker_loop(q)
        except Exception as e:
            if str(e) != "StopLoop":
                raise

    assert sample_mp3.exists()
    assert not sample_wav.exists()
