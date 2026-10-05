"""Tests for the check_output QA hook (Item 2 of plugin_contract_qa_hooks_plan).

Covers:
- StudioTTSEngine ABC default accepts all (T1)
- TTS Server /synthesize rejects + deletes artifact on (False, reason) (T2, R1 red-first)
- Crashing check_output is failure-isolated: logs + accepts (T3)
- bridge_remote maps output_rejected -> EngineOutputRejectedError (T4)
"""

from __future__ import annotations

import json
import textwrap
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.engines.voice.sdk import TTSRequest, TTSResult


# ---------------------------------------------------------------------------
# T1 — ABC default accepts all
# ---------------------------------------------------------------------------

class TestCheckOutputDefault:
    def test_default_returns_true_ok(self):
        from app.engines.voice.base import StudioTTSEngine

        # Minimal concrete subclass (only required abstract methods implemented)
        class _MinimalEngine(StudioTTSEngine):
            def info(self): return {}
            def check_env(self): return True, "OK"
            def check_request(self, req): return True, "OK"
            def synthesize(self, req): return TTSResult(ok=True, output_path=req.output_path)
            def settings_schema(self): return {}

        engine = _MinimalEngine()
        req = TTSRequest(text="hello", output_path="/tmp/out.wav")
        result = TTSResult(ok=True, output_path="/tmp/out.wav", duration_sec=1.0)
        ok, reason = engine.check_output(req, result)
        assert ok is True
        assert reason == "OK"


# ---------------------------------------------------------------------------
# Helpers to build a minimal test plugin for server endpoint tests
# ---------------------------------------------------------------------------

