"""W-PAR slice A: /synthesize endpoint non-blocking tests.

Verifies that the synthesize endpoint is non-blocking (async), so the uvicorn
event loop can service concurrent inferences simultaneously.

This is "ships dark" — with per-engine cap=1 (today's default) behaviour is
byte-identical to today.  Concurrency only becomes observable when caps are
raised (separate task).

Also covers the Voxtral acceptance criterion: no artificial serialization at
the endpoint layer, regardless of which engine is active.
"""

from __future__ import annotations

import asyncio
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.engines.voice.sdk import TTSResult


# ---------------------------------------------------------------------------
# Shared helpers / fixtures
# ---------------------------------------------------------------------------

class _NoopHooks:
    def preprocess_request(self, _request):
        return None

    def select_voice(self, _profile_id, _settings):
        return None

    def postprocess_audio(self, _output_path, _settings):
        return None


def _make_verified_plugin(engine_id: str, engine_obj, plugin_dir: Path) -> SimpleNamespace:
    """Build a minimal verified plugin SimpleNamespace matching server expectations."""
    return SimpleNamespace(
        engine_id=engine_id,
        folder_name=f"tts_{engine_id}",
        plugin_dir=plugin_dir,
        engine=engine_obj,
        manifest={"engine_id": engine_id},
        verified=True,
        verification_error=None,
        load_error=None,
        dependencies_satisfied=True,
        missing_dependencies=[],
        setup_message=None,
    )


# ---------------------------------------------------------------------------
# T1 — Response dict shape is unchanged for a single request
# ---------------------------------------------------------------------------

class TestSynthesizeResponseShape:
    """Single-request sanity: response dict shape must be unchanged post-async conversion."""

    def test_single_request_response_shape(self, tmp_path):
        from app.tts_server.server import app
        from httpx import ASGITransport, AsyncClient

        output_path = tmp_path / "out.wav"

        class _SimpleEngine:
            def check_env(self): return True, "OK"
            def hooks(self): return _NoopHooks()
            def check_request(self, req): return True, "OK"
            def synthesize(self, req):
                return TTSResult(
                    ok=True,
                    output_path=req.output_path,
                    duration_sec=2.5,
                    warnings=["test-warning"],
                )
            def check_output(self, req, result): return True, "OK"

        plugin = _make_verified_plugin("mock_shape", _SimpleEngine(), tmp_path / "tts_mock_shape")

        async def _run():
            with patch("app.tts_server.server._plugins", [plugin]), \
                 patch("app.tts_server.server.load_settings", return_value={}), \
                 patch("app.tts_server.server._engine_readiness_status", return_value="ready"):
                async with AsyncClient(
                    transport=ASGITransport(app=app), base_url="http://test"
                ) as client:
                    resp = await client.post(
                        "/synthesize",
                        json={
                            "engine_id": "mock_shape",
                            "text": "Hello world",
                            "output_path": str(output_path),
                        },
                    )
            return resp

        resp = asyncio.run(_run())

        assert resp.status_code == 200
        data = resp.json()
        # Required keys per spec (server.py ~L730-740)
        assert data["ok"] is True
        assert "engine_id" in data
        assert "output_path" in data
        assert "duration_sec" in data
        assert "warnings" in data
        assert data["engine_id"] == "mock_shape"
        assert data["duration_sec"] == 2.5
        assert data["warnings"] == ["test-warning"]
        # timing absent when TTSResult.timing is None
        assert "timing" not in data


