import pytest
import os
from app.api.routers.voices_helpers import _new_voice_profile_dir
from fastapi.testclient import TestClient
import json
from pathlib import Path
from unittest.mock import patch, MagicMock
from tests.utils.timeout import timeout_after

# Import the app
from app.api.web import app

client = TestClient(app)

@pytest.fixture
def clean_db(tmp_path):
    db_path = tmp_path / "test_speakers.db"
    if os.path.exists(db_path):
        os.unlink(db_path)
    os.environ["DB_PATH"] = os.fspath(db_path)
    import app.db.core
    from importlib import reload
    reload(app.db.core)
    app.db.core.init_db()
    yield db_path
    if os.path.exists(db_path):
        os.unlink(db_path)

@pytest.fixture
def clean_voices(tmp_path, clean_db):
    test_voices = tmp_path / "test_voices"
    test_voices.mkdir()
    test_state = tmp_path / "test_state.json"
    import os
    # Create empty state if needed, but app.db.state should handle it
    with patch("app.api.web.VOICES_DIR", test_voices), \
         patch("app.api.routers.voices.VOICES_DIR", test_voices), \
         patch("app.api.routers.voices_helpers.VOICES_DIR", test_voices), \
         patch("app.core.config.VOICES_DIR", test_voices), \
         patch("app.db.speakers.config.VOICES_DIR", test_voices), \
         patch("app.db.state.STATE_FILE", test_state):
        yield test_voices

def test_list_profiles_empty(clean_voices):
    response = client.get("/api/speaker-profiles")
    assert response.status_code == 200
    assert response.json() == []

def test_build_profile(clean_voices):
    # Setup profile dir with configured engine first to satisfy strict policy
    profile_dir = _new_voice_profile_dir("TestSpeaker")
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({"engine": "xtts"}))

    # Mocking files
    files = [
        ("files", ("test1.wav", b"fake wav content 1", "audio/wav")),
        ("files", ("test2.wav", b"fake wav content 2", "audio/wav")),
    ]
    response = client.post(
        "/api/speaker-profiles/TestSpeaker/build",
        files=files
    )
    assert response.status_code == 200

    assert profile_dir.exists()
    assert (profile_dir / "test1.wav").exists()
    assert (profile_dir / "test2.wav").exists()

    # Check listing now
    response = client.get("/api/speaker-profiles")
    assert len(response.json()) == 1
    assert response.json()[0]["name"] == "TestSpeaker"
    assert response.json()[0]["wav_count"] == 2
    assert response.json()[0]["speed"] == 1.0

def test_build_profile_allows_latent_without_raw_samples(clean_voices):
    from unittest.mock import patch

    profile_dir = _new_voice_profile_dir("LatentOnly")
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({"engine": "xtts"}))
    (profile_dir / "latent.pth").write_text("latent")

    response = client.post("/api/speaker-profiles/LatentOnly/build")

    assert response.status_code == 200

def test_update_speed(clean_voices):
    # Create a profile first
    profile_dir = _new_voice_profile_dir("Speedy")
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({"engine": "xtts"}))
    (profile_dir / "1.wav").write_text("audio")

    response = client.post(
        "/api/speaker-profiles/Speedy/speed",
        data={"speed": 1.45}
    )
    assert response.status_code == 200
    assert response.json()["speed"] == 1.45

    # Verify persistence
    meta_path = profile_dir / "profile.json"
    assert meta_path.exists()
    meta = json.loads(meta_path.read_text())
    assert meta["speed"] == 1.45

    # Check listing includes speed
    response = client.get("/api/speaker-profiles")
    assert response.json()[0]["speed"] == 1.45

@patch("app.api.routers.voices_actions.create_orchestrator")
def test_speaker_profile_test_endpoint(mock_orchestrator, clean_voices):
    # Create profile
    name = "Tester"
    profile_dir = _new_voice_profile_dir(name)
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({"engine": "xtts"}))
    (profile_dir / "1.wav").write_text("audio")
    (profile_dir / "1.wav").write_text("audio")
    wav_path = profile_dir / "sample.wav"
    wav_path.write_text("audio")

    # Mock successful generation
    mock_orchestrator.return_value.submit.return_value = None

    # We need to make sure the expected output file exists or the endpoint will return 500
    test_out = clean_voices / name / "sample.wav"
    test_out.parent.mkdir(parents=True, exist_ok=True)
    test_out.write_text("output audio")

    with timeout_after(5, "speaker profile test endpoint should not hang"):
        response = client.post(f"/api/speaker-profiles/{name}/test")

    assert response.status_code == 200
    assert response.json()["audio_url"] == f"/out/voices/{name}/Default/sample.wav"

    # Cleanup test output
    if test_out.exists():
        test_out.unlink()

