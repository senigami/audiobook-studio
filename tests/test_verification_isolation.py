import pytest
from pathlib import Path
from unittest.mock import MagicMock
from app.tts_server.plugin_loader import LoadedPlugin
from app.tts_server.verification import verify_plugin, VerificationResult
from app.engines.voice.sdk import TTSResult

class TestVerificationIsolation:
    def test_verify_success(self, tmp_path):
        """Standard successful verification."""
        engine = MagicMock()
        engine.check_request.return_value = (True, "OK")

        def mock_synthesize(req):
            Path(req.output_path).write_text("audio data")
            return TTSResult(ok=True, output_path=req.output_path, duration_sec=1.5)

        engine.synthesize.side_effect = mock_synthesize

        plugin = LoadedPlugin(
            folder_name="tts_mock",
            plugin_dir=tmp_path / "tts_mock",
            manifest={"engine_id": "mock", "display_name": "Mock"},
            engine=engine
        )

        result = verify_plugin(plugin)
        assert result.ok is True
        assert result.duration_sec == 1.5
        assert result.error is None

    def test_check_request_crash_isolated(self, tmp_path):
        """Exception in check_request() should result in failed verification but no crash."""
        engine = MagicMock()
        engine.check_request.side_effect = RuntimeError("check_request crash")

        plugin = LoadedPlugin(
            folder_name="tts_mock",
            plugin_dir=tmp_path / "tts_mock",
            manifest={"engine_id": "mock", "display_name": "Mock"},
            engine=engine
        )

        result = verify_plugin(plugin)
        assert result.ok is False
        assert "check_request() raised: check_request crash" in result.error

    def test_synthesize_crash_isolated(self, tmp_path):
        """Exception in synthesize() should result in failed verification but no crash."""
        engine = MagicMock()
        engine.check_request.return_value = (True, "OK")
        engine.synthesize.side_effect = RuntimeError("synthesize crash")

        plugin = LoadedPlugin(
            folder_name="tts_mock",
            plugin_dir=tmp_path / "tts_mock",
            manifest={"engine_id": "mock", "display_name": "Mock"},
            engine=engine
        )

        result = verify_plugin(plugin)
        assert result.ok is False
        assert "synthesize() raised: synthesize crash" in result.error

    def test_synthesize_failure_return_isolated(self, tmp_path):
        """Returning ok=False should result in failed verification."""
        engine = MagicMock()
        engine.check_request.return_value = (True, "OK")
        engine.synthesize.return_value = TTSResult(ok=False, error="Engine reported error")

        plugin = LoadedPlugin(
            folder_name="tts_mock",
            plugin_dir=tmp_path / "tts_mock",
            manifest={"engine_id": "mock", "display_name": "Mock"},
            engine=engine
        )

        result = verify_plugin(plugin)
        assert result.ok is False
        assert result.error == "Engine reported error"

    def test_missing_output_file_isolated(self, tmp_path):
        """If synthesis returns ok=True but writes no file, verification should fail."""
        engine = MagicMock()
        engine.check_request.return_value = (True, "OK")
        engine.synthesize.return_value = TTSResult(ok=True, output_path="nonexistent.wav")

        plugin = LoadedPlugin(
            folder_name="tts_mock",
            plugin_dir=tmp_path / "tts_mock",
            manifest={"engine_id": "mock", "display_name": "Mock"},
            engine=engine
        )

        result = verify_plugin(plugin)
        assert result.ok is False
        assert "empty or missing output file" in result.error

    def test_empty_output_file_isolated(self, tmp_path):
        """If synthesis writes an empty file, verification should fail."""
        engine = MagicMock()
        engine.check_request.return_value = (True, "OK")

        def mock_synthesize(req):
            Path(req.output_path).write_text("") # Empty file
            return TTSResult(ok=True, output_path=req.output_path)

        engine.synthesize.side_effect = mock_synthesize

        plugin = LoadedPlugin(
            folder_name="tts_mock",
            plugin_dir=tmp_path / "tts_mock",
            manifest={"engine_id": "mock", "display_name": "Mock"},
            engine=engine
        )

        result = verify_plugin(plugin)
        assert result.ok is False
        assert "empty or missing output file" in result.error
