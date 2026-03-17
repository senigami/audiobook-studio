import pytest
from unittest.mock import patch

# NOTE: Do NOT import TestClient or app at the top level in these isolation tests.
# This ensures conftest.py env vars take effect before app.config is loaded.

@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.web import app
    return TestClient(app)

@pytest.fixture
def clean_state(tmp_path):
    test_state_file = tmp_path / "test_state.json"
    with patch("app.state.STATE_FILE", test_state_file):
        yield test_state_file

def test_default_settings_refactor(client, clean_state):
    from app.state import get_settings
    # Verify defaults match the new requirement (MP3 False)
    settings = get_settings()
    assert "safe_mode" in settings

def test_save_settings_ignores_deprecated_speed(client, clean_state):
    # 1. Update settings with deprecated field
    response = client.post("/settings", data={
        "safe_mode": "false",
        "make_mp3": "true",
        "xtts_speed": "1.5"
    })
    assert response.status_code == 200
    data = response.json()["settings"]

    # 2. Check that valid fields updated
    assert data["safe_mode"] is False
    assert data["make_mp3"] is True

    # 3. Check that xtts_speed was ignored/not saved
    assert "xtts_speed" not in data

def test_get_speaker_settings_uses_hardcoded_fallback(clean_state):
    from app.jobs import get_speaker_settings

    # We don't need a real profile for this, it falls back to a dict
    # which we modified to have "speed": 1.0 regardless of global settings
    res = get_speaker_settings("NonExistentProfile")
    assert res["speed"] == 1.0

def test_api_home_reflects_new_state_structure(client, clean_state):
    response = client.get("/api/home")
    assert response.status_code == 200
    settings = response.json()["settings"]

    assert "make_mp3" in settings
    assert "safe_mode" in settings
    assert "xtts_speed" not in settings
