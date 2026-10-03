"""/synthesize failures return a stable code + fixed message + correlation id.

Nothing derived from the engine's error text or exception reaches the response
(security.md Status Payload Rule); the full detail is logged server-side under
the same correlation id.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from unittest.mock import patch

import pytest

from app.engines.voice.sdk import TTSResult
from tests.tts_server.test_server_concurrency import _make_verified_plugin, _NoopHooks

LEAKY_ERRORS = [
    r"boom C:\Users\Jane Doe\My Books\secret chapter.wav",
    r"boom \\fileserver\share\private\voice.pth",
    "boom ./voices/secret_voice/latent.pth and ../../etc/passwd",
    "boom /Users/secret/voices/latent.pth via http://127.0.0.1:7863/x",
]
LEAK_MARKERS = ["Jane", "Doe", "fileserver", "private", "secret", "etc/passwd", "127.0.0.1", "latent"]


def _post(tmp_path: Path, *, result=None, raises=None):
    from app.tts_server.server import app
    from httpx import ASGITransport, AsyncClient

    class _Engine:
        def check_env(self): return True, "OK"
        def hooks(self): return _NoopHooks()
        def check_request(self, req): return True, "OK"
        def synthesize(self, req):
            if raises is not None:
                raise raises
            return result
        def check_output(self, req, res): return True, "OK"

    plugin = _make_verified_plugin("mock_fail", _Engine(), tmp_path / "tts_mock_fail")

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


@pytest.mark.parametrize("error", LEAKY_ERRORS)
def test_result_error_never_reaches_response_but_is_logged(tmp_path, caplog, error):
    with caplog.at_level(logging.ERROR, logger="app.tts_server.server"):
        resp = _post(tmp_path, result=TTSResult(ok=False, error=error))
    assert resp.status_code == 500
    detail = resp.json()["detail"]
    assert detail["code"] == "synthesis_failed"
    assert detail["message"] == "Synthesis failed."
    for marker in LEAK_MARKERS + ["boom"]:
        assert marker not in resp.text
    # The same correlation id ties the response to the full text in the log.
    cid = detail["correlation_id"]
    assert cid
    assert any(cid in r.getMessage() and error in r.getMessage() for r in caplog.records)


@pytest.mark.parametrize(
    "exc, code",
    [
        (TimeoutError("took too long reading C:\\Users\\Jane Doe\\x.wav"), "timeout"),
        (FileNotFoundError("/Users/secret/model.bin"), "engine_unavailable"),
        (ImportError("No module named secret_dep"), "engine_unavailable"),
        (ValueError(r"bad input \\fileserver\share\private\a.wav"), "invalid_request"),
        (RuntimeError("CUDA out of memory ./voices/secret"), "synthesis_failed"),
    ],
)
def test_raised_exception_is_classified_by_type_and_traceback_is_logged(tmp_path, caplog, exc, code):
    with caplog.at_level(logging.ERROR, logger="app.tts_server.server"):
        resp = _post(tmp_path, raises=exc)
    assert resp.status_code == 500
    detail = resp.json()["detail"]
    assert detail["code"] == code
    assert set(detail) == {"code", "message", "correlation_id"}
    for marker in LEAK_MARKERS + ["CUDA", "secret_dep"]:
        assert marker not in resp.text
    assert type(exc).__name__ not in resp.text
    logged = [r for r in caplog.records if detail["correlation_id"] in r.getMessage()]
    assert logged and logged[0].exc_info is not None
    assert logged[0].exc_info[0] is type(exc)


def test_classification_ignores_message_text(tmp_path):
    # A RuntimeError whose message says "timeout" must not be classified as one.
    resp = _post(tmp_path, raises=RuntimeError("timeout while loading"))
    assert resp.json()["detail"]["code"] == "synthesis_failed"


@pytest.mark.parametrize(
    "exc, code",
    [
        (TimeoutError("slow C:\\Users\\Jane Doe\\x.wav"), "timeout"),
        (FileNotFoundError("/Users/secret/model.bin"), "engine_unavailable"),
        (ConnectionError("refused http://127.0.0.1:9"), "engine_unavailable"),
        (ValueError("bad"), "invalid_request"),
        (TypeError("bad"), "invalid_request"),
        (RuntimeError("boom"), "synthesis_failed"),
    ],
)
def test_engine_caught_exception_on_result_is_classified_by_type(tmp_path, caplog, exc, code):
    # Engines such as XTTS catch their own exceptions and hand them back on the result.
    try:
        raise exc
    except Exception as caught:
        result = TTSResult(ok=False, error=f"engine said: {caught}", exception=caught)
    with caplog.at_level(logging.ERROR, logger="app.tts_server.server"):
        resp = _post(tmp_path, result=result)
    detail = resp.json()["detail"]
    assert detail["code"] == code
    assert set(detail) == {"code", "message", "correlation_id"}
    for marker in LEAK_MARKERS + ["engine said", "boom"]:
        assert marker not in resp.text
    assert type(exc).__name__ not in resp.text


def test_exactly_one_record_carries_correlation_id_and_traceback(tmp_path, caplog):
    try:
        raise TimeoutError("worker stalled")
    except TimeoutError as caught:
        result = TTSResult(ok=False, error="XTTS synthesis raised: worker stalled", exception=caught)
    with caplog.at_level(logging.DEBUG):
        resp = _post(tmp_path, result=result)
    cid = resp.json()["detail"]["correlation_id"]
    carrying = [r for r in caplog.records if cid in r.getMessage()]
    assert len(carrying) == 1
    record = carrying[0]
    assert record.exc_info is not None and record.exc_info[0] is TimeoutError
    assert record.exc_info[2] is not None  # traceback attached
    assert "worker stalled" in record.getMessage()


@pytest.mark.parametrize("bogus", ["a string", 42, {"k": "v"}, object()])
def test_non_exception_value_on_result_falls_back_to_synthesis_failed(tmp_path, bogus):
    result = TTSResult(ok=False, error="engine said no", exception=bogus)
    resp = _post(tmp_path, result=result)
    assert resp.status_code == 500
    detail = resp.json()["detail"]
    assert detail["code"] == "synthesis_failed"
    assert set(detail) == {"code", "message", "correlation_id"}
