"""Issue #250: changing tts_parallel_cap through the real settings route must
gate/ungate admission on the very next attempt, with no server restart."""
from __future__ import annotations

import pytest

from app.orchestration.scheduler import resources as res


@pytest.fixture(autouse=True)
def _fresh_semaphores(monkeypatch):
    monkeypatch.setenv("ENGINE_CLASS_ADMISSION", "1")
    res._engine_semaphores.clear()
    res._engine_id_semaphores.clear()
    yield
    res._engine_semaphores.clear()
    res._engine_id_semaphores.clear()


def _claim(task_id: str) -> dict:
    return {
        "gpu": True, "vram_mb": 0, "cpu_heavy": False, "exclusive": False,
        "engine_class": "gpu", "engine_id": "tts_fake",
        "cap": 4, "manifest_max": 4, "task_id": task_id,
    }


def _set_cap(client, value: int) -> None:
    resp = client.post("/api/settings", json={"tts_parallel_cap": value})
    assert resp.status_code == 200
    assert resp.json()["settings"]["tts_parallel_cap"] == value


def _admit(task_id: str):
    claim = _claim(task_id)
    return claim, res.reserve_task_resources(task_type="synthesis", resource_claims=claim)["admitted"]


def test_lowering_cap_via_settings_route_blocks_next_admission_without_evicting(clean_db, client):
    _set_cap(client, 4)
    held = []
    for i in range(3):
        claim, ok = _admit(f"run-{i}")
        assert ok is True
        held.append(claim)

    _set_cap(client, 2)  # three already running, over the new limit

    late = _claim("late")
    assert res.reserve_task_resources(task_type="synthesis", resource_claims=late)["admitted"] is False, (
        "new admission must honor the lowered cap immediately"
    )
    assert res.get_engine_semaphore("gpu", 4).active_count == 3, "in-flight work is not evicted"

    # Draining back under the new limit re-opens admission, still no restart.
    res.release_task_resources(task_id="run-0", resource_claims=held[0])
    res.release_task_resources(task_id="run-1", resource_claims=held[1])
    # "late" is still the FIFO waiter, so it is the one admitted once under the limit.
    assert res.reserve_task_resources(task_type="synthesis", resource_claims=late)["admitted"] is True
    for c in held[2:] + [late]:
        res.release_task_resources(task_id=c["task_id"], resource_claims=c)


def test_raising_cap_via_settings_route_admits_the_queued_task_next_attempt(clean_db, client):
    _set_cap(client, 1)
    first, ok = _admit("first")
    assert ok is True
    queued = _claim("queued")
    assert res.reserve_task_resources(task_type="synthesis", resource_claims=queued)["admitted"] is False

    _set_cap(client, 3)

    # The orchestrator's wait loop re-calls reserve with the same claim.
    assert res.reserve_task_resources(task_type="synthesis", resource_claims=queued)["admitted"] is True
    for c in (first, queued):
        res.release_task_resources(task_id=c["task_id"], resource_claims=c)
