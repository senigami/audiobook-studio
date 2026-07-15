import pytest
import json
import io
from pathlib import Path
from unittest.mock import patch

from app.db.speakers import update_speaker_settings


def test_create_profile_persists_engine_metadata(clean_db, voices_root, client):
    voices_root.mkdir(parents=True, exist_ok=True)

    with patch("app.api.routers.voices_helpers._is_engine_active", return_value=True):
        response = client.post("/api/speaker-profiles", data={"speaker_id": "S1", "variant_name": "Vox", "engine": "voxtral"})
    assert response.status_code == 200

    name = response.json()["name"]
    spk, var = name.split(" - ", 1)
    meta = json.loads((voices_root / spk.strip() / var.strip() / "profile.json").read_text())
    assert meta["engine"] == "voxtral"


def test_create_managed_engine_profile_requires_active_status(clean_db, voices_root, client):
    voices_root.mkdir(parents=True, exist_ok=True)

    with patch("app.api.routers.voices_helpers._is_engine_active", return_value=False), patch("app.api.routers.voices_actions.voices_helpers._is_engine_active", return_value=False):
        response = client.post("/api/speaker-profiles", data={"speaker_id": "S1", "variant_name": "Vox", "engine": "voxtral"})
    assert response.status_code == 400
    assert "not enabled" in response.json()["message"]


def test_update_profile_engine(clean_db, voices_root, client):
    voices_root.mkdir(parents=True, exist_ok=True)
    profile_root = voices_root / "SpeakerA"
    profile_root.mkdir(parents=True, exist_ok=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "SpeakerA"}))
    profile_dir = profile_root / "Default"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default"}))

    with patch("app.api.routers.voices_helpers._is_engine_active", return_value=True):
        response = client.post("/api/speaker-profiles/SpeakerA/engine", data={"engine": "voxtral"})
    assert response.status_code == 200
    assert response.json()["engine"] == "voxtral"

    meta = json.loads((profile_dir / "profile.json").read_text())
    assert meta["engine"] == "voxtral"


def test_update_managed_engine_requires_active_status(clean_db, voices_root, client):
    voices_root.mkdir(parents=True, exist_ok=True)
    profile_root = voices_root / "SpeakerA"
    profile_root.mkdir(parents=True, exist_ok=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "SpeakerA"}))
    profile_dir = profile_root / "Default"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default", "engine": "xtts"}))

    with patch("app.api.routers.voices_helpers._is_engine_active", return_value=False), patch("app.api.routers.voices_actions.voices_helpers._is_engine_active", return_value=False):
        response = client.post("/api/speaker-profiles/SpeakerA/engine", data={"engine": "voxtral"})
    assert response.status_code == 400
    assert "not enabled" in response.json()["message"]
    voices_root.mkdir(parents=True, exist_ok=True)
    profile_root = voices_root / "SpeakerA"
    profile_root.mkdir(parents=True, exist_ok=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "SpeakerA"}))
    profile_dir = profile_root / "Default"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default"}))
    profile_dir = voices_root / "SpeakerA"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default"}))

    response = client.post("/api/speaker-profiles/SpeakerA/engine", data={"engine": "bad-engine"})
    assert response.status_code == 400


def test_update_profile_reference_sample(clean_db, voices_root, client):
    voices_root.mkdir(parents=True, exist_ok=True)
    profile_root = voices_root / "SpeakerA"
    profile_root.mkdir(parents=True, exist_ok=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "SpeakerA"}))
    profile_dir = profile_root / "Default"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default", "engine": "voxtral"}))
    (profile_dir / "sample1.wav").write_text("audio")

    with patch("app.api.routers.voices_helpers._is_engine_active", return_value=True):
        response = client.post("/api/speaker-profiles/SpeakerA/reference-sample", data={"sample_name": "sample1.wav"})
    assert response.status_code == 200
    assert response.json()["reference_sample"] == "sample1.wav"

    meta = json.loads((profile_dir / "profile.json").read_text())
    assert meta["reference_sample"] == "sample1.wav"


def test_update_profile_voice_asset_id(clean_db, voices_root, client):
    voices_root.mkdir(parents=True, exist_ok=True)
    profile_root = voices_root / "SpeakerA"
    profile_root.mkdir(parents=True, exist_ok=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "SpeakerA"}))
    profile_dir = profile_root / "Default"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default", "engine": "voxtral"}))

    with patch("app.api.routers.voices_helpers._is_engine_active", return_value=True):
        response = client.post("/api/speaker-profiles/SpeakerA/voice-asset-id", data={"voice_id": "voice_123"})
    assert response.status_code == 200
    assert response.json()["voice_asset_id"] == "voice_123"

    meta = json.loads((profile_dir / "profile.json").read_text())
    assert meta["voice_asset_id"] == "voice_123"


