# 00 — Overview

## The task

Render the segments of a single chapter **concurrently** across per-engine worker pools (GPU/XTTS, CPU, cloud/Voxtral), capped per engine, to cut chapter render wall-clock time. Ship it **off-by-default** (cap = 1) behind a toggle, on a verified-stable synthesis core. This is **Phase 1**: the backend parallelism plus the minimum frontend generalization so the existing per-segment progress UI shows multiple segments rendering at once. The dedicated "render monitor" visualizer is **Phase 2** (fast-follow).

## Why

- A chapter is already decomposed into render groups (≤500-char segments, each tagged with its engine — `app/domain/chunk_groups.py:build_chunk_groups`). They render **sequentially** today (mixed handler loops groups; standard XTTS sends the whole chapter in one call) and one render runs at a time (the binary exclusive gate in `app/orchestration/scheduler/resources.py`).
- A single XTTS inference is autoregressive/single-stream and **does not saturate the GPU** (owner-confirmed: past concurrent XTTS runs did not tax the hardware). Cloud (Voxtral) is network-bound. So GPU, CPU, and cloud segments can run concurrently, and multiple can run within a pool — the hardware has headroom we don't use.
- The existing per-segment progress UI (gray→black text + per-segment bars, generalized in W-MIX W4) already animates per segment — with a parallel backend, **multiple light up at once** with no new visualizer required.

## Scope — IN (Phase 1)

1. **Per-engine concurrency declaration** — `behavior.max_concurrent_workers` in each engine manifest + a global cap; default 1.
2. **Scheduler per-engine semaphores** — replace the binary `GpuAdmissionGate`/`ExclusiveAdmissionGate` with per-engine counting semaphores keyed by engine/processor class. **Subsumes W5.**
3. **Parent/child segment scheduling** — a chapter job fans out child segment units the scheduler admits under the per-engine caps.
4. **Per-segment dispatch isolation** — each concurrent segment gets its own timing/marker state (the `_dispatch` closure is single-stream today — keystone refactor, R-A).
5. **TTS-server concurrent inference** — warm-worker semaphore (replace the per-engine `Lock`), lazy N-th worker spawn (VRAM-aware), `run_in_threadpool` so the endpoint stops blocking; cloud is trivially concurrent.
6. **Correctness under parallelism** — stitch in manuscript order; artifact-validated completion; cancel signals + joins all in-flight; recovery resumes only unfinished; per-segment writes to SQLite (not state.json full-rewrites); stuck-segment heartbeat.
7. **Frontend multi-active** — backend emits a chapter-level `active_segments_map`; thread it end-to-end (extract → overlay whitelist → hydration merge → store → `useStudioChapter` set); rAF-coalesce updates; existing per-segment bars light up in parallel.
8. **ETA under parallelism** — throughput/bottleneck-based, bracketed ("estimating…" until ≥3 completions); never imply block width = render time.
9. **Off-by-default toggle + config** — cap defaults to 1; a setting raises it; spec reconciliation + the invariant test suite.

## Scope — OUT (deferred)

- **The dedicated "BitTorrent" render monitor** (proportional-block field, popover detail, dual-layer a11y table, gated power controls, per-segment retry-from-UI) → **Phase 2**, [10-phase2-render-monitor.md](10-phase2-render-monitor.md). The design is captured there; build it as a fast-follow once Phase 1 is stable.
- Multi-GPU / distributed rendering; cross-machine pools.
- Live per-engine worker sliders / throughput diagnostics panel (power-user controls) — Phase 2.

## Prerequisite (gate)

The **W-MIX `👁 VISUAL CHECK`** (a live mixed XTTS+Voxtral render confirming preparing/ETA behavior) must be owner-verified before Phase-1 execution starts. Parallelism on an unverified sequential core compounds risk (R-E).

## Success criteria (definition of done)

- A chapter renders multiple segments concurrently up to each engine's declared cap; with cap=1 behavior is identical to today (ships dark).
- Raising an engine's cap (XTTS≥2 where VRAM allows, Voxtral 4–8) measurably reduces chapter wall-clock, with no OOM on the default and a safe fallback if a worker fails to spawn (INV-10).
- The chapter WAV is byte-correct: segments stitch in manuscript order regardless of completion order (INV-2); a chapter is "done" only on validated artifacts (INV-3).
- Cancel mid-fan-out stops all in-flight segments cleanly (no orphan WAVs / straggler writes); restart resumes only unfinished segments (INV-7, INV-8).
- The existing per-segment progress UI shows multiple segments advancing simultaneously; chapter progress + a bracketed ETA remain coherent.
- Durable chapter status stays monotonic; one job per chapter in the UI/recovery (INV-4). No engine-ID branching (INV-5).
- All new behavior is TDD-covered (stitch-order + cancel/recovery + cap-enforcement invariants pinned); touched specs bumped with changelog rows.
