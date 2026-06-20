# Progress Routing Unification — Architecture Map (v2.1 — post 2nd adversarial review)

> v2.1 folds 10 execution-safety corrections (lock hierarchy/deadlock, grouped→1.0 terminal, 003a seed source, 004/005 builder coverage, 006 seg-confidence producer, 009 load signal, read-only enrich, 010 latch+reconcile, B8 real-render task 012, 002 tests).

> Goal unchanged: **one authoritative contract** so every progress frame the UI receives honors
> `docs/specs/progress-presentation.md` §4A. **The v1 convergence point was wrong** — an adversarial
> panel + direct code verification corrected it. This v2 is the spot-on design.

## 0. What v1 got wrong (verified in code)
- v1 claimed `broadcast_job_updated` is the universal chokepoint. **False.** `app/api/web.py:358` wires
  `ProgressService`'s sink directly to `manager.broadcast` (`configure_progress_broadcaster(lambda payload,_: manager.broadcast(payload))`), and `orchestrator_publish.py:240` calls `update_job(..., skip_job_updated=True)` — **Path A deliberately bypasses `broadcast_job_updated`.**
- The bug is **not routing topology — it's a value-forwarding gap.** `ProgressService.publish` computes a numeric `eta_confidence` in `_build_progress_payload` but then calls `build_chapter_progress_event(...)` **without passing it** (`service.py:463-480`); the builder falls back to `compute_progress_confidence` = `coverage_ratio*progress` (`events.py:199`). So the echo afflicts **both** paths, not just Path B.
- D5 (idempotency for "Path-A re-entry") guarded a path that doesn't exist → deleted.
- The v1.4.0 ETA/confidence helpers are **committed but unwired (dead code)**, not "uncommitted."

## 1. Real topology (verified)

```
Path A (orchestrated):
  orchestrator._publish ─► ProgressService.publish ─► build_*_event(...)  ─┐  (suppresses broadcast_job_updated)
     (service.py:304/328/367/422/463 — builds events itself)               │
                                                                           ▼
Path B (handler-direct / TTS subprocess):                       app/api/contracts/events.py
  state_jobs.update_job/put_job, plugin SDK ─► _JOB_LISTENERS ─►   build_{chapter,segment,queue_item}
     ─► broadcast_job_updated (ws.py:283) ─────────────────────►   _progress_event(...)   ◄── TRUE CONVERGENCE
                                                                   (compute_progress_confidence:199 = echo)
                                                                           │
                                                                           ▼
                                                          broadcast_studio_event ─► manager.broadcast
Bypass paths (NOT via builders):
  • jobs_snapshot (web.py:219) — raw asdict → websocket.send_json  ← needs its own enrich (PI6)
  • broadcast_segment_progress (ws.py:555) / broadcast_test_progress (ws.py:569) / broadcast_tts_log_line → broadcast_studio_event direct
    ↳ These carry their own `progress` field but currently call no builder with confidence=.
      Decision (FIX 4): either add `confidence=` to `build_voice_test_progress_event` and wire it for
      broadcast_test_progress, OR document them as OUT of the enriched-confidence contract (they carry
      their own progress) so the 005 fail-loud guard does NOT fire on them. Pick one in Task 004/005.
```

**The single point BOTH progress paths cross is the event builders in `app/api/contracts/events.py`.**
That — not `broadcast_job_updated`, not `manager.broadcast` (too late; events already built) — is where the
contract must be made single-source.

## 2. Target design (v2)

