import os
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from pathlib import Path

import pytest

from app.db.core import init_db


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.api.web import app as fastapi_app

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
    bridge.clear_engine_setting.return_value = {"status": "ok", "engine_id": "xtts-local", "setting": "computer_speed_multiplier", "cleared": True}
    bridge.refresh_plugins.return_value = {"status": "ok", "loaded_count": 2}

    with patch("app.api.routers.engines.create_voice_bridge", return_value=bridge):
        update_response = client.put(
            "/api/engines/xtts-local/settings",
            json={"temperature": 0.8, "speaker_name": "Narrator"},
        )
        clear_response = client.delete("/api/engines/xtts-local/settings/computer_speed_multiplier")
        refresh_response = client.post("/api/engines/refresh")

    assert update_response.status_code == 200
    assert update_response.json() == {"status": "ok", "engine_id": "xtts-local"}
    assert clear_response.status_code == 200
    assert clear_response.json() == {
        "status": "ok",
        "engine_id": "xtts-local",
        "setting": "computer_speed_multiplier",
        "cleared": True,
    }
    assert refresh_response.status_code == 200
    assert refresh_response.json() == {"status": "ok", "loaded_count": 2}
    bridge.update_engine_settings.assert_called_once_with(
        "xtts-local",
        {"temperature": 0.8, "speaker_name": "Narrator"},
    )
    bridge.clear_engine_setting.assert_called_once_with("xtts-local", "computer_speed_multiplier")
    bridge.refresh_plugins.assert_called_once()


def test_install_engine_dependencies_delegates_to_bridge(clean_db, client):
    bridge = MagicMock()
    bridge.install_dependencies.return_value = {"ok": True, "message": "Installed"}

    with patch("app.api.routers.engines.create_voice_bridge", return_value=bridge):
        response = client.post("/api/engines/mock-engine/install")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "message": "Installed"}
    bridge.install_dependencies.assert_called_once_with("mock-engine")


def test_install_engine_dependencies_returns_tts_server_error(clean_db, client):
    from app.engines.tts_client import TtsServerResponseError

    bridge = MagicMock()
    bridge.install_dependencies.side_effect = TtsServerResponseError(
        "TTS Server returned 500 for install: Dependency installation failed: pip exited 1"
    )

    with patch("app.api.routers.engines.create_voice_bridge", return_value=bridge):
        response = client.post("/api/engines/mock-engine/install")

    assert response.status_code == 500
    assert response.json() == {
        "status": "error",
        "message": "TTS Server returned 500 for install: Dependency installation failed: pip exited 1",
    }


def test_engine_test_endpoint_delegates_run_test(clean_db, client, tmp_path):
    bridge = MagicMock()
    bridge.run_test.return_value = {"ok": True, "message": "Test passed"}

    registration = SimpleNamespace(
        manifest=SimpleNamespace(
            module_path="plugins.tts_mock.plugin.server.engine",
        )
    )

    # Setup mock plugin assets folder
    plugin_dir = tmp_path / "plugins" / "tts_mock"
    assets_dir = plugin_dir / "assets"
    assets_dir.mkdir(parents=True)
    output_path = assets_dir / "test_output.wav"
    output_path.write_bytes(b"wav content")

    with patch("app.api.routers.engines.create_voice_bridge", return_value=bridge), \
         patch("app.engines.registry.load_engine_registry", return_value={"mock-engine": registration}), \
         patch("app.core.config.PLUGINS_DIR", tmp_path / "plugins"):

        response = client.post("/api/engines/mock-engine/test")

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["audio_url"] == "/api/engines/mock-engine/test/audio"
    assert isinstance(data["generated_at"], (int, float))
    bridge.run_test.assert_called_once_with("mock-engine")


def test_engine_test_endpoint_handles_tts_server_registry_shape(clean_db, client, tmp_path):
    bridge = MagicMock()
    bridge.run_test.return_value = {"ok": True, "message": "Test passed"}

    registration = SimpleNamespace(
        manifest=SimpleNamespace(
            module_path="tts_server.plugin.xtts",
        )
    )

    plugin_dir = tmp_path / "plugins" / "tts_xtts"
    assets_dir = plugin_dir / "assets"
    assets_dir.mkdir(parents=True)
    (assets_dir / "test_output.wav").write_bytes(b"wav content")

    with patch("app.api.routers.engines.create_voice_bridge", return_value=bridge), \
         patch("app.engines.registry.load_engine_registry", return_value={"xtts": registration}), \
         patch("app.core.config.PLUGINS_DIR", tmp_path / "plugins"):
        response = client.post("/api/engines/xtts/test")

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["audio_url"] == "/api/engines/xtts/test/audio"
    assert isinstance(data["generated_at"], (int, float))
    bridge.run_test.assert_called_once_with("xtts")


