import pytest
import json
from unittest.mock import patch

# NOTE: Do NOT import TestClient or app at the top level in these isolation tests.
# This ensures conftest.py env vars take effect before app.core.config is loaded.

@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.api.web import app
    return TestClient(app)

@pytest.fixture
def clean_state(tmp_path):
    test_state_file = tmp_path / "test_state.json"
    with patch("app.db.state.STATE_FILE", test_state_file):
        yield test_state_file

def test_default_settings_refactor(client, clean_state):
    from app.db.state import get_settings
    # Verify defaults match the new requirement (MP3 False)
    settings = get_settings()
    assert "safe_mode" in settings

def test_get_speaker_settings_uses_hardcoded_fallback(clean_state):
    from app.db.speakers import get_speaker_settings

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


def test_baseline_engine_cps_lives_in_behavior_not_core_config():
    from app.core import config
    from app.engines.behavior import DEFAULT_BASELINE_ENGINE_CPS

    assert not hasattr(config, "BASELINE_ENGINE_CPS")
    assert DEFAULT_BASELINE_ENGINE_CPS == 16.7


def test_verification_metadata_ignores_read_only_computed_settings(tmp_path):
    from app.tts_server.settings_store import calculate_verification_metadata, save_settings

    plugin_dir = tmp_path / "tts_mock"
    plugin_dir.mkdir()
    (plugin_dir / "settings_schema.json").write_text(
        json.dumps(
            {
                "properties": {
                    "temperature": {"type": "number"},
                    "computer_speed_multiplier": {"type": "number", "readOnly": True},
                }
            }
        ),
        encoding="utf-8",
    )

    save_settings(
        plugin_dir,
        {
            "temperature": 0.7,
            "computer_speed_multiplier": 1.75,
        },
    )
    first = calculate_verification_metadata(plugin_dir, {"engine_id": "mock"})

    save_settings(
        plugin_dir,
        {
            "temperature": 0.7,
            "computer_speed_multiplier": 2.5,
        },
    )
    second = calculate_verification_metadata(plugin_dir, {"engine_id": "mock"})

    assert first["settings_hash"] == second["settings_hash"]


def test_plugin_settings_and_state_are_stored_outside_plugin_source(tmp_path, monkeypatch):
    from app.tts_server.settings_store import load_settings, load_state, save_settings, save_state

    plugin_data_dir = tmp_path / "plugin_data"
    plugin_dir = tmp_path / "plugins" / "tts_mock"
    plugin_dir.mkdir(parents=True)

    monkeypatch.setattr("app.core.config.PLUGIN_DATA_DIR", plugin_data_dir)

    save_settings(plugin_dir, {"temperature": 0.7})
    save_state(plugin_dir, {"verified": True})

    assert not (plugin_dir / "settings.json").exists()
    assert not (plugin_dir / "state.json").exists()
    assert load_settings(plugin_dir) == {"temperature": 0.7}
    assert load_state(plugin_dir) == {"verified": True}
    assert (plugin_data_dir / "mock" / "settings.json").is_file()
    assert (plugin_data_dir / "mock" / "state.json").is_file()


def test_plugin_root_runtime_files_are_ignored(tmp_path, monkeypatch):
    from app.tts_server.settings_store import load_settings, load_state, save_settings

    plugin_data_dir = tmp_path / "plugin_data"
    plugin_dir = tmp_path / "plugins" / "tts_mock"
    plugin_dir.mkdir(parents=True)
    (plugin_dir / "settings.json").write_text(json.dumps({"temperature": 0.4}), encoding="utf-8")
    (plugin_dir / "state.json").write_text(json.dumps({"verified": True}), encoding="utf-8")

    monkeypatch.setattr("app.core.config.PLUGIN_DATA_DIR", plugin_data_dir)

    assert load_settings(plugin_dir) == {}
    assert load_state(plugin_dir) == {}

    save_settings(plugin_dir, {"temperature": 0.9})
    (plugin_dir / "settings.json").write_text(json.dumps({"temperature": 0.1}), encoding="utf-8")

    assert load_settings(plugin_dir) == {"temperature": 0.9}
    assert not (plugin_data_dir / "mock" / "state.json").exists()


# ---------------------------------------------------------------------------
# engine_id validation / path-injection guard tests
# ---------------------------------------------------------------------------

