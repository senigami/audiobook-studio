# ADR-0012: `enrich` Kernel at the Event-Builder Layer; One RLock-Guarded `ProgressService` Singleton; Python `compute_progress_confidence` Echo Deleted (Client Fallback Retained)

**Date:** 2026-06-18  
**Status:** Accepted  
**Deciders:** Studio owner

## Context

### The problem — two uncoordinated emit paths + a confidence echo

Studio 2.0 progress frames reach the WebSocket via two independent paths:

**Path A (orchestrated):**  
`ProgressService.publish` → `build_*_event(...)` → `broadcast_studio_event` → `manager.broadcast`  
Path A sets `skip_job_updated=True` on `update_job`, deliberately bypassing `broadcast_job_updated`.

**Path B (handler-direct / TTS subprocess):**  
`state_jobs.update_job` / `put_job` → `_JOB_LISTENERS` → `broadcast_job_updated` (`app/api/ws.py`) → `build_*_event(...)` → `broadcast_studio_event`

Before this ADR, `compute_progress_confidence` in `app/api/contracts/events.py` (line 199) computed confidence as `coverage_ratio * progress` — effectively **echoing `progress` back as confidence**. Every frame from every path emitted `confidence == progress`, carrying zero variance/freshness/ETA-stability information. This afflicted both paths equally; it was not a routing topology bug, it was a value-forwarding gap in the builder layer.

A concurrent architectural error: `ProgressService` was owned per-orchestrator rather than as a process-wide singleton. Multiple orchestrator instances (each running tasks on separate threads) maintained independent ETA rings with no cross-job coordination and no lock guarding against the asyncio loop (which calls `broadcast_job_updated` on Path B).

### Why `broadcast_job_updated` was NOT the correct chokepoint

The v1 design plan nominated `broadcast_job_updated` as the universal convergence point for enrichment. This was wrong: **Path A bypasses `broadcast_job_updated` entirely** (`app/api/web.py` wires `ProgressService`'s sink directly to `manager.broadcast` via `configure_progress_broadcaster`; `orchestrator_publish.py` passes `skip_job_updated=True`). Enriching only inside `broadcast_job_updated` would have left Path A frames unenriched — a worse regression than the status quo.

## Decision

**The event builders in `app/api/contracts/events.py` are the single contract authority** for every progress frame that leaves the backend. Both producers call `ProgressService.enrich(job_id, payload)` before building events, then thread the enriched values into every `build_*_event(...)` call.

### Concrete changes

1. **One singleton, RLock-guarded (`ProgressService`).**  
   A single process-wide `ProgressService` is boot-installed by `app/api/web.py` (via `app/core/boot.py`) and resolved by the orchestrator (Path A), `broadcast_job_updated` (Path B), and the snapshot serializer. Per-job ETA rings, monotonic floors, and the last-payload cache all live in this singleton, guarded by a single `threading.RLock`. Producers run on multiple threads; without the lock, concurrent jobs would race.

2. **`enrich(job_id, payload, *, sample: bool = True)` is the single contract kernel.**  
   Called by both producers immediately before event building. It applies:
   - §4A.2 numeric `eta_confidence` (variance × completion × freshness, with cold-start maturity factor `n_samples`)
   - §4A.3 share-weighted segment→chapter ETA/confidence composition
   - §4A.4 mechanical ETA ceiling (`apply_eta_ceiling`)
   - §4A.5 convergence-trust (a monotonically-dropping ETA does not lower confidence)
   - §4A.8 calculated→observed ETA crossfade (`crossfade_eta`, bootstrap `DEFAULT_BASELINE_ENGINE_CPS` for cold renders)
   - Monotonic-clamped `progress` / `grouped_progress` forced to `1.0` at terminal  
   When `sample=False` (snapshot/hydration, PI6), `enrich` computes from the current ring state without mutating it or the monotonic floor.

3. **Python `compute_progress_confidence` deleted; client fallback retained.**  
   The echo (`coverage_ratio * progress`) in `app/api/contracts/events.py` is removed. §4A progress-bearing frames (jobs.lifecycle / chapters.progress / queue.items) carry backend-authoritative numeric `confidence`; builders that receive such a frame with `confidence=None` raise `ValueError` — fail-loud, not silent passthrough. The client (`frontend/src/api/contracts/liveEvents.ts`) retains a `computeProgressConfidence` function as a **fallback only for non-§4A direct-broadcast frames** (`segments.progress` via `broadcast_segment_progress`, `voice.test` via `broadcast_test_progress`) that legitimately carry no `confidence` and are not routed through `enrich`. This is not a redundant echo — removing it would leave those frames with `confidence === undefined`.

4. **D7 lock hierarchy enforced.**  
   `_STATE_LOCK` (`state_jobs.py`) is always the **outer** lock; the `ProgressService` RLock is a **leaf** lock. `publish` reads all job state via `get_jobs()` **before** entering the RLock-guarded region to prevent the `PS-RLock → _STATE_LOCK` AB-BA deadlock. (The reversed order was a real deadlock path: `state_jobs.update_job` holds `_STATE_LOCK` → fires listeners → `broadcast_job_updated` → `enrich` → `PS-RLock`; meanwhile `publish` holds `PS-RLock` → `get_jobs()` → `_STATE_LOCK`.)

### Rejected alternative — wiring `broadcast_job_updated` as the universal chokepoint

This was the v1 plan. It was rejected because Path A bypasses `broadcast_job_updated` by design (`skip_job_updated=True`). Enriching only at `broadcast_job_updated` would produce correct Path-B frames but leave Path-A frames at the old unenriched `confidence = progress` echo — a regression on the primary orchestrated path. The correct chokepoint must be shared by both paths: the event builders are.

## Consequences

### Positive

- Every §4A progress frame a client receives (jobs.lifecycle / chapters.progress / queue.items) carries §4A-correct `eta_confidence`, composed ETA, and mechanical ceiling — regardless of which emit path (A or B) produced it. Non-§4A direct broadcasts (segments.progress, voice.test) are out-of-contract by design; the client provides a lightweight fallback.
- Cold renders (first frame, no observed throughput) produce a non-null ETA from the baseline chars-per-second rate, eliminating the null-ETA/null-confidence cold-start window.
- A single RLocked singleton eliminates per-orchestrator ring fragmentation; the ETA state for every job is consistent across threads.
- Snapshot/hydration frames carry the same §4A enrichment as live frames (PI6).

### Negative / Trade-offs

- All producers must be updated to call `enrich` before building events; missing a call site leaves a builder receiving `confidence=None` — which now fails loudly rather than silently. This is intentional but requires discipline at new call sites.
- The singleton must be boot-installed before any `broadcast_job_updated` call can succeed; attempting to call it before boot raises a clear error.
- The D7 lock ordering constraint (`get_jobs()` before the RLock block) means `publish` reads a snapshot of job state that may be slightly stale relative to concurrent mutations — acceptable because ETA math is inherently approximate and stale-by-one-frame is not observable.

### Neutral

- Snapshot/hydration uses `enrich(sample=False)`, which is read-only and does not push velocity samples, preserving the ETA ring for the live path.
- `broadcast_test_progress` and `broadcast_segment_progress` (voice test and raw segment frames) remain outside the enriched-confidence contract — they carry their own `progress` field but have no chapter/char_count/ETA semantics, and their builders do not require `confidence`.
- `design-docs/specs/live-events.md` §"Progress contract authority" and `design-docs/specs/progress-presentation.md` §§2.4/2.5/2.6 document the shipped contract.
