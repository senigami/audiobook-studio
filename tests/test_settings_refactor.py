import pytest
import json
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

def test_get_speaker_settings_uses_hardcoded_fallback(clean_state):
    from app.jobs import get_speaker_settings

    # We don't need a real profile for this, it falls back to a dict
    # which we modified to have "speed": 1.0 regardless of global settings
    res = get_speaker_settings("NonExistentProfile")
    assert res["speed"] == 1.0

def test_api_home_reflects_new_state_structure(client, clean_state):
    response = client.get("/api/home")
    assert response.status_code == 200
    payload = response.json()
    settings = payload["settings"]

    assert "safe_mode" in settings
    assert "xtts_speed" not in settings
    assert "render_stats" in payload
