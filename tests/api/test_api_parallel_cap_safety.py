"""Save-time refusal of unsafe parallel-render caps, on both write paths (#251)."""
from __future__ import annotations

import logging
import re

import pytest

from app.db.state import get_settings, update_settings

MAC = {
    "cpu_pct": 5.0,
    "ram_used_gb": 11720 / 1024,
    "ram_total_gb": 24576 / 1024,
    "ram_available_gb": 10934 / 1024,
    "vram_used_gb": None,
    "vram_total_gb": None,
}
AMPLE = {**MAC, "ram_total_gb": 131072 / 1024, "ram_available_gb": 120000 / 1024}
LOW = {**MAC, "ram_available_gb": 3000 / 1024}
UNMEASURABLE = {**MAC, "ram_available_gb": None}

REFUSAL_MESSAGE_AT_1 = (
    "Your change was not saved. Studio estimates this computer can render up to 1 at once right now. "
    "Lower the number, or close other apps and try again."
)
INVALID_CAP_MESSAGE = (
    "Your change was not saved because the value was not a whole number. "
    "Enter a whole number, such as 1 or 2."
)


@pytest.fixture
def machine(monkeypatch, clean_db):
    """Patch the memory sampler (a boundary). Set machine['sample'] to change the machine."""
    state = {"sample": MAC}
    monkeypatch.setattr("app.api.routers.cap_guard.sample_resources", lambda: dict(state["sample"]))
    keys = ("tts_parallel_cap", "tts_engine_caps", "safe_mode", "enabled_plugins")
    before = {key: get_settings().get(key) for key in keys}
    update_settings({"tts_parallel_cap": 2, "tts_engine_caps": {}, "safe_mode": False})
    yield state
    # Settings outlive the test db fixture; leave them as found for later tests.
    update_settings({key: value for key, value in before.items() if value is not None})


def _xtts_violation(setting, requested, basis="memory", safe_maximum=1):
    return {"setting": setting, "engine": "xtts", "requested": requested,
            "safe_maximum": safe_maximum, "basis": basis}


@pytest.mark.parametrize("requested", [3, 4])
def test_post_global_above_safe_max_is_refused_and_saves_nothing(client, machine, requested, caplog):
    with caplog.at_level(logging.WARNING):
        resp = client.post("/api/settings", json={"tts_parallel_cap": requested})
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail["code"] == "parallel_cap_unsafe"
    assert detail["message"] == REFUSAL_MESSAGE_AT_1
    assert detail["violations"] == [_xtts_violation("tts_parallel_cap", requested)]
    assert re.fullmatch(r"[0-9a-f]{12}", detail["correlation_id"])
    assert sum(detail["correlation_id"] in r.getMessage() for r in caplog.records) == 1
    assert get_settings()["tts_parallel_cap"] == 2


def test_refusal_is_atomic_an_unrelated_field_in_the_same_post_is_not_applied(client, machine):
    resp = client.post("/api/settings", json={"tts_parallel_cap": 4, "safe_mode": True})
    assert resp.status_code == 422
    assert get_settings()["safe_mode"] is False
    assert get_settings()["tts_parallel_cap"] == 2


def test_post_engine_override_above_safe_max_is_refused(client, machine):
    resp = client.post("/api/settings", json={"tts_engine_caps": {"xtts": 4}})
    assert resp.status_code == 422
    assert resp.json()["detail"]["violations"] == [_xtts_violation("tts_engine_caps", 4)]
    assert get_settings()["tts_engine_caps"] == {}


def test_string_value_cannot_escape_the_check(client, machine):
    resp = client.post("/api/settings", json={"tts_engine_caps": {"xtts": "8"}})
    assert resp.status_code == 422
    assert resp.json()["detail"]["violations"] == [_xtts_violation("tts_engine_caps", 8)]


def test_put_concurrency_is_guarded_too_no_bypass(client, machine):
    resp = client.put("/api/engines/xtts/concurrency", json={"cap": 4})
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail["code"] == "parallel_cap_unsafe"
    assert detail["violations"] == [_xtts_violation("tts_engine_caps", 4)]
    assert get_settings()["tts_engine_caps"] == {}


