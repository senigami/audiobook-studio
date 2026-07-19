# Plan — VRAM/CPU-aware dynamic concurrency auto-throttle

**Status:** DRAFT — awaiting twin + Fable plan review. No code changes made producing this plan.
**Feeds from:** `.agent/frontier-calibration/references/AR-1.md` (Fable design reference, 2026-07-18).
**Scope note:** built as one consolidated plan doc (not the full plan-architect 5-file ceremony)
given the reference already supplies map-equivalent detail (exact call sites, chokepoint analysis,
rejected alternatives). Task-slice discipline still applies below.

## Problem

Each concurrent XTTS worker loads its own model copy into VRAM; too-high a configured cap risks a
mid-render OOM (losing in-flight work); too-low wastes throughput. No mechanism today lets the
*effective* cap drop under live memory pressure and recover as it eases.

## Design (from AR-1 reference — see it for full rationale/rejected alternatives)

1. **New module** `app/orchestration/scheduler/memory_pressure.py`: a `MemoryPressureMonitor`
   daemon thread, started only from `boot_studio()` (never at import — side-effect ban), sampling
   VRAM (`torch.cuda.mem_get_info()` / `nvidia-smi` fallback / MPS+psutil) + RAM every ~3s.
   Exports two pure functions: `get_pressure_penalty() -> int`, `get_pressure_state() -> dict`.
2. **One-line integration inside the chokepoint**: `resolve_effective_cap`
   (`app/orchestration/scheduler/cap_settings.py:156`) subtracts the penalty **AFTER** the
   manifest-ceiling clamp, not before — **Petra's plan review caught a real arithmetic bug here**:
   subtracting before the clamp lets `min()` swallow the penalty whenever the configured cap exceeds
   the manifest ceiling (e.g. `min(8-1, 4) = 4`, unchanged — the penalty vanishes). Correct order:
   `max(1, min(requested, manifest_ceiling) - penalty)`. This bug is insidious because at the default
   (unraised) cap it looks correct, so a naive test would pass — the regression test must specifically
   cover a configured cap above the manifest ceiling. This is the ONLY integration point — it's already
   re-resolved on every admission
   attempt (`resources.py:626-631,699,706`) and feeds the ETA bracket + engines API for free.
3. **Hysteresis**: fast asymmetric down (VRAM ≥90% for 2 samples/~6s), slow single-step recovery
   (≤75% for 10 samples/~30s + 60s dwell since last down-step). Configurable via settings-then-env.
4. **Visibility**: a versioned `concurrency_throttle` studio-event (mirrors `broadcast_pause_state`),
   an honest `waiting_reason` when denied specifically due to throttle, and the pressure state added
   to the engines/settings API payload (also serves the adjacent silent-clamp-warning backlog item).
5. **Sampling-failure fallback**: freeze the current penalty at whatever it already is — never reset
   it to 0 and never grow it further while sampling is down (this is "fail-open-freeze," not
   "fail-open-reset"; Fable's plan review flagged this wording as ambiguous) —
   per the no-fabrication principle. After 3 consecutive failures, flag `sampling_ok: false` visibly.

## Open questions — LARGELY RESOLVED by both twin reviews, with one genuine disagreement to escalate

- **Can the Studio process read CUDA memory at all? NO — both twins independently confirmed this.**
  `torch` is not a declared root dependency; where present (incidentally, on a dev machine) it's a
  CPU/MPS build with no CUDA. The design's primary `torch.cuda.mem_get_info()` branch is dead on
  standard installs. **This unblocks Task 1 rather than leaving it open** — do NOT sample in-process
  in the Studio daemon.
- **Genuine twin disagreement on the correct transport (escalate — this is exactly the kind of split
  the twin design exists to surface, not to average):**
  - **Constance**: ride the TTS server's existing `/health` heartbeat (the watchdog already polls
    it; the xtts-env subprocess holds the real CUDA context, so sampling there is free and accurate).
  - **Petra**: call NVML/`nvidia-smi` directly from the Studio daemon, reading global board memory
    (host-total, not per-process) — demote/drop in-process `torch` entirely; this also stays correct
    if synthesis is ever remote over HTTP, where `/health`-heartbeat-piggybacking would not.
  - **Both agree**: don't sample via in-process `torch` in Studio. They disagree on subprocess-poll
    vs. heartbeat-piggyback for reaching the real number. **Recommend the owner/engineer pick one at
    build time** rather than this plan guessing — it's a concrete, bounded implementation choice with
    both options now well-specified, not an open research question.
