import pytest
import os
import json
from app.db.core import init_db

@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.web import app as fastapi_app
    return TestClient(fastapi_app)

@pytest.fixture
def clean_db():
    db_path = "/tmp/test_api_system.db"
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

@pytest.fixture(autouse=True)
def disable_tts_v2(monkeypatch):
    """Disable Studio 2.0 modular paths by default for these legacy tests."""
    monkeypatch.setenv("USE_TTS_SERVER", "0")
    monkeypatch.setenv("USE_STUDIO_ORCHESTRATOR", "0")

def test_home_endpoint(clean_db, client, monkeypatch):
    """GET /api/home — the main system info/home endpoint."""
    # Re-enable for this specific test
    monkeypatch.setenv("USE_TTS_SERVER", "1")
    monkeypatch.setenv("USE_STUDIO_ORCHESTRATOR", "1")

    # Mock the watchdog so it appears to be running
    from unittest.mock import MagicMock, patch
    from app.engines.watchdog import TtsServerWatchdog
    mock_watchdog = MagicMock(spec=TtsServerWatchdog)
    mock_watchdog.is_healthy.return_value = True
    mock_watchdog.get_port.return_value = 7862
    mock_watchdog.get_url.return_value = "http://127.0.0.1:7862"

    with patch("app.engines.watchdog.get_watchdog", return_value=mock_watchdog), \
         patch("app.engines.bridge.VoiceBridge.describe_registry", return_value=[{"engine_id": "xtts"}]):

        response = client.get("/api/home")
        assert response.status_code == 200
        data = response.json()
        assert {"chapters", "jobs", "settings", "speaker_profiles", "speakers", "system_info", "runtime_services"}.issubset(data.keys())

        # Verify Studio 2.0 system info
        info = data["system_info"]
        assert "Managed Subprocess (Watchdog @ 7862)" in info["backend_mode"]
        assert info["orchestrator"] == "Studio 2.0"
        assert info["tts_server_url"] == "http://127.0.0.1:7862"
        assert info["startup_ready"] is True

def test_home_endpoint_degraded(clean_db, client, monkeypatch):
    """Verify system info when watchdog is starting/unhealthy."""
    monkeypatch.setenv("USE_TTS_SERVER", "1")
    monkeypatch.setenv("USE_STUDIO_ORCHESTRATOR", "1")

    from unittest.mock import MagicMock, patch
    from app.engines.watchdog import TtsServerWatchdog
    mock_watchdog = MagicMock(spec=TtsServerWatchdog)
    mock_watchdog.is_healthy.return_value = False
    mock_watchdog.is_circuit_open.return_value = False
    mock_watchdog.get_url.return_value = "http://127.0.0.1:7862"

    with patch("app.engines.watchdog.get_watchdog", return_value=mock_watchdog), \
         patch("app.engines.bridge.VoiceBridge.describe_registry", return_value=[]):

        response = client.get("/api/home")
        data = response.json()
        assert "Managed Subprocess (Starting/Unhealthy)" in data["system_info"]["backend_mode"]
        assert data["system_info"]["startup_ready"] is False

def test_home_endpoint_fallback(clean_db, client, monkeypatch):
    """Verify system info when watchdog circuit trips and triggers explicit fallback."""
    # When circuit trips, watchdog changes USE_TTS_SERVER to 0
    monkeypatch.setenv("USE_TTS_SERVER", "0")
    monkeypatch.setenv("USE_STUDIO_ORCHESTRATOR", "1")

    from unittest.mock import MagicMock, patch
    from app.engines.watchdog import TtsServerWatchdog
    mock_watchdog = MagicMock(spec=TtsServerWatchdog)
    mock_watchdog.is_healthy.return_value = False
    mock_watchdog.is_circuit_open.return_value = True

    with patch("app.engines.watchdog.get_watchdog", return_value=mock_watchdog), \
         patch("app.engines.bridge.VoiceBridge.describe_registry", return_value=[]):

        response = client.get("/api/home")
        data = response.json()
        assert "Direct-In-Process (Fallback from Crashed Subprocess)" in data["system_info"]["backend_mode"]
        assert data["system_info"]["startup_ready"] is True

def test_settings_get_and_update(clean_db, client):
    # USE_TTS_SERVER=0 is already set by the autouse fixture
    response = client.post("/api/settings", json={
        "safe_mode": True,
        "default_engine": "xtts"
    })
    assert response.status_code == 200
    data = response.json()["settings"]
    assert data["safe_mode"] is True
    assert data["default_engine"] == "xtts"
    assert data["default_engine"] == "xtts"

def test_default_speaker_setting(clean_db, client, tmp_path, monkeypatch):
    # POST /api/settings/default-speaker
    voices_dir = tmp_path / "voices"
    voices_dir.mkdir()
    from app import config
    import app.web as web
    from app.api.routers import system as r_system, voices as r_voices
    monkeypatch.setenv("VOICES_DIR", str(voices_dir))
    monkeypatch.setattr(config, "VOICES_DIR", voices_dir)
    monkeypatch.setattr(web, "VOICES_DIR", voices_dir)
    monkeypatch.setattr(r_system, "VOICES_DIR", voices_dir)
    monkeypatch.setattr(r_voices, "VOICES_DIR", voices_dir)

    response = client.post("/api/settings/default-speaker",
                           data={"name": "TestVoice"})
    assert response.status_code == 200
    home = client.get("/api/home").json()
    assert home["settings"]["default_speaker_profile"] == "TestVoice"

def test_audiobooks_list(clean_db, client, tmp_path, monkeypatch):
    audiobook_dir = tmp_path / "audiobooks"
    projects_dir = tmp_path / "projects"
    monkeypatch.setenv("AUDIOBOOK_DIR", str(audiobook_dir))
    monkeypatch.setenv("PROJECTS_DIR", str(projects_dir))
    from app import config
    import app.web as web
    monkeypatch.setattr(config, "AUDIOBOOK_DIR", audiobook_dir)
    monkeypatch.setattr(config, "PROJECTS_DIR", projects_dir)
    monkeypatch.setattr(web, "AUDIOBOOK_DIR", audiobook_dir)
    monkeypatch.setattr(web, "PROJECTS_DIR", projects_dir)
    audiobook_dir.mkdir()
    projects_dir.mkdir()
    response = client.get("/api/audiobooks")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
    assert response.json() == []
