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

    def test_verify_non_rendering(self, tmp_path):
        """Plugin-provided verify() should succeed without writing an audio file."""
        from app.engines.voice.sdk import VerificationResult as SDKVerificationResult

        class MockEngine:
            def __init__(self):
                self.verify_called = False
                self.synthesize_called = False

            def check_request(self, req):
                return True, "OK"

            def verify(self, req):
                self.verify_called = True
                return SDKVerificationResult(ok=True, message="Fast check OK")

            def synthesize(self, req):
                self.synthesize_called = True
                return TTSResult(ok=True, output_path=req.output_path)

        engine = MockEngine()

        plugin = LoadedPlugin(
            folder_name="tts_mock",
            plugin_dir=tmp_path / "tts_mock",
            manifest={"engine_id": "mock", "display_name": "Mock"},
            engine=engine,
        )

        result = verify_plugin(plugin)
        assert result.ok is True
        assert result.error is None
        # Verify synthesize was NOT called
        assert engine.synthesize_called is False
        # Verify verify was called
        assert engine.verify_called is True

    def test_verify_default_unsupported(self, tmp_path):
        """Default StudioTTSEngine.verify() should return a clean unsupported result."""
        from app.engines.voice.base import StudioTTSEngine
        from app.engines.voice.sdk import TTSRequest

        class MinimalEngine(StudioTTSEngine):
            def synthesize(self, req):
                pass

            def check_request(self, req):
                return True, "OK"

            def check_env(self):
                return True, "OK"

            def info(self):
                return {}

            def settings_schema(self):
                return {}

        engine = MinimalEngine()
        req = TTSRequest(text="test", output_path="test.wav")
        result = engine.verify(req)

        assert result.ok is False
        assert "does not implement" in result.message

    def test_verify_uses_default_studio_voice_reference(self, tmp_path):
        """Verification should borrow the Studio default voice sample when available."""
        engine = MagicMock()
        engine.check_request.return_value = (True, "OK")

        default_voice_dir = tmp_path / "voices" / "Narrator"
        default_voice_dir.mkdir(parents=True)
        reference_sample = default_voice_dir / "sample.wav"
        reference_sample.write_text("reference audio")

        def mock_synthesize(req):
            assert req.voice_ref == str(reference_sample)
            Path(req.output_path).write_text("audio data")
            return TTSResult(ok=True, output_path=req.output_path, duration_sec=1.5)

        engine.synthesize.side_effect = mock_synthesize

        plugin = LoadedPlugin(
            folder_name="tts_mock",
            plugin_dir=tmp_path / "tts_mock",
            manifest={"engine_id": "mock", "display_name": "Mock"},
            engine=engine
        )

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr("app.state.get_settings", lambda: {"default_speaker_profile": "Narrator"})
            mp.setattr("app.jobs.speaker.get_speaker_settings", lambda _profile: {"reference_sample": "sample.wav"})
            mp.setattr("app.jobs.speaker.get_voice_profile_dir", lambda _profile: default_voice_dir)

            result = verify_plugin(plugin)

        assert result.ok is True
        assert result.duration_sec == 1.5
        assert result.error is None
        assert engine.check_request.call_args[0][0].voice_ref == str(reference_sample)

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