def test_put_concurrency_cap_1_is_always_allowed(client, machine):
    resp = client.put("/api/engines/xtts/concurrency", json={"cap": 1})
    assert resp.status_code == 200
    assert get_settings()["tts_engine_caps"] == {"xtts": 1}


def test_cap_1_and_unrelated_saves_never_lock_the_user_out_when_memory_is_tight(client, machine):
    machine["sample"] = LOW
    assert client.post("/api/settings", json={"tts_parallel_cap": 1}).status_code == 200
    assert client.post("/api/settings", json={"tts_engine_caps": {"xtts": 1}}).status_code == 200
    assert client.put("/api/engines/xtts/concurrency", json={"cap": 1}).status_code == 200
    # Effective cap is already above the safe maximum; an unrelated save must still work.
    update_settings({"tts_parallel_cap": 2, "tts_engine_caps": {}})
    assert client.post("/api/settings", json={"safe_mode": True}).status_code == 200
    assert client.post("/api/settings", json={"tts_parallel_cap": 2}).status_code == 200


def test_every_registered_engine_is_checked_even_when_disabled(client, machine):
    update_settings({"enabled_plugins": {"xtts": False, "voxtral": True}})
    resp = client.post("/api/settings", json={"tts_parallel_cap": 8})
    assert resp.status_code == 422
    assert resp.json()["detail"]["violations"] == [_xtts_violation("tts_parallel_cap", 8)]


def test_removing_an_override_that_re_exposes_the_global_is_refused(client, machine):
    machine["sample"] = AMPLE
    assert client.post("/api/settings", json={"tts_parallel_cap": 8}).status_code == 200
    assert client.put("/api/engines/xtts/concurrency", json={"cap": 1}).status_code == 200
    machine["sample"] = MAC
    resp = client.put("/api/engines/xtts/concurrency", json={"cap": None})
    assert resp.status_code == 422
    assert resp.json()["detail"]["violations"] == [_xtts_violation("tts_parallel_cap", 8)]
    assert get_settings()["tts_engine_caps"] == {"xtts": 1}


def test_lowering_is_allowed_when_memory_is_tighter_than_the_saved_value(client, machine):
    machine["sample"] = AMPLE
    assert client.post("/api/settings", json={"tts_parallel_cap": 4}).status_code == 200
    machine["sample"] = MAC
    resp = client.post("/api/settings", json={"tts_parallel_cap": 2})
    assert resp.status_code == 200
    assert get_settings()["tts_parallel_cap"] == 2


def test_unmeasurable_memory_refuses_a_raise_and_allows_1(client, machine):
    machine["sample"] = UNMEASURABLE
    resp = client.post("/api/settings", json={"tts_parallel_cap": 3})
    assert resp.status_code == 422
    assert resp.json()["detail"]["violations"] == [_xtts_violation("tts_parallel_cap", 3, basis="unmeasurable")]
    assert client.post("/api/settings", json={"tts_parallel_cap": 1}).status_code == 200


def test_voxtral_override_of_1_is_allowed(client, machine):
    assert client.post("/api/settings", json={"tts_engine_caps": {"voxtral": 1}}).status_code == 200


def _no_engines_known(monkeypatch):
    monkeypatch.setattr("app.engines.registry.load_engine_registry", lambda: {})
    monkeypatch.setattr("app.api.routers.cap_guard.local_engine_ids", lambda: [])


def test_raising_with_no_engine_information_fails_closed_with_503(client, machine, monkeypatch):
    _no_engines_known(monkeypatch)
    resp = client.post("/api/settings", json={"tts_parallel_cap": 3})
    assert resp.status_code == 503
    assert get_settings()["tts_parallel_cap"] == 2
    assert client.put("/api/engines/xtts/concurrency", json={"cap": 4}).status_code == 503
    assert get_settings()["tts_engine_caps"] == {}