def _make_plugin_dir(tmp_path: Path, folder_name: str, manifest: dict, engine_src: str = "") -> Path:
    plugin_dir = tmp_path / folder_name
    plugin_dir.mkdir(parents=True, exist_ok=True)
    (plugin_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    if engine_src:
        (plugin_dir / "engine.py").write_text(textwrap.dedent(engine_src), encoding="utf-8")
    return plugin_dir


def _minimal_manifest(engine_id: str, entry_class: str = "engine:MockEngine") -> dict:
    return {
        "studio_tts_manifest": "1.0",
        "engine_id": engine_id,
        "display_name": f"Mock {engine_id}",
        "entry_class": entry_class,
        "capabilities": ["synthesis"],
    }


def _make_verified_plugin(engine_id: str, engine_obj: object) -> object:
    """Build a LoadedPlugin-like namespace that the server's _plugin_by_id can return."""
    plugin = SimpleNamespace(
        engine_id=engine_id,
        engine=engine_obj,
        verified=True,
        verification_error=None,
        plugin_dir=Path("/tmp/fake"),
        manifest={},
        folder_name=f"tts_{engine_id}",
    )
    return plugin


class _NoopHooks:
    def preprocess_request(self, _request): pass
    def select_voice(self, _profile_id, _settings): return None
    def postprocess_audio(self, _output_path, _settings): pass


# ---------------------------------------------------------------------------
# T2 — server rejects + deletes artifact on (False, reason)
#
# R1 (revert-check): the test asserts that without the check_output call the
# response would be 200 and the artifact file would remain.  The test is
# written so that, if the check_output call is removed from server.py, the
# test will fail (the response won't be 422 and the artifact won't be deleted).
# ---------------------------------------------------------------------------

class TestServerCheckOutputRejection:
    def _build_app_client(self, engine_obj, tmp_artifact: Path) -> TestClient:
        from app.tts_server import server as _server

        plugin = _make_verified_plugin("mockrej", engine_obj)

        def _fake_plugin_by_id(engine_id: str):
            return plugin

        def _fake_load_settings(plugin_dir):
            return {}

        def _fake_engine_status(plugin, current_settings=None):
            return "ready"

        with patch.object(_server, "_plugin_by_id", _fake_plugin_by_id), \
             patch("app.tts_server.server.load_settings", _fake_load_settings), \
             patch("app.tts_server.server._engine_readiness_status", return_value="ready"):
            from app.tts_server.server import app
            return TestClient(app)

    def test_check_output_false_returns_422_and_deletes_artifact(self, tmp_path):
        """R1: without check_output this would be 200; with it we get 422 + deleted artifact."""
        artifact = tmp_path / "out.wav"
        artifact.write_bytes(b"FAKE_WAV")

        class _RejectingEngine:
            def hooks(self): return _NoopHooks()
            def check_env(self): return True, "OK"
            def check_request(self, req): return True, "OK"
            def synthesize(self, req):
                # Write the artifact (simulating real synthesis)
                Path(req.output_path).write_bytes(b"FAKE_WAV")
                return TTSResult(ok=True, output_path=req.output_path, duration_sec=1.0)
            def check_output(self, req, result):
                return False, "duration is zero — truncated"

        from app.tts_server import server as _server

        plugin = _make_verified_plugin("mockrej", _RejectingEngine())

        with patch.object(_server, "_plugin_by_id", lambda _: plugin), \
             patch("app.tts_server.server.load_settings", return_value={}), \
             patch("app.tts_server.server._engine_readiness_status", return_value="ready"):
            from app.tts_server.server import app
            client = TestClient(app)
            resp = client.post("/synthesize", json={
                "engine_id": "mockrej",
                "text": "hello",
                "output_path": str(artifact),
            })

        assert resp.status_code == 422
        body = resp.json()
        assert body["ok"] is False
        assert body["error"] == "output_rejected"
        assert "truncated" in body["reason"]

        # The artifact must have been deleted
        assert not artifact.exists(), "rejected artifact must be deleted by the server"

    def test_check_output_true_returns_200(self, tmp_path):
        """Sanity: accepting check_output still returns 200."""
        artifact = tmp_path / "out.wav"

        class _AcceptingEngine:
            def hooks(self): return _NoopHooks()
            def check_env(self): return True, "OK"
            def check_request(self, req): return True, "OK"
            def synthesize(self, req):
                Path(req.output_path).write_bytes(b"FAKE_WAV")
                return TTSResult(ok=True, output_path=req.output_path, duration_sec=1.0)
            def check_output(self, req, result):
                return True, "OK"

        from app.tts_server import server as _server

        plugin = _make_verified_plugin("mockacc", _AcceptingEngine())

        with patch.object(_server, "_plugin_by_id", lambda _: plugin), \
             patch("app.tts_server.server.load_settings", return_value={}), \
             patch("app.tts_server.server._engine_readiness_status", return_value="ready"):
            from app.tts_server.server import app
            client = TestClient(app)
            resp = client.post("/synthesize", json={
                "engine_id": "mockacc",
                "text": "hello",
                "output_path": str(artifact),
            })

        assert resp.status_code == 200
        assert resp.json()["ok"] is True


# ---------------------------------------------------------------------------
# T3 — crashing check_output is failure-isolated (logs + accepts)
# ---------------------------------------------------------------------------

class TestCheckOutputIsolation:
    def test_crashing_check_output_does_not_fail_synthesis(self, tmp_path):
        artifact = tmp_path / "out.wav"

        class _CrashingQAEngine:
            def hooks(self): return _NoopHooks()
            def check_env(self): return True, "OK"
            def check_request(self, req): return True, "OK"
            def synthesize(self, req):
                Path(req.output_path).write_bytes(b"FAKE_WAV")
                return TTSResult(ok=True, output_path=req.output_path, duration_sec=1.0)
            def check_output(self, req, result):
                raise RuntimeError("QA hook exploded")

        from app.tts_server import server as _server

        plugin = _make_verified_plugin("mockcrash", _CrashingQAEngine())

        with patch.object(_server, "_plugin_by_id", lambda _: plugin), \
             patch("app.tts_server.server.load_settings", return_value={}), \
             patch("app.tts_server.server._engine_readiness_status", return_value="ready"):
            from app.tts_server.server import app
            client = TestClient(app)
            resp = client.post("/synthesize", json={
                "engine_id": "mockcrash",
                "text": "hello",
                "output_path": str(artifact),
            })

        # Must succeed despite crashing hook
        assert resp.status_code == 200
        assert resp.json()["ok"] is True


# ---------------------------------------------------------------------------
# T4 — bridge_remote maps output_rejected -> EngineOutputRejectedError
# ---------------------------------------------------------------------------

class TestBridgeOutputRejectedMapping:
    def test_output_rejected_raises_engine_output_rejected_error(self):
        from app.engines.bridge_remote import RemoteBridgeHandler
        from app.engines.errors import EngineOutputRejectedError
        from app.engines.tts_client import TtsServerOutputRejectedError

        mock_client = MagicMock()
        mock_client.synthesize.side_effect = TtsServerOutputRejectedError("duration too short")

        handler = RemoteBridgeHandler(tts_client_factory=lambda: mock_client)

        with pytest.raises(EngineOutputRejectedError) as exc_info:
            handler.synthesize({
                "engine_id": "xtts",
                "script_text": "hello",
                "output_path": "/tmp/out.wav",
            })

        assert exc_info.value.reason == "duration too short"

    def test_output_rejected_error_is_distinguishable_from_unavailable(self):
        from app.engines.errors import EngineOutputRejectedError, EngineUnavailableError, EngineBridgeError

        err = EngineOutputRejectedError("some reason")
        assert isinstance(err, EngineBridgeError)
        assert not isinstance(err, EngineUnavailableError)
        assert err.reason == "some reason"
