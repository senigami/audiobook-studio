"""Unset global cap resolves to min(2, safe max) at read time (two boundaries faked: sampler, clock)."""
from __future__ import annotations

import pytest

from app.orchestration.scheduler import cap_default
from app.orchestration.scheduler.cap_default import resolve_live_effective_cap

MAC = {
    "ram_total_gb": 24576 / 1024,
    "ram_available_gb": 10934 / 1024,
    "vram_total_gb": None,
    "vram_used_gb": None,
}
BIG = {**MAC, "ram_total_gb": 65536 / 1024, "ram_available_gb": 60000 / 1024}


class Sampler:
    def __init__(self, sample):
        self.sample = sample
        self.calls = 0

    def __call__(self):
        self.calls += 1
        if isinstance(self.sample, Exception):
            raise self.sample
        return dict(self.sample)


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


@pytest.fixture(autouse=True)
def current(monkeypatch):
    """The stored settings the resolver reads; mutate ``current["settings"]`` per test."""
    holder = {"settings": {}}
    monkeypatch.delenv("TTS_PARALLEL_CAP", raising=False)
    monkeypatch.delenv("TTS_ENGINE_CAPS", raising=False)
    monkeypatch.setattr(cap_default, "_cache", {})
    monkeypatch.setattr("app.orchestration.scheduler.cap_settings._read_settings", lambda: holder["settings"])
    return holder


def _resolve(sampler, clock=None):
    return resolve_live_effective_cap("xtts", 8, clock=clock or Clock(), sampler=sampler)


def test_unset_on_the_mac_resolves_to_1():
    assert _resolve(Sampler(MAC)) == 1


def test_unset_on_a_big_machine_resolves_to_2():
    assert _resolve(Sampler(BIG)) == 2


def test_explicit_saved_cap_wins_and_never_samples(current):
    current["settings"] = {"tts_parallel_cap": 3}
    sampler = Sampler(MAC)
    assert _resolve(sampler) == 3
    assert sampler.calls == 0


def test_engine_override_wins_and_never_samples(current):
    current["settings"] = {"tts_engine_caps": {"xtts": 4}}
    sampler = Sampler(MAC)
    assert _resolve(sampler) == 4
    assert sampler.calls == 0


def test_a_failing_sampler_resolves_to_1():
    assert _resolve(Sampler(RuntimeError("boom"))) == 1


def test_sample_is_cached_for_30_seconds():
    clock = Clock()
    sampler = Sampler(BIG)
    _resolve(sampler, clock)
    clock.now += 29
    _resolve(sampler, clock)
    assert sampler.calls == 1
    clock.now += 2
    _resolve(sampler, clock)
    assert sampler.calls == 2


TIGHT = {**MAC, "ram_total_gb": 16384 / 1024, "ram_available_gb": 7500 / 1024}


class _Claim:
    manifest_max = 8
    vram_mb = 4000
    gpu = False


class _Semaphore:
    def __init__(self):
        self.active_count = 0


@pytest.fixture
def semaphore(monkeypatch):
    sem = _Semaphore()
    monkeypatch.setattr("app.orchestration.tasks.synthesis._manifest_resource_claim", lambda engine_id: _Claim())
    monkeypatch.setattr(
        "app.orchestration.scheduler.resources.get_engine_id_semaphore", lambda engine_id, manifest_max: sem
    )
    return sem


def test_a_worker_started_after_the_sample_is_not_counted_twice(semaphore):
    clock = Clock()
    sampler = Sampler(TIGHT)
    assert _resolve(sampler, clock) == 1
    semaphore.active_count = 1
    clock.now += 5
    assert _resolve(sampler, clock) == 1


def test_the_automatic_value_is_recomputed_after_the_ttl(semaphore):
    clock = Clock()
    sampler = Sampler(TIGHT)
    assert _resolve(sampler, clock) == 1
    sampler.sample = BIG
    clock.now += 31
    assert _resolve(sampler, clock) == 2
    assert sampler.calls == 2


