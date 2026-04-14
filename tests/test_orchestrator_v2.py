"""Tests for the scheduler priority policies (Phase 5)."""

from __future__ import annotations

import time

import pytest

from app.orchestration.scheduler.policies import (
    API_FIRST,
    EQUAL,
    STUDIO_FIRST,
    choose_next_task,
    get_priority_mode,
)
from app.orchestration.tasks.base import TaskContext


def _make_ctx(task_id="t1", source="ui", submitted_at=None) -> TaskContext:
    ctx = TaskContext(
        task_id=task_id,
        task_type="synthesis",
        source=source,
        submitted_at=submitted_at or time.monotonic(),
    )
    return ctx


class TestGetPriorityMode:
    def test_default_is_studio_first(self, monkeypatch):
        monkeypatch.delenv("TTS_API_PRIORITY", raising=False)
        assert get_priority_mode() == STUDIO_FIRST

    def test_envvar_studio_first(self, monkeypatch):
        monkeypatch.setenv("TTS_API_PRIORITY", "studio_first")
        assert get_priority_mode() == STUDIO_FIRST

    def test_envvar_equal(self, monkeypatch):
        monkeypatch.setenv("TTS_API_PRIORITY", "equal")
        assert get_priority_mode() == EQUAL

    def test_envvar_api_first(self, monkeypatch):
        monkeypatch.setenv("TTS_API_PRIORITY", "api_first")
        assert get_priority_mode() == API_FIRST

    def test_invalid_envvar_falls_back_to_studio_first(self, monkeypatch):
        monkeypatch.setenv("TTS_API_PRIORITY", "invalid_mode")
        assert get_priority_mode() == STUDIO_FIRST


class TestChooseNextTask:
    def test_empty_queue_returns_none(self):
        assert choose_next_task(queued_tasks=[]) is None

    def test_single_task_returned(self, monkeypatch):
        monkeypatch.setenv("TTS_API_PRIORITY", "studio_first")
        ctx = _make_ctx("t1")
        result = choose_next_task(queued_tasks=[ctx])
        assert result is ctx

    def test_studio_first_prefers_studio_task(self, monkeypatch):
        monkeypatch.setenv("TTS_API_PRIORITY", "studio_first")
        t = time.monotonic()
        api_task = _make_ctx("api1", source="api", submitted_at=t)
        studio_task = _make_ctx("studio1", source="ui", submitted_at=t + 1)
        # API task was submitted first, but studio_first mode should pick studio task.
        result = choose_next_task(queued_tasks=[api_task, studio_task])
        assert result is studio_task

    def test_api_first_prefers_api_task(self, monkeypatch):
        monkeypatch.setenv("TTS_API_PRIORITY", "api_first")
        t = time.monotonic()
        api_task = _make_ctx("api1", source="api", submitted_at=t + 1)
        studio_task = _make_ctx("studio1", source="ui", submitted_at=t)
        result = choose_next_task(queued_tasks=[api_task, studio_task])
        assert result is api_task

    def test_equal_respects_fifo_order(self, monkeypatch):
        monkeypatch.setenv("TTS_API_PRIORITY", "equal")
        t = time.monotonic()
        api_task = _make_ctx("api1", source="api", submitted_at=t)
        studio_task = _make_ctx("studio1", source="ui", submitted_at=t + 1)
        # API submitted first — EQUAL mode picks it first.
        result = choose_next_task(queued_tasks=[api_task, studio_task])
        assert result is api_task

    def test_studio_first_fifo_within_bucket(self, monkeypatch):
        monkeypatch.setenv("TTS_API_PRIORITY", "studio_first")
        t = time.monotonic()
        s1 = _make_ctx("s1", source="ui", submitted_at=t)
        s2 = _make_ctx("s2", source="ui", submitted_at=t + 1)
        result = choose_next_task(queued_tasks=[s2, s1])
        assert result is s1  # earlier submission wins
