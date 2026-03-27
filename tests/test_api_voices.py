import pytest
import os
import io
import json
import uuid
from pathlib import Path
from unittest.mock import patch, MagicMock
from app.db.core import init_db


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
def client():
    from fastapi.testclient import TestClient
    from app.web import app as fastapi_app
    return TestClient(fastapi_app)

@pytest.fixture
def clean_db(tmp_path):
    from app.web import app as fastapi_app
    db_path = "/tmp/test_api_voices.db"
    if os.path.exists(db_path):
        os.unlink(db_path)
    os.environ["DB_PATH"] = db_path
    import app.db.core
    import importlib
    importlib.reload(app.db.core)
    init_db()

    yield

    if os.path.exists(db_path):
        os.unlink(db_path)
    fastapi_app.dependency_overrides = {}

def test_list_speaker_profiles(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir()
    (voices_dir / "SpeakerA").mkdir()
    (voices_dir / "SpeakerA" / "v1.wav").write_text("audio")

    with patch("app.api.routers.voices.get_speaker_settings", return_value={"built_samples": [], "speed": 1.0, "test_text": "", "engine": "xtts"}):
        response = client.get("/api/speaker-profiles")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "SpeakerA"
        assert data[0]["engine"] == "xtts"

def test_create_and_delete_profile(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir()

    # Create
    response = client.post("/api/speaker-profiles", data={"speaker_id": "S1", "variant_name": "V1"})
    assert response.status_code == 200
    name = response.json()["name"]
    assert (voices_dir / name).exists()

    # Delete
    response = client.delete(f"/api/speaker-profiles/{name}")
    assert response.status_code == 200
    assert not (voices_dir / name).exists()


def test_create_profile_persists_engine_metadata(clean_db, voices_root, client):
    voices_root.mkdir()

    response = client.post("/api/speaker-profiles", data={"speaker_id": "S1", "variant_name": "Vox", "engine": "voxtral"})
    assert response.status_code == 200

    name = response.json()["name"]
    meta = json.loads((voices_root / name / "profile.json").read_text())
    assert meta["engine"] == "voxtral"


def test_update_profile_engine(clean_db, voices_root, client):
    voices_root.mkdir()
    profile_dir = voices_root / "SpeakerA"
    profile_dir.mkdir()
    (profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default"}))

    response = client.post("/api/speaker-profiles/SpeakerA/engine", data={"engine": "voxtral"})
    assert response.status_code == 200
    assert response.json()["engine"] == "voxtral"

    meta = json.loads((profile_dir / "profile.json").read_text())
    assert meta["engine"] == "voxtral"


def test_update_profile_engine_rejects_invalid_value(clean_db, voices_root, client):
    voices_root.mkdir()
    profile_dir = voices_root / "SpeakerA"
    profile_dir.mkdir()
    (profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default"}))

    response = client.post("/api/speaker-profiles/SpeakerA/engine", data={"engine": "bad-engine"})
    assert response.status_code == 400

def test_character_crud(clean_db, client):
    from app.db.projects import create_project
    pid = create_project("P1")

    # Create
    response = client.post(f"/api/projects/{pid}/characters", data={"name": "Alice", "speaker_profile_name": "Prof1"})
    assert response.status_code == 200
    cid = response.json()["id"]

    # List
    response = client.get(f"/api/projects/{pid}/characters")
    assert response.status_code == 200
    assert len(response.json()["characters"]) == 1

    # Update
    response = client.put(f"/api/characters/{cid}", data={"name": "Alice Updated", "color": "#123456"})
    assert response.status_code == 200

    # Delete
    response = client.delete(f"/api/characters/{cid}")
    assert response.status_code == 200

def test_speaker_crud(clean_db, client):
    # Create
    response = client.post("/api/speakers", data={"name": "Narrator", "default_profile_name": "P1"})
    assert response.status_code == 200
    sid = response.json()["id"]

    # List
    response = client.get("/api/speakers")
    assert response.status_code == 200
    assert len(response.json()) == 1

    # Update
    response = client.put(f"/api/speakers/{sid}", data={"name": "Narrator Updated"})
    assert response.status_code == 200

    # Delete
    response = client.delete(f"/api/speakers/{sid}")
    assert response.status_code == 200

def test_rename_profile_and_security(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir()
    (voices_dir / "OldName").mkdir()
    (voices_dir / "OldName" / "profile.json").write_text(json.dumps({"variant_name": "Old"}))
    (voices_dir / "OldName" / "latent.pth").write_text("latent")

    # Success
    response = client.post("/api/voices/rename-profile", data={"old_name": "OldName", "new_name": "NewName - Variant"})
    assert response.status_code == 200
    assert (voices_dir / "NewName - Variant").exists()
    assert not (voices_dir / "OldName").exists()
    assert (voices_dir / "NewName - Variant" / "latent.pth").exists()

    # Security traversal
    response = client.post("/api/voices/rename-profile", data={"old_name": "NewName - Variant", "new_name": "../../traversal"})
    assert response.status_code == 403

def test_speaker_settings_updates(clean_db, client):
    with patch("app.api.routers.voices.update_speaker_settings") as mock_update:
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
    assert "test_text" not in json.loads((profile_dir / "profile.json").read_text())

def test_build_and_test_profiles(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir()

    with patch("app.api.routers.voices.VOICES_DIR", voices_dir):
        # Build
        file_content = b"fake wav"
        files = {"files": ("input1.wav", io.BytesIO(file_content), "audio/wav")}
        with patch("app.api.routers.voices.put_job"), patch("app.api.routers.voices.enqueue"):
            response = client.post("/api/speaker-profiles/SpeakerA/build", files=files)
            assert response.status_code == 200
            assert (voices_dir / "SpeakerA" / "input1.wav").exists()

        (voices_dir / "SpeakerA" / "1.wav").write_text("fake wav content 2")

        # Test
        with patch("app.api.routers.voices.put_job"), patch("app.api.routers.voices.enqueue"):
            response = client.post("/api/speaker-profiles/SpeakerA/test")
            assert response.status_code == 200

def test_build_and_test_require_samples(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir()

    with patch("app.api.routers.voices.VOICES_DIR", voices_dir):
        profile_dir = voices_dir / "SpeakerA"
        profile_dir.mkdir(parents=True, exist_ok=True)

        with patch("app.api.routers.voices.put_job"), patch("app.api.routers.voices.enqueue"):
            response = client.post("/api/speaker-profiles/SpeakerA/test")
            assert response.status_code == 400
            assert "sample" in response.json()["message"].lower()

            response = client.post("/api/speaker-profiles/SpeakerA/build")
            assert response.status_code == 400
            assert "sample" in response.json()["message"].lower()

def test_legacy_build_and_rename(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir()

    # Legacy Build
    with patch("app.api.routers.voices.put_job"), patch("app.api.routers.voices.enqueue"):
        response = client.post("/api/speaker-profiles/SpeakerL/build", files={"files": ("sample.wav", io.BytesIO(b"legacy"), "audio/wav")})
        assert response.status_code == 200

    # Legacy Rename
    if not (voices_dir / "SpeakerL").exists():
        (voices_dir / "SpeakerL").mkdir()
    response = client.post("/api/speaker-profiles/SpeakerL/rename", data={"new_name": "SpeakerNew"})
    assert response.status_code == 200

def test_profile_creation_errors(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir()

    # Already exists
    (voices_dir / "S1 - V1").mkdir()
    response = client.post("/api/speaker-profiles", data={"speaker_id": "S1", "variant_name": "V1"})
    assert response.status_code == 400

    # Traversal
    response = client.post("/api/speaker-profiles", data={"speaker_id": "../../etc", "variant_name": "passwd"})
    assert response.status_code == 403

    # Exception
    with patch("app.api.routers.voices.Path.mkdir", side_effect=Exception("boom")):
        response = client.post("/api/speaker-profiles", data={"speaker_id": "Err", "variant_name": "V1"})
        assert response.status_code == 500

    response = client.post("/api/speaker-profiles", data={"speaker_id": "Err", "variant_name": "V1", "engine": "bad-engine"})
    assert response.status_code == 400

def test_rename_speaker_with_variants(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir()
    (voices_dir / "Narrator").mkdir()
    (voices_dir / "Narrator - Calm").mkdir()
    (voices_dir / "Narrator - Calm" / "profile.json").write_text(json.dumps({"speaker_id": "Narrator"}))
    (voices_dir / "Narrator - Calm" / "latent.pth").write_text("latent")
    (voices_dir / "Narrator - Excited").mkdir()

    # Rename
    response = client.post("/api/voices/rename-profile", data={"old_name": "Narrator", "new_name": "Dracula"})
    assert response.status_code == 200

    # Verify both main and variants are renamed
    assert (voices_dir / "Dracula").exists()
    assert (voices_dir / "Dracula - Calm").exists()
    assert (voices_dir / "Dracula - Excited").exists()
    assert not (voices_dir / "Narrator").exists()
    assert not (voices_dir / "Narrator - Calm").exists()
    assert (voices_dir / "Dracula - Calm" / "latent.pth").exists()

    # Verify metadata update
    meta = json.loads((voices_dir / "Dracula - Calm" / "profile.json").read_text())
    assert meta["speaker_id"] == "Dracula"

def test_rename_profile_default_sync(clean_db, voices_root, client):
    from app.state import update_settings, get_settings
    update_settings({"default_speaker_profile": "OldProfile"})

    voices_dir = voices_root
    voices_dir.mkdir()
    (voices_dir / "OldProfile").mkdir()
    response = client.post("/api/voices/rename-profile", data={"old_name": "OldProfile", "new_name": "NewProfile"})
    assert response.status_code == 200
    assert get_settings()["default_speaker_profile"] == "NewProfile"

def test_upload_samples_security_and_failure(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir()

    # Define files for the test
    files = {"files": ("sample.wav", io.BytesIO(b"data"), "audio/wav")}

    # Exception during upload
    with patch("app.api.routers.voices.Path.mkdir", side_effect=Exception("makedirs failed")):
        response = client.post("/api/speaker-profiles/SpeakerA/samples/upload", files=files)
        assert response.status_code == 500

def test_delete_sample_errors(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir()
    (voices_dir / "SpeakerA").mkdir()
    (voices_dir / "SpeakerA" / "sample1.wav").write_text("audio")

    # Success
    response = client.delete("/api/speaker-profiles/SpeakerA/samples/sample1.wav")
    assert response.status_code == 200
    assert not (voices_dir / "SpeakerA" / "sample1.wav").exists()

    # Exception
    with patch("pathlib.Path.unlink", side_effect=Exception("unlink failed")):
        (voices_dir / "SpeakerA" / "bad.wav").write_text("trash")
        response = client.delete("/api/speaker-profiles/SpeakerA/samples/bad.wav")
        assert response.status_code == 500


def test_delete_sample_rejects_traversal(voices_root):
    from app.api.routers.voices import delete_speaker_sample

    voices_dir = voices_root
    voices_dir.mkdir()
    (voices_dir / "SpeakerA").mkdir()
    with patch("app.api.routers.voices.VOICES_DIR", voices_dir):
        response = delete_speaker_sample(
            name="SpeakerA",
            sample_name="../../escape.wav",
        )
    assert response.status_code == 403

def test_assign_profile_to_speaker_errors(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir()
    (voices_dir / "SomeProf").mkdir()

    # Generic error
    with patch("app.api.routers.voices.get_speaker", side_effect=Exception("db crash")):
        response = client.post("/api/speaker-profiles/SomeProf/assign", data={"speaker_id": "sid"})
        assert response.status_code == 500
