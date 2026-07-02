"""Tests for the XTTS warm worker (model warm-holding feature).

All tests use a fake worker script injected via XTTS_WARM_WORKER_SCRIPT so
the real XTTS model is never loaded.  The fake script honours the same
stdin/stdout/stderr protocol as the real serve loop.

Test inventory
--------------
- test_worker_spawns_and_runs_job          spawn on first job, returns rc 0
- test_worker_reused_across_two_jobs       two jobs, one spawn (PID stable)
- test_idle_timeout_kills_worker           idle timer fires, process terminates
- test_crash_fallback_returns_minus_one    worker crash → run_job returns -1
- test_shutdown_terminates_worker          shutdown() kills the process
- test_disabled_setting_uses_legacy_path   keep_model_loaded=False → run_cmd_stream called
- test_cancel_kills_worker                 cancel_check triggers worker kill
- test_engine_shutdown_calls_reset         engine.shutdown() calls _reset_warm_worker
- test_markers_passed_to_on_output         stderr markers forwarded to on_output
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Path to the fake worker script bundled with the tests.
FAKE_WORKER = str(Path(__file__).parent / "fixtures" / "fake_xtts_worker.py")


@pytest.fixture(autouse=True)
def _enable_warm_worker(monkeypatch):
    """Re-enable the warm worker for this test module (conftest disables it globally)."""
    monkeypatch.setenv("XTTS_WARM_WORKER_DISABLED", "0")


def _make_manager(idle_seconds: int = 60, extra_env: dict | None = None):
    """Create a WarmWorkerManager pointed at the fake worker."""
    from plugins.tts_xtts.plugin.core.warm_worker import WarmWorkerManager

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    env["XTTS_WARM_WORKER_SCRIPT"] = FAKE_WORKER
    if extra_env:
        env.update(extra_env)

    mgr = WarmWorkerManager(
        python_exe=Path(sys.executable),
        idle_seconds=idle_seconds,
        env=env,
    )
    # Override script path (manager reads env at init time).
    mgr._script_path = Path(FAKE_WORKER)
    return mgr


def _simple_job(tmp_path) -> dict:
    return {
        "text": "Hello world.",
        "out_path": str(tmp_path / "out.wav"),
        "language": "en",
        "speed": 1.0,
        "repetition_penalty": 2.0,
        "task_id": "test-task",
    }


# ---------------------------------------------------------------------------
# Core behaviour
# ---------------------------------------------------------------------------

def test_worker_spawns_and_runs_job(tmp_path):
    mgr = _make_manager()
    try:
        lines = []
        rc = mgr.run_job(_simple_job(tmp_path), on_output=lines.append, cancel_check=lambda: False)
        assert rc == 0
        marker_lines = [ln for ln in lines if "[START_SYNTHESIS]" in ln or "[PROGRESS]" in ln]
        assert marker_lines, f"No markers received; got: {lines}"
    finally:
        mgr.shutdown()


def test_worker_reused_across_two_jobs(tmp_path):
    """Two consecutive jobs must reuse the same worker process (same PID)."""
    mgr = _make_manager()
    try:
        pids: list[int] = []

        def _capture_worker_pid():
            with mgr._lock:
                w = mgr._worker
            if w is not None and w._proc is not None:
                pids.append(w._proc.pid)

        job = _simple_job(tmp_path)
        rc1 = mgr.run_job(job, on_output=lambda _: None, cancel_check=lambda: False)
        _capture_worker_pid()

        job2 = dict(job, out_path=str(tmp_path / "out2.wav"))
        rc2 = mgr.run_job(job2, on_output=lambda _: None, cancel_check=lambda: False)
        _capture_worker_pid()

        assert rc1 == 0
        assert rc2 == 0
        assert len(pids) == 2, f"Expected 2 PID samples, got {pids}"
        assert pids[0] == pids[1], f"Worker was re-spawned between jobs: PIDs {pids}"
    finally:
        mgr.shutdown()


def test_idle_timeout_kills_worker(tmp_path):
    """The idle timer must terminate the worker after the configured seconds."""
    mgr = _make_manager(idle_seconds=1)
    try:
        mgr.run_job(_simple_job(tmp_path), on_output=lambda _: None, cancel_check=lambda: False)

        # Worker should be alive right after the job.
        with mgr._lock:
            worker = mgr._worker
        assert worker is not None and worker.is_alive

        # Wait for the idle timer to fire (2x the timeout for reliability).
        time.sleep(2.5)

        with mgr._lock:
            worker_after = mgr._worker
        assert worker_after is None or not worker_after.is_alive, (
            "Worker should have been terminated by idle timeout"
        )
    finally:
        mgr.shutdown()


def test_crash_fallback_returns_minus_one(tmp_path):
    """If WarmWorker.run_job raises RuntimeError the manager returns -1 (fallback signal)."""
    from plugins.tts_xtts.plugin.core.warm_worker import WarmWorkerManager

    mgr = _make_manager()
    try:
        # Force the inner worker's run_job to raise RuntimeError (simulates broken pipe).
        def _raise(*args, **kwargs):
            raise RuntimeError("simulated pipe failure")

        rc = mgr.run_job(
            _simple_job(tmp_path),
            on_output=lambda _: None,
            cancel_check=lambda: False,
        )
        # Inject the fault for the actual call via the manager's worker.
        # Re-run with a mocked worker that always raises.
        with mgr._lock:
            worker = mgr._get_or_spawn()
            worker.run_job = _raise  # type: ignore[method-assign]

        rc2 = mgr.run_job(
            dict(_simple_job(tmp_path), out_path=str(tmp_path / "out2.wav")),
            on_output=lambda _: None,
            cancel_check=lambda: False,
        )
        assert rc2 == -1, f"Expected -1 (fallback signal), got {rc2}"
    finally:
        mgr.shutdown()


def test_shutdown_terminates_worker(tmp_path):
    """shutdown() must terminate the worker process."""
    mgr = _make_manager()
    mgr.run_job(_simple_job(tmp_path), on_output=lambda _: None, cancel_check=lambda: False)

    with mgr._lock:
        worker = mgr._worker
    assert worker is not None and worker.is_alive

    mgr.shutdown()

    # Worker process should be gone.
    assert worker._proc is None or worker._proc.poll() is not None, (
        "Worker process should have been terminated by shutdown()"
    )
    with mgr._lock:
        assert mgr._worker is None


def test_markers_passed_to_on_output(tmp_path):
    """[START_SYNTHESIS] and [PROGRESS] markers must reach the on_output callback."""
    mgr = _make_manager()
    try:
        collected: list[str] = []
        mgr.run_job(_simple_job(tmp_path), on_output=collected.append, cancel_check=lambda: False)
        full_output = "".join(collected)
        assert "[START_SYNTHESIS]" in full_output
        assert "[PROGRESS]" in full_output
    finally:
        mgr.shutdown()


def test_every_job_receives_its_own_markers(tmp_path):
    """Regression: EVERY job — not just the first — must stream its own stderr
    markers to on_output.

    The per-job reader threads leaked. After a job's stdout done-sentinel the
    stdout reader returned, but the stderr reader stayed blocked on read() because
    the warm worker's stderr never closes between jobs. The next job started a
    SECOND stderr reader on the same pipe; the orphaned reader competed
    byte-for-byte and stole the new job's markers into a dead queue. So the second
    (and every later) chapter render emitted no [SEGMENT_SAVED]/progress markers —
    segments never flipped to 'done' and the render bar jumped straight to ~complete,
    which looked like cached/reused audio. One persistent reader per stream fixes it.

    R1: on the pre-fix code the job-2 assertions FAIL (markers stolen); they pass
    once the readers are per-worker, not per-job.
    """
    mgr = _make_manager(extra_env={"FAKE_WORKER_EMIT_SEGMENT": "1"})
    try:
        out1: list[str] = []
        rc1 = mgr.run_job(
            dict(_simple_job(tmp_path), task_id="job-1", out_path=str(tmp_path / "s1.wav")),
            on_output=out1.append,
            cancel_check=lambda: False,
        )
        out2: list[str] = []
        rc2 = mgr.run_job(
            dict(_simple_job(tmp_path), task_id="job-2", out_path=str(tmp_path / "s2.wav")),
            on_output=out2.append,
            cancel_check=lambda: False,
        )
        assert rc1 == 0 and rc2 == 0, f"rc1={rc1} rc2={rc2}"
        for label, out in (("job-1", out1), ("job-2", out2)):
            joined = "".join(out)
            assert "[START_SYNTHESIS]" in joined, f"{label} missing [START_SYNTHESIS]; got {out}"
            assert "[SEGMENT_SAVED]" in joined, f"{label} missing [SEGMENT_SAVED]; got {out}"
            assert "[PROGRESS] 100%" in joined, f"{label} missing [PROGRESS] 100%; got {out}"
    finally:
        mgr.shutdown()


# ---------------------------------------------------------------------------
# Settings / disabled path
# ---------------------------------------------------------------------------

def test_disabled_setting_uses_legacy_path(tmp_path):
    """keep_model_loaded=False must skip the warm worker and call run_cmd_stream."""
    from plugins.tts_xtts.plugin.core import implementation as impl

    impl._reset_warm_worker()
    try:
        with (
            patch("plugins.tts_xtts.plugin.core.implementation.XTTS_ENV_ACTIVATE") as mock_activate,
            patch("plugins.tts_xtts.plugin.core.implementation.run_cmd_stream", return_value=0) as mock_run,
        ):
            mock_activate.exists.return_value = True

            rc = impl.xtts_generate(
                text="Hello",
                out_wav=tmp_path / "out.wav",
                safe_mode=True,
                on_output=lambda _: None,
                cancel_check=lambda: False,
                speaker_wav="spk.wav",
                engine_settings={"keep_model_loaded": False},
            )

        assert rc == 0
        assert mock_run.called, "run_cmd_stream should have been called (legacy path)"
    finally:
        impl._reset_warm_worker()


def test_idle_zero_uses_legacy_path(tmp_path):
    """keep_model_loaded_idle_seconds=0 must skip the warm worker."""
    from plugins.tts_xtts.plugin.core import implementation as impl

    impl._reset_warm_worker()
    try:
        with (
            patch("plugins.tts_xtts.plugin.core.implementation.XTTS_ENV_ACTIVATE") as mock_activate,
            patch("plugins.tts_xtts.plugin.core.implementation.run_cmd_stream", return_value=0) as mock_run,
        ):
            mock_activate.exists.return_value = True

            rc = impl.xtts_generate(
                text="Hello",
                out_wav=tmp_path / "out.wav",
                safe_mode=True,
                on_output=lambda _: None,
                cancel_check=lambda: False,
                speaker_wav="spk.wav",
                engine_settings={"keep_model_loaded": True, "keep_model_loaded_idle_seconds": 0},
            )

        assert rc == 0
        assert mock_run.called, "run_cmd_stream should have been called (idle=0 → legacy path)"
    finally:
        impl._reset_warm_worker()


# ---------------------------------------------------------------------------
# Cancel
# ---------------------------------------------------------------------------

def test_cancel_kills_worker(tmp_path):
    """cancel_check returning True must kill the worker and return rc=1."""
    mgr = _make_manager()
    try:
        # cancel immediately
        rc = mgr.run_job(
            _simple_job(tmp_path),
            on_output=lambda _: None,
            cancel_check=lambda: True,
        )
        assert rc == 1, f"Expected rc=1 on cancel, got {rc}"

        # Worker should be dead / cleared after cancel.
        with mgr._lock:
            w = mgr._worker
        assert w is None or not w.is_alive
    finally:
        mgr.shutdown()


# ---------------------------------------------------------------------------
# Engine.shutdown() integration
# ---------------------------------------------------------------------------

def test_engine_shutdown_calls_reset(tmp_path):
    """XttsPlugin.shutdown() must call _reset_warm_worker()."""
    from plugins.tts_xtts.plugin.core import implementation as impl
    from plugins.tts_xtts.plugin.server.engine import XttsPlugin

    impl._reset_warm_worker()
    plugin = XttsPlugin()

    reset_called = []
    original = impl._reset_warm_worker

    def _spy():
        reset_called.append(True)
        original()

    with patch("plugins.tts_xtts.plugin.core.implementation._reset_warm_worker", side_effect=_spy):
        plugin.shutdown()

    assert reset_called, "engine.shutdown() should have called _reset_warm_worker()"


# ---------------------------------------------------------------------------
# is_model_ready tracking
# ---------------------------------------------------------------------------

def test_is_model_ready_false_before_ready_line():
    """WarmWorker.is_model_ready is False when the 'model ready' line has not appeared."""
    mgr = _make_manager()
    # Acquire a worker without running a job (so no model-ready line is emitted)
    with mgr._lock:
        worker = mgr._get_or_spawn()
    assert not worker.is_model_ready


def test_is_model_ready_true_after_model_ready_line():
    """WarmWorker.is_model_ready becomes True when the worker emits 'model ready'."""
    mgr = _make_manager(extra_env={"FAKE_WORKER_EMIT_MODEL_READY": "1"})
    mgr.run_job({"task_id": "t1", "text": "hi"}, lambda _: None, lambda: False)
    worker = mgr._worker
    assert worker._model_ready.wait(timeout=2.0), "model-ready event never fired"
    assert worker.is_model_ready


def test_manager_is_model_ready_reflects_pool():
    """WarmWorkerManager.is_model_ready() is True when any pool worker is warm."""
    mgr = _make_manager(extra_env={"FAKE_WORKER_EMIT_MODEL_READY": "1"})
    mgr.run_job({"task_id": "t1", "text": "hi"}, lambda _: None, lambda: False)
    assert mgr._worker._model_ready.wait(timeout=2.0)
    assert mgr.is_model_ready()


def test_dead_worker_not_counted_as_model_ready():
    """Removing a dead worker from the pool means manager.is_model_ready() goes False."""
    mgr = _make_manager(extra_env={"FAKE_WORKER_EMIT_MODEL_READY": "1"})
    mgr.run_job({"task_id": "t1", "text": "hi"}, lambda _: None, lambda: False)
    worker = mgr._worker
    assert worker._model_ready.wait(timeout=2.0)
    assert mgr.is_model_ready()
    # Remove the worker from the pool
    with mgr._lock:
        mgr._remove_dead_worker(worker)
    assert not mgr.is_model_ready()
