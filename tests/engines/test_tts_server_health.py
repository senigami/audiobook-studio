"""Tests for TTS Server health aggregation."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.tts_server.health import (
    STATUS_INVALID_CONFIG,
    STATUS_NEEDS_SETUP,
    STATUS_READY,
    STATUS_UNVERIFIED,
    build_engine_detail,
    build_health_response,
    engine_status,
)


class _MockEngine:
    def __init__(self, env_ok=True):
        self._env_ok = env_ok

    def check_env(self):
        return self._env_ok, "OK" if self._env_ok else "Missing dependency"

    def info(self):
        return {}

    def settings_schema(self):
        return {}


class _MockPlugin:
    def __init__(self, engine_id="mock", env_ok=True, verified=False, deps_ok=True):
        self.engine_id = engine_id
        self.display_name = engine_id.upper()
        self.engine = _MockEngine(env_ok=env_ok)
        self.verified = verified
        self.verification_error = None
        self.load_error = None
        self.manifest = {}
        self.dependencies_satisfied = deps_ok
        self.missing_dependencies = [] if deps_ok else ["missing-pkg"]
        self.folder_name = f"tts_{engine_id}"


class TestEngineStatus:
    def test_ready_when_env_ok_and_verified(self):
        plugin = _MockPlugin(env_ok=True, verified=True)
        assert engine_status(plugin) == STATUS_READY

    def test_unverified_when_env_ok_but_not_verified(self):
        plugin = _MockPlugin(env_ok=True, verified=False)
        assert engine_status(plugin) == STATUS_UNVERIFIED

    def test_needs_setup_when_env_fails(self):
        plugin = _MockPlugin(env_ok=False, verified=False)
        assert engine_status(plugin) == STATUS_NEEDS_SETUP

    def test_needs_setup_when_check_env_raises(self):
        class BrokenEngine:
            def check_env(self):
                raise RuntimeError("crash")

        plugin = _MockPlugin()
        plugin.engine = BrokenEngine()
        assert engine_status(plugin) == STATUS_NEEDS_SETUP
        assert "check_env() crashed" in plugin.setup_message
        assert "crash\"" not in plugin.setup_message and ": crash" not in plugin.setup_message  # exception text must not leak

    def test_needs_setup_when_check_env_fails_with_message(self):
        class FailingEngine:
            def check_env(self):
                return False, "API key missing"

        plugin = _MockPlugin()
        plugin.engine = FailingEngine()
        assert engine_status(plugin) == STATUS_NEEDS_SETUP
        assert plugin.setup_message == "API key missing"

    def test_invalid_config_when_plugin_has_load_error(self):
        plugin = _MockPlugin()
        plugin.engine = None
        plugin.load_error = "manifest.json missing required field 'entry_class'"

        assert engine_status(plugin) == STATUS_INVALID_CONFIG

    def test_invalid_config_engine_detail_is_safe_without_engine_object(self):
        plugin = _MockPlugin()
        plugin.engine = None
        plugin.load_error = "manifest.json missing required field 'entry_class'"
        plugin.manifest = {"engine_id": "broken", "behavior": {}}

        detail = build_engine_detail(plugin, {})

        assert detail["status"] == STATUS_INVALID_CONFIG
        assert detail["verification_error"] == plugin.load_error
        assert detail["setup_message"] == plugin.load_error
        assert detail["health_message"] == plugin.load_error
        assert detail["settings_schema"] == {}

    def test_uses_current_settings_when_check_env_accepts_settings(self):
        class SettingsAwareEngine:
            def check_env(self, settings=None):
                return bool((settings or {}).get("mistral_api_key")), "OK"

            def info(self):
                return {}

            def settings_schema(self):
                return {}

        plugin = _MockPlugin(env_ok=False, verified=False)
        plugin.engine = SettingsAwareEngine()

        assert engine_status(plugin, current_settings={}) == STATUS_NEEDS_SETUP
        assert engine_status(
            plugin,
            current_settings={"mistral_api_key": "saved-key"},
        ) == STATUS_UNVERIFIED

    def test_engine_detail_uses_current_settings_for_status(self):
        class SettingsAwareEngine:
            def check_env(self, settings=None):
                return bool((settings or {}).get("mistral_api_key")), "OK"

            def info(self):
                return {}

            def settings_schema(self):
                return {}

        plugin = _MockPlugin(engine_id="voxtral", env_ok=False, verified=False)
        plugin.engine = SettingsAwareEngine()
        plugin.manifest = {"engine_id": "voxtral", "behavior": {}}

        detail = build_engine_detail(plugin, {"mistral_api_key": "saved-key"})

        assert detail["status"] == STATUS_UNVERIFIED
        assert detail["setup_message"] is None
        assert detail["health_message"] is None

    def test_engine_detail_preserves_setup_message_from_check_env_when_settings_still_invalid(self):
        class SettingsAwareEngine:
            def check_env(self, settings=None):
                return bool((settings or {}).get("mistral_api_key")), "Missing API key"

            def info(self):
                return {}

            def settings_schema(self):
                return {}

        plugin = _MockPlugin(engine_id="voxtral", env_ok=False, verified=False)
        plugin.engine = SettingsAwareEngine()
        plugin.setup_message = "Initial message"
        plugin.manifest = {"engine_id": "voxtral", "behavior": {}}

        detail = build_engine_detail(plugin, {})

        assert detail["status"] == STATUS_NEEDS_SETUP
        assert detail["setup_message"] == "Missing API key"


class TestBuildHealthResponse:
    def test_empty_plugin_list(self):
        result = build_health_response([])
        assert result["status"] == "ok"
        assert result["engines"] == []

    def test_all_ready(self):
        plugins = [
            _MockPlugin("eng1", env_ok=True, verified=True),
            _MockPlugin("eng2", env_ok=True, verified=True),
        ]
        result = build_health_response(plugins)
        assert result["status"] == "ok"
        assert len(result["engines"]) == 2

    def test_one_needs_setup_returns_degraded(self):
        plugins = [
            _MockPlugin("eng1", env_ok=True, verified=True),
            _MockPlugin("eng2", env_ok=False, verified=False),
        ]
        result = build_health_response(plugins)
        assert result["status"] == "degraded"

    def test_invalid_config_returns_degraded(self):
        plugin = _MockPlugin("broken", env_ok=True, verified=False)
        plugin.load_error = "Unsupported studio_tts_manifest version '9.0'"

        result = build_health_response([plugin])

        assert result["status"] == "degraded"
        assert result["engines"][0]["status"] == STATUS_INVALID_CONFIG
        assert result["engines"][0]["verification_error"] == plugin.load_error

    def test_engine_fields_present(self):
        plugins = [_MockPlugin("mock", env_ok=True, verified=True)]
        result = build_health_response(plugins)
        engine = result["engines"][0]
        assert engine["engine_id"] == "mock"
        assert engine["status"] == STATUS_READY
        assert engine["verified"] is True

    def test_engine_detail_does_not_inject_privacy_notices(self):
        # Even if an engine is cloud/network, build_engine_detail should not
        # mutate the schema anymore.
        plugin = _MockPlugin(engine_id="cloudy", env_ok=True, verified=True)
        plugin.manifest = {"cloud": True, "network": True}

        # Plugin returns its own schema
        plugin.engine.settings_schema = lambda: {
            "type": "object",
            "properties": {"api_key": {"type": "string"}},
            "x-ui": {"panel_title": "Cloudy Setup"}
        }

        detail = build_engine_detail(plugin, {})
        schema = detail["settings_schema"]

        # Should preserve plugin's x-ui exactly
        assert schema["x-ui"] == {"panel_title": "Cloudy Setup"}
        # Should NOT contain injected notice
        assert "privacy_notice" not in schema["x-ui"]


class TestSettingsAwareReadiness:
    """engine_status callers must pass persisted settings; a settings-keyed
    engine (e.g. Voxtral's API key) otherwise reports needs_setup on /health
    at boot and 503s on /synthesize even though it is verified (regression:
    'Engine voxtral is not ready (status: needs_setup)' on sample render)."""

    class _SettingsKeyedEngine:
        def check_env(self, settings=None):
            if (settings or {}).get("mistral_api_key"):
                return True, "OK"
            return False, "Voxtral requires a Mistral API key in engine settings or MISTRAL_API_KEY."

        def info(self):
            return {}

        def settings_schema(self):
            return {}

        def hooks(self):
            return {}

    def _plugin(self, verified=True):
        plugin = _MockPlugin(engine_id="voxkeyed", verified=verified)
        plugin.engine = self._SettingsKeyedEngine()
        plugin.plugin_dir = Path("/tmp/tts_voxkeyed")
        return plugin

    def test_build_health_response_uses_persisted_settings(self, monkeypatch):
        import app.tts_server.health as health_mod

        plugin = self._plugin(verified=True)
        monkeypatch.setattr(
            health_mod, "load_settings", lambda plugin_dir: {"mistral_api_key": "saved-key"}
        )

        payload = build_health_response([plugin])
        assert payload["engines"][0]["status"] == "ready"
        assert payload["status"] == "ok"

    def test_synthesize_readiness_gate_uses_persisted_settings(self, monkeypatch):
        import app.tts_server.server as server_mod

        plugin = self._plugin(verified=True)
        monkeypatch.setattr(
            server_mod, "load_settings", lambda plugin_dir: {"mistral_api_key": "saved-key"}
        )

        status = server_mod._engine_readiness_status(plugin)
        assert status == "ready"

    def test_install_recovery_passes_persisted_settings_to_check_env(self, tmp_path, monkeypatch):
        from types import SimpleNamespace

        import app.tts_server.server as server_mod
        from app.tts_server.settings_store import save_settings

        plugin_dir = tmp_path / "tts_instkeyed"
        plugin_dir.mkdir()
        (plugin_dir / "requirements.txt").write_text("requests", encoding="utf-8")
        save_settings(plugin_dir, {"mistral_api_key": "saved-key"})

        plugin = _MockPlugin(engine_id="instkeyed", verified=True)
        plugin.engine = self._SettingsKeyedEngine()
        plugin.plugin_dir = plugin_dir
        plugin.dependencies_satisfied = False
        plugin.missing_dependencies = ["requests"]
        plugin.setup_message = "Missing dependencies: requests."

        monkeypatch.setattr(server_mod, "_plugin_by_id", lambda engine_id: plugin)
        monkeypatch.setattr(
            "subprocess.run",
            lambda *args, **kwargs: SimpleNamespace(returncode=0, stdout="", stderr=""),
        )
        monkeypatch.setattr(
            "app.tts_server.plugin_loader._check_dependencies", lambda plugin_dir: (True, [])
        )

        response = server_mod.install_dependencies("instkeyed")

        assert response["ok"] is True
        assert plugin.setup_message is None
