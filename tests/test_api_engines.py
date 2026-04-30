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


def test_list_engines_no_longer_falls_back_during_tts_server_startup(clean_db, client):
    from app.engines.errors import EngineUnavailableError

    bridge = MagicMock()
    bridge.describe_registry.side_effect = EngineUnavailableError("TTS Server is starting up...")

    with patch("app.api.routers.engines.create_voice_bridge", return_value=bridge):
        response = client.get("/api/engines")

    assert response.status_code == 503
    assert response.json()["message"] == "TTS Server is starting up..."


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


def test_install_engine_dependencies_delegates_to_bridge(clean_db, client):
    bridge = MagicMock()
    bridge.install_dependencies.return_value = {"ok": True, "message": "Installed"}

    with patch("app.api.routers.engines.create_voice_bridge", return_value=bridge):
        response = client.post("/api/engines/mock-engine/install")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "message": "Installed"}
    bridge.install_dependencies.assert_called_once_with("mock-engine")


def test_engine_test_endpoint_delegates_preview_with_engine_id(clean_db, client, tmp_path):
    bridge = MagicMock()

    with patch("app.api.routers.engines.create_voice_bridge", return_value=bridge), \
         patch("app.tts_server.verification._resolve_default_voice_reference", return_value=(str(tmp_path / "reference.wav"), None)), \
         patch("app.config.ENGINE_TEST_DIR", tmp_path):

        # Mock bridge to say it succeeded
        # The router will check if the file exists at output_path
        def mock_preview(engine_id, payload):
            out_path = payload["output_path"]
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            with open(out_path, "wb") as f:
                f.write(b"wav")
            return {"ok": True, "audio_path": out_path}

        bridge.preview.side_effect = mock_preview

        response = client.post("/api/engines/mock-engine/test")

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert "audio_url" in data
    assert "/api/engines/mock-engine/test/audio" in data["audio_url"]
    assert "generated_at" in data

    bridge.preview.assert_called_once()
    engine_id, payload = bridge.preview.call_args.args
    assert engine_id == "mock-engine"
    assert payload["script_text"]
    assert payload["output_path"].endswith("last_test.wav")


def test_get_test_audio_returns_file(clean_db, client, tmp_path):
    safe_engine_id = "mock_engine"
    engine_test_root = tmp_path / safe_engine_id
    engine_test_root.mkdir(parents=True, exist_ok=True)
    audio_path = engine_test_root / "last_test.wav"
    audio_path.write_bytes(b"wav content")

    with patch("app.config.ENGINE_TEST_DIR", tmp_path):
        response = client.get(f"/api/engines/{safe_engine_id}/test/audio")

    assert response.status_code == 200
    assert response.content == b"wav content"
