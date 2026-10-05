import pytest
from fastapi.testclient import TestClient
import shutil
from unittest.mock import patch

# Import the app
from app.api.web import app

client = TestClient(app)

@pytest.fixture
def clean_state(tmp_path):
    # Use temporary directories for tests
    test_voices = tmp_path / "test_voices"
    test_voices.mkdir()

    test_state_file = tmp_path / "test_state.json"

    # We must patch multiple modules because they might have imported the constants already
    with patch("app.db.state.STATE_FILE", test_state_file), \
         patch("app.api.web.VOICES_DIR", test_voices), \
         patch("app.core.config.VOICES_DIR", test_voices):
        # Reset state cache if any
        import app.db.state
        if hasattr(app.db.state, '_load_state_no_lock'):
            # The state library keeps no persistent in-memory global state besides listeners,
            # but it reads from STATE_FILE.
            pass
        yield test_voices, test_state_file

def test_auto_set_default_for_single_narrator(clean_state):
    test_voices, _ = clean_state

    # Create one narrator
    (test_voices / "Narrator1").mkdir()
    (test_voices / "Narrator1" / "test.wav").write_text("audio")

    # list_speaker_profiles should auto-set it
    response = client.get("/api/speaker-profiles")
    assert response.status_code == 200
    profiles = response.json()
    assert len(profiles) == 1
    assert profiles[0]["name"] == "Narrator1"
    assert profiles[0]["is_default"] is True

    # Verify it reflects in home settings
    response = client.get("/api/home")
    assert response.json()["settings"]["default_speaker_profile"] == "Narrator1"

def test_set_default_manually(clean_state):
    test_voices, _ = clean_state

    # Create two narrators
    (test_voices / "Narrator1").mkdir()
    (test_voices / "Narrator2").mkdir()

    # Set Narrator2 as default
    response = client.post("/api/settings/default-speaker", data={"name": "Narrator2"})
    assert response.status_code == 200

    # Check listing
    response = client.get("/api/speaker-profiles")
    profiles = response.json()
    p_map = {p["name"]: p["is_default"] for p in profiles}
    assert p_map["Narrator1"] is False
    assert p_map["Narrator2"] is True

def test_auto_reconcile_on_home_load(clean_state):
    test_voices, _ = clean_state

    # Create Narrator1 and set it as default
    (test_voices / "Narrator1").mkdir()
    client.post("/api/settings/default-speaker", data={"name": "Narrator1"})

    # Create Narrator2
    (test_voices / "Narrator2").mkdir()

    # Get home data, should show Narrator1
    response = client.get("/api/home")
    assert response.json()["settings"]["default_speaker_profile"] == "Narrator1"

    # Simulation: Narrator1 is deleted behind the scenes (manual file deletion)
    shutil.rmtree(test_voices / "Narrator1")

    # api_home should auto-reconcile and pick Narrator2
    response = client.get("/api/home")
    assert response.json()["settings"]["default_speaker_profile"] == "Narrator2"
    profiles = response.json()["speaker_profiles"]
    assert len(profiles) == 1
    assert profiles[0]["name"] == "Narrator2"
    assert profiles[0]["is_default"] is True

def test_no_narrators_default_is_none(clean_state):
    test_voices, _ = clean_state
    # No narrators
    response = client.get("/api/speaker-profiles")
    assert response.json() == []

    response = client.get("/api/home")
    assert response.json()["settings"].get("default_speaker_profile") is None

def test_rename_default_narrator_persists(clean_state):
    test_voices, _ = clean_state

    # 1. Create and set as default
    (test_voices / "OldName").mkdir()
    (test_voices / "OldName" / "test.wav").write_text("audio")
    client.post("/api/settings/default-speaker", data={"name": "OldName"})

    # 2. Rename it
    response = client.post("/api/speaker-profiles/OldName/rename", data={"new_name": "NewName"})
    assert response.status_code == 200

    # 3. Check home data - should now point to NewName
    response = client.get("/api/home")
    assert response.json()["settings"]["default_speaker_profile"] == "NewName"

    # 4. Check profile list - NewName should be default
    profiles = response.json()["speaker_profiles"]
    assert len(profiles) == 1
    assert profiles[0]["name"] == "NewName"
    assert profiles[0]["is_default"] is True