@patch("app.api.routers.voices_actions.create_orchestrator")
def test_speaker_profile_test_endpoint_allows_latent_without_raw_samples(mock_orchestrator, clean_voices):
    name = "LatentTester"
    profile_dir = _new_voice_profile_dir(name)
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({"engine": "xtts"}))
    (profile_dir / "latent.pth").write_text("latent")

    with timeout_after(5, "latent voice profile test endpoint should not hang"):
        response = client.post(f"/api/speaker-profiles/{name}/test")

    assert response.status_code == 200
    assert response.json()["audio_url"] == f"/out/voices/{name}/Default/sample.wav"

def test_delete_profile(clean_voices):
    name = "DeleteMe"
    profile_dir = _new_voice_profile_dir(name)
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text("{}")
    (profile_dir / "1.wav").write_text("audio")

    response = client.delete(f"/api/speaker-profiles/{name}")
    assert response.status_code == 200
    assert not profile_dir.exists()

def test_rename_profile(clean_voices):
    from app.db.state import update_settings, get_settings
    name = "Original"
    new_name = "Renamed"
    profile_dir = _new_voice_profile_dir(name)
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text("{}")
    (profile_dir / "1.wav").write_text("audio")
    (profile_dir / "latent.pth").write_text("latent")

    # Set as default to test settings update
    update_settings(default_speaker_profile=name)

    response = client.post(f"/api/speaker-profiles/{name}/rename", data={"new_name": new_name})
    assert response.status_code == 200
    assert response.json()["new_name"] == new_name

    assert not (clean_voices / name).exists()
    assert (clean_voices / new_name).exists()
    assert (_new_voice_profile_dir(new_name) / "1.wav").exists()
    assert (_new_voice_profile_dir(new_name) / "latent.pth").exists()

    # Verify settings updated
    assert get_settings()["default_speaker_profile"] == new_name

def test_rename_variant_profile(clean_voices):
    # 1. Setup a speaker and a variant profile
    speaker_id = "spk-123"
    speaker_name = "Sally"
    variant_label = "Happy"
    profile_name = f"{speaker_name} - {variant_label}"

    profile_dir = _new_voice_profile_dir(profile_name)
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text("{}")
    (profile_dir / "latent.pth").write_text("latent")

    meta = {
        "speaker_id": speaker_id,
        "variant_name": variant_label,
        "speed": 1.0
    }
    meta_path = profile_dir / "profile.json"
    meta_path.write_text(json.dumps(meta))

    # 2. Rename to a new variant
    new_variant_label = "Excited"
    new_profile_name = f"{speaker_name} - {new_variant_label}"

    response = client.post(f"/api/speaker-profiles/{profile_name}/rename", data={"new_name": new_profile_name})
    assert response.status_code == 200

    # 3. Verify folder renamed
    speaker_root = clean_voices / speaker_name
    assert not (speaker_root / variant_label).exists()
    assert (speaker_root / new_variant_label).exists()
    assert (_new_voice_profile_dir(new_profile_name) / "latent.pth").exists()

    # 4. Verify profile.json updated with new variant_name
    new_meta_path = _new_voice_profile_dir(new_profile_name) / "profile.json"
    assert new_meta_path.exists()
    new_meta = json.loads(new_meta_path.read_text())
    assert new_meta["variant_name"] == new_variant_label
    assert new_meta["speaker_id"] == speaker_id

def test_get_speaker_settings(clean_voices):
    from app.db.speakers import get_speaker_settings
    from app.db.state import update_settings

    # 1. Test global fallback
    update_settings(speed=1.23)
    settings = get_speaker_settings("NonExistent")
    assert settings["speed"] == 1.23

    # 2. Test per-narrator override
    name = "FastTalker"
    profile_dir = _new_voice_profile_dir(name)
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text("{}")
    meta_path = profile_dir / "profile.json"
    meta_path.write_text(json.dumps({"speed": 1.75}))

    settings = get_speaker_settings(name)
    assert settings["speed"] == 1.75


def test_get_voice_profile_dir_rejects_traversal(clean_voices):
    from app.db.speakers import get_profile_dir as get_voice_profile_dir

    with pytest.raises(ValueError):
        get_voice_profile_dir("../escape")


def test_update_speaker_settings_rejects_invalid_profile_name(clean_voices):
    from app.db.speakers import update_speaker_settings

    assert update_speaker_settings("../escape", speed=1.2) is False


def test_get_speaker_settings_repairs_blank_profile_metadata(clean_voices):
    from app.db.speakers import get_speaker_settings

    name = "BlankMeta"
    profile_dir = _new_voice_profile_dir(name)
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text("{}")
    meta_path = profile_dir / "profile.json"
    meta_path.write_text("", encoding="utf-8")

    settings = get_speaker_settings(name)

    assert settings["variant_name"] == "Default"
    repaired = json.loads(meta_path.read_text(encoding="utf-8"))
    assert "variant_name" not in repaired
    assert "engine" not in repaired

def test_get_speaker_settings_normalizes_default_variant(clean_voices):
    from app.db.speakers import get_speaker_settings

    name = "Dracula"
    profile_dir = _new_voice_profile_dir(name)
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text("{}")

    settings = get_speaker_settings(name)
    assert settings["variant_name"] == "Default"

    meta_path = profile_dir / "profile.json"
    assert meta_path.exists()
    meta = json.loads(meta_path.read_text())
    assert "variant_name" not in meta
    assert "engine" not in meta

