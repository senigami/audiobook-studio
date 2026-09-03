# Task 001 — Per-engine concurrency cap + scheduler semaphores

**Workstream:** W-PAR  ·  **Depends on:** G0 prereq  ·  **Blocks:** 002, 004  ·  **Status:** DONE (2026-06-26)

> **Ships-dark mechanism (as built):** per-engine-class concurrency is gated behind the env flag
> `ENGINE_CLASS_ADMISSION` (**default OFF**). While off, every `engine_class` claim is funnelled
> through the single shared exclusive gate → exact pre-W-PAR single-flight (xtts/voxtral/mixed/api all
> one-at-a-time), so 001 is genuinely byte-identical to today. The per-class counting-semaphore
> machinery, manifest caps, `_claim_to_dict` propagation, and plugin validation are all in place and
> dormant. **Task 007 surfaces this flag as a proper setting** (and must snapshot it into the claim at
> reserve time so a mid-render toggle can't desync release). W5 is closed at runtime even in dark mode
> (mixed takes the exclusive slot instead of bypassing admission). All manifest caps are 1 in 001;
> real caps (e.g. voxtral) land with the toggle in 007. Adversarial-reviewed; 434 orchestration/queue
> tests green.

> Read [`../01-map.md`](../01-map.md) (Parts **A**, **B**; invariants **INV-1**, **INV-5**, **INV-10**)
> and [`../00-overview.md`](../00-overview.md) before starting. This task is the foundation: every
> downstream task (parent/child scheduling, TTS server concurrency, correctness invariants) relies on
> the semaphore primitives and manifest cap values established here.

## Goal

Declare a `behavior.max_concurrent_workers` field in each engine manifest and replace the binary
`GpuAdmissionGate` / `ExclusiveAdmissionGate` one-at-a-time locks in `resources.py` with per-engine-
class counting semaphores sized to that cap. Add a global cap backstop. Default cap = 1, so behavior
is **byte-identical to today** (INV-1). This task also closes the W5 gap: `SynthesisTask` currently
hard-codes `ResourceClaim.none()` for `engine_id == "mixed"` (synthesis.py:89); after this task the
claim is derived from the engine manifest cap/class instead of an engine-ID branch (INV-5).

## Why it matters

Today two `threading.Lock`-backed gates admit exactly one synthesis task at a time, regardless of
engine. A cloud (Voxtral) render and a local XTTS render queue behind each other even though they
share no resource. The manifest-declared cap is the control surface that lets each engine class run N
concurrent jobs without engine-ID branching anywhere in core code. With default cap = 1 this is a
safe no-op landing (Milestone M-PAR-1 "ships dark"). With cap ≥ 2 it unlocks real concurrency once
001 + 002–003 are merged.

The W5 gap (`ResourceClaim.none()` for mixed) means the mixed engine currently bypasses resource
admission entirely — it cannot throttle even when downstream tasks need a semaphore slot. Closing it
here means the mixed engine gets a semaphore slot like any other engine, derived from its manifest.

## Files to touch

| File | Current anchor (file:line) | Change |
|------|---------------------------|--------|
| `plugins/tts_xtts/manifest.json` | `behavior` block, line 26; no `max_concurrent_workers` field | Add `"max_concurrent_workers": 1` (GPU-local, VRAM-constrained; conservative default) |
| `plugins/tts_voxtral/manifest.json` | `behavior` block, line 26; no `max_concurrent_workers` field | Add `"max_concurrent_workers": 4` (cloud / network-bound; concurrency is free) |
| `plugins/tts_mixed/manifest.json` | `behavior` block, line 15; no `max_concurrent_workers` field | Add `"max_concurrent_workers": 1` (inherits from child engines in practice; 1 is safe default until 002 fans children) |
| `app/orchestration/scheduler/resources.py` | `GpuAdmissionGate` class at line 97; `ExclusiveAdmissionGate` at line 169; singletons `_gpu_gate`/`_exclusive_gate` at lines 210–211; `reserve_task_resources` at line 224; `release_task_resources` at line 308 | Replace both binary gates with a `EngineClassSemaphore` (counting semaphore keyed by engine/processor class) sized from the manifest cap. Add `get_engine_semaphore(engine_class, cap)` factory. Add a global cap backstop (`MAX_GLOBAL_CONCURRENT_SYNTHESIS` from settings, default 8). Update `reserve_task_resources` and `release_task_resources` to acquire/release the appropriate semaphore. Preserve the `reset()` and `active_task_id` interfaces for tests that rely on them, or document the migration. |
| `app/orchestration/tasks/synthesis.py` | `ResourceClaim.none() if engine_id == "mixed" else ResourceClaim.exclusive_claim()` at line 89 | Replace the engine-ID branch with a manifest-driven lookup: read the manifest for `engine_id`, resolve its resource class (gpu/cpu-heavy/cloud), and build the `ResourceClaim` from that. `mixed` with `max_concurrent_workers=1` and no GPU/cpu-heavy resource claims gets a counting-semaphore slot in the cpu/cloud class, not `none()`. |
| `app/tts_server/plugin_loader.py` | manifest validation (load-time schema check) | Accept and validate the new `behavior.max_concurrent_workers` field (integer ≥ 1); manifests without it default to 1 (backward compatibility). |

### Anchor note

`studio_tts_manifest` is currently `"1.0"` in all three manifests. The `max_concurrent_workers` field
is a backward-compatible addition (missing = default 1); a manifest version bump is optional but
recommended for clarity. Bump to `"1.1"` if you bump; the loader must still accept `"1.0"` manifests.

## Target shape / contract

- Each engine manifest declares `behavior.max_concurrent_workers` (integer ≥ 1; absent → 1).
- `resources.py` exposes `get_engine_semaphore(engine_class: str, cap: int) -> EngineClassSemaphore`
  (module-level singletons keyed by class string, lazily created from the manifest cap at first
  admission call). Engine class is derived from the manifest resource block: `"gpu"` if `resource.gpu`,
  `"cpu_heavy"` if `resource.cpu_heavy`, else `"cloud"`.
- `reserve_task_resources(...)` acquires a slot from the engine-class semaphore (non-blocking; returns
  `admitted=False` + `waiting_reason` if all slots taken). Global cap backstop is checked first.
- `release_task_resources(...)` releases the slot back.
- `SynthesisTask.__init__` (synthesis.py:88–90): the `ResourceClaim` is constructed from the
  manifest-resolved resource class, not an engine-ID branch. No `if engine_id == "mixed"` remains.
- With any engine's `max_concurrent_workers = 1`: exactly one task of that engine class runs at a
  time — identical to today's behavior (INV-1). With N ≥ 2: N tasks run concurrently, N+1st waits.
- No engine-ID branching in core code (INV-5). Semaphore keys are engine-class strings derived from
  the manifest resource block, not engine_id strings.

## Steps (ordered)

1. **Write the failing tests first** (see Tests section). Confirm red on current code.
2. Add `"max_concurrent_workers": 1` to `plugins/tts_xtts/manifest.json` `behavior` block.
3. Add `"max_concurrent_workers": 4` to `plugins/tts_voxtral/manifest.json` `behavior` block.
4. Add `"max_concurrent_workers": 1` to `plugins/tts_mixed/manifest.json` `behavior` block.
5. Optionally bump `studio_tts_manifest` to `"1.1"` in all three manifests; update loader to accept
   both `"1.0"` and `"1.1"`.
6. In `app/tts_server/plugin_loader.py`, add validation for `behavior.max_concurrent_workers`
   (integer ≥ 1); missing field defaults to 1.
7. In `app/orchestration/scheduler/resources.py`:
   a. Add `EngineClassSemaphore` (wraps `threading.Semaphore`; tracks active count + task IDs;
      exposes `try_acquire(task_id) -> (bool, str | None)`, `release(task_id)`, `active_count`,
      `waiting_reason(task_id)`, `reset()`).
   b. Add `get_engine_semaphore(engine_class: str, cap: int) -> EngineClassSemaphore` factory
      (module-level dict, created once per class string).
   c. Add `_global_cap_gate` (a counting semaphore at `MAX_GLOBAL_CONCURRENT_SYNTHESIS`, default 8
      from settings/env).
   d. Keep `GpuAdmissionGate` and `ExclusiveAdmissionGate` as **deprecated aliases** (or thin wrappers
      around `get_engine_semaphore("gpu", 1)` / `get_engine_semaphore("exclusive", 1)`) so existing
      tests compile. Mark them deprecated with a comment.
   e. Update `reserve_task_resources(...)`: check global cap first, then engine-class semaphore.
      Pass `engine_class` and `cap` as new optional kwargs (derived from the manifest cap the
      orchestrator already has). Return the same dict shape; add `engine_class` key.
   f. Update `release_task_resources(...)`: release engine-class semaphore + global cap.
8. In `app/orchestration/tasks/synthesis.py:88–90`: replace the `engine_id == "mixed"` branch with
   a manifest-driven `ResourceClaim`. Load the manifest (via the plugin loader or a thin helper),
   read `resource.gpu` / `resource.cpu_heavy` / `max_concurrent_workers`, and set:
   - GPU resource + exclusive flag if `resource.gpu`
   - cpu_heavy flag if `resource.cpu_heavy`
   - No exclusive flag (the semaphore in resources.py now governs concurrency)
   No `if engine_id` branches remain.
9. Revert-check (R1): stash the fix, run the cap=1 invariant test (step 1), confirm it goes red,
   restore.
10. Update `design-docs/specs/queue-jobs.md` and `design-docs/specs/system-architecture.md`: note
    the per-engine semaphore model, bump `spec_version`, add a changelog row.

## Tests (TDD — write first)

Write these before implementing. Confirm each is red on current code (R1 revert-check).

**File:** `tests/orchestration/test_engine_semaphores.py` (new)

- **`test_cap1_admits_one_blocks_second`** — Build an `EngineClassSemaphore(cap=1)`. First
  `try_acquire("task-A")` → `(True, None)`. Second `try_acquire("task-B")` → `(False, reason_str)`.
  After `release("task-A")`, `try_acquire("task-B")` → `(True, None)`. **Red on current code** (class
  doesn't exist yet).
- **`test_cap2_admits_two_blocks_third`** — `EngineClassSemaphore(cap=2)`. Admit A and B → both
  `True`. Third C → `(False, ...)`. Release A → C now admits.
- **`test_reserve_task_resources_engine_class_serial_with_cap1`** — Call
  `reserve_task_resources(task_type="synthesis", resource_claims={..., "engine_class": "gpu", "cap": 1, "task_id": "t1"})`.
  Assert `admitted=True`. Call again with `task_id="t2"` → `admitted=False`. Release t1 →
  t2 admits. **Pins INV-1: with cap=1 behavior is serial (= today).**
- **`test_mixed_engine_no_longer_uses_resource_claim_none`** — Construct a `SynthesisTask` with
  `engine_id="mixed"`. Assert `task.resource_claim` is not `ResourceClaim.none()` (it must have a
  semaphore slot, not bypass admission). **Red on current code** (line 89 returns `none()` for mixed).
- **`test_manifest_missing_max_concurrent_workers_defaults_to_1`** — Load a manifest dict without
  `behavior.max_concurrent_workers`. Assert the loader resolves the cap to 1.
- **`test_no_engine_id_branching_in_resources`** — Grep `resources.py` for `engine_id` string
  comparisons (a static check via `ast.parse` or regex). Assert zero hits. Regression: ensure the
  old `if engine_id == "mixed"` branch is gone from synthesis.py.

**Constraints (R2, R4):** mock only the filesystem/manifest-loader boundary; do not mock
`EngineClassSemaphore` itself (it is the unit under test). No `sleep` or wall-clock waits — semaphore
`try_acquire` is non-blocking.

**Commands:**
```
./venv/bin/python -m pytest tests/orchestration/test_engine_semaphores.py -q
./venv/bin/python -m pytest tests/orchestration -q -k "semaphore or resource_claim or cap"
ruff check app/orchestration/scheduler/resources.py app/orchestration/tasks/synthesis.py plugins/
```

## Acceptance criteria

- [ ] All three engine manifests declare `behavior.max_concurrent_workers`.
- [ ] `resources.py` exposes `EngineClassSemaphore` and `get_engine_semaphore(class, cap)`.
- [ ] With `max_concurrent_workers=1` (any engine): only one task of that class runs at a time —
      serial behavior identical to today (INV-1). The full test suite passes unchanged.
- [ ] With `max_concurrent_workers=N` (N ≥ 2): N tasks of that engine class are admitted concurrently;
      N+1th waits; releasing one admits the next.
- [ ] `SynthesisTask` (synthesis.py:88–90) derives its `ResourceClaim` from the manifest cap/class;
      no `if engine_id == "mixed"` branch remains (INV-5 + W5 closed).
- [ ] `app/tts_server/plugin_loader.py` validates `max_concurrent_workers` (integer ≥ 1); manifests
      without the field load as cap = 1.
- [ ] No engine-ID string comparisons in `resources.py` (INV-5). Semaphore keys are engine-class
      strings derived from the manifest resource block.
- [ ] Global cap backstop is enforced before the engine-class semaphore.
- [ ] `design-docs/specs/queue-jobs.md` and `design-docs/specs/system-architecture.md` updated with
      changelog rows and `spec_version` bumps.
- [ ] All new tests pass; R1 revert-check confirmed for the cap=1 serial test and the mixed
      `ResourceClaim.none()` test.

## Map links

- `../01-map.md` Parts **A** (cap declaration) and **B** (scheduler semaphores); invariants **INV-1**
  (ships dark), **INV-5** (no engine-ID branching), **INV-10** (VRAM-aware, fail-safe).
- Subsumes **W5** from
  [`../mixed-synthesis-fused-proposal/00-overview.md`](../../mixed-synthesis-fused-proposal/00-overview.md)
  (§Scope, Layer 4) — the mixed `ResourceClaim.none()` gap is closed here.
- Milestone **M-PAR-1** ("ships dark"): this task + task 004 merged = cap + server concurrency exist
  at default 1, no behavior change, safe to land pre-release.

## Out of scope

- Parent/child segment scheduling (fan-out) → **task 002**.
- TTS server warm-worker semaphore and `run_in_threadpool` → **task 004** (shares the cap value from
  this task but is an independent server-side change).
- Per-segment dispatch isolation (the R-A keystone refactor) → **task 003**.
- ETA under parallelism → **task 007**.
- Any frontend changes → **tasks 006, 007**.
- Multi-GPU / distributed rendering — Phase 2 and out of scope for this plan.