def test_managed_profile_test_accepts_saved_voice_id_without_samples(clean_db, voices_root, client):
    profile_root = voices_root / "SpeakerA"
    profile_root.mkdir(parents=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "SpeakerA"}))
    profile_dir = profile_root / "Default"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({
        "variant_name": "Default",
        "engine": "voxtral",
        "voice_asset_id": "voice_123",
    }))

    with patch("app.api.routers.voices_helpers._is_engine_active", return_value=True), \
         patch("app.db.state.put_job"), \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit") as mock_submit:
        response = client.post("/api/speaker-profiles/SpeakerA/test")

    assert response.status_code == 200
    assert mock_submit.called
    assert response.json()["status"] == "ok"


def test_voice_test_job_uses_descriptive_queue_title(clean_db, voices_root, client):
    profile_root = voices_root / "Alice"
    profile_root.mkdir(parents=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "Alice"}))
    profile_dir = profile_root / "Warm"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "1.wav").write_text("audio")
    (profile_dir / "profile.json").write_text(json.dumps({
        "speaker_id": "speaker-alice",
        "variant_name": "Warm",
        "engine": "xtts",
    }))

    with patch("app.db.state.put_job") as mock_put_job, \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"):
        response = client.post("/api/speaker-profiles/Alice%20-%20Warm/test")

    assert response.status_code == 200
    queued_job = mock_put_job.call_args.args[0]
    assert queued_job.custom_title == "Building voice for Alice: Warm"



def test_reset_speaker_test_text(clean_db, voices_root, client):
    from app.api.routers.voices import DEFAULT_SPEAKER_TEST_TEXT

    voices_dir = voices_root
    voices_dir = voices_root
    profile_root = voices_dir / "SpeakerA"
    profile_root.mkdir(parents=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "SpeakerA"}))
    profile_dir = profile_root / "Default"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({"test_text": "Custom text", "variant_name": "Default"}))

    with patch("app.api.routers.voices_actions.update_speaker_settings", wraps=update_speaker_settings):
        response = client.post("/api/speaker-profiles/SpeakerA/reset-test-text")

    assert response.status_code == 200
    assert response.json()["test_text"] == DEFAULT_SPEAKER_TEST_TEXT
    # Check that test_text was removed from profile.json (falling back to default)
    assert "test_text" not in json.loads((profile_dir / "profile.json").read_text())


def test_build_and_test_profiles(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir(parents=True, exist_ok=True)

    with patch("app.api.routers.voices_helpers.VOICES_DIR", voices_dir):
        # Build
        file_content = b"fake wav"
        files = {"files": ("input1.wav", io.BytesIO(file_content), "audio/wav")}
        profile_root = voices_dir / "SpeakerA"
        profile_root.mkdir(parents=True, exist_ok=True)
        (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "SpeakerA"}))
        profile_dir = profile_root / "Default"
        profile_dir.mkdir(parents=True, exist_ok=True)
        (profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default", "engine": "xtts"}))
        with patch("app.db.state.put_job"), \
             patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"):
            response = client.post("/api/speaker-profiles/SpeakerA/build", files=files)
            assert response.status_code == 200
            assert (voices_dir / "SpeakerA" / "input1.wav").exists() or (voices_dir / "SpeakerA" / "Default" / "input1.wav").exists()

        (voices_dir / "SpeakerA" / "1.wav").write_text("fake wav content 2")

        # Test
        with patch("app.db.state.put_job"), \
             patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"):
            response = client.post("/api/speaker-profiles/SpeakerA/test")
            assert response.status_code == 200


def test_engine_actions_reject_when_disabled(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir = voices_root
    profile_root = voices_dir / "SpeakerA"
    profile_root.mkdir(parents=True, exist_ok=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "SpeakerA"}))
    profile_dir = profile_root / "Default"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({
        "variant_name": "Default",
        "engine": "xtts",
    }))
    (profile_dir / "1.wav").write_text("fake wav content")

    with patch("app.api.routers.voices_helpers._is_engine_active", return_value=False), patch("app.api.routers.voices_actions.voices_helpers._is_engine_active", return_value=False):
        response = client.post("/api/speaker-profiles/SpeakerA/test")

    assert response.status_code == 400
    assert "enabled in Settings" in response.json()["message"]


def test_build_and_rename_profile(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir(parents=True, exist_ok=True)

    profile_root = voices_dir / "SpeakerL"
    profile_root.mkdir(parents=True, exist_ok=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "SpeakerL"}))
    profile_dir = profile_root / "Default"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default", "engine": "xtts"}))

    # Legacy Build
    with patch("app.db.state.put_job"), \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"):
        response = client.post("/api/speaker-profiles/SpeakerL/build", files={"files": ("sample.wav", io.BytesIO(b"sample"), "audio/wav")})
        assert response.status_code == 200

    # Legacy Rename
    if not (voices_dir / "SpeakerL").exists():
        (voices_dir / "SpeakerL").mkdir(parents=True, exist_ok=True)
    response = client.post("/api/speaker-profiles/SpeakerL/rename", data={"new_name": "SpeakerNew"})
    assert response.status_code == 200


