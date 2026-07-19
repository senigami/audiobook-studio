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
   (`app/orchestration/scheduler/cap_settings.py:156`) subtracts the penalty before the manifest-
   ceiling clamp. This is the ONLY integration point — it's already re-resolved on every admission
   attempt (`resources.py:626-631,699,706`) and feeds the ETA bracket + engines API for free.
3. **Hysteresis**: fast asymmetric down (VRAM ≥90% for 2 samples/~6s), slow single-step recovery
   (≤75% for 10 samples/~30s + 60s dwell since last down-step). Configurable via settings-then-env.
4. **Visibility**: a versioned `concurrency_throttle` studio-event (mirrors `broadcast_pause_state`),
   an honest `waiting_reason` when denied specifically due to throttle, and the pressure state added
   to the engines/settings API payload (also serves the adjacent silent-clamp-warning backlog item).
5. **Sampling-failure fallback**: fail-open to the configured cap (penalty stays, doesn't grow) —
   per the no-fabrication principle. After 3 consecutive failures, flag `sampling_ok: false` visibly.

## Open questions this plan carries forward (unresolved in the reference — flag for reviewers)

- **Can the Studio process read CUDA memory at all**, or must sampling live in
  `app/tts_server/health.py` and ride the watchdog's existing `/health` heartbeat instead (XTTS deps
  are in the separate `~/xtts-env`; root env may lack `torch`)? **This blocks Task 1 and must be
  resolved first** — it changes where the monitor lives, not the design above it.
- Hysteresis numbers (90/75%, 6s/30s/60s) are engineering judgment, untuned against real VRAM traces.

## Tasks

1. **Resolve the process-boundary question** (blocking). Read `app/tts_server/health.py` and the
   watchdog heartbeat payload; confirm whether `torch`/CUDA is importable in the Studio process.
   Decide: in-process sampling vs. health-heartbeat transport. **Do not proceed to Task 2 until
   this is answered** — it determines Task 2's module location.
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
   penalty (default/no-pressure state == today's behavior exactly).

## Out of scope

Per-worker VRAM estimation via a manifest field (rejected — would guess across model sizes and add
a contract bump); a separate pressure gate outside the chokepoint (rejected — creates a second place
deciding effective cap).
