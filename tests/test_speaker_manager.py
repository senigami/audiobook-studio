import pytest
import json
from fastapi.testclient import TestClient
from pathlib import Path
import os

# Import the app
from app.web import app
from app.config import VOICES_DIR

client = TestClient(app)

@pytest.fixture
def mock_voices(tmp_path):
    # The app uses app.config.VOICES_DIR which is set via env in conftest.py
    # But for extra safety in this test we can patch it if we wanted to be sure
    # However, conftest.py already points it to a temp dir.
    # Let's just use the one from config.
    yield VOICES_DIR

def test_create_speaker_auto_links_existing_unassigned_profile(mock_voices):
    # 1. Create an unassigned profile directory on disk
    profile_name = "UnassignedSpeaker"
    profile_dir = VOICES_DIR / profile_name
    profile_dir.mkdir(parents=True, exist_ok=True)

    meta = {
        "variant_name": "Default",
        "speed": 1.2,
        "test_text": "Existing text"
    }
    (profile_dir / "profile.json").write_text(json.dumps(meta))

    # 2. Create a speaker with the same name via API
    response = client.post(
        "/api/speakers",
        data={"name": profile_name}
    )
    assert response.status_code == 200
    speaker_id = response.json()["id"]

    # 3. Verify it linked instead of creating a new one
    updated_meta = json.loads((profile_dir / "profile.json").read_text())
    assert updated_meta["speaker_id"] == speaker_id
    assert updated_meta["speed"] == 1.2 # Preserved
    assert updated_meta["test_text"] == "Existing text" # Preserved

def test_create_speaker_creates_default_profile(mock_voices):
    speaker_name = "NewVoice"

    # 1. Create a speaker via API
    response = client.post(
        "/api/speakers",
        data={"name": speaker_name}
    )
    assert response.status_code == 200
    speaker_id = response.json()["id"]

    # 2. Verify profile directory was created automatically
    profile_dir = VOICES_DIR / speaker_name
    assert profile_dir.exists()

    # 3. Verify profile.json contains correct mapping
    meta = json.loads((profile_dir / "profile.json").read_text())
    assert meta["speaker_id"] == speaker_id
    assert meta["variant_name"] == "Default"
    assert meta["speed"] == 1.0

def test_create_speaker_handles_collision(mock_voices):
    # 1. Create an ALREADY ASSIGNED profile directory on disk
    existing_name = "CollisionTest"
    profile_dir = VOICES_DIR / existing_name
    profile_dir.mkdir(parents=True, exist_ok=True)

    meta = {
        "speaker_id": "already-assigned-id",
        "variant_name": "Default"
    }
    (profile_dir / "profile.json").write_text(json.dumps(meta))

    # 2. Create a new speaker with the same name
    response = client.post(
        "/api/speakers",
        data={"name": existing_name}
    )
    assert response.status_code == 200
    speaker_id = response.json()["id"]

    # 3. Verify a NEW profile directory was created with a suffix
    new_profile_dir = VOICES_DIR / f"{existing_name}_1"
    assert new_profile_dir.exists()

    new_meta = json.loads((new_profile_dir / "profile.json").read_text())
    assert new_meta["speaker_id"] == speaker_id

    # Original should be untouched
    old_meta = json.loads((profile_dir / "profile.json").read_text())
    assert old_meta["speaker_id"] == "already-assigned-id"
