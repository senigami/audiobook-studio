"""Pure safe-cap math (#251). Numbers are the owner's Mac, measured with psutil:
total 24576 MB, available 10934 MB, free 1504 MB. XTTS declares vram_mb 4000."""
from __future__ import annotations

import pytest

from app.orchestration.scheduler.cap_safety import (
    BASIS_MEMORY,
    BASIS_UNMEASURABLE,
    CapViolation,
    EngineLimits,
    engine_safe_max,
    find_cap_violations,
    global_safe_max,
    is_memory_measurable,
    safe_cap_ceiling,
)


@pytest.fixture(autouse=True)
def _no_env_caps(monkeypatch):
    monkeypatch.delenv("TTS_PARALLEL_CAP", raising=False)
    monkeypatch.delenv("TTS_ENGINE_CAPS", raising=False)


def _sample(total_mb, available_mb, **extra):
    return {
        "ram_total_gb": total_mb / 1024,
        "ram_available_gb": available_mb / 1024,
        "vram_total_gb": None,
        "vram_used_gb": None,
        **extra,
    }


MAC = _sample(24576, 10934)
XTTS = EngineLimits("xtts", manifest_max=8, footprint_mb=4000, gpu=True)
VOXTRAL = EngineLimits("voxtral", manifest_max=1, footprint_mb=0)
CURRENT = {"tts_parallel_cap": 2, "tts_engine_caps": {}}


def test_mac_numbers_give_xtts_safe_max_1():
    assert engine_safe_max(XTTS, MAC) == (1, BASIS_MEMORY)


@pytest.mark.parametrize(
    "available_mb, expected",
    [(10934, 1), (16000, 2), (20000, 3), (24000, 4)],
)
def test_safe_max_steps_with_available_memory(available_mb, expected):
    assert engine_safe_max(XTTS, _sample(24576, available_mb))[0] == expected


def test_big_machine_is_limited_by_manifest_ceiling():
    assert engine_safe_max(XTTS, _sample(65536, 60000))[0] == 8


def test_free_memory_is_never_used():
    # 'free' is huge, 'available' is the Mac's. Result must follow available.
    sample = _sample(24576, 10934, ram_free_gb=20.0, ram_used_gb=1.0)
    assert engine_safe_max(XTTS, sample)[0] == 1


def test_running_renders_are_added_back():
    running = EngineLimits("xtts", manifest_max=8, footprint_mb=4000, gpu=True, active_count=1)
    assert engine_safe_max(running, MAC)[0] == 2


def test_footprint_zero_engine_uses_manifest_ceiling_only():
    assert engine_safe_max(VOXTRAL, MAC) == (1, BASIS_MEMORY)
    assert safe_cap_ceiling(footprint_mb=0, manifest_max=5, budget_mb=0.0) == 5


def test_floor_is_one_when_budget_is_negative():
    assert engine_safe_max(XTTS, _sample(24576, 3000))[0] == 1


@pytest.mark.parametrize(
    "sample",
    [
        {"ram_total_gb": 24.0, "ram_available_gb": None},
        {"ram_total_gb": None, "ram_available_gb": 10.0},
        {"ram_total_gb": 0, "ram_available_gb": 0},
        {"ram_total_gb": 16.0, "ram_available_gb": 20.0},
        {"ram_total_gb": 16.0},
    ],
)
def test_unusable_sample_is_budget_zero_safe_max_1(sample):
    assert engine_safe_max(XTTS, sample) == (1, BASIS_UNMEASURABLE)


def test_is_memory_measurable():
    assert is_memory_measurable(MAC) is True
    assert is_memory_measurable({"ram_total_gb": 24.0, "ram_available_gb": None}) is False
    assert is_memory_measurable({}) is False


def test_measurable_vram_can_be_the_tighter_limit():
    sample = _sample(65536, 60000, vram_total_gb=8.0, vram_used_gb=1.0)
    assert engine_safe_max(XTTS, sample)[0] == 1


def test_global_safe_max():
    assert global_safe_max([XTTS, VOXTRAL], MAC, 8) == 1
    assert global_safe_max([XTTS, VOXTRAL], _sample(65536, 60000), 8) == 8
    assert global_safe_max([VOXTRAL], MAC, 8) == 8
    assert global_safe_max([], MAC, 8) == 8


def _check(candidate_updates, *, current=CURRENT, limits=(XTTS, VOXTRAL), sample=MAC):
    return find_cap_violations(
        current_settings=current,
        candidate_settings={**current, **candidate_updates},
        limits=list(limits),
        sample=sample,
    )


@pytest.mark.parametrize("requested", [3, 4])
def test_raising_global_above_safe_max_is_refused(requested):
    assert _check({"tts_parallel_cap": requested}) == [
        CapViolation("tts_parallel_cap", "xtts", requested, 1, BASIS_MEMORY)
    ]


def test_cap_1_and_resaving_current_are_allowed():
    assert _check({"tts_parallel_cap": 1}) == []
    assert _check({"tts_parallel_cap": 2}) == []


def test_unrelated_save_is_never_refused_even_when_current_exceeds_safe_max():
    assert _check({"safe_mode": True}) == []


def test_lowering_is_allowed():
    current = {"tts_parallel_cap": 4, "tts_engine_caps": {}}
    assert _check({"tts_parallel_cap": 2}, current=current) == []


def test_engine_override_above_safe_max_is_refused_and_attributed():
    assert _check({"tts_engine_caps": {"xtts": 3}}) == [
        CapViolation("tts_engine_caps", "xtts", 3, 1, BASIS_MEMORY)
    ]


def test_string_override_cannot_escape_the_check():
    assert _check({"tts_engine_caps": {"xtts": "8"}}) == [
        CapViolation("tts_engine_caps", "xtts", 8, 1, BASIS_MEMORY)
    ]


def test_removing_an_override_that_re_exposes_the_global_is_checked():
    current = {"tts_parallel_cap": 8, "tts_engine_caps": {"xtts": 1}}
    assert _check({"tts_engine_caps": {}}, current=current) == [
        CapViolation("tts_parallel_cap", "xtts", 8, 1, BASIS_MEMORY)
    ]


def test_global_value_no_engine_inherits_is_not_refused():
    # XTTS has its own override of 1; only Voxtral inherits, and its manifest_max is 1.
    current = {"tts_parallel_cap": 2, "tts_engine_caps": {"xtts": 1}}
    assert _check({"tts_parallel_cap": 8}, current=current) == []


def test_voxtral_only_registry_accepts_any_global_value():
    assert _check({"tts_parallel_cap": 8}, limits=(VOXTRAL,)) == []


def test_every_registered_engine_is_checked_regardless_of_enablement():
    # The function takes only limits; there is no enablement input to consult.
    assert [v.engine for v in _check({"tts_parallel_cap": 4}, limits=(VOXTRAL, XTTS))] == ["xtts"]


def test_unmeasurable_sample_refuses_a_raise_with_that_basis():
    sample = {"ram_total_gb": 24.0, "ram_available_gb": None}
    assert _check({"tts_parallel_cap": 3}, sample=sample) == [
        CapViolation("tts_parallel_cap", "xtts", 3, 1, BASIS_UNMEASURABLE)
    ]
    assert _check({"tts_parallel_cap": 1}, sample=sample) == []