def test_get_test_audio_returns_file_from_plugin_assets(clean_db, client, tmp_path):
    registration = SimpleNamespace(
        manifest=SimpleNamespace(
            module_path="plugins.tts_mock.plugin.server.engine",
        )
    )

    # Setup mock plugin assets folder
    plugin_dir = tmp_path / "plugins" / "tts_mock"
    assets_dir = plugin_dir / "assets"
    assets_dir.mkdir(parents=True)
    audio_path = assets_dir / "test_output.wav"
    audio_path.write_bytes(b"plugin wav content")

    with patch("app.engines.registry.load_engine_registry", return_value={"mock-engine": registration}), \
         patch("app.core.config.PLUGINS_DIR", tmp_path / "plugins"):
        response = client.get("/api/engines/mock-engine/test/audio")

    assert response.status_code == 200
    assert response.content == b"plugin wav content"


def test_get_test_audio_resolves_tts_server_registry_shape(clean_db, client, tmp_path):
    registration = SimpleNamespace(
        manifest=SimpleNamespace(
            module_path="tts_server.plugin.xtts",
        )
    )

    plugin_dir = tmp_path / "plugins" / "tts_xtts"
    assets_dir = plugin_dir / "assets"
    assets_dir.mkdir(parents=True)
    audio_path = assets_dir / "test_output.wav"
    audio_path.write_bytes(b"remote registry wav content")

    with patch("app.engines.registry.load_engine_registry", return_value={"xtts": registration}), \
         patch("app.core.config.PLUGINS_DIR", tmp_path / "plugins"):
        response = client.get("/api/engines/xtts/test/audio")

    assert response.status_code == 200
    assert response.content == b"remote registry wav content"


def test_get_engine_scenarios_resolves_from_manifest(clean_db, client, tmp_path):
    from app.engines.models import EngineManifestModel

    registration = SimpleNamespace(
        manifest=EngineManifestModel(
            engine_id="mock-engine",
            display_name="Mock Engine",
            phase="test",
            module_path="plugins.tts_mock.plugin.server.engine",
            dev={"enabled": True, "scenarios": "dev/scenarios.json"},
        )
    )

    plugin_dir = tmp_path / "plugins" / "tts_mock"
    dev_dir = plugin_dir / "dev"
    dev_dir.mkdir(parents=True)
    scenario_path = dev_dir / "scenarios.json"
    scenario_content = '{"scenarios": [{"id": "test", "label": "Test Scenario", "engine_detail": {}}]}'
    scenario_path.write_text(scenario_content)

    with patch("app.engines.registry.load_engine_registry", return_value={"mock-engine": registration}), \
         patch("app.core.config.PLUGINS_DIR", tmp_path / "plugins"):
        response = client.get("/api/engines/mock-engine/dev/scenarios")

    assert response.status_code == 200
    assert response.json() == {"scenarios": [{"id": "test", "label": "Test Scenario", "engine_detail": {}}]}


def test_get_engine_scenarios_missing_file_returns_404(client, tmp_path):
    from app.engines.models import EngineManifestModel

    registration = SimpleNamespace(
        manifest=EngineManifestModel(
            engine_id="mock-engine",
            display_name="Mock Engine",
            phase="test",
            module_path="plugins.tts_mock.plugin.server.engine",
            dev={"enabled": True, "scenarios": "dev/missing.json"},
        )
    )

    with patch("app.engines.registry.load_engine_registry", return_value={"mock-engine": registration}), \
         patch("app.core.config.PLUGINS_DIR", tmp_path / "plugins"):
        response = client.get("/api/engines/mock-engine/dev/scenarios")

    assert response.status_code == 404
    assert "not found" in response.json()["message"]


