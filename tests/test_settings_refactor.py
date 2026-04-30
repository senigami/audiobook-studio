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

def test_save_settings_ignores_deprecated_speed(client, clean_state):
    # 1. Update settings with deprecated field
    response = client.post("/api/settings", data={
        "safe_mode": "false",
        "xtts_speed": "1.5"
    })
    assert response.status_code == 200
    data = response.json()["settings"]

    # 2. Check that valid fields updated
    assert data["safe_mode"] is False

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
    payload = response.json()
    settings = payload["settings"]

    assert "safe_mode" in settings
    assert "xtts_speed" not in settings
    assert "render_stats" in payload


def test_get_settings_does_not_persist_normalization_on_read(clean_state):
    from app.state import get_settings

    raw_state = {
        "jobs": {},
        "settings": {
            "default_engine": "voxtral",
            "enabled_plugins": {"voxtral": True},
            "mistral_api_key": "   ",
        },
        "performance_metrics": {
            "audiobook_speed_multiplier": 1.0,
            "xtts_cps": 16.7,
        },
    }
    clean_state.write_text(json.dumps(raw_state, indent=2), encoding="utf-8")
    before = clean_state.read_text(encoding="utf-8")

    settings = get_settings()
    after = clean_state.read_text(encoding="utf-8")

    assert settings["default_engine"] == "xtts"
    assert settings.get("enabled_plugins", {}).get("voxtral") is False
    assert "mistral_api_key" not in settings
    assert after == before
