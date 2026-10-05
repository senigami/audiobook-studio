import pytest
from pathlib import Path
from unittest.mock import MagicMock
from app.tts_server.plugin_loader import LoadedPlugin
from app.tts_server.verification import verify_plugin, VerificationResult
from app.engines.voice.sdk import VerificationResult as SDKVerificationResult
from app.tts_server.settings_store import save_settings

class TestVerificationIsolation:
    def test_verify_success(self, tmp_path):
        """Standard successful verification by delegating to plugin.run_test()."""
        engine = MagicMock()
        engine.run_test.return_value = SDKVerificationResult(ok=True, message="Plugin test passed")

        plugin = LoadedPlugin(
            folder_name="tts_mock",
            plugin_dir=tmp_path / "tts_mock",
            manifest={"engine_id": "mock", "display_name": "Mock"},
            engine=engine
        )

        result = verify_plugin(plugin)
        assert result.ok is True
        assert result.error is None
        engine.run_test.assert_called_once()

    def test_verify_failure(self, tmp_path):
        """Verification failure reported by the plugin."""
        engine = MagicMock()
        engine.run_test.return_value = SDKVerificationResult(ok=False, message="Engine reported failure")

        plugin = LoadedPlugin(
            folder_name="tts_mock",
            plugin_dir=tmp_path / "tts_mock",
            manifest={"engine_id": "mock", "display_name": "Mock"},
            engine=engine
        )

        result = verify_plugin(plugin)
        assert result.ok is False
        assert result.error == "Engine reported failure"
        engine.run_test.assert_called_once()

    def test_run_test_crash_isolated(self, tmp_path):
        """Exception in run_test() should result in failed verification but no crash."""
        engine = MagicMock()
        engine.run_test.side_effect = RuntimeError("run_test crash")

        plugin = LoadedPlugin(
            folder_name="tts_mock",
            plugin_dir=tmp_path / "tts_mock",
            manifest={"engine_id": "mock", "display_name": "Mock"},
            engine=engine
        )

        result = verify_plugin(plugin)
        assert result.ok is False
        assert "run_test() raised an unhandled exception" in result.error
        assert "run_test crash" not in result.error  # exception text must not leak

    def test_verify_does_not_depend_on_studio_voices(self, tmp_path, monkeypatch):
        """Verification must not call into Studio voice resolution logic.

        Installs a real spy on ``app.db.speakers.get_speaker_settings`` --
        Studio's speaker/voice-resolution entry point -- so a future
        regression that wires verify_plugin() into Studio voice lookups
        would actually be caught here, instead of the test just asserting
        the (unmocked) happy path succeeds.
        """
        from app.db import speakers as speakers_module

        voice_spy = MagicMock(wraps=speakers_module.get_speaker_settings)
        monkeypatch.setattr(speakers_module, "get_speaker_settings", voice_spy)

        engine = MagicMock()
        engine.run_test.return_value = SDKVerificationResult(ok=True)

        plugin = LoadedPlugin(
            folder_name="tts_mock",
            plugin_dir=tmp_path / "tts_mock",
            manifest={"engine_id": "mock", "display_name": "Mock"},
            engine=engine
        )

        result = verify_plugin(plugin)
        assert result.ok is True
        voice_spy.assert_not_called()

    def test_verify_passes_persisted_engine_settings_when_supported(self, tmp_path):
        """Cloud plugins need saved settings during verification."""
        plugin_dir = tmp_path / "tts_cloud"
        plugin_dir.mkdir()
        save_settings(plugin_dir, {"mistral_api_key": "saved-key"})

        class SettingsAwareEngine:
            def __init__(self):
                self.seen_settings = None

            def run_test(self, settings=None):
                self.seen_settings = settings
                return SDKVerificationResult(ok=bool(settings.get("mistral_api_key")))

        engine = SettingsAwareEngine()
        plugin = LoadedPlugin(
            folder_name="tts_cloud",
            plugin_dir=plugin_dir,
            manifest={"engine_id": "cloud", "display_name": "Cloud"},
            engine=engine,
        )

        result = verify_plugin(plugin)

        assert result.ok is True
        assert engine.seen_settings == {"mistral_api_key": "saved-key"}
