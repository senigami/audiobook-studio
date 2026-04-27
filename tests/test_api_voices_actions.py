import pytest
import json
import io
from pathlib import Path
from unittest.mock import patch


def test_create_profile_persists_engine_metadata(clean_db, voices_root, client):
    voices_root.mkdir()

    with patch("app.api.routers.voices_helpers._is_engine_active", return_value=True):
        response = client.post("/api/speaker-profiles", data={"speaker_id": "S1", "variant_name": "Vox", "engine": "voxtral"})
    assert response.status_code == 200

    name = response.json()["name"]
    spk, var = name.split(" - ", 1)
    meta = json.loads((voices_root / spk.strip() / var.strip() / "profile.json").read_text())
    assert meta["engine"] == "voxtral"


def test_create_voxtral_profile_requires_api_key(clean_db, voices_root, client):
    voices_root.mkdir()

    with patch("app.api.routers.voices_helpers._is_engine_active", return_value=False):
        response = client.post("/api/speaker-profiles", data={"speaker_id": "S1", "variant_name": "Vox", "engine": "voxtral"})
    assert response.status_code == 400
    assert "not enabled" in response.json()["message"]


def test_update_profile_engine(clean_db, voices_root, client):
    voices_root.mkdir()
    profile_dir = voices_root / "SpeakerA"
    profile_dir.mkdir()
    (profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default"}))

    with patch("app.api.routers.voices_helpers._is_engine_active", return_value=True):
        response = client.post("/api/speaker-profiles/SpeakerA/engine", data={"engine": "voxtral"})
    assert response.status_code == 200
    assert response.json()["engine"] == "voxtral"

    meta = json.loads((profile_dir / "profile.json").read_text())
    assert meta["engine"] == "voxtral"


def test_update_voxtral_engine_requires_api_key(clean_db, voices_root, client):
    voices_root.mkdir()
    profile_dir = voices_root / "SpeakerA"
    profile_dir.mkdir()
    (profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default", "engine": "xtts"}))

    with patch("app.api.routers.voices_helpers._is_engine_active", return_value=False):
        response = client.post("/api/speaker-profiles/SpeakerA/engine", data={"engine": "voxtral"})
    assert response.status_code == 400
    assert "not enabled" in response.json()["message"]


def test_update_profile_engine_rejects_invalid_value(clean_db, voices_root, client):
    voices_root.mkdir()
    profile_dir = voices_root / "SpeakerA"
    profile_dir.mkdir()
    (profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default"}))

    response = client.post("/api/speaker-profiles/SpeakerA/engine", data={"engine": "bad-engine"})
    assert response.status_code == 400


def test_update_profile_reference_sample(clean_db, voices_root, client):
    voices_root.mkdir()
    profile_dir = voices_root / "SpeakerA"
    profile_dir.mkdir()
    (profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default", "engine": "voxtral"}))
    (profile_dir / "sample1.wav").write_text("audio")

    with patch("app.api.routers.voices_helpers._is_engine_active", return_value=True):
        response = client.post("/api/speaker-profiles/SpeakerA/reference-sample", data={"sample_name": "sample1.wav"})
    assert response.status_code == 200
    assert response.json()["reference_sample"] == "sample1.wav"

    meta = json.loads((profile_dir / "profile.json").read_text())
    assert meta["reference_sample"] == "sample1.wav"


def test_update_profile_voxtral_voice_id(clean_db, voices_root, client):
    voices_root.mkdir()
    profile_dir = voices_root / "SpeakerA"
    profile_dir.mkdir()
    (profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default", "engine": "voxtral"}))

    with patch("app.api.routers.voices_helpers._is_engine_active", return_value=True):
        response = client.post("/api/speaker-profiles/SpeakerA/voxtral-voice-id", data={"voice_id": "voice_123"})
    assert response.status_code == 200
    assert response.json()["voxtral_voice_id"] == "voice_123"

    meta = json.loads((profile_dir / "profile.json").read_text())
    assert meta["voxtral_voice_id"] == "voice_123"


def test_voxtral_profile_test_accepts_saved_voice_id_without_samples(clean_db, voices_root, client):
    profile_dir = voices_root / "SpeakerA"
    profile_dir.mkdir(parents=True)
    (profile_dir / "profile.json").write_text(json.dumps({
        "variant_name": "Default",
        "engine": "voxtral",
        "voxtral_voice_id": "voice_123",
    }))

    with patch("app.api.routers.voices_helpers._is_engine_active", return_value=True), patch("app.state.put_job"), patch("app.jobs.enqueue"):
        response = client.post("/api/speaker-profiles/SpeakerA/test")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_voice_test_job_uses_descriptive_queue_title(clean_db, voices_root, client):
    profile_dir = voices_root / "Alice - Warm"
    profile_dir.mkdir(parents=True)
    (profile_dir / "1.wav").write_text("audio")
    (profile_dir / "profile.json").write_text(json.dumps({
        "speaker_id": "speaker-alice",
        "variant_name": "Warm",
        "engine": "xtts",
    }))

    with patch("app.state.put_job") as mock_put_job, patch("app.jobs.enqueue"):
        response = client.post("/api/speaker-profiles/Alice%20-%20Warm/test")

    assert response.status_code == 200
    queued_job = mock_put_job.call_args.args[0]
    assert queued_job.custom_title == "Building voice for Alice: Warm"


def test_speaker_settings_updates(clean_db, client):
    with patch("app.jobs.update_speaker_settings") as mock_update:
        # Test text
        response = client.post("/api/speaker-profiles/SpeakerA/test-text", data={"text": "Hello world"})
        assert response.status_code == 200
        assert response.json()["test_text"] == "Hello world"

        # Speed
        response = client.post("/api/speaker-profiles/SpeakerA/speed", data={"speed": 1.2})
        assert response.status_code == 200
        assert response.json()["speed"] == 1.2

    assert mock_update.call_count == 2


def test_reset_speaker_test_text(clean_db, voices_root, client):
    from app.api.routers.voices import DEFAULT_SPEAKER_TEST_TEXT

    voices_dir = voices_root
    profile_dir = voices_dir / "SpeakerA"
    profile_dir.mkdir(parents=True)
    (profile_dir / "profile.json").write_text(json.dumps({"test_text": "Custom text"}))

    with patch("app.jobs.speaker.VOICES_DIR", voices_dir):
        response = client.post("/api/speaker-profiles/SpeakerA/reset-test-text")

    assert response.status_code == 200
    assert response.json()["test_text"] == DEFAULT_SPEAKER_TEST_TEXT
    # Check that test_text was removed from profile.json (falling back to default)
    assert "test_text" not in json.loads((profile_dir / "profile.json").read_text())


def test_build_and_test_profiles(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir()

    with patch("app.api.routers.voices_helpers.VOICES_DIR", voices_dir):
        # Build
        file_content = b"fake wav"
        files = {"files": ("input1.wav", io.BytesIO(file_content), "audio/wav")}
        (voices_dir / "SpeakerA").mkdir()
        (voices_dir / "SpeakerA" / "profile.json").write_text("{}")
        with patch("app.state.put_job"), patch("app.jobs.enqueue"):
            response = client.post("/api/speaker-profiles/SpeakerA/build", files=files)
            assert response.status_code == 200
            assert (voices_dir / "SpeakerA" / "input1.wav").exists() or (voices_dir / "SpeakerA" / "Default" / "input1.wav").exists()

        (voices_dir / "SpeakerA" / "1.wav").write_text("fake wav content 2")

        # Test
        with patch("app.state.put_job"), patch("app.jobs.enqueue"):
            response = client.post("/api/speaker-profiles/SpeakerA/test")
            assert response.status_code == 200


def test_build_and_test_require_samples(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir()

    with patch("app.api.routers.voices_helpers.VOICES_DIR", voices_dir):
        profile_dir = voices_dir / "SpeakerA"
        profile_dir.mkdir(parents=True, exist_ok=True)

        with patch("app.state.put_job"), patch("app.jobs.enqueue"):
            response = client.post("/api/speaker-profiles/SpeakerA/test")
            assert response.status_code == 400
            assert "sample" in response.json()["message"].lower()

            response = client.post("/api/speaker-profiles/SpeakerA/build")
            assert response.status_code == 400
            assert "sample" in response.json()["message"].lower()


def test_xtts_voice_actions_reject_when_disabled(clean_db, voices_root, client):
    voices_dir = voices_root
    profile_dir = voices_dir / "SpeakerA"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({
        "variant_name": "Default",
        "engine": "xtts",
    }))
    (profile_dir / "1.wav").write_text("fake wav content")

    with patch("app.api.routers.voices_helpers._is_engine_active", return_value=False):
        response = client.post("/api/speaker-profiles/SpeakerA/test")

    assert response.status_code == 400
    assert "enabled in Settings" in response.json()["message"]


def test_legacy_build_and_rename(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir()

    # Legacy Build
    with patch("app.state.put_job"), patch("app.jobs.enqueue"):
        response = client.post("/api/speaker-profiles/SpeakerL/build", files={"files": ("sample.wav", io.BytesIO(b"legacy"), "audio/wav")})
        assert response.status_code == 200

    # Legacy Rename
    if not (voices_dir / "SpeakerL").exists():
        (voices_dir / "SpeakerL").mkdir()
    response = client.post("/api/speaker-profiles/SpeakerL/rename", data={"new_name": "SpeakerNew"})
    assert response.status_code == 200


def test_upload_samples_security_and_failure(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir()

    # Define files for the test
    files = {"files": ("sample.wav", io.BytesIO(b"data"), "audio/wav")}

    # Exception during upload
    with patch("app.api.routers.voices_actions.Path.mkdir", side_effect=Exception("makedirs failed")):
        response = client.post("/api/speaker-profiles/SpeakerA/samples/upload", files=files)
        assert response.status_code == 500


def test_delete_sample_errors(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir()
    (voices_dir / "SpeakerA").mkdir()
    (voices_dir / "SpeakerA" / "profile.json").write_text("{}")
    (voices_dir / "SpeakerA" / "sample1.wav").write_text("audio")

    # Success
    response = client.delete("/api/speaker-profiles/SpeakerA/samples/sample1.wav")
    assert response.status_code == 200
    assert not (voices_dir / "SpeakerA" / "sample1.wav").exists()

    # Exception
    with patch("os.unlink", side_effect=Exception("unlink failed")):
        (voices_dir / "SpeakerA" / "bad.wav").write_text("trash")
        response = client.delete("/api/speaker-profiles/SpeakerA/samples/bad.wav")
        assert response.status_code == 500


def test_delete_sample_reject_traversal(voices_root):
    from app.api.routers.voices import delete_speaker_sample

    voices_dir = voices_root
    voices_dir.mkdir()
    (voices_dir / "SpeakerA").mkdir()
    (voices_dir / "SpeakerA" / "profile.json").write_text("{}")
    with patch("app.api.routers.voices_helpers.VOICES_DIR", voices_dir):
        response = delete_speaker_sample(
            name="SpeakerA",
            sample_name="../../escape.wav",
        )
    assert response.status_code == 403
