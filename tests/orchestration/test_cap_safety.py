"""Pure safe-cap math (#251). Numbers are the owner's Mac, measured with psutil:
total 24576 MB, available 10934 MB, free 1504 MB. XTTS declares vram_mb 4000."""
from __future__ import annotations

import pytest

from app.orchestration.scheduler.cap_safety import (
    BASIS_MEMORY,
    BASIS_UNMEASURABLE,
    CapViolation,
    EngineLimits,
    engine_hard_max,
    engine_safe_max,
    find_cap_violations,
    global_hard_max,
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
def test_raising_global_above_hard_max_is_refused(requested):
    assert _check({"tts_parallel_cap": requested}, current={"tts_parallel_cap": 1, "tts_engine_caps": {}}) == [
        CapViolation("tts_parallel_cap", "xtts", requested, 1, 2, BASIS_MEMORY)
    ]


def test_cap_1_and_resaving_current_are_allowed():
    assert _check({"tts_parallel_cap": 1}) == []
    assert _check({"tts_parallel_cap": 2}) == []


def test_unrelated_save_is_never_refused_even_when_current_exceeds_safe_max():
    assert _check({"safe_mode": True}) == []


def test_lowering_is_allowed():
    current = {"tts_parallel_cap": 4, "tts_engine_caps": {}}
    assert _check({"tts_parallel_cap": 2}, current=current) == []


def test_engine_override_above_hard_max_is_refused_and_attributed():
    assert _check({"tts_engine_caps": {"xtts": 3}}) == [
        CapViolation("tts_engine_caps", "xtts", 3, 1, 2, BASIS_MEMORY)
    ]


def test_string_override_cannot_escape_the_check():
    assert _check({"tts_engine_caps": {"xtts": "8"}}) == [
        CapViolation("tts_engine_caps", "xtts", 8, 1, 2, BASIS_MEMORY)
    ]


def test_removing_an_override_that_re_exposes_the_global_is_checked():
    current = {"tts_parallel_cap": 8, "tts_engine_caps": {"xtts": 1}}
    assert _check({"tts_engine_caps": {}}, current=current) == [
        CapViolation("tts_parallel_cap", "xtts", 8, 1, 2, BASIS_MEMORY)
    ]


def test_global_value_no_engine_inherits_is_not_refused():
    # XTTS has its own override of 1; only Voxtral inherits, and its manifest_max is 1.
    current = {"tts_parallel_cap": 2, "tts_engine_caps": {"xtts": 1}}
    assert _check({"tts_parallel_cap": 8}, current=current) == []


def test_voxtral_only_registry_accepts_any_global_value():
    assert _check({"tts_parallel_cap": 8}, limits=(VOXTRAL,)) == []


def test_unmeasurable_sample_refuses_a_raise_with_that_basis():
    sample = {"ram_total_gb": 24.0, "ram_available_gb": None}
    assert _check({"tts_parallel_cap": 3}, sample=sample) == [
        CapViolation("tts_parallel_cap", "xtts", 3, 1, 1, BASIS_UNMEASURABLE)
    ]
    assert _check({"tts_parallel_cap": 1}, sample=sample) == []


@pytest.mark.parametrize("bad", [float("nan"), float("inf")])
def test_non_finite_ram_is_unmeasurable(bad):
    assert engine_safe_max(XTTS, {"ram_total_gb": 24.0, "ram_available_gb": bad}) == (1, BASIS_UNMEASURABLE)
    assert engine_safe_max(XTTS, {"ram_total_gb": bad, "ram_available_gb": 10.0}) == (1, BASIS_UNMEASURABLE)
    assert is_memory_measurable({"ram_total_gb": 24.0, "ram_available_gb": bad}) is False


def test_non_finite_vram_is_ignored_not_trusted():
    sample = _sample(65536, 60000, vram_total_gb=float("nan"), vram_used_gb=1.0)
    assert engine_safe_max(XTTS, sample)[0] == 8


def test_mac_numbers_give_safe_1_hard_2():
    assert engine_safe_max(XTTS, MAC) == (1, BASIS_MEMORY)
    assert engine_hard_max(XTTS, MAC) == (2, BASIS_MEMORY)


def test_mac_raise_to_2_allowed_to_3_refused():
    current = {"tts_parallel_cap": 1, "tts_engine_caps": {}}
    assert _check({"tts_parallel_cap": 2}, current=current) == []
    assert _check({"tts_parallel_cap": 3}, current=current) == [
        CapViolation("tts_parallel_cap", "xtts", 3, 1, 2, BASIS_MEMORY)
    ]


@pytest.mark.parametrize(
    "total_mb, avail_mb, expected_safe, expected_hard",
    [
        (16384, 9000, 1, 2),
        (16384, 6000, 1, 1),
        (16384, 3000, 1, 1),
        (65536, 24000, 2, 6),
        (65536, 40000, 6, 8),
        (65536, 60000, 8, 8),
        (24576, 4000, 1, 1),
        (24576, 8000, 1, 2),
    ],
)
def test_safe_and_hard_grid(total_mb, avail_mb, expected_safe, expected_hard):
    sample = _sample(total_mb, avail_mb)
    assert engine_safe_max(XTTS, sample)[0] == expected_safe
    assert engine_hard_max(XTTS, sample)[0] == expected_hard


def test_running_workers_added_back_to_hard():
    one = EngineLimits("xtts", manifest_max=8, footprint_mb=4000, gpu=True, active_count=1)
    two = EngineLimits("xtts", manifest_max=8, footprint_mb=4000, gpu=True, active_count=2)
    assert engine_safe_max(one, _sample(24576, 6934))[0] == 1
    assert engine_hard_max(one, _sample(24576, 6934))[0] == 2
    assert engine_hard_max(two, _sample(24576, 2934))[0] == 2


def test_footprint_zero_hard_is_manifest_ceiling():
    assert engine_hard_max(EngineLimits("v", manifest_max=1, footprint_mb=0), MAC)[0] == 1
    assert engine_hard_max(EngineLimits("v", manifest_max=5, footprint_mb=0), MAC)[0] == 5


@pytest.mark.parametrize(
    "bad",
    [
        {"ram_total_gb": 24.0, "ram_available_gb": None},
        {"ram_total_gb": 24.0, "ram_available_gb": float("nan")},
        {"ram_total_gb": float("inf"), "ram_available_gb": 10.0},
        {"ram_total_gb": 0, "ram_available_gb": 0},
    ],
)
def test_unmeasurable_gives_hard_1(bad):
    assert engine_hard_max(XTTS, bad) == (1, BASIS_UNMEASURABLE)


def test_vram_term_uses_zero_reserve_too():
    sample = _sample(65536, 60000, vram_total_gb=16.0, vram_used_gb=2.0)
    assert engine_safe_max(XTTS, sample)[0] == 2
    assert engine_hard_max(XTTS, sample)[0] == 3


def test_available_below_reserve_hard_never_below_safe():
    assert (engine_safe_max(XTTS, _sample(24576, 4500))[0], engine_hard_max(XTTS, _sample(24576, 4500))[0]) == (1, 1)
    assert (engine_safe_max(XTTS, _sample(24576, 8500))[0], engine_hard_max(XTTS, _sample(24576, 8500))[0]) == (1, 2)


def test_hard_never_below_safe():
    for total in (8192, 16384, 24576, 65536):
        for avail in (0, 1000, 3000, 4915, 6000, 10934, 24000, 60000):
            if avail > total:
                continue
            for footprint in (0, 1000, 4000):
                for manifest in (1, 2, 8):
                    for active in (0, 1, 3):
                        for vram in (None, (16.0, 2.0)):
                            extra = {} if vram is None else {"vram_total_gb": vram[0], "vram_used_gb": vram[1]}
                            lim = EngineLimits("e", manifest, footprint, gpu=True, active_count=active)
                            sample = _sample(total, avail, **extra)
                            safe = engine_safe_max(lim, sample)[0]
                            hard = engine_hard_max(lim, sample)[0]
                            assert hard >= safe >= 1
                            assert hard <= manifest


def test_global_hard_max():
    assert global_hard_max([XTTS, VOXTRAL], MAC, 8) == 2
    assert global_hard_max([XTTS, VOXTRAL], _sample(65536, 60000), 8) == 8
    assert global_hard_max([VOXTRAL], MAC, 8) == 8
    assert global_hard_max([], MAC, 8) == 8


def test_unrelated_save_and_lowering_still_never_violate():
    current = {"tts_parallel_cap": 4, "tts_engine_caps": {}}
    assert _check({"safe_mode": True}, current=current) == []
    assert _check({"tts_parallel_cap": 3}, current=current) == []


def test_unset_cap_resolves_to_min_2_safe():
    unset = {"tts_engine_caps": {}}
    # Mac: auto is min(2, safe 1) = 1, so raising to 2 is within hard 2 and allowed, 3 is refused.
    assert _check({"tts_parallel_cap": 2}, current=unset) == []
    assert _check({"tts_parallel_cap": 3}, current=unset) == [
        CapViolation("tts_parallel_cap", "xtts", 3, 1, 2, BASIS_MEMORY)
    ]
    # An unrelated save from an unset cap never violates, on any machine.
    assert _check({"safe_mode": True}, current=unset) == []
    assert _check({"safe_mode": True}, current=unset, sample=_sample(65536, 60000)) == []


def test_unset_cap_on_a_hard_1_machine_refuses_a_global_2_and_allows_an_unrelated_override():
    unset = {"tts_engine_caps": {}}
    tight = _sample(24576, 5000)
    assert _check({"tts_parallel_cap": 2}, current=unset, sample=tight) == [
        CapViolation("tts_parallel_cap", "xtts", 2, 1, 1, BASIS_MEMORY)
    ]
    assert _check({"tts_engine_caps": {"voxtral": 1}}, current=unset, sample=tight) == []

