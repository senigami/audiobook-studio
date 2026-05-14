"""Tests for TTS Server health aggregation."""

from __future__ import annotations

import pytest

from app.tts_server.health import (
    STATUS_NEEDS_SETUP,
    STATUS_READY,
    STATUS_UNVERIFIED,
    build_health_response,
    engine_status,
)


class _MockEngine:
    def __init__(self, env_ok=True):
        self._env_ok = env_ok

    def check_env(self):
        return self._env_ok, "OK" if self._env_ok else "Missing dependency"

    def info(self):
        return {}

    def settings_schema(self):
        return {}


class _MockPlugin:
    def __init__(self, engine_id="mock", env_ok=True, verified=False, deps_ok=True):
        self.engine_id = engine_id
        self.display_name = engine_id.upper()
        self.engine = _MockEngine(env_ok=env_ok)
        self.verified = verified
        self.verification_error = None
        self.manifest = {}
        self.dependencies_satisfied = deps_ok
        self.missing_dependencies = [] if deps_ok else ["missing-pkg"]
        self.folder_name = f"tts_{engine_id}"


class TestEngineStatus:
    def test_ready_when_env_ok_and_verified(self):
        plugin = _MockPlugin(env_ok=True, verified=True)
        assert engine_status(plugin) == STATUS_READY

    def test_unverified_when_env_ok_but_not_verified(self):
        plugin = _MockPlugin(env_ok=True, verified=False)
        assert engine_status(plugin) == STATUS_UNVERIFIED

    def test_needs_setup_when_env_fails(self):
        plugin = _MockPlugin(env_ok=False, verified=False)
        assert engine_status(plugin) == STATUS_NEEDS_SETUP

    def test_needs_setup_when_check_env_raises(self):
        class BrokenEngine:
            def check_env(self):
                raise RuntimeError("crash")

        plugin = _MockPlugin()
        plugin.engine = BrokenEngine()
        assert engine_status(plugin) == STATUS_NEEDS_SETUP


class TestBuildHealthResponse:
    def test_empty_plugin_list(self):
        result = build_health_response([])
        assert result["status"] == "ok"
        assert result["engines"] == []

    def test_all_ready(self):
        plugins = [
            _MockPlugin("eng1", env_ok=True, verified=True),
            _MockPlugin("eng2", env_ok=True, verified=True),
        ]
        result = build_health_response(plugins)
        assert result["status"] == "ok"
        assert len(result["engines"]) == 2

    def test_one_needs_setup_returns_degraded(self):
        plugins = [
            _MockPlugin("eng1", env_ok=True, verified=True),
            _MockPlugin("eng2", env_ok=False, verified=False),
        ]
        result = build_health_response(plugins)
        assert result["status"] == "degraded"

    def test_engine_fields_present(self):
        plugins = [_MockPlugin("mock", env_ok=True, verified=True)]
        result = build_health_response(plugins)
        engine = result["engines"][0]
        assert engine["engine_id"] == "mock"
        assert engine["status"] == STATUS_READY
        assert engine["verified"] is True