def test_upload_samples_security_and_failure(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir(parents=True, exist_ok=True)

    # Define files for the test
    files = {"files": ("sample.wav", io.BytesIO(b"data"), "audio/wav")}

    # Exception during upload
    with patch("app.api.routers.voices_actions.Path.mkdir", side_effect=Exception("makedirs failed")):
        response = client.post("/api/speaker-profiles/SpeakerA/samples/upload", files=files)
        assert response.status_code == 500


def test_upload_samples_collision_guard_auto_suffixes(clean_db, voices_root, client):
    """Regression: two uploads with the same filename must never overwrite
    one another (task 009, INV-REC-2 at the persistence layer). Before the
    fix, `open(target_path, "wb")` had no existence check, so this second
    upload would silently clobber the first sample's bytes.
    """
    voices_dir = voices_root
    profile_root = voices_dir / "SpeakerCollide"
    profile_root.mkdir(parents=True, exist_ok=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "SpeakerCollide"}))
    profile_dir = profile_root / "Default"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default"}))

    files = {"files": ("take.wav", io.BytesIO(b"first-take-bytes"), "audio/wav")}
    response = client.post("/api/speaker-profiles/SpeakerCollide/samples/upload", files=files)
    assert response.status_code == 200

    files = {"files": ("take.wav", io.BytesIO(b"second-take-bytes"), "audio/wav")}
    response = client.post("/api/speaker-profiles/SpeakerCollide/samples/upload", files=files)
    assert response.status_code == 200

    wav_files = sorted(p.name for p in profile_dir.glob("*.wav"))
    assert len(wav_files) == 2

    contents = {p.name: p.read_bytes() for p in profile_dir.glob("*.wav")}
    assert b"first-take-bytes" in contents.values()
    assert b"second-take-bytes" in contents.values()


def test_delete_sample_errors(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir(exist_ok=True)
    profile_root = voices_dir / "SpeakerA"
    profile_root.mkdir(parents=True, exist_ok=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "SpeakerA"}))
    profile_dir = profile_root / "Default"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default"}))
    (profile_dir / "sample1.wav").write_text("audio")

    # Success
    response = client.delete("/api/speaker-profiles/SpeakerA/samples/sample1.wav")
    assert response.status_code == 200
    assert not (profile_dir / "sample1.wav").exists()

    # Exception
    with patch("os.unlink", side_effect=Exception("unlink failed")):
        (profile_dir / "bad.wav").write_text("trash")
        response = client.delete("/api/speaker-profiles/SpeakerA/samples/bad.wav")
        assert response.status_code == 500


def test_delete_sample_reject_traversal(voices_root):
    from app.api.routers.voices_helpers import delete_speaker_sample

    voices_dir = voices_root
    voices_dir.mkdir(exist_ok=True)
    profile_root = voices_dir / "SpeakerA"
    profile_root.mkdir(parents=True, exist_ok=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "SpeakerA"}))
    profile_dir = profile_root / "Default"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default"}))

    with patch("app.api.routers.voices_helpers.get_voices_dir", return_value=voices_dir):
        response = delete_speaker_sample(
            name="SpeakerA",
            sample_name="../../escape.wav",
        )
    assert response.status_code == 403

def test_update_profile_voice_asset_id_generic(clean_db, voices_root, client):
    voices_root.mkdir(parents=True, exist_ok=True)
    profile_root = voices_root / "SpeakerA"
    profile_root.mkdir(parents=True, exist_ok=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "SpeakerA"}))
    profile_dir = profile_root / "Default"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default", "engine": "voxtral"}))

    with patch("app.api.routers.voices_helpers._is_engine_active", return_value=True):
        response = client.post("/api/speaker-profiles/SpeakerA/voice-asset-id", data={"voice_id": "asset_456"})
    assert response.status_code == 200
    assert response.json()["voice_asset_id"] == "asset_456"

    meta = json.loads((profile_dir / "profile.json").read_text())
    assert meta["voice_asset_id"] == "asset_456"


def test_update_profile_voice_asset_id_rejects_local_engine(clean_db, voices_root, client):
    voices_root.mkdir(parents=True, exist_ok=True)
    profile_root = voices_root / "SpeakerA"
    profile_root.mkdir(parents=True, exist_ok=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "SpeakerA"}))
    profile_dir = profile_root / "Default"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default", "engine": "xtts"}))

    response = client.post("/api/speaker-profiles/SpeakerA/voice-asset-id", data={"voice_id": "asset_456"})
    assert response.status_code == 400
    assert "does not support voice asset IDs" in response.json()["message"]


def test_build_profile_exception_does_not_expose_stack_trace(clean_db, voices_root, client):
    """Internal exceptions must not leak exception text or tracebacks to the client."""
    voices_root.mkdir(parents=True, exist_ok=True)
    profile_root = voices_root / "SpeakerA"
    profile_root.mkdir(parents=True, exist_ok=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "SpeakerA"}))
    profile_dir = profile_root / "Default"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default", "engine": "xtts"}))
    (profile_dir / "source.wav").write_bytes(b"sample")

    with patch(
        "app.api.routers.voices_helpers._existing_voice_profile_dir",
        side_effect=RuntimeError("internal secret path: /etc/passwd"),
    ):
        response = client.post("/api/speaker-profiles/SpeakerA/build")

    assert response.status_code in (400, 403, 500, 503)
    body = response.text
    assert "internal secret path" not in body
    assert "/etc/passwd" not in body
    assert "Traceback" not in body
