"""COR-B-4: `_cancelled_tasks` must not grow unboundedly across server uptime.

Prior to this fix, `_cancelled_tasks` was a bare set discarded ONLY in the
`/synthesize` finally block for a matching `task_id`. A task cancelled but
never synthesized (a fan-out child cancelled before its own `/synthesize`
runs, or a job cancelled while still queued) left a permanent entry with no
eviction path — unbounded growth over server uptime.

R4 (no sleep-based timing): the clock is injected by monkeypatching
`server.time.monotonic`, never a real sleep.
"""
from __future__ import annotations

import app.tts_server.server as server


def test_cancelled_tasks_bounded_by_ttl_sweep(monkeypatch):
    """Many cancellations that are never followed by /synthesize must
    eventually be swept once they age past the TTL; a recent cancellation
    must still be reported cancelled.

    R1 revert-check: pre-fix, `_cancelled_tasks` is a bare set with no sweep
    at all — the 50 stale entries below are never evicted, so the bounded-
    size assertion fails (set keeps growing forever).
    """
    server._cancelled_tasks.clear()

    fake_now = {"t": 1000.0}
    monkeypatch.setattr(server.time, "monotonic", lambda: fake_now["t"])

    # 50 cancellations that are never followed by a /synthesize call — the
    # exact "queued job cancelled" / "fan-out child cancelled pre-dispatch"
    # scenario that previously left permanent entries.
    for i in range(50):
        server.cancel_task(f"stale-task-{i}")

    # A cancellation shortly before the TTL threshold — must survive.
    fake_now["t"] = 1000.0 + server._CANCELLED_TASK_TTL_SECONDS - 1.0
    server.cancel_task("recent-task")
    assert server._is_task_cancelled("recent-task") is True

    # Advance well past the TTL and trigger another cancellation (the sweep
    # point) — the 50 stale entries must now be gone.
    fake_now["t"] = 1000.0 + server._CANCELLED_TASK_TTL_SECONDS + 60.0
    server.cancel_task("trigger-sweep")

    assert set(server._cancelled_tasks.keys()) == {"recent-task", "trigger-sweep"}, (
        f"expected only the two recent entries to survive the sweep, got: "
        f"{sorted(server._cancelled_tasks.keys())}"
    )
    assert server._is_task_cancelled("recent-task") is True
    assert server._is_task_cancelled("trigger-sweep") is True
    assert server._is_task_cancelled("stale-task-0") is False
    assert server._is_task_cancelled("stale-task-49") is False


def test_normal_cancel_then_synthesize_flow_is_unaffected(monkeypatch, tmp_path):
    """The existing cancel -> /synthesize -> discard flow must keep working:
    `_is_task_cancelled` reports True right after `cancel_task`, and the
    `/synthesize` finally block's `_cancelled_tasks.pop(...)` still clears it
    (unaffected by storing a timestamp instead of a bare marker).
    """
    server._cancelled_tasks.clear()
    monkeypatch.setattr(server.time, "monotonic", lambda: 5000.0)

    server.cancel_task("normal-task")
    assert server._is_task_cancelled("normal-task") is True

    with server._state_lock:
        server._cancelled_tasks.pop("normal-task", None)

    assert server._is_task_cancelled("normal-task") is False
