"""Tests for the remote registry short-TTL cache in load_engine_registry."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

import app.engines.registry as registry_module
from app.engines.registry import load_engine_registry


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_fake_remote() -> dict:
    """Return a non-empty dict that load_engine_registry treats as a remote hit."""
    reg = MagicMock()
    return {"fake_engine": reg}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def reset_cache():
    """Ensure each test starts with a clean cache state."""
    load_engine_registry.cache_clear()
    yield
    load_engine_registry.cache_clear()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_two_calls_within_ttl_fetch_once():
    """Two consecutive calls within the TTL should only call _load_tts_server_registry once."""
    fake_remote = _make_fake_remote()
    call_count = 0

    def fake_fetch():
        nonlocal call_count
        call_count += 1
        return fake_remote

    with patch.object(registry_module, "_load_tts_server_registry", side_effect=fake_fetch):
        result1 = load_engine_registry()
        result2 = load_engine_registry()

    assert call_count == 1, f"Expected 1 fetch, got {call_count}"
    assert result1 is result2


def test_cache_clear_causes_refetch():
    """After cache_clear, the next call should fetch again."""
    fake_remote = _make_fake_remote()
    call_count = 0

    def fake_fetch():
        nonlocal call_count
        call_count += 1
        return fake_remote

    with patch.object(registry_module, "_load_tts_server_registry", side_effect=fake_fetch):
        load_engine_registry()
        assert call_count == 1

        load_engine_registry.cache_clear()

        load_engine_registry()
        assert call_count == 2, f"Expected 2 fetches after cache_clear, got {call_count}"


def test_expired_ttl_causes_refetch(monkeypatch):
    """When the cached entry is older than TTL, the next call should refetch."""
    fake_remote = _make_fake_remote()
    call_count = 0

    def fake_fetch():
        nonlocal call_count
        call_count += 1
        return fake_remote

    with patch.object(registry_module, "_load_tts_server_registry", side_effect=fake_fetch):
        load_engine_registry()
        assert call_count == 1

        # Wind the clock forward past the TTL
        import time
        original_monotonic = time.monotonic
        monkeypatch.setattr(
            registry_module.time,
            "monotonic",
            lambda: original_monotonic() + registry_module._REMOTE_CACHE_TTL + 1,
        )

        load_engine_registry()
        assert call_count == 2, f"Expected refetch after TTL expiry, got {call_count}"


def test_empty_remote_still_cached():
    """An empty remote result (TTS server unavailable) is cached to avoid hammering."""
    call_count = 0

    def fake_fetch():
        nonlocal call_count
        call_count += 1
        return {}

    with patch.object(registry_module, "_load_tts_server_registry", side_effect=fake_fetch), \
         patch.object(registry_module, "_load_local_registry", return_value={}):
        load_engine_registry()
        load_engine_registry()

    assert call_count == 1, f"Expected empty remote to be cached; got {call_count} fetches"
