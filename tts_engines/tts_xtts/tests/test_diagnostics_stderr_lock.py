"""Tests for tts_engines/tts_xtts/plugin/core/diagnostics.py's stderr write lock.

R1 revert-check: before the fix, emit_diagnostics called a bare
sys.stderr.write(line)/flush() with no lock — this test's concurrency
assertion fails on that code (interleaved output), and the shared-lock-object
assertion fails if engine.py ever reverts to its own separate lock instance.
"""
from __future__ import annotations

import threading

from tts_engines.tts_xtts.plugin.core.diagnostics import emit_diagnostics, emit_stderr_atomic


def test_emit_diagnostics_calls_on_output_and_tees_to_stderr(monkeypatch):
    written: list[str] = []
    monkeypatch.setattr(
        "tts_engines.tts_xtts.plugin.core.diagnostics.sys",
        type("_S", (), {"stderr": type("_F", (), {"write": lambda self, s: written.append(s), "flush": lambda self: None})()})(),
    )
    received: list[str] = []
    emit_diagnostics(received.append, "Launching XTTS inference...\n")

    assert received == ["Launching XTTS inference...\n"]
    assert written == ["Launching XTTS inference...\n"]


def test_engine_module_shares_the_same_lock_instance():
    """engine.py must reuse diagnostics.py's lock, not define its own — two
    separate locks would not serialize against each other, defeating the fix
    (the whole point is that engine.py's marker relay and diagnostics.py's
    tee-to-stderr write to the SAME process stderr and must share ONE lock)."""
    from tts_engines.tts_xtts.plugin.core import diagnostics as diag_module
    from tts_engines.tts_xtts.plugin.server import engine as engine_module

    # engine.py no longer defines its own lock at all.
    assert not hasattr(engine_module, "_STDERR_WRITE_LOCK"), (
        "engine.py must not define a separate stderr lock — it must import "
        "and reuse diagnostics.py's STDERR_WRITE_LOCK so both writers "
        "serialize against each other."
    )
    # And its _emit_stderr_atomic must route through diagnostics.py's locked
    # writer, not a bare print()/write().
    assert engine_module._emit_stderr_atomic_line is emit_stderr_atomic


def test_concurrent_emit_diagnostics_calls_never_interleave(monkeypatch):
    """Two threads calling emit_diagnostics concurrently must never produce a
    corrupted/merged physical line on the shared stderr."""

    class _SlowSplittingStream:
        def __init__(self):
            self.calls: list[str] = []

        def write(self, s: str) -> None:
            if not s:
                self.calls.append(s)
                return
            mid = max(1, len(s) // 2)
            self.calls.append(s[:mid])
            threading.Event().wait(0.005)
            self.calls.append(s[mid:])

        def flush(self) -> None:
            pass

    from tts_engines.tts_xtts.plugin.core import diagnostics as diag_module

    fake_stream = _SlowSplittingStream()
    monkeypatch.setattr(diag_module.sys, "stderr", fake_stream)

    line_a = "Launching XTTS inference for job A...\n"
    line_b = "Launching XTTS inference for job B...\n"
    barrier = threading.Barrier(2)

    def _emit(line: str) -> None:
        barrier.wait(timeout=5)
        emit_diagnostics(lambda _l: None, line)

    t1 = threading.Thread(target=_emit, args=(line_a,))
    t2 = threading.Thread(target=_emit, args=(line_b,))
    t1.start()
    t2.start()
    t1.join(timeout=5)
    t2.join(timeout=5)

    written = "".join(fake_stream.calls)
    lines = [ln + "\n" for ln in written.split("\n") if ln]
    assert sorted(lines) == sorted([line_a, line_b]), (
        f"Concurrent emit_diagnostics calls must never interleave. Raw output: {written!r}"
    )