def test_lowering_works_when_the_server_registry_is_empty(client, machine, monkeypatch):
    update_settings({"tts_parallel_cap": 4})
    monkeypatch.setattr("app.engines.registry.load_engine_registry", lambda: {})
    assert client.post("/api/settings", json={"tts_parallel_cap": 1}).status_code == 200
    assert get_settings()["tts_parallel_cap"] == 1
    assert client.put("/api/engines/xtts/concurrency", json={"cap": 1}).status_code == 200


def test_lowering_works_even_when_no_engine_is_known_at_all(client, machine, monkeypatch):
    update_settings({"tts_parallel_cap": 4})
    _no_engines_known(monkeypatch)
    assert client.post("/api/settings", json={"tts_parallel_cap": 1}).status_code == 200
    assert get_settings()["tts_parallel_cap"] == 1
    assert client.put("/api/engines/xtts/concurrency", json={"cap": 1}).status_code == 200
    assert client.post("/api/settings", json={"safe_mode": True}).status_code == 200


def test_a_plugin_on_disk_but_missing_from_the_server_registry_is_still_checked(client, machine, monkeypatch):
    monkeypatch.setattr("app.engines.registry.load_engine_registry", lambda: {"voxtral": object()})
    put = client.put("/api/engines/xtts/concurrency", json={"cap": 8})
    assert put.status_code == 422
    assert put.json()["detail"]["violations"] == [_xtts_violation("tts_engine_caps", 8)]
    post = client.post("/api/settings", json={"tts_parallel_cap": 8})
    assert post.status_code == 422
    assert get_settings()["tts_engine_caps"] == {}
    assert get_settings()["tts_parallel_cap"] == 2


def test_concurrent_safe_saves_cannot_combine_into_an_unsafe_cap(client, machine, monkeypatch):
    import threading

    from app.orchestration.scheduler.cap_settings import get_engine_caps, resolve_effective_cap

    sample = {**MAC, "ram_available_gb": 16000 / 1024}  # XTTS safe maximum is 2
    update_settings({"tts_parallel_cap": 2, "tts_engine_caps": {"xtts": 1}})
    barrier = threading.Barrier(2)

    def sampler():
        try:
            barrier.wait(timeout=1.5)  # both checks in flight before either writes, if nothing serializes them
        except threading.BrokenBarrierError:
            pass
        return dict(sample)

    monkeypatch.setattr("app.api.routers.cap_guard.sample_resources", sampler)
    results = {}
    threads = [
        threading.Thread(target=lambda: results.update(a=client.post("/api/settings", json={"tts_parallel_cap": 8}))),
        threading.Thread(target=lambda: results.update(b=client.put("/api/engines/xtts/concurrency", json={"cap": None}))),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=20)
    assert {results["a"].status_code, results["b"].status_code} == {200, 422}
    stored = get_settings()
    assert resolve_effective_cap(engine_id="xtts", manifest_max=8, settings=stored) <= 2
    assert get_engine_caps(stored) in ({"xtts": 1}, {})


def test_get_concurrency_reports_safe_maxima_matching_the_refusal(client, machine):
    body = client.get("/api/engines/concurrency").json()
    by_id = {e["engine_id"]: e for e in body["engines"]}
    assert by_id["xtts"]["safe_max"] == 1
    assert by_id["voxtral"]["safe_max"] == 1
    assert body["global_safe_max"] == 1
    assert body["memory_measurable"] is True
    refusal = client.post("/api/settings", json={"tts_parallel_cap": 3}).json()["detail"]
    assert refusal["violations"][0]["safe_maximum"] == by_id["xtts"]["safe_max"]


def test_get_concurrency_on_a_big_machine_and_with_unmeasurable_memory(client, machine):
    machine["sample"] = AMPLE
    big = client.get("/api/engines/concurrency").json()
    assert {e["engine_id"]: e["safe_max"] for e in big["engines"]}["xtts"] == 8
    assert big["global_safe_max"] == 8
    machine["sample"] = UNMEASURABLE
    unknown = client.get("/api/engines/concurrency").json()
    assert unknown["memory_measurable"] is False
    assert {e["engine_id"]: e["safe_max"] for e in unknown["engines"]}["xtts"] == 1