```
            ┌──────────────────────────────────────────────────────────────┐
 Path A ───►│ ProgressService.enrich(job_id, payload) — ONE kernel, ONE      │  per-job state (RLOCKED):
 Path B ───►│   singleton, RLock-guarded:                                    │  ETA ring, monotonic clamp,
 snapshot ─►│   • char-weighted progress (B9) + monotonic clamp              │  last-payload, last-emit
            │   • calculated→observed ETA crossfade w/ BOOTSTRAP cps (B10/D4) │
            │   • §4A.3 segment→chapter ETA composition + §4A.5 trust         │
            │   • numeric eta_confidence (B7, §4A.2)                          │
            └───────────────────────────┬──────────────────────────────────┘
                                         ▼
   every producer threads the enriched values INTO build_*_event(confidence=, eta_seconds=, …)
                                         ▼
            build_*_event (echo deleted) ─► broadcast_studio_event ─► manager.broadcast
   (snapshot serializer calls enrich directly, then send_json)
```

**Decisions (v2, binding):**
- **D1 — One singleton, RLock-guarded.** A single main-process `ProgressService`, boot-wired, resolved by the orchestrator AND `broadcast_job_updated` AND the snapshot serializer. Per-job state (ETA ring, monotonic clamp, last-payload) lives only here and is guarded by an `RLock` — producers run on different threads (orchestrator workers, the `state_jobs` listener, the asyncio loop), so concurrent jobs would otherwise race. *(This is a behavior change from today's per-orchestrator-owned, effectively-serialized service — call it out.)*
- **D2 — `enrich(job_id, payload)` is the single contract kernel**, called by BOTH producers right before they build events, and by the snapshot serializer. Producers then pass the enriched `confidence`/`eta_seconds`/`eta_basis`/`estimated_end_at`/`grouped_progress` **into every `build_*_event(...)` call**.
- **D3 — Delete `compute_progress_confidence`** (`events.py:199`). Builders require a non-None enriched value and **fail loudly** (a real test, not a comment) if a progress-bearing frame reaches a builder with `confidence=None`. ⚠️ This means Task "wire the value" must update **all** `build_*_event` call sites in BOTH `service.py` (304/328/367/422/463) AND `ws.py`, or Path-A confidence goes None — a worse regression.
- **D4 — `enrich` COMPUTES ETA with a bootstrap rate.** When `engine_cps` is empty (cold/first render — the captured case), seed `seconds_per_char` from `DEFAULT_BASELINE_ENGINE_CPS` (already in `orchestrator_eta.py:85`) or a per-engine manifest default. Note: `predicted_audio_length`/`char_count` are **chapter/queue-row fields, not Job fields** — they are NOT directly accessible from a Job object; if char-based seeding is wanted it must be threaded in as an explicit new parameter. The genuine cold-null case is chapter-level `eta_seconds` when `expected_duration` is unavailable; the segment-ETA baseline already handles the segment path. Crossfade calculated→observed (§4A.8); bound by §4A.4 ceiling.
- **D5 — Monotonic floor is reconciled with the spec.** §4A/§3 put the *display* floor client-side (`progressMemory` by `persistenceKey`). The server `enrich` provides monotonic-clamped values, but the spec's client floor remains the display authority — the plan does NOT claim the server is the sole floor. (If we want server-authoritative, that's a spec change in the same task.)
- **D6 — Emission policy stays separate** (`_should_emit` throttle, terminal latch) — `enrich` is math only. The throttle's shared-state writes are RLock-guarded (D1).
- **D7 — Lock hierarchy (BLOCKER — must be enforced across the implementation).** `_STATE_LOCK` (`state_jobs.py`) is always the **outer** lock; the `ProgressService` RLock is a **leaf** — code that already holds the PS-RLock must NEVER call into `app.db.state_jobs` (which acquires `_STATE_LOCK`). The verified deadlock path: `state_jobs.update_job` holds `_STATE_LOCK` and invokes listeners (state_jobs.py:468-477) including `broadcast_job_updated` → after Task 004 the listener calls `enrich` → PS-RLock, giving order `_STATE_LOCK → PS-RLock`. Meanwhile `ProgressService.publish` calls `get_jobs()` (service.py:298,392) which takes `_STATE_LOCK` → if publish holds PS-RLock that's `PS-RLock → _STATE_LOCK`. AB-BA inversion. **Resolution: `publish` performs all `get_jobs()` reads (service.py:298,392) BEFORE entering the RLock-guarded region.** Task 002 must include a two-thread deadlock/lock-ordering test. See also Task 010.

