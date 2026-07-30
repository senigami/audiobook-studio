# AR-1 concurrency-throttle plan — Tamsin review (empirical / bottom-up)

**Reviewer:** Tamsin (younger sibling; empirical lens — reasoned up from call sites, not the design's self-description)
**Date:** 2026-07-18
**Plan:** `design-docs/plans/active/ar1_concurrency_throttle/00-plan.md`
**Verdict:** **Conditional go.** The core mechanism is architecturally sound and lands on a genuinely correct single chokepoint — but the plan ships with one arithmetic bug in its stated integration order, a backwards default for the blocking process-boundary question (which is more answerable *now* than the plan claims), and an unacknowledged gap between its stated goal ("prevent mid-render OOM") and what the mechanism can actually do.

---

## Ground truth loaded (map ritual)

- Core map + shards for `cap_settings` and `resources` pulled via `.agent/code-map/tools/lookup.sh`.
- Symbol trace on `resolve_effective_cap` — **three** callers, all routing through the one function:
  - `app/orchestration/scheduler/resources.py:631` (admission — `live_limit` → `try_acquire(..., limit=)`)
  - `app/orchestration/progress/service.py:79` (ETA bracket)
  - `app/api/routers/engines_registry.py:72,127` (engines API display)
- Read `cap_settings.py:119-156` (the function), `resources.py:600-729` (admission path), `watchdog.py` spawn, `tts_xtts/README.md:38-55` (process topology), root `requirements.txt`, and ran the dev venv to check torch/CUDA reality.

---

## What the plan gets right (confirmed against the code, not the reference)

1. **The chokepoint claim is true and strong.** `resolve_effective_cap` really is the single place every consumer derives the effective cap from (3 callers above). Wiring the penalty here does reach admission, ETA, and the engines API without extra plumbing. Verified, not assumed.

2. **The architecture already supports *dynamic lowering* — this is the load-bearing fact.** Task 014 (2026-07-11) split the structural cap from the live limit: `get_engine_semaphore(engine_class, cap)` is grow-only and never shrinks, while `try_acquire(task_id, limit=live_limit)` (`resources.py:699,706`) resolves admission as `min(self._cap, limit)` *per call without mutating the semaphore*. `live_limit` is literally the return of `resolve_effective_cap`, re-resolved fresh every admission (`resources.py:626-631`). A memory penalty flowing through this path narrows admission correctly and reversibly, with no semaphore surgery. The plan's central bet is well-founded.

---

## Must-fix before implementation

### F1 — The stated clamp order is arithmetically wrong (masks the penalty)

The plan says: "subtracts the penalty **before** the manifest-ceiling clamp." The current return is:

```python
return max(1, min(requested_cap, manifest_ceiling))   # cap_settings.py:156
```

"Before the clamp" means `min(requested_cap - penalty, manifest_ceiling)`. When `requested_cap > manifest_ceiling` (a legitimate config — global cap 8, manifest ceiling 4), the penalty is swallowed by the clamp: `min(8-1, 4) = 4`, i.e. **no reduction at all**. The intent — reduce the number of workers actually admitted — requires subtracting from the *clamped* value:

```python
return max(1, min(requested_cap, manifest_ceiling) - penalty)
```

This bug is insidious because at the shipped default (`requested_cap=2`, `manifest_ceiling>=2`) both orderings give the same answer, so a naive Task 3 test passes and the defect only surfaces on machines with a higher configured cap — exactly the machines that most need the throttle. **Fix the stated order to subtract after the min, and make the Task 3 test use `requested_cap > manifest_max`** so it would actually catch this.

### F2 — The blocking "can Studio read CUDA" question is mostly answerable now, and the plan's default answer is backwards

The plan treats `torch.cuda.mem_get_info()` as primary and `nvidia-smi` as fallback, and flags the process boundary as an open blocker. The trace resolves most of it:

- **Root/server venv has no torch by contract.** `requirements.txt` (root) contains no torch; torch is declared only in `tts_engines/tts_xtts/requirements.txt`, installed "only into the external xtts-env" (its own comment). Torch *is* importable in this dev `./venv` (2.12.0) — but that's incidental to this machine, not guaranteed by the install contract. A clean CI/production Studio process cannot rely on `import torch`.
- **The VRAM is consumed by a third process, not Studio and not the TTS server.** Per `tts_xtts/README.md:42` and the env-readiness tests, real XTTS inference shells out to `XTTS_ENV_PYTHON` as a subprocess in `~/xtts-env`. The model copies (the actual VRAM) live in those ephemeral per-render subprocesses. Neither the long-lived Studio process nor the TTS-server process is where the memory sits.
- **This dev machine has no CUDA at all** (`torch.cuda.is_available()` → False; MPS only), so `torch.cuda.mem_get_info()` is a dead path here regardless.

Conclusion: **invert the priority.** The portable, process-boundary-independent primary path is `nvidia-smi` / NVML (pynvml) reading *global board* free/total — which is exactly the right signal, since you want total board pressure across all the xtts subprocesses, not one process's view. `torch.cuda` in-process should be demoted to opportunistic-only or dropped; initializing a CUDA context inside the long-lived Studio daemon just to poll is heavyweight and often unavailable. This mostly **unblocks Task 1** — the answer is "sample globally via NVML/nvidia-smi from the Studio daemon; do not depend on in-process torch." The health-heartbeat transport is a fallback only if NVML is also unreachable from the Studio process, which is unlikely (nvidia-smi is a system binary, not an env dep).

---

## Must-address (design honesty, not necessarily blocking)

### F3 — The mechanism cannot do what the problem statement claims

Problem statement: "too-high a cap risks a mid-render OOM (losing in-flight work)... lets the effective cap drop under live memory pressure." But `try_acquire` only gates **new** admissions. It cannot preempt or evict an already-running worker. If N model copies are already resident and pressure spikes toward OOM, dropping the effective cap relieves nothing until a worker finishes on its own. The throttle is **preventive of over-ramp, not corrective of current load** — it cannot prevent an OOM caused by work already admitted, which is the specific failure the problem names. Combined with F4 below, the design is a soft-pressure smoother, not an OOM guarantee. Reframe the problem/goal honestly: "prevents concurrency from climbing further under pressure and eases it back as workers drain," not "prevents mid-render OOM."

### F4 — The debounce delays protection past the danger point; and true OOM-safety was scoped out

The down-step fires only after "VRAM ≥90% for 2 samples / ~6s." With per-worker model copies, the memory jump from admitting one more worker can cross 90% in a single step — and the 6s debounce means the offending worker is *already admitted (and possibly OOM'd)* before the penalty applies. The only genuinely OOM-safe move — "don't admit if free VRAM < one-model estimate" — depends on per-worker VRAM estimation, which the plan explicitly rejects as out of scope. That rejection is defensible (cross-model guessing, contract bump), but it removes the one predictive guard, so the design should stop implying OOM prevention. Consider: make the *down* direction less debounced than the up direction (protect fast, recover slow), and document that the floor-of-1 case still runs one model copy that can itself OOM — the throttle has no answer below cap=1.

### F5 — Feeding the ETA bracket "for free" is double-edged (regression risk)

The plan counts `resolve_effective_cap` also feeding `progress/service.py:79` as a free win. It's also a hazard: a fluctuating pressure penalty will move the ETA bracket up and down mid-render. Project memory records a standing **no-fabrication / no-ETA-jump** principle and a past bug fix for exactly this class of visible jump. A throttle that makes ETA yo-yo would reintroduce that. **Add a test that pressure-driven cap changes do not cause ETA jumps**, or have the ETA path read the *structural* cap (`manifest_max` / configured) rather than the pressure-adjusted effective cap. This decision needs to be explicit in the plan, not incidental.

---

## Smaller notes

- **Shared-GPU semantics undocumented.** Board-total percent thresholds mean non-Studio processes' memory counts toward the penalty — Studio throttles itself for pressure it didn't cause. That may be desired (protect the box) or not (Studio starves for someone else's job). State the intended behavior.
- **Recovery latency.** Single-step recovery + 60s dwell per step means climbing back from a deep penalty (e.g. -4) takes ~4 × (30s + 60s) ≈ 6 minutes of throughput left on the table after pressure clears. Fine if intentional; flag it.
- **Versioned event.** Owner directive requires every event declare an explicit version validated at load. The plan says the `concurrency_throttle` event "mirrors `broadcast_pause_state`" (`ws.py:290`) — verify that helper actually carries a schema version; the grep didn't show one on the pause helper, so "mirror it" may inherit a missing-version gap. Confirm before copying.
- **Fail-open-freeze is correct** and consistent with the no-fabrication principle; no objection.

---

## Confidence & falsifier

**Confidence: high** on F1 (pure arithmetic over code I read), F2 (topology confirmed from README + requirements + live venv), and F3/F4 (direct from the `try_acquire`-gates-admission-only semantics at `resources.py:699`). **Medium** on F5 (depends on how `progress/service.py` consumes the value — I read its call site but not the full bracket math).

**What would change my call:** if `progress/service.py` already snapshots the structural cap and never re-reads the effective cap mid-render, F5 dissolves. If there exists a production install where torch+CUDA is reliably in the Studio process venv by contract (not just this dev box), F2's inversion weakens — but the requirements.txt evidence says otherwise.

## Escalation note

No frontier-escalation trigger from my seat: the calls here are grounded in traced code, not judgment beyond the ceiling. The one genuinely owner-facing decision embedded in the plan is **F5's ETA policy** (does effective-cap throttling get to move user-visible ETAs?) — that touches a release-facing behavior the owner has previously ruled on. Stage that as a decision for the owner rather than letting the implementer pick silently. Convergence check with Esther pending via the fusion-reasoning judge.