class TestValidateEngineId:
    """validate_engine_id rejects traversal strings and accepts well-formed ids."""

    def test_valid_id_accepted(self):
        from app.tts_server.settings_store import validate_engine_id
        # Should not raise
        validate_engine_id("xtts2")
        validate_engine_id("my-engine")
        validate_engine_id("tts_v2")
        validate_engine_id("a")

    @pytest.mark.parametrize("bad_id", ["../x", "a/b", "..", "A", "", "/etc/passwd", "foo bar"])
    def test_traversal_ids_rejected(self, bad_id):
        from app.tts_server.settings_store import validate_engine_id
        with pytest.raises(ValueError, match="Invalid engine_id"):
            validate_engine_id(bad_id)


class TestSettingsStoreTraversalGuard:
    """_runtime_file raises for ids that escape PLUGIN_DATA_DIR after resolve."""

    def test_traversal_id_blocked_in_load_settings(self, tmp_path, monkeypatch):
        from app.tts_server.settings_store import load_settings
        plugin_data_dir = tmp_path / "plugin_data"
        monkeypatch.setattr("app.core.config.PLUGIN_DATA_DIR", plugin_data_dir)
        # Build a plugin_dir whose derived engine_id would escape (use a crafted name)
        plugin_dir = tmp_path / "plugins" / "tts_mock"
        plugin_dir.mkdir(parents=True)
        with pytest.raises(ValueError):
            # Force _engine_id_from_plugin_dir to return a traversal string by
            # using a folder that starts with "pip:" and contains traversal chars.
            # We monkey-patch _engine_id_from_plugin_dir directly to simulate it.
            import app.tts_server.settings_store as ss
            original = ss._engine_id_from_plugin_dir
            monkeypatch.setattr(ss, "_engine_id_from_plugin_dir", lambda _: "../evil")
            try:
                load_settings(plugin_dir)
            finally:
                monkeypatch.setattr(ss, "_engine_id_from_plugin_dir", original)

    def test_valid_id_round_trips_setting(self, tmp_path, monkeypatch):
        from app.tts_server.settings_store import load_settings, save_settings
        plugin_data_dir = tmp_path / "plugin_data"
        plugin_dir = tmp_path / "plugins" / "tts_roundtrip"
        plugin_dir.mkdir(parents=True)
        monkeypatch.setattr("app.core.config.PLUGIN_DATA_DIR", plugin_data_dir)
        save_settings(plugin_dir, {"key": "value123"})
        assert load_settings(plugin_dir) == {"key": "value123"}


class TestPerformanceSettingsTraversalGuard:
    """performance_settings functions reject traversal engine_ids without touching disk."""

    @pytest.mark.parametrize("bad_id", ["../x", "a/b", ".."])
    def test_save_multiplier_rejects_traversal(self, bad_id, tmp_path):
        from app.tts_server.performance_settings import save_engine_computer_speed_multiplier
        with pytest.raises(ValueError, match="Invalid engine_id"):
            save_engine_computer_speed_multiplier(bad_id, 20.0)
        assert not any(tmp_path.rglob("*.json"))

    @pytest.mark.parametrize("bad_id", ["../x", "a/b", ".."])
    def test_get_multiplier_rejects_traversal(self, bad_id):
        from app.tts_server.performance_settings import get_engine_computer_speed_multiplier
        with pytest.raises(ValueError, match="Invalid engine_id"):
            get_engine_computer_speed_multiplier(bad_id)

    @pytest.mark.parametrize("bad_id", ["../x", "a/b", ".."])
    def test_clear_baseline_rejects_traversal(self, bad_id):
        from app.tts_server.performance_settings import clear_engine_computer_speed_baseline
        with pytest.raises(ValueError, match="Invalid engine_id"):
            clear_engine_computer_speed_baseline(bad_id)

    @pytest.mark.parametrize("bad_id", ["../x", "a/b", ".."])
    def test_resolve_model_rejects_traversal(self, bad_id):
        from app.tts_server.performance_settings import resolve_engine_settings_model
        with pytest.raises(ValueError, match="Invalid engine_id"):
            resolve_engine_settings_model(bad_id)

    def test_valid_id_get_multiplier_returns_default(self, tmp_path, monkeypatch):
        """Valid engine_id with no plugin dir returns neutral 1.0 multiplier."""
        from app.tts_server.performance_settings import get_engine_computer_speed_multiplier
        monkeypatch.setattr("app.core.config.PLUGINS_DIR", tmp_path / "plugins")
        result = get_engine_computer_speed_multiplier("validengine")
        assert result == 1.0
