import pytest
import os
import io
import json
import uuid
from pathlib import Path
from unittest.mock import patch, MagicMock
from app.db.core import init_db

@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.web import app as fastapi_app
    return TestClient(fastapi_app)

@pytest.fixture
def clean_db():
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

def test_list_speaker_profiles(clean_db, tmp_path, client):
    from app.web import app as fastapi_app
    from app.api.routers.voices import get_voices_dir
    voices_dir = tmp_path / "voices"
    voices_dir.mkdir()
    (voices_dir / "SpeakerA").mkdir()
    (voices_dir / "SpeakerA" / "v1.wav").write_text("audio")

    fastapi_app.dependency_overrides[get_voices_dir] = lambda: voices_dir

    with patch("app.api.routers.voices.get_speaker_settings", return_value={"built_samples": [], "speed": 1.0, "test_text": ""}):
        response = client.get("/api/speaker-profiles")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "SpeakerA"

def test_create_and_delete_profile(clean_db, tmp_path, client):
    from app.web import app as fastapi_app
    from app.api.routers.voices import get_voices_dir
    voices_dir = (tmp_path / "voices").resolve()
    voices_dir.mkdir()
    fastapi_app.dependency_overrides[get_voices_dir] = lambda: voices_dir

    # Create
    response = client.post("/api/speaker-profiles", data={"speaker_id": "S1", "variant_name": "V1"})
    assert response.status_code == 200
    name = response.json()["name"]
    assert (voices_dir / name).exists()

    # Delete
    response = client.delete(f"/api/speaker-profiles/{name}")
    assert response.status_code == 200
    assert not (voices_dir / name).exists()

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

def test_rename_profile_and_security(clean_db, tmp_path, client):
    from app.web import app as fastapi_app
    from app.api.routers.voices import get_voices_dir
    voices_dir = (tmp_path / "voices").resolve()
    voices_dir.mkdir()
    (voices_dir / "OldName").mkdir()
    (voices_dir / "OldName" / "profile.json").write_text(json.dumps({"variant_name": "Old"}))

    fastapi_app.dependency_overrides[get_voices_dir] = lambda: voices_dir

    # Success
    response = client.post("/api/voices/rename-profile", data={"old_name": "OldName", "new_name": "NewName - Variant"})
    assert response.status_code == 200
    assert (voices_dir / "NewName - Variant").exists()
    assert not (voices_dir / "OldName").exists()

    # Security traversal
    response = client.post("/api/voices/rename-profile", data={"old_name": "NewName - Variant", "new_name": "../../traversal"})
    assert response.status_code == 403

def test_speaker_settings_updates(clean_db, client):
    with patch("app.api.routers.voices.update_speaker_settings") as mock_update:
        # Test text
        response = client.post("/api/speaker-profiles/SpeakerA/test-text", data={"text": "Hello world"})
        assert response.status_code == 200

        # Speed
        response = client.post("/api/speaker-profiles/SpeakerA/speed", data={"speed": 1.2})
        assert response.status_code == 200

def test_build_and_test_profiles(clean_db, tmp_path, client):
    from app.web import app as fastapi_app
    from app.api.routers.voices import get_voices_dir
    voices_dir = (tmp_path / "voices").resolve()
    voices_dir.mkdir()
    fastapi_app.dependency_overrides[get_voices_dir] = lambda: voices_dir

    # Build
    file_content = b"fake wav"
    files = {"files": ("sample.wav", io.BytesIO(file_content), "audio/wav")}
    with patch("app.api.routers.voices.put_job"), patch("app.api.routers.voices.enqueue"):
        response = client.post("/api/speaker-profiles/SpeakerA/build", files=files)
        assert response.status_code == 200
        assert (voices_dir / "SpeakerA" / "sample.wav").exists()

    # Test
    with patch("app.api.routers.voices.put_job"), patch("app.api.routers.voices.enqueue"):
        response = client.post("/api/speaker-profiles/SpeakerA/test")
        assert response.status_code == 200

def test_legacy_build_and_rename(clean_db, tmp_path, client):
    from app.web import app as fastapi_app
    from app.api.routers.voices import get_voices_dir
    voices_dir = (tmp_path / "voices").resolve()
    voices_dir.mkdir()
    fastapi_app.dependency_overrides[get_voices_dir] = lambda: voices_dir

    # Legacy Build
    with patch("app.api.routers.voices.put_job"), patch("app.api.routers.voices.enqueue"):
        response = client.post("/api/speaker-profiles/build", data={"name": "SpeakerL"})
        assert response.status_code == 200

    # Legacy Rename
    if not (voices_dir / "SpeakerL").exists():
        (voices_dir / "SpeakerL").mkdir()
    response = client.post("/api/speaker-profiles/SpeakerL/rename", data={"new_name": "SpeakerNew"})
    assert response.status_code == 200