@pytest.mark.parametrize(
    "payload",
    [
        {"tts_parallel_cap": "abc"},
        {"tts_parallel_cap": None},
        {"tts_engine_caps": {"xtts": "abc"}},
        {"tts_parallel_cap": "abc", "safe_mode": True},
    ],
)
def test_non_numeric_cap_is_refused_with_invalid_cap_and_saves_nothing(client, machine, payload, caplog):
    with caplog.at_level(logging.WARNING):
        resp = client.post("/api/settings", json=payload)
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert set(detail) == {"code", "message", "correlation_id"}
    assert detail["code"] == "invalid_cap"
    assert detail["message"] == INVALID_CAP_MESSAGE
    assert "abc" not in resp.text
    assert re.fullmatch(r"[0-9a-f]{12}", detail["correlation_id"])
    assert sum(detail["correlation_id"] in r.getMessage() for r in caplog.records) == 1
    stored = get_settings()
    assert stored["tts_parallel_cap"] == 2
    assert stored["tts_engine_caps"] == {}
    assert stored["safe_mode"] is False


@pytest.mark.parametrize(
    "raw_body",
    [
        b'{"tts_parallel_cap": Infinity}',
        b'{"tts_parallel_cap": 1e400}',
        b'{"safe_mode": true, "tts_engine_caps": {"xtts": Infinity}}',
        b'{"safe_mode": true, "tts_engine_caps": {"xtts": 1e400}}',
    ],
)
def test_overflowing_cap_is_refused_with_invalid_cap_and_saves_nothing(client, machine, raw_body):
    resp = client.post("/api/settings", content=raw_body, headers={"content-type": "application/json"})
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "invalid_cap"
    assert get_settings()["safe_mode"] is False
    assert get_settings()["tts_parallel_cap"] == 2


def test_null_engine_cap_clears_that_override_as_before(client, machine):
    from app.orchestration.scheduler.cap_settings import get_engine_caps

    machine["sample"] = AMPLE
    update_settings({"tts_engine_caps": {"xtts": 1}})
    resp = client.post("/api/settings", json={"tts_engine_caps": {"xtts": None}})
    assert resp.status_code == 200
    assert get_engine_caps(get_settings()) == {}


def test_a_global_raise_is_checked_against_every_engine_not_only_those_named(client, machine):
    # voxtral (named, safe at 1) is not the engine that goes unsafe; xtts inherits the new global.
    update_settings({"tts_engine_caps": {"voxtral": 1}})
    for body in (
        {"tts_parallel_cap": 4},
        {"tts_parallel_cap": 4, "tts_engine_caps": {"voxtral": 1}},
    ):
        resp = client.post("/api/settings", json=body)
        assert resp.status_code == 422
        assert resp.json()["detail"]["violations"] == [_xtts_violation("tts_parallel_cap", 4)]
    assert get_settings()["tts_parallel_cap"] == 2


def test_an_unexpected_failure_inside_the_guard_never_results_in_a_save(client, machine, monkeypatch):
    def broken_sampler():
        raise RuntimeError("sampler exploded")

    monkeypatch.setattr("app.api.routers.cap_guard.sample_resources", broken_sampler)
    try:
        resp = client.post("/api/settings", json={"tts_parallel_cap": 3, "safe_mode": True})
        assert resp.status_code >= 500
    except RuntimeError:
        pass  # the test client re-raises server errors; either way nothing may be saved
    assert get_settings()["tts_parallel_cap"] == 2
    assert get_settings()["safe_mode"] is False


def test_null_engine_cap_cannot_fall_back_to_an_unsafe_env_override(client, machine, monkeypatch):
    monkeypatch.setenv("TTS_ENGINE_CAPS", '{"xtts": 8}')
    update_settings({"tts_parallel_cap": 1, "tts_engine_caps": {"xtts": 1}})
    resp = client.post("/api/settings", json={"tts_engine_caps": {"xtts": None}})
    assert resp.status_code == 422
    assert resp.json()["detail"]["violations"] == [_xtts_violation("tts_engine_caps", 8)]
    assert get_settings()["tts_engine_caps"] == {"xtts": 1}


