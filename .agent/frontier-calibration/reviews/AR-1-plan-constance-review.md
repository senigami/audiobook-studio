# AR-1 plan review — Esther (structural / top-down panelist)

**Date:** 2026-07-18
**Reviewing:** `design-docs/plans/active/ar1_concurrency_throttle/00-plan.md` (+ `.agent/frontier-calibration/references/AR-1.md`)
**Lens:** structural — reasoning downward from the code-map's chokepoint/invariants, trace as evidence.
**Verdict:** SOUND with corrections. The integration architecture is correct and well-grounded. The
blocking process-boundary question is real and I can now **resolve it from evidence** rather than
leave it open. Two honesty gaps and one API-semantics change need to be added before build.

---

## Ground truth loaded (map ritual)

- Core map + shards for `cap_settings.py` and `resources.py` loaded via `lookup.sh`.
- **Symbol trace of `resolve_effective_cap`** (the sole integration point). Callers confirmed on disk:
  - `resources.py:629-631` — live admission, re-resolved **fresh every attempt**, fed as `limit=` to
    both semaphores.
  - `progress/service.py:69-79` — ETA bracket (`_resolve_pool_cap`).
  - `engines_registry.py:72,127` — engines API `effective_cap` field.
  - Tests: `tests/orchestration/test_eta_bracket_and_engine_cap.py` (asserts exact values),
    `test_live_cap_admission.py:193` (patches the function).
- **`try_acquire` shrink mechanism confirmed** (`resources.py:226`):
  `effective = self._cap if limit is None else max(1, min(self._cap, limit))` — a live limit narrows
  admission, never mutates the grow-only structural cap, and **floors at 1**. This is exactly the
  primitive the throttle needs; the reference's read is accurate.
- Boot hook (`boot_studio` at `boot.py:76`), broadcast precedents (`ws.py:290` pause,
  `ws.py:686` `broadcast_studio_event`), and the conftest scheduler-reset block (`conftest.py:143-147`)
  all confirmed present as the plan assumes.

---

## What the plan gets right (established form is evidence — and here it holds)

1. **Chokepoint integration is the correct structural call.** Folding the penalty into
   `resolve_effective_cap` rather than adding a second gate is right *by construction*: the trace proves
   admission, ETA, and the engines API all route through this one function, so throttle + recovery flow
   everywhere with no new plumbing. A parallel pressure-gate (the rejected alternative) would have created
   a second cap-deciding site and bypassed ETA — correctly rejected.
2. **Throttle-down = stop-admitting, never kill in-flight.** The `limit=` narrowing on a grow-only
   semaphore means running workers drain normally; recovery is automatic on the next resolve. Verified,
   not asserted.
3. **Step-penalty over per-worker VRAM estimation** honours the repo's no-fabrication principle. Correct.
4. **Fail-open-**freeze** on sampler failure** (hold penalty, never grow it, surface `sampling_ok:false`)
   is the right reading of the no-fabrication precedent and avoids a stealth throughput regression.
5. **Side-effect ban respected** — thread started only from `boot_studio()`, lazy import in cap_settings.

---

## Corrections and gaps (owed before build)

### C1 — The blocking process-boundary question: RESOLVED by evidence. Do NOT sample torch.cuda in the Studio process.
The plan lists this as blocking and unresolved. I can resolve it:

- **`torch` is not a declared root dependency.** `requirements.txt` lists `psutil` but no torch (torch
  lives only in `tts_engines/tts_xtts/requirements.txt` → `~/xtts-env`).
- On this dev machine torch *is* importable in `./venv` (2.12.0) — but only as a transitive artifact
  (`Required-by: encodec, torchvision, trainer`, none of which are root deps either) and it is a
  **CPU/MPS build: `torch.version.cuda == None`, `torch.cuda.is_available() == False`.**

Consequence: the design's primary "`torch.cuda.mem_get_info()` when CUDA is available" branch is
**effectively dead in the Studio process on any standard install** — it will always fall through to the
fallback. Two honest homes remain:
  - **Preferred: `/health` heartbeat transport.** The `tts_server` process runs in `~/xtts-env` with a
    CUDA-enabled torch **and already holds the live model context**, so `mem_get_info()` there is free
    (no extra CUDA-context VRAM cost) and accurate. `build_health_response` (`health.py:119`) is the
    natural place to add a `memory` field; the watchdog already polls it.
  - **Alternative: `nvidia-smi` subprocess from the Studio process** — works cross-process, no CUDA
    context cost, but see C2.

Recommendation: **health transport.** Task 1 should not be "decide"; the evidence already points one way.