## 3. Invariants (every progress frame, all paths)
- **PI1** — `eta_confidence` is numeric, computed by `enrich` (§4A.2); never equals `progress`. Verified on a **Path-B/subprocess-shaped sparse frame** (progress+status only), not just a synthetic stream.
- **PI2** — `progress`/`grouped_progress` char-weighted (B9), monotonic, `==1.0` at terminal — verified on the **frontend surface that actually renders** (RailBookBlock/ChapterList read `job.progress`; ChapterList prefers `grouped_progress`). **Verified bug**: `debug/chapter-segment.txt:48` shows `status:done, progress:1, grouped_progress:0.9` — `service.py:690-697` only clamps via `min(gp,1.0)` (upper bound) but never forces 1.0 on a terminal status. `enrich` MUST set `grouped_progress = 1.0` when status is terminal (done/error/cancelled), not merely clamp.
- **PI3** — `eta_seconds` present and converging even on a **cold render** (bootstrap cps), bounded, →0 at done.
- **PI4** — One enrich kernel + one RLock-guarded singleton; both producers + snapshot use it.
- **PI5** — Terminal latch + ordering preserved.
- **PI6** — Snapshot/REST hydration calls `enrich` (it bypasses the builders).
- **PI7 (new)** — A late high-confidence segment ETA dominates the chapter ETA (§4A.3 composition) and a *converging* ETA raises confidence (§4A.5) — the owner's "4s/91% should win" requirement.
- **PI8 (new)** — `enrich` signature: `enrich(job_id, payload, *, sample: bool = True)`. When `sample=False` (snapshot/hydration paths), it computes values WITHOUT mutating the per-job ETA ring or monotonic floor. The ETA ring is pushed at most once per `enrich` call (no double-sampling). See Task 001 acceptance, Task 007 wiring.

## 4. Acknowledged scope the panel surfaced (now in-plan)
- **Cold-load UX:** ~36s of XTTS model load reads as a frozen 0% bar with null ETA. No enrich can fix it (no velocity yet). Needs a distinct "loading voice model…" / indeterminate state during `preparing` — a real task, not silently dropped.
- **B8 freeze re-scoped:** the captured render had **zero `[START_SEGMENT]`/`[PROGRESS]` markers** — the freeze was model-load + sub-second synthesis, NOT an uncredited-markers bug. The within-group credit machinery already exists (`orchestrator_helpers.py:471/726`). So B8's binding work is a **synthetic-marker-stream unit test** to characterize whether a clean marker stream advances; the live "did the highlight fire" is owner evidence. If markers are absent in real renders, the freeze is engine/relay-side — a separate task, not this plan's credit logic. (Also: the two captures — `0.44-hold` vs `0→0.91` — are different renders; don't conflate.)
- **§4A.3/§4A.5 ETA composition** (PI7) needs its own task; v1 had none.

## 5. Verification rule (corrected)
- The **binding gate is a CI-runnable unit test**: feed one synthetic shared-state job dict through BOTH producers (publish + broadcast_job_updated) and assert the enriched `confidence`/`eta`/`grouped` match, AND that each differs from `progress`/isn't null on a cold/sparse frame. The **live event-stream capture is owner manual evidence**, not the autonomous gate. Golden-frame = dict **value-equality** with injected deterministic clocks (NOT byte/JSON-string identity — confidence math uses wall-clock + floats).
- Existing tests to update (refactor breaks them): `tests/orchestration/test_progress_logic.py` (calls `_build_progress_payload` directly, asserts `source` stack-walk), `tests/orchestration/test_progress_contract_v140.py` (constructs its own `ProgressService`), plus a conftest autouse reset for the new singleton.