# ---------------------------------------------------------------------------
# T2 (keystone) — concurrency regression guard: two concurrent requests are
#                 serviced concurrently and complete in < 0.18s (well under
#                 the 0.20s serial sum of two 0.1s engine calls).
#
# Engine-agnostic: does not depend on any real engine.  Also covers the
# Voxtral acceptance criterion (no artificial serialization at the endpoint).
#
# HONESTY NOTE (not an R1 revert-check): FastAPI already runs sync ``def``
# route handlers in anyio's threadpool, so the PRE-fix synchronous endpoint
# was *also* non-blocking under ASGITransport — this test passes on both the
# old and new endpoint.  It is therefore a forward regression guard, NOT a
# red-on-pre-fix bug-fix test.  The async + run_in_threadpool conversion is a
# correctness/idiom improvement (it offloads only the blocking engine call,
# leaving validation/timing/response on the event loop) rather than a fix for
# a loop-blocking bug.  The real server-side serialization was the single
# warm-worker subprocess (addressed in the XTTS pool slice), not this endpoint.
#
# R2 (mock boundary): only plugin.engine.synthesize (the engine, outside the
# unit under test) is mocked.  run_in_threadpool, the endpoint, and the app
# are NOT mocked.
# ---------------------------------------------------------------------------

class TestSynthesizeNonBlocking:
    """Keystone concurrency test: two simultaneous requests must not serialize."""

    SIMULATED_WORK_SECONDS = 0.1
    # Allow up to 80% of serial sum (generous; serial would be ≥0.20s)
    CONCURRENT_LIMIT_SECONDS = 0.18

    def _make_blocking_engine(self):
        """Engine whose synthesize() does real blocking I/O (time.sleep)."""
        work_secs = self.SIMULATED_WORK_SECONDS

        class _BlockingEngine:
            def check_env(self): return True, "OK"
            def hooks(self): return _NoopHooks()
            def check_request(self, req): return True, "OK"
            def synthesize(self, req):
                # Simulate blocking engine work (e.g. XTTS GPU call).
                # Real thread-blocking sleep (not asyncio.sleep): the engine call
                # must be offloaded to a threadpool for two requests to overlap.
                time.sleep(work_secs)
                return TTSResult(
                    ok=True,
                    output_path=req.output_path,
                    duration_sec=work_secs,
                    warnings=[],
                )
            def check_output(self, req, result): return True, "OK"

        return _BlockingEngine()

    def test_two_concurrent_requests_complete_below_serial_sum(self, tmp_path):
        from app.tts_server.server import app
        from httpx import ASGITransport, AsyncClient

        output_a = tmp_path / "out_a.wav"
        output_b = tmp_path / "out_b.wav"
        plugin = _make_verified_plugin(
            "mock_concurrent", self._make_blocking_engine(), tmp_path / "tts_mock_concurrent"
        )

        async def _fire_two():
            with patch("app.tts_server.server._plugins", [plugin]), \
                 patch("app.tts_server.server.load_settings", return_value={}), \
                 patch("app.tts_server.server._engine_readiness_status", return_value="ready"):
                async with AsyncClient(
                    transport=ASGITransport(app=app), base_url="http://test"
                ) as client:
                    t0 = time.monotonic()
                    resp_a, resp_b = await asyncio.gather(
                        client.post(
                            "/synthesize",
                            json={
                                "engine_id": "mock_concurrent",
                                "text": "Hello",
                                "output_path": str(output_a),
                            },
                        ),
                        client.post(
                            "/synthesize",
                            json={
                                "engine_id": "mock_concurrent",
                                "text": "World",
                                "output_path": str(output_b),
                            },
                        ),
                    )
                    elapsed = time.monotonic() - t0
            return resp_a, resp_b, elapsed

        resp_a, resp_b, elapsed = asyncio.run(_fire_two())

        assert resp_a.status_code == 200, f"Request A failed: {resp_a.text}"
        assert resp_b.status_code == 200, f"Request B failed: {resp_b.text}"
        assert resp_a.json()["ok"] is True
        assert resp_b.json()["ok"] is True

        assert elapsed < self.CONCURRENT_LIMIT_SECONDS, (
            f"Two concurrent {self.SIMULATED_WORK_SECONDS}s requests took {elapsed:.3f}s — "
            f"expected < {self.CONCURRENT_LIMIT_SECONDS}s (concurrent, not serialized). "
            "A regression here means something started serializing requests at the "
            "endpoint layer (e.g. a global lock or an awaited blocking call on the loop)."
        )
