"""Issue #199: release must mirror the reserve that actually happened.

``reserve_task_resources`` and ``release_task_resources`` each used to read
``ENGINE_CLASS_ADMISSION`` independently.  When the toggle moved while a task
was in flight the two paths took different branches and the acquired slots were
never returned (``release()`` is idempotent, so nothing errored and nothing
logged).  These tests pin the symmetry: whatever reserve acquired, release
gives back, regardless of what the toggle says at release time.
"""
from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _clean_gates():
    from app.orchestration.scheduler import resources as res  # noqa: PLC0415

    def _reset():
        res._global_cap_gate.reset()
        res._exclusive_gate.reset()
        for sem in list(res._engine_semaphores.values()):
            sem.reset()
        for sem in list(res._engine_id_semaphores.values()):
            sem.reset()

    _reset()
    yield
    _reset()


def _claims(task_id: str) -> dict[str, object]:
    return {
        "task_id": task_id,
        "engine_class": "gpu",
        "engine_id": "tts_xtts",
        "gpu": True,
        "cap": 1,
    }


def test_release_returns_slots_when_toggle_disabled_mid_task(monkeypatch):
    """Reserve with admission ON, flip OFF, release → no slots left held."""
    from app.orchestration.scheduler.resources import (  # noqa: PLC0415
        get_engine_id_semaphore,
        get_engine_semaphore,
        release_task_resources,
        reserve_task_resources,
        _global_cap_gate,
    )

    monkeypatch.setenv("ENGINE_CLASS_ADMISSION", "1")
    claims = _claims("leak-1")
    result = reserve_task_resources(task_type="synthesis", resource_claims=claims)
    assert result["admitted"] is True

    monkeypatch.setenv("ENGINE_CLASS_ADMISSION", "0")
    release_task_resources(task_id="leak-1", resource_claims=claims)

    assert get_engine_semaphore("gpu", 1).active_count == 0
    assert get_engine_id_semaphore("tts_xtts", 1).active_count == 0
    assert _global_cap_gate.active_count == 0


def test_release_returns_exclusive_gate_when_toggle_enabled_mid_task(monkeypatch):
    """Mirror case: reserve with admission OFF, flip ON, release → gate free."""
    from app.orchestration.scheduler.resources import (  # noqa: PLC0415
        _exclusive_gate,
        release_task_resources,
        reserve_task_resources,
    )

    monkeypatch.setenv("ENGINE_CLASS_ADMISSION", "0")
    claims = _claims("leak-2")
    result = reserve_task_resources(task_type="synthesis", resource_claims=claims)
    assert result["admitted"] is True

    monkeypatch.setenv("ENGINE_CLASS_ADMISSION", "1")
    release_task_resources(task_id="leak-2", resource_claims=claims)

    assert _exclusive_gate.active_task_id is None


def test_next_task_is_admitted_after_toggle_flip_release(monkeypatch):
    """The user-visible consequence: the queue keeps admitting."""
    from app.orchestration.scheduler.resources import (  # noqa: PLC0415
        release_task_resources,
        reserve_task_resources,
    )

    monkeypatch.setenv("ENGINE_CLASS_ADMISSION", "1")
    first = _claims("flip-1")
    assert reserve_task_resources(task_type="synthesis", resource_claims=first)["admitted"] is True

    monkeypatch.setenv("ENGINE_CLASS_ADMISSION", "0")
    release_task_resources(task_id="flip-1", resource_claims=first)

    monkeypatch.setenv("ENGINE_CLASS_ADMISSION", "1")
    second = _claims("flip-2")
    assert reserve_task_resources(task_type="synthesis", resource_claims=second)["admitted"] is True, (
        "A slot leaked across the toggle flip: the engine-class semaphore is "
        "still holding the released task."
    )
