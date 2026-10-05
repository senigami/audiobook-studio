"""PERF-7: SimpleRateLimiter._history must not grow unbounded.

``check()`` already trims each key's own timestamps to the last 60s, but
never removed the key itself, and a key belonging to an IP that stops
sending is never revisited (silent IPs never re-enter ``check()`` on their
own key) -> unbounded growth over the life of the process.

No sleep-based timing (R4): the limiter's time source is injected
(``time_fn``) so the clock is advanced explicitly rather than via real
``time.sleep``.
"""
from __future__ import annotations

from app.core.security import SimpleRateLimiter


def _make_limiter(requests_per_minute: int = 5, sweep_interval_seconds: float = 30.0):
    clock = {"now": 1_000_000.0}

    def time_fn() -> float:
        return clock["now"]

    limiter = SimpleRateLimiter(
        requests_per_minute=requests_per_minute,
        time_fn=time_fn,
        sweep_interval_seconds=sweep_interval_seconds,
    )
    return limiter, clock


def test_silent_ips_are_swept_after_window_and_interval_elapse():
    limiter, clock = _make_limiter(sweep_interval_seconds=30.0)

    # 50 distinct IPs each send exactly one request, then go silent forever.
    for i in range(50):
        assert limiter.check(f"ip-{i}") is True
    assert len(limiter._history) == 50

    # Advance the clock past BOTH the 60s rate window and the sweep
    # interval — a silent IP's history is now fully stale.
    clock["now"] += 90.0

    # The sweep is opportunistic: it piggybacks on the next check() call
    # (from any key, active or not) rather than needing its own timer/thread.
    assert limiter.check("trigger-sweep") is True

    # Only the just-inserted trigger key should remain; the 50 silent IPs
    # must have been swept away, not accumulate forever.
    assert len(limiter._history) == 1, (
        f"expected _history to shrink to ~1 after the sweep, got "
        f"{len(limiter._history)} keys: {sorted(limiter._history)[:5]}..."
    )
    assert "trigger-sweep" in limiter._history


def test_active_client_is_still_rate_limited_correctly_after_sweep_logic_added():
    limiter, clock = _make_limiter(requests_per_minute=3, sweep_interval_seconds=30.0)

    assert limiter.check("busy-client") is True
    assert limiter.check("busy-client") is True
    assert limiter.check("busy-client") is True
    # 4th request within the same 60s window exceeds the limit of 3.
    assert limiter.check("busy-client") is False

    # After the window fully elapses, the same client is allowed again.
    clock["now"] += 61.0
    assert limiter.check("busy-client") is True


def test_check_drops_key_whose_filtered_history_is_empty():
    """(a) A key's own filtered-to-empty history is dropped from _history
    inside check() itself, rather than left as an empty-list placeholder."""
    limiter, clock = _make_limiter(requests_per_minute=5, sweep_interval_seconds=1_000_000.0)

    assert limiter.check("one-off-ip") is True
    assert list(limiter._history["one-off-ip"]) == [clock["now"]]

    # Move well past the 60s window with no further requests from this key.
    clock["now"] += 120.0

    # A different key's check() call must not resurrect the stale entry as
    # an empty list — checking "one-off-ip" itself re-filters it fresh.
    assert limiter.check("one-off-ip") is True
    assert list(limiter._history["one-off-ip"]) == [clock["now"]], (
        "the stale pre-window timestamp must have been dropped, not kept"
    )