### C2 — Transport choice is a *correctness* axis, not just an implementation detail.
The architecture routes synthesis over HTTP (`bridge_remote.py` + `tts_client.py`), so a **remote
TTS server** is at least conceivable. Under that topology, `nvidia-smi` on the Studio host reads the
*wrong machine's* GPU. Only the `/health` transport is correct-by-construction because the reporting
process is the one that owns the device. The plan frames transport as "same design, different transport";
it is also same-host-only vs. topology-correct. Another point for C1's recommendation.

### C3 — This is OOM *mitigation*, not *prevention*. State it plainly for the owner.
A purely reactive percentage-watermark throttle **cannot prevent the OOM caused by the very admission
that crosses the line**: if free headroom at 89% is smaller than one XTTS worker's (multi-GB) footprint,
that worker OOMs before any sample observes 90%. The throttle reduces the probability of the *next* OOM;
it does not guarantee against the *triggering* one. The reference leans (correctly) on watchdog-restart +
task-recovery as the safety net — which is right — but the feature must be sold as mitigation, not a
guarantee. This is the single most important honesty framing for the owner's call.

### C4 — Down-detection latency vs. model-load spike is the highest-risk unknown — rank it above the recovery numbers.
The reference flags the recovery numbers (75%/30s/60s) as the medium-confidence part. I disagree on
*which* number matters most: the **2-sample (~6s) down-step confirmation** is the make-or-break, because
XTTS VRAM is spikiest exactly during model load, and an OOM during that ~6s window is precisely the loss
the feature exists to prevent. Tune/validate the down-detection window against real load-spike traces
first; the recovery cadence is lower-stakes (worst case = slightly slow throughput recovery).

### C5 — `effective_cap` in the engines API becomes time-variant. That is an existing-contract semantic change.
Post-change, `engines_registry.py`'s `effective_cap` will flicker second-to-second under GPU pressure.
Today it answers "what is your configured ceiling"; after, it conflates that with "momentary throttled
admission limit." The plan's item 4.3 (add `get_pressure_state()` to the payload) is good but does not
address that the *existing* field's meaning changes. Decide deliberately: keep `effective_cap` = the
configured/structural effective value and expose the throttled value as a distinct field
(`throttled_cap` / pressure state), so a user reading Settings isn't shown a number depressed by a
transient spike. This also keeps the direct-call value tests (`test_eta_bracket_and_engine_cap.py`)
meaning what they mean today.

### C6 — Add a conftest reset hook for the monitor's global penalty state.
`conftest.py:143-147` resets the scheduler gates between tests precisely because they are global mutable
state. `get_pressure_penalty()` introduces another piece of global state read by `resolve_effective_cap`.
Without a reset hook, a test that pushes the penalty up leaks it into later cases and silently corrupts
the exact-value assertions. Task 7 mentions regression but not this hook specifically — make it explicit.

### C7 — Scope: "CPU-aware" is deferred to telemetry. Surface it, don't bury it.
Owner framing and the plan *title* say "VRAM/CPU-aware"; the reference gates on VRAM/RAM only in v1 and
records CPU as telemetry. That is a defensible scope cut, but it is a partial answer to the stated ask and
a mild title/spec drift. Flag it as an explicit owner-visible decision, not a footnote.

### C8 (minor) — Device-global penalty is applied per-engine.
The penalty is engine-neutral (samples the device) but subtracted inside a per-engine resolve. With one
GPU engine (xtts) and cloud engines flooring at manifest_max=1, this is harmless today. Note it as a
known limitation if two GPU-resident engine classes ever run concurrently (both would be penalised for
pressure only one caused).

---

## Blast-radius summary (from the trace, not felt)
The one-line change sits inside a function on **four** call paths (admission, ETA, engines API ×2) plus
two direct-value test files. It is not a "small" change: it converts a pure function of
`(engine_id, manifest_max, settings)` into one that reads live background-thread state, giving it
time-variance that propagates to a user-facing API field (C5) and to test determinism (C6). The admission
path is race-safe by construction (`try_acquire` under lock, floor-of-1 confirmed) — that part is low
risk. The risk concentrates in the semantic/observability surface, not the mechanism.

## Confidence & falsifier
- **High (0.85)** that the chokepoint integration + shrink mechanism are the correct architecture — the
  trace and semaphore semantics were visibly built for this.
- **High (0.8)** on C1 (do not use in-process torch.cuda) — grounded in the actual requirements + the
  observed CPU-only torch build; would flip only if root `requirements.txt` were changed to ship a
  CUDA torch (which adds a heavy dep to the lean root env — itself an argument against).
- **Medium (0.6)** on the hysteresis numbers, same as the reference, but with C4 re-ranking which number
  is load-bearing.

## Escalation note
The hysteresis watermarks and the OOM mitigation-vs-guarantee framing (C3) are the owner's call, not a
build detail — they trade throughput against crash risk with no in-repo trace data to tune against. Stage
real XTTS VRAM-during-load traces for the owner before locking C4's down-step window. Everything else here
is a build-time correction the engineer can act on directly.