def test_get_speaker_settings_infers_variant_from_folder_name(clean_voices):
    from app.db.speakers import get_speaker_settings

    name = "Dracula - Angry"
    profile_dir = _new_voice_profile_dir(name)
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text("{}")

    settings = get_speaker_settings(name)
    assert settings["variant_name"] == "Angry"

def test_list_profiles_marks_preview_out_of_date_when_test_script_changes(clean_voices):
    name = "Preview Drift"
    profile_dir = _new_voice_profile_dir(name)
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text("{}")
    (profile_dir / "voice.wav").write_text("audio")
    (profile_dir / "sample.wav").write_text("preview")
    (profile_dir / "profile.json").write_text(json.dumps({
        "variant_name": "Default",
        "engine": "voxtral",
        "test_text": "New preview script",
        "preview_test_text": "Old preview script",
        "voxtral_voice_id": "voice_123",
        "preview_voxtral_voice_id": "voice_123",
    }))

    response = client.get("/api/speaker-profiles")

    assert response.status_code == 200
    profiles = response.json()
    assert profiles[0]["name"] == name
    assert profiles[0]["is_rebuild_required"] is True

def test_list_profiles_does_not_mark_legacy_preview_out_of_date_without_preview_signature(clean_voices):
    name = "Legacy Preview"
    profile_dir = _new_voice_profile_dir(name)
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text("{}")
    (profile_dir / "voice.wav").write_text("audio")
    (profile_dir / "sample.wav").write_text("preview")
    (profile_dir / "profile.json").write_text(json.dumps({
        "variant_name": "Default",
        "engine": "xtts",
        "built_samples": ["voice.wav"],
        "test_text": "Current script",
    }))

    response = client.get("/api/speaker-profiles")

    assert response.status_code == 200
    profiles = response.json()
    assert profiles[0]["name"] == name
    assert profiles[0]["is_rebuild_required"] is False

def test_get_speaker_settings_prefers_base_folder_over_variant(clean_voices):
    from app.db.speakers import get_speaker_settings, get_profile_wavs as get_speaker_wavs

    base = _new_voice_profile_dir("Dracula")
    base.mkdir(parents=True, exist_ok=True)
    (base / "profile.json").write_text("{}")
    angry = _new_voice_profile_dir("Dracula - Angry")
    angry.mkdir(parents=True, exist_ok=True)
    (angry / "profile.json").write_text("{}")
    (base / "voice.wav").write_text("base")
    (angry / "sample.wav").write_text("angry")

    settings = get_speaker_settings("Dracula")
    assert settings["variant_name"] == "Default"

    wavs = get_speaker_wavs("Dracula")
    assert wavs is not None
    assert str(base / "voice.wav") in wavs
    assert str(angry / "sample.wav") not in wavs

def test_speaker_listing_normalizes_base_profile_to_default(clean_voices):
    from app.db.speakers import create_speaker, update_speaker, delete_speaker, normalize_base_profiles

    speaker_id = create_speaker("Dracula Test Normalize")
    try:
        update_speaker(speaker_id, default_profile_name="Dracula Test Normalize - Angry")

        base_dir = _new_voice_profile_dir("Dracula Test Normalize")
        base_dir.mkdir(parents=True, exist_ok=True)
        (base_dir / "profile.json").write_text("{}")
        angry_dir = _new_voice_profile_dir("Dracula Test Normalize - Angry")
        angry_dir.mkdir(parents=True, exist_ok=True)
        (angry_dir / "profile.json").write_text("{}")
        (base_dir / "profile.json").write_text(json.dumps({"built_samples": [], "engine": "xtts"}))
        (angry_dir / "profile.json").write_text(json.dumps({"speaker_id": speaker_id, "variant_name": "Angry", "engine": "xtts"}))

        normalize_base_profiles(voices_dir=clean_voices)

        response = client.get("/api/speakers")
        assert response.status_code == 200

        dracula = next(s for s in response.json() if s["id"] == speaker_id)
        assert dracula["default_profile_name"] == "Dracula Test Normalize"

        profiles_response = client.get("/api/speaker-profiles")
        assert profiles_response.status_code == 200
        base_profile = next(p for p in profiles_response.json() if p["name"] == "Dracula Test Normalize")
        assert base_profile["variant_name"] == "Default"
        assert base_profile["speaker_id"] == speaker_id
        assert base_profile["engine"] == "xtts"

        # After migrate_voices_to_v2() (called by listing endpoint), the flat
        # profile.json is promoted to Default/profile.json.
        meta = json.loads((base_dir / "profile.json").read_text())
        assert "variant_name" not in meta
        assert meta["speaker_id"] == speaker_id
        assert meta["engine"] == "xtts"
    finally:
        delete_speaker(speaker_id)
