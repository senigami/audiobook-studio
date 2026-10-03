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


def test_empty_registry_fails_closed_with_503_and_saves_nothing(client, machine, monkeypatch):
    monkeypatch.setattr("app.engines.registry.load_engine_registry", lambda: {})
    resp = client.post("/api/settings", json={"tts_parallel_cap": 3})
    assert resp.status_code == 503
    assert get_settings()["tts_parallel_cap"] == 2


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