- **Goal-honesty gap (Petra, F3/F4 — must be stated plainly, not silently scoped around):** the
  `try_acquire`-based mechanism can only stop *new* admissions; it cannot evict an already-running
  worker. If N model copies are already resident when pressure spikes, throttling relieves nothing
  until one finishes and releases. **This design is OOM *mitigation* (smooths the ramp-up), not OOM
  *prevention*** — the crash-and-recover path (watchdog restart + task recovery) remains the actual
  backstop for an OOM that happens anyway. State this honestly in whatever announces the feature;
  don't oversell it as "prevents OOM."
- **ETA-jitter regression risk (Petra, F5 — needs an explicit decision, not left implicit):** since
  the throttle penalty feeds `resolve_effective_cap` and the ETA bracket reads the same function, a
  fluctuating penalty could make ETAs visibly jump, colliding with this repo's no-ETA-jump principle.
  Decide explicitly: either test that ETA doesn't jump under a changing penalty, or have the ETA
  bracket read the structural (unthrottled) cap instead of the live one.
- Hysteresis numbers (90/75%, 6s/30s/60s) remain engineering judgment, untuned against real VRAM
  traces — unchanged from the original open question.

## Tasks

1. **Implement the sampling transport per the owner's pick** (Constance's `/health`-heartbeat vs.
   Petra's NVML/`nvidia-smi`-from-Studio-daemon — both are now fully specified; this is no longer a
   research task, just an implementation choice). Do NOT implement in-process `torch.cuda` sampling
   in the Studio daemon — both twins independently ruled it out.
2. **Implement `MemoryPressureMonitor`** per the design above, wired only from `boot_studio()`.
   Test: import-time side-effect check (no thread starts on import); `get_pressure_penalty()`
   returns 0 before boot.
3. **Wire the penalty into `resolve_effective_cap`** (one-line change + the lazy-import pattern
   matching `_read_settings`). Test: penalty reduces effective cap; floor of 1 enforced; ETA bracket
   and engines API both reflect the reduced value automatically (no separate wiring needed —
   confirm this by test, don't just assume it from the design doc).
4. **Implement hysteresis** with the down/up asymmetry. Test: rapid oscillation near the watermark
   does NOT cause flapping (the anti-oscillation property is the thing to prove, not just the
   individual thresholds).
5. **Visibility**: the `concurrency_throttle` event, the honest `waiting_reason` string, and the
   pressure state on the engines/settings payload. Test: event fires on penalty change; denied
   admission during throttle carries the specific reason string.
6. **Sampling-failure fallback**: implement fail-open-freeze (don't recover without evidence of low
   pressure; don't increase penalty on sampler failure). Test: simulate 3 consecutive sampling
   failures → `sampling_ok: false` surfaces; existing penalty holds, doesn't grow.
7. **Full regression**: existing scheduler/resources tests unaffected when the monitor reports 0
   penalty (default/no-pressure state == today's behavior exactly). Explicitly include
   `app/orchestration/progress/service.py`'s `_resolve_pool_cap` (the ETA bracket) — it calls the
   same chokepoint and is an automatic beneficiary of this change, so it's also automatic
   regression risk a generic "scheduler/resources tests" pass could miss (Fable's plan review).

## Out of scope

Per-worker VRAM estimation via a manifest field (rejected — would guess across model sizes and add
a contract bump); a separate pressure gate outside the chokepoint (rejected — creates a second place
deciding effective cap).