def test_get_engine_scenarios_malformed_json_returns_400(client, tmp_path):
    from app.engines.models import EngineManifestModel

    registration = SimpleNamespace(
        manifest=EngineManifestModel(
            engine_id="mock-engine",
            display_name="Mock Engine",
            phase="test",
            module_path="plugins.tts_mock.plugin.server.engine",
            dev={"enabled": True, "scenarios": "dev/scenarios.json"},
        )
    )

    plugin_dir = tmp_path / "plugins" / "tts_mock"
    dev_dir = plugin_dir / "dev"
    dev_dir.mkdir(parents=True)
    (dev_dir / "scenarios.json").write_text("{ invalid json }")

    with patch("app.engines.registry.load_engine_registry", return_value={"mock-engine": registration}), \
         patch("app.core.config.PLUGINS_DIR", tmp_path / "plugins"):
        response = client.get("/api/engines/mock-engine/dev/scenarios")

    assert response.status_code == 400
    assert "Invalid JSON" in response.json()["message"]


def test_get_engine_scenarios_invalid_structure_returns_400(client, tmp_path):
    from app.engines.models import EngineManifestModel

    registration = SimpleNamespace(
        manifest=EngineManifestModel(
            engine_id="mock-engine",
            display_name="Mock Engine",
            phase="test",
            module_path="plugins.tts_mock.plugin.server.engine",
            dev={"enabled": True, "scenarios": "dev/scenarios.json"},
        )
    )

    plugin_dir = tmp_path / "plugins" / "tts_mock"
    dev_dir = plugin_dir / "dev"
    dev_dir.mkdir(parents=True)

    # Case: not a dict
    (dev_dir / "scenarios.json").write_text("[1, 2, 3]")

    with patch("app.engines.registry.load_engine_registry", return_value={"mock-engine": registration}), \
         patch("app.core.config.PLUGINS_DIR", tmp_path / "plugins"):
        response = client.get("/api/engines/mock-engine/dev/scenarios")
        assert response.status_code == 400
        assert "must be a JSON object" in response.json()["message"]

    # Case: missing 'scenarios' key
    (dev_dir / "scenarios.json").write_text('{"other": []}')
    with patch("app.engines.registry.load_engine_registry", return_value={"mock-engine": registration}), \
         patch("app.core.config.PLUGINS_DIR", tmp_path / "plugins"):
        response = client.get("/api/engines/mock-engine/dev/scenarios")
        assert response.status_code == 400
        assert "Missing 'scenarios' key" in response.json()["message"]

    # Case: scenarios not a list
    (dev_dir / "scenarios.json").write_text('{"scenarios": {}}')
    with patch("app.engines.registry.load_engine_registry", return_value={"mock-engine": registration}), \
         patch("app.core.config.PLUGINS_DIR", tmp_path / "plugins"):
        response = client.get("/api/engines/mock-engine/dev/scenarios")
        assert response.status_code == 400
        assert "'scenarios' must be a list" in response.json()["message"]

    # Case: scenario missing required fields
    (dev_dir / "scenarios.json").write_text('{"scenarios": [{"id": "test"}]}')
    with patch("app.engines.registry.load_engine_registry", return_value={"mock-engine": registration}), \
         patch("app.core.config.PLUGINS_DIR", tmp_path / "plugins"):
        response = client.get("/api/engines/mock-engine/dev/scenarios")
        assert response.status_code == 400
        assert "missing required fields" in response.json()["message"]

    # Case: scenario has required fields with invalid types
    (dev_dir / "scenarios.json").write_text('{"scenarios": [{"id": 123, "label": "Test", "engine_detail": {}}]}')
    with patch("app.engines.registry.load_engine_registry", return_value={"mock-engine": registration}), \
         patch("app.core.config.PLUGINS_DIR", tmp_path / "plugins"):
        response = client.get("/api/engines/mock-engine/dev/scenarios")
        assert response.status_code == 400
        assert "id must be a string" in response.json()["message"]

    (dev_dir / "scenarios.json").write_text('{"scenarios": [{"id": "test", "label": 123, "engine_detail": {}}]}')
    with patch("app.engines.registry.load_engine_registry", return_value={"mock-engine": registration}), \
         patch("app.core.config.PLUGINS_DIR", tmp_path / "plugins"):
        response = client.get("/api/engines/mock-engine/dev/scenarios")
        assert response.status_code == 400
        assert "label must be a string" in response.json()["message"]

    (dev_dir / "scenarios.json").write_text('{"scenarios": [{"id": "test", "label": "Test", "engine_detail": []}]}')
    with patch("app.engines.registry.load_engine_registry", return_value={"mock-engine": registration}), \
         patch("app.core.config.PLUGINS_DIR", tmp_path / "plugins"):
        response = client.get("/api/engines/mock-engine/dev/scenarios")
        assert response.status_code == 400
        assert "engine_detail must be an object" in response.json()["message"]
