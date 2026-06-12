"""
Thread-safety of _get_registry_manifests:
While thread A is blocked inside discovery, thread B must still get the
registry entries — not [] — because the recursion guard must be thread-local.

Pre-fix (module-global _IN_DISCOVERY): thread B returns [], list_tts_engines()
returns [], normalize_tts_engine('voxtral') returns '', causing the
'Voice requests must include engine_id' failure during mixed renders.
"""
import threading
from unittest.mock import patch, MagicMock

import pytest

from app.engines import voice_engines


def test_concurrent_discovery_thread_b_still_returns_registry():
    """
    While thread A holds the discovery lock (simulated via a blocking bridge),
    thread B's list_tts_engines() must return the manifests, not [].

    With the old module-global _IN_DISCOVERY flag, thread B would see the flag
    set and return []. With a thread-local, thread B runs its own discovery
    independently and returns the real list.
    """
    FAKE_MANIFESTS = [{"engine_id": "voxtral"}]

    # Event to signal that thread A has entered _get_registry_manifests
    a_started = threading.Event()
    # Event to let thread A finish after thread B has completed
    a_release = threading.Event()

    thread_b_result: list = []
    thread_a_exception: list = []

    def make_blocking_bridge():
        """Bridge factory for thread A — blocks until a_release is set."""
        bridge = MagicMock()

        def blocking_describe():
            a_started.set()
            a_release.wait(timeout=5)
            return FAKE_MANIFESTS

        bridge.describe_registry.side_effect = blocking_describe
        return bridge

    def make_fast_bridge():
        """Bridge factory for thread B — returns immediately."""
        bridge = MagicMock()
        bridge.describe_registry.return_value = FAKE_MANIFESTS
        return bridge

    # We use a thread-local to direct each thread to the right bridge factory.
    bridge_local = threading.local()

    def patched_create_bridge():
        if getattr(bridge_local, "is_slow", False):
            return make_blocking_bridge()
        return make_fast_bridge()

    def thread_a_fn():
        try:
            bridge_local.is_slow = True
            # Directly call _get_registry_manifests so thread A blocks inside it
            with patch("app.engines.bridge.create_voice_bridge", side_effect=patched_create_bridge):
                voice_engines._get_registry_manifests()
        except Exception as exc:
            thread_a_exception.append(exc)

    def thread_b_fn():
        # Wait until thread A is inside discovery before proceeding
        a_started.wait(timeout=5)
        try:
            bridge_local.is_slow = False
            with patch("app.engines.bridge.create_voice_bridge", side_effect=patched_create_bridge):
                result = voice_engines.list_tts_engines()
            thread_b_result.extend(result)
        finally:
            # Let thread A finish regardless of thread B's result
            a_release.set()

    ta = threading.Thread(target=thread_a_fn, daemon=True)
    tb = threading.Thread(target=thread_b_fn, daemon=True)

    ta.start()
    tb.start()
    tb.join(timeout=5)
    ta.join(timeout=5)

    assert not tb.is_alive(), "Thread B did not finish"
    assert not ta.is_alive(), "Thread A did not finish"
    assert not thread_a_exception, f"Thread A raised: {thread_a_exception}"

    # Thread B must return ['voxtral'], not [] — that's the contract.
    assert thread_b_result == ["voxtral"], (
        f"Expected ['voxtral'] from thread B but got {thread_b_result!r}. "
        "This indicates _IN_DISCOVERY is module-global (shared between threads) "
        "rather than thread-local."
    )