def test_the_manifest_claim_is_not_re_read_inside_the_ttl(monkeypatch, semaphore):
    reads = []

    def claim(engine_id):
        reads.append(engine_id)
        return _Claim()

    monkeypatch.setattr("app.orchestration.tasks.synthesis._manifest_resource_claim", claim)
    clock = Clock()
    sampler = Sampler(BIG)
    for _ in range(3):
        _resolve(sampler, clock)
    assert reads == ["xtts"]


# The chapter pool has no manifest; it must follow the same automatic value segments get.
BIG_64 = {**MAC, "ram_total_gb": 64.0, "ram_available_gb": 58.0}


def _chapter(sampler, clock=None):
    return resolve_live_effective_cap("chapter_admission", 64, clock=clock or Clock(), sampler=sampler)


@pytest.fixture
def xtts_limits(monkeypatch):
    """One known engine (XTTS, 4000 MB) so the global value is computed from a fixed set."""
    from app.orchestration.scheduler.cap_safety import EngineLimits

    monkeypatch.setattr(
        "app.orchestration.scheduler.cap_limits.collect_limits",
        lambda: [EngineLimits(engine_id="xtts", manifest_max=8, footprint_mb=4000)],
    )


@pytest.mark.parametrize(
    "sample, expected",
    [(BIG_64, 2), (MAC, 1), (TIGHT, 1)],
    ids=["64gb", "mac", "16gb"],
)
def test_unset_chapter_pool_follows_the_global_automatic_value(xtts_limits, sample, expected):
    assert _chapter(Sampler(sample)) == expected


def test_xtts_and_chapter_pool_agree_on_a_big_machine(xtts_limits):
    assert _resolve(Sampler(BIG_64)) == 2
    assert _chapter(Sampler(BIG_64)) == 2


def test_chapter_pool_is_still_clamped_by_the_callers_ceiling(xtts_limits):
    assert resolve_live_effective_cap("chapter_admission", 1, clock=Clock(), sampler=Sampler(BIG_64)) == 1


def test_cache_entry_is_stamped_with_the_time_before_the_sample(semaphore):
    clock = Clock()

    class SlowSampler(Sampler):
        def __call__(self):
            clock.now += 10
            return super().__call__()

    sampler = SlowSampler(BIG)
    _resolve(sampler, clock)
    clock.now += 21  # 31 s after the sample began, 21 s after it finished
    _resolve(sampler, clock)
    assert sampler.calls == 2


def test_a_release_during_the_sample_is_not_counted_as_still_active(semaphore):
    semaphore.active_count = 1

    class ReleasingSampler(Sampler):
        def __call__(self):
            semaphore.active_count = 0  # the worker finished and gave its memory back mid-sample
            return super().__call__()

    # 16 GB, 7500 MB free: the worker's 4000 MB is already inside "available", so adding it back double counts.
    assert _resolve(ReleasingSampler(TIGHT)) == 1


def test_cap_default_never_pulls_the_api_layer_even_when_it_resolves_the_chapter_pool():
    """Fresh interpreter: the scheduler must not depend on app.api, at import or when it computes."""
    import subprocess
    import sys

    code = (
        "import sys\n"
        "from app.orchestration.scheduler.cap_default import resolve_live_effective_cap\n"
        "s = {'ram_total_gb': 64.0, 'ram_available_gb': 58.0, 'vram_total_gb': None, 'vram_used_gb': None}\n"
        "resolve_live_effective_cap('chapter_admission', 64, sampler=lambda: s)\n"
        "print(sorted(m for m in sys.modules if m == 'app.api' or m.startswith('app.api.')))\n"
    )
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, timeout=120, check=True)
    assert out.stdout.strip().splitlines()[-1] == "[]"


@pytest.mark.parametrize(
    "sample, expected",
    [(BIG_64, 2), (MAC, 1)],
    ids=["64gb-58gb-free", "24gb-10.7gb-free"],
)
def test_chapter_pool_automatic_value_over_the_real_manifest_registry(sample, expected):
    """No collect_limits patch: the real plugins directory and registry feed the global safe max."""
    assert _chapter(Sampler(sample)) == expected
