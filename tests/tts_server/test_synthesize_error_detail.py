"""/synthesize must tell the client why synthesis failed, without leaking paths."""

from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import patch

import pytest

from app.engines.voice.sdk import TTSResult
from tests.tts_server.test_server_concurrency import _make_verified_plugin, _NoopHooks


def _post_failing_synth(tmp_path: Path, error):
    from app.tts_server.server import app
    from httpx import ASGITransport, AsyncClient

    class _FailingEngine:
        def check_env(self): return True, "OK"
        def hooks(self): return _NoopHooks()
        def check_request(self, req): return True, "OK"
        def synthesize(self, req): return TTSResult(ok=False, error=error)
        def check_output(self, req, result): return True, "OK"

    plugin = _make_verified_plugin("mock_fail", _FailingEngine(), tmp_path / "tts_mock_fail")

    async def _run():
        with patch("app.tts_server.server._plugins", [plugin]), \
             patch("app.tts_server.server.load_settings", return_value={}), \
             patch("app.tts_server.server._engine_readiness_status", return_value="ready"):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                return await client.post(
                    "/synthesize",
                    json={"engine_id": "mock_fail", "text": "Hello", "output_path": str(tmp_path / "o.wav")},
                )

    return asyncio.run(_run())


def test_real_error_reaches_client_with_paths_and_urls_redacted(tmp_path):
    resp = _post_failing_synth(
        tmp_path,
        "XTTS synthesis raised: RuntimeError: CUDA out of memory loading "
        "/Users/secret/voices/latent.pth via http://127.0.0.1:7863/x and C:\\Users\\secret\\v.wav",
    )
    assert resp.status_code == 500
    detail = resp.json()["detail"]
    assert "RuntimeError: CUDA out of memory" in detail
    assert "secret" not in resp.text
    assert "/Users" not in resp.text
    assert "127.0.0.1" not in resp.text


def test_error_detail_is_length_capped(tmp_path):
    resp = _post_failing_synth(tmp_path, "boom " * 5000)
    assert resp.status_code == 500
    assert 0 < len(resp.json()["detail"]) <= 1000


@pytest.mark.parametrize("error", [None, "", "   "])
def test_blank_error_falls_back_to_generic_message(tmp_path, error):
    resp = _post_failing_synth(tmp_path, error)
    assert resp.status_code == 500
    assert resp.json()["detail"] == "Synthesis failed."
