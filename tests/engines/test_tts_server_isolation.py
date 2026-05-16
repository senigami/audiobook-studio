import pytest
import json
import textwrap
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.tts_server.plugin_loader import discover_plugins, LoadedPlugin
from app.tts_server.verification import verify_all
from app.tts_server.server import load_plugins, refresh_plugins
from app.engines.voice.sdk import TTSResult

def _make_plugin_dir(
    tmp_path: Path,
    folder_name: str,
    manifest: dict,
    engine_src: str = "",
) -> Path:
    plugin_dir = tmp_path / folder_name
    plugin_dir.mkdir(parents=True, exist_ok=True)
    (plugin_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    if engine_src:
        (plugin_dir / "engine.py").write_text(textwrap.dedent(engine_src), encoding="utf-8")
    return plugin_dir

def _minimal_manifest(engine_id="mock", entry_class="engine:MockEngine"):
    return {
        "studio_tts_manifest": "1.0",
        "engine_id": engine_id,
        "display_name": f"Mock {engine_id}",
        "entry_class": entry_class,
        "capabilities": ["synthesis"],
    }

class TestTTSServerIsolation:
    class _NoopHooks:
        def preprocess_request(self, _request):
            return None

        def postprocess_audio(self, _output_path, _settings):
            return None

    class _PendingVerificationEngine:
        def check_env(self):
            return True, "OK"

        def hooks(self):
            return TestTTSServerIsolation._NoopHooks()

        def check_request(self, _req):
            return True, "OK"

        def synthesize(self, req):
            return TTSResult(ok=True, output_path=req.output_path)

    def test_ready_endpoint_is_cheap(self):
        from app.tts_server.server import app

        client = TestClient(app)
        response = client.get("/ready")
        assert response.status_code == 200
        assert response.json() == {"status": "ready"}

    def test_startup_announces_ready_after_lifespan_starts(self):
        from app.tts_server.server import app, set_ready_port

        with patch("builtins.print") as mock_print:
            set_ready_port(7862)
            with TestClient(app):
                pass

        mock_print.assert_any_call("READY:7862", flush=True)

    def test_startup_with_mixed_plugins_isolated(self, tmp_path):
        """Server should start and load good plugins even if some are broken."""
        # 1. Good plugin
        _make_plugin_dir(tmp_path, "tts_good", _minimal_manifest("good"), """
            from app.engines.voice.sdk import VerificationResult
            class MockEngine:
                def check_env(self): return True, "OK"
                def check_request(self, req): return True, "OK"
                def info(self): return {}
                def settings_schema(self): return {}
                def synthesize(self, req): return VerificationResult(ok=True)
                def run_test(self): return VerificationResult(ok=True)
        """)

        # 2. Syntax error plugin
        _make_plugin_dir(tmp_path, "tts_badsyntax", _minimal_manifest("badsyntax"), "invalid python code")

        # 3. Crash on init plugin
        _make_plugin_dir(tmp_path, "tts_badinit", _minimal_manifest("badinit"), """
            class MockEngine:
                def __init__(self): raise RuntimeError("init crash")
                def check_env(self): return True, "OK"
                def check_request(self, req): return True, "OK"
                def info(self): return {}
                def settings_schema(self): return {}
                def synthesize(self, req): return None
        """)

        # 4. Crash on check_env plugin
        _make_plugin_dir(tmp_path, "tts_badenv", _minimal_manifest("badenv"), """
            class MockEngine:
                def check_env(self): raise RuntimeError("env crash")
                def check_request(self, req): return True, "OK"
                def info(self): return {}
                def settings_schema(self): return {}
                def synthesize(self, req): return None
        """)

        # 5. Crash on verification plugin (passes loader but fails verify_all)
        _make_plugin_dir(tmp_path, "tts_badverify", _minimal_manifest("badverify"), """
            class MockEngine:
                def check_env(self): return True, "OK"
                def check_request(self, req): return True, "OK"
                def info(self): return {}
                def settings_schema(self): return {}
                def synthesize(self, req): return None
                def run_test(self): raise RuntimeError("verify crash")
        """)

        with patch("app.tts_server.server._state_lock"), \
             patch("threading.Thread") as mock_thread:

            def run_sync(target, *args, **kwargs):
                target()
                return MagicMock()

            mock_thread.side_effect = lambda target=None, **kwargs: MagicMock(start=lambda: target())

            load_plugins(tmp_path)

            from app.tts_server.server import _plugins
            # Should have loaded 'good' and 'badverify'
            engine_ids = [p.engine_id for p in _plugins]
            assert "good" in engine_ids
            assert "badverify" in engine_ids
            assert "badsyntax" not in engine_ids
            assert "badinit" not in engine_ids
            assert "badenv" not in engine_ids

            # badverify should be marked unverified
            badverify_plugin = next(p for p in _plugins if p.engine_id == "badverify")
            assert badverify_plugin.verified is False
            assert "verify crash" in badverify_plugin.verification_error

    def test_refresh_isolation(self, tmp_path):
        """Refreshing plugins should isolate failures and not crash the server."""
        # Start with a good plugin
        _make_plugin_dir(tmp_path, "tts_good", _minimal_manifest("good"), """
            from app.engines.voice.sdk import VerificationResult
            class MockEngine:
                def check_env(self): return True, "OK"
                def check_request(self, req): return True, "OK"
                def info(self): return {}
                def settings_schema(self): return {}
                def synthesize(self, req): return VerificationResult(ok=True)
                def shutdown(self): pass
                def run_test(self): return VerificationResult(ok=True)
        """)

        with patch("app.tts_server.server._state_lock"), \
             patch("app.tts_server.server._plugins_dir", tmp_path):

            load_plugins(tmp_path)
            from app.tts_server.server import _plugins
            assert len(_plugins) == 1

            # Now add a broken plugin to the directory
            _make_plugin_dir(tmp_path, "tts_new_broken", _minimal_manifest("broken"), """
                class MockEngine:
                    def __init__(self): raise RuntimeError("new plugin crash")
            """)

            # Add a plugin that crashes on shutdown
            old_plugin = _plugins[0]
            old_plugin.engine.shutdown = MagicMock(side_effect=RuntimeError("shutdown crash"))

            # Trigger refresh
            response = refresh_plugins()

            assert response["ok"] is True
            # Good plugin remains (it's reloaded), broken one is skipped
            assert len(_plugins) == 1
            assert _plugins[0].engine_id == "good"
            old_plugin.engine.shutdown.assert_called_once()

    def test_clear_read_only_engine_setting(self, tmp_path):
        from app.tts_server.server import app
        from app.tts_server.settings_store import save_settings

        plugin_dir = tmp_path / "tts_mock"
        plugin_dir.mkdir()
        plugin_data_dir = tmp_path / "plugin_data"

        class MockEngine:
            def settings_schema(self):
                return {
                    "properties": {
                        "temperature": {"type": "number"},
                        "computer_speed_multiplier": {"type": "number", "readOnly": True},
                    }
                }

        plugin = SimpleNamespace(
            engine_id="mock",
            plugin_dir=plugin_dir,
            engine=MockEngine(),
            manifest={},
        )

        with patch("app.tts_server.server._plugins", [plugin]), \
             patch("app.core.config.PLUGINS_DIR", tmp_path), \
             patch("app.core.config.PLUGIN_DATA_DIR", plugin_data_dir):
            save_settings(plugin_dir, {"temperature": 0.7, "computer_speed_multiplier": 1.75})
            client = TestClient(app)
            response = client.delete("/engines/mock/settings/computer_speed_multiplier")

        assert response.status_code == 200
        assert response.json()["cleared"] is True
        settings = json.loads((plugin_data_dir / "mock" / "settings.json").read_text(encoding="utf-8"))
        assert "computer_speed_multiplier" not in settings
        assert settings["temperature"] == 0.7

    def test_synthesize_allows_pending_verification_engine(self, tmp_path):
        from app.tts_server.server import app

        plugin_dir = tmp_path / "tts_pending"
        plugin_dir.mkdir()
        plugin = SimpleNamespace(
            engine_id="pending",
            folder_name="tts_pending",
            plugin_dir=plugin_dir,
            engine=self._PendingVerificationEngine(),
            manifest={},
            verified=False,
            verification_error=None,
            load_error=None,
            dependencies_satisfied=True,
            missing_dependencies=[],
            setup_message=None,
        )

        client = TestClient(app)
        with patch("app.tts_server.server._plugins", [plugin]), \
             patch("app.tts_server.server.load_settings", return_value={}):
            response = client.post(
                "/synthesize",
                json={
                    "engine_id": "pending",
                    "text": "Hello world",
                    "output_path": str(tmp_path / "out.wav"),
                    "task_id": "task-1",
                },
            )

        assert response.status_code == 200
        assert response.json()["ok"] is True
        assert response.json()["output_path"] == str(tmp_path / "out.wav")

    def test_synthesize_blocks_after_failed_verification(self, tmp_path):
        from app.tts_server.server import app

        plugin_dir = tmp_path / "tts_failed"
        plugin_dir.mkdir()
        plugin = SimpleNamespace(
            engine_id="failed",
            folder_name="tts_failed",
            plugin_dir=plugin_dir,
            engine=self._PendingVerificationEngine(),
            manifest={},
            verified=False,
            verification_error="verify crash",
            load_error=None,
            dependencies_satisfied=True,
            missing_dependencies=[],
            setup_message=None,
        )

        client = TestClient(app)
        with patch("app.tts_server.server._plugins", [plugin]), \
             patch("app.tts_server.server.load_settings", return_value={}):
            response = client.post(
                "/synthesize",
                json={
                    "engine_id": "failed",
                    "text": "Hello world",
                    "output_path": str(tmp_path / "out.wav"),
                    "task_id": "task-2",
                },
            )

        assert response.status_code == 503
        assert "failed verification" in response.json()["detail"]
