import os
from unittest.mock import MagicMock, patch

import pytest

from app.db.core import init_db


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.web import app as fastapi_app

    return TestClient(fastapi_app)


@pytest.fixture
def clean_db():
    db_path = "/tmp/test_api_engines.db"
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


def test_list_engines_returns_registry_payload(clean_db, client):
    engine_payload = [
        {
            "engine_id": "xtts-local",
            "display_name": "XTTS Local",
            "status": "ready",
            "verified": True,
            "version": "1.2.3",
            "local": True,
            "cloud": False,
            "network": False,
            "languages": ["en"],
            "capabilities": ["preview"],
            "resource": {"gpu": False, "vram_mb": 0, "cpu_heavy": True},
            "author": "Studio",
            "homepage": "https://example.com/xtts",
            "settings_schema": {"properties": {}},
        }
    ]
    bridge = MagicMock()
    bridge.describe_registry.return_value = engine_payload

    with patch("app.api.routers.engines.create_voice_bridge", return_value=bridge):
        response = client.get("/api/engines")

    assert response.status_code == 200
    assert response.json() == engine_payload
    bridge.describe_registry.assert_called_once()


def test_update_engine_settings_and_refresh_delegate_to_bridge(clean_db, client):
    bridge = MagicMock()
    bridge.update_engine_settings.return_value = {"status": "ok", "engine_id": "xtts-local"}
    bridge.refresh_plugins.return_value = {"status": "ok", "loaded_count": 2}

    with patch("app.api.routers.engines.create_voice_bridge", return_value=bridge):
        update_response = client.put(
            "/api/engines/xtts-local/settings",
            json={"temperature": 0.8, "speaker_name": "Narrator"},
        )
        refresh_response = client.post("/api/engines/refresh")

    assert update_response.status_code == 200
    assert update_response.json() == {"status": "ok", "engine_id": "xtts-local"}
    assert refresh_response.status_code == 200
    assert refresh_response.json() == {"status": "ok", "loaded_count": 2}
    bridge.update_engine_settings.assert_called_once_with(
        "xtts-local",
        {"temperature": 0.8, "speaker_name": "Narrator"},
    )
    bridge.refresh_plugins.assert_called_once()


def test_in_process_voxtral_engine_settings_roundtrip(monkeypatch):
    from app.engines.bridge import VoiceBridge

    bridge = VoiceBridge(registry_loader=lambda: {})

    captured_updates: dict[str, object] = {}

    monkeypatch.setattr("app.engines.bridge.use_tts_server", lambda: False)
    monkeypatch.setattr(
        "app.state.update_settings",
        lambda updates=None, **kwargs: captured_updates.update(updates or {}, **kwargs),
    )
    monkeypatch.setattr(
        "app.state.get_settings",
        lambda: {
            "voxtral_enabled": True,
            "mistral_api_key": "workspace-key",
            "voxtral_model": "voxtral-mini-tts-2603",
        },
    )

    result = bridge.update_engine_settings(
        "voxtral",
        {
            "voxtral_enabled": True,
            "mistral_api_key": "workspace-key",
            "voxtral_model": "voxtral-mini-tts-2603",
            "ignored_key": "nope",
        },
    )

    assert captured_updates == {
        "voxtral_enabled": True,
        "mistral_api_key": "workspace-key",
        "voxtral_model": "voxtral-mini-tts-2603",
    }
    assert result["ok"] is True
    assert result["settings"]["voxtral_enabled"] is True
    assert result["settings"]["mistral_api_key"] == "workspace-key"
    assert result["settings"]["voxtral_model"] == "voxtral-mini-tts-2603"