def test_profile_creation_errors(clean_db, tmp_path, client):
    from app.web import app as fastapi_app
    from app.api.routers.voices import get_voices_dir
    voices_dir = (tmp_path / "voices").resolve()
    voices_dir.mkdir()
    fastapi_app.dependency_overrides[get_voices_dir] = lambda: voices_dir

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

def test_rename_speaker_with_variants(clean_db, tmp_path, client):
    from app.web import app as fastapi_app
    from app.api.routers.voices import get_voices_dir
    voices_dir = (tmp_path / "voices").resolve()
    voices_dir.mkdir()
    (voices_dir / "Narrator").mkdir()
    (voices_dir / "Narrator - Calm").mkdir()
    (voices_dir / "Narrator - Calm" / "profile.json").write_text(json.dumps({"speaker_id": "Narrator"}))
    (voices_dir / "Narrator - Excited").mkdir()

    fastapi_app.dependency_overrides[get_voices_dir] = lambda: voices_dir

    # Rename
    response = client.post("/api/voices/rename-profile", data={"old_name": "Narrator", "new_name": "Dracula"})
    assert response.status_code == 200

    # Verify both main and variants are renamed
    assert (voices_dir / "Dracula").exists()
    assert (voices_dir / "Dracula - Calm").exists()
    assert (voices_dir / "Dracula - Excited").exists()
    assert not (voices_dir / "Narrator").exists()
    assert not (voices_dir / "Narrator - Calm").exists()

    # Verify metadata update
    meta = json.loads((voices_dir / "Dracula - Calm" / "profile.json").read_text())
    assert meta["speaker_id"] == "Dracula"

def test_rename_profile_default_sync(clean_db, tmp_path, client):
    from app.web import app as fastapi_app
    from app.api.routers.voices import get_voices_dir
    from app.state import update_settings, get_settings
    update_settings({"default_speaker_profile": "OldProfile"})

    voices_dir = (tmp_path / "voices").resolve()
    voices_dir.mkdir()
    (voices_dir / "OldProfile").mkdir()
    fastapi_app.dependency_overrides[get_voices_dir] = lambda: voices_dir

    response = client.post("/api/voices/rename-profile", data={"old_name": "OldProfile", "new_name": "NewProfile"})
    assert response.status_code == 200
    assert get_settings()["default_speaker_profile"] == "NewProfile"

def test_upload_samples_security_and_failure(clean_db, tmp_path, client):
    from app.web import app as fastapi_app
    from app.api.routers.voices import get_voices_dir
    voices_dir = (tmp_path / "voices").resolve()
    voices_dir.mkdir()
    fastapi_app.dependency_overrides[get_voices_dir] = lambda: voices_dir

    # Define files for the test
    files = {"files": ("sample.wav", io.BytesIO(b"data"), "audio/wav")}

    # Exception during upload
    with patch("app.api.routers.voices.Path.mkdir", side_effect=Exception("makedirs failed")):
        response = client.post("/api/speaker-profiles/SpeakerA/samples/upload", files=files)
        assert response.status_code == 500

def test_delete_sample_errors(clean_db, tmp_path, client):
    from app.web import app as fastapi_app
    from app.api.routers.voices import get_voices_dir
    voices_dir = (tmp_path / "voices").resolve()
    voices_dir.mkdir()
    (voices_dir / "SpeakerA").mkdir()
    (voices_dir / "SpeakerA" / "sample1.wav").write_text("audio")
    fastapi_app.dependency_overrides[get_voices_dir] = lambda: voices_dir

    # Success
    response = client.delete("/api/speaker-profiles/SpeakerA/samples/sample1.wav")
    assert response.status_code == 200
    assert not (voices_dir / "SpeakerA" / "sample1.wav").exists()

    # Exception
    with patch("app.api.routers.voices.os.unlink", side_effect=Exception("unlink failed")):
        (voices_dir / "SpeakerA" / "bad.wav").write_text("trash")
        response = client.delete("/api/speaker-profiles/SpeakerA/samples/bad.wav")
        assert response.status_code == 500


def test_delete_sample_rejects_traversal(tmp_path):
    from app.api.routers.voices import delete_speaker_sample

    voices_dir = (tmp_path / "voices").resolve()
    voices_dir.mkdir()
    (voices_dir / "SpeakerA").mkdir()

    response = delete_speaker_sample(
        name="SpeakerA",
        sample_name="../../escape.wav",
        voices_dir=voices_dir,
    )
    assert response.status_code == 403

def test_assign_profile_to_speaker_errors(clean_db, tmp_path, client):
    from app.web import app as fastapi_app
    from app.api.routers.voices import get_voices_dir
    voices_dir = (tmp_path / "voices").resolve()
    voices_dir.mkdir()
    (voices_dir / "SomeProf").mkdir()
    fastapi_app.dependency_overrides[get_voices_dir] = lambda: voices_dir

    # Generic error
    with patch("app.api.routers.voices.get_speaker", side_effect=Exception("db crash")):
        response = client.post("/api/speaker-profiles/SomeProf/assign", data={"speaker_id": "sid"})
        assert response.status_code == 500