def test_put_null_cap_cannot_fall_back_to_an_unsafe_env_override(client, machine, monkeypatch):
    monkeypatch.setenv("TTS_ENGINE_CAPS", '{"xtts": 8}')
    update_settings({"tts_parallel_cap": 1, "tts_engine_caps": {"xtts": 1}})
    resp = client.put("/api/engines/xtts/concurrency", json={"cap": None})
    assert resp.status_code == 422
    assert get_settings()["tts_engine_caps"] == {"xtts": 1}


def test_a_stray_plugin_folder_is_not_a_checked_phantom_engine(machine, monkeypatch, tmp_path):
    from app.api.routers import cap_guard

    for name in ("tts_alpha", "tts_alpha_old", "tts_Bad", "notaplugin"):
        (tmp_path / name).mkdir()
        (tmp_path / name / "manifest.json").write_text("{}", encoding="utf-8")
    (tmp_path / "tts_nomanifest").mkdir()
    monkeypatch.setattr("app.core.config.PLUGINS_DIR", tmp_path)
    assert cap_guard.local_engine_ids() == ["alpha"]


def test_the_check_still_works_from_local_manifests_when_the_registry_raises(client, machine, monkeypatch):
    def boom():
        raise RuntimeError("server unreachable")

    monkeypatch.setattr("app.engines.registry.load_engine_registry", boom)
    resp = client.post("/api/settings", json={"tts_parallel_cap": 4})
    assert resp.status_code == 422
    assert resp.json()["detail"]["violations"] == [_xtts_violation("tts_parallel_cap", 4)]
    assert client.post("/api/settings", json={"tts_parallel_cap": 1}).status_code == 200


def test_a_save_waiting_on_the_cap_lock_does_not_block_the_event_loop(machine):
    import asyncio
    import threading
    import time

    import httpx

    from app.api.routers import cap_guard
    from app.api.web import app as fastapi_app

    holder_has_lock = threading.Event()
    release = threading.Event()

    def hold_lock():
        with cap_guard.cap_write_lock:
            holder_has_lock.set()
            release.wait(timeout=10)

    async def scenario():
        holder = threading.Thread(target=hold_lock)
        holder.start()
        assert holder_has_lock.wait(timeout=5)
        worst_gap = 0.0
        stop = False

        async def ticker():
            nonlocal worst_gap
            last = time.monotonic()
            while not stop:
                await asyncio.sleep(0.02)
                now = time.monotonic()
                worst_gap = max(worst_gap, now - last)
                last = now

        tick = asyncio.create_task(ticker())
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=fastapi_app), base_url="http://t") as ac:
            post = asyncio.create_task(ac.post("/api/settings", json={"tts_parallel_cap": 1}))
            await asyncio.sleep(0.8)  # the save is now waiting on the lock
            release.set()
            resp = await post
        stop = True
        await tick
        holder.join(timeout=5)
        return resp.status_code, worst_gap

    status, worst_gap = asyncio.run(scenario())
    assert status == 200
    assert worst_gap < 0.4, f"event loop was blocked for {worst_gap:.2f}s"


def test_get_concurrency_agrees_with_the_guard_when_the_server_registry_is_empty(client, machine, monkeypatch):
    monkeypatch.setattr("app.engines.registry.load_engine_registry", lambda: {})
    body = client.get("/api/engines/concurrency").json()
    by_id = {e["engine_id"]: e for e in body["engines"]}
    assert {"xtts", "voxtral", "mixed"} <= set(by_id)
    assert by_id["xtts"]["safe_max"] == 1
    assert body["global_safe_max"] == 1
    refusal = client.post("/api/settings", json={"tts_parallel_cap": 8})
    assert refusal.status_code == 422
    assert refusal.json()["detail"]["violations"][0]["safe_maximum"] == body["global_safe_max"]
