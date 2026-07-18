# Task 014 — Live per-engine cap admission (close the "setting has no effect" gap)

Status: complete — 2026-07-11

Risk: quality-sensitive (touches the live admission path every render job goes through), multi-file

## Goal

Make a change to `tts_parallel_cap`/`tts_engine_caps` (however it's written — task 012's new UI, a direct settings edit, or a future API client) take effect on **already-queued and already-running** work within seconds, not only on the next process restart. Add a purpose-built API for reading/writing per-engine concurrency that validates against the manifest ceiling server-side.

## Why this matters

Task 012 makes the cap setting configurable and honest about its ceiling in the UI. It does not fix a deeper, separate problem this session diagnosed: even after 012 lands, changing the setting has **no live effect** — `ResourceClaim.cap` is frozen to the *effective* cap at task-construction time, and `EngineClassSemaphore` (`app/orchestration/scheduler/resources.py`) only ever grows, never shrinks. A user who raises `tts_engine_caps["xtts"]` from 2 to 4 sees no new concurrency until whatever already-queued claims cycle through or the process restarts; a user who lowers it sees the old, higher cap keep admitting new work indefinitely. Task 012's own "Out of scope" section explicitly defers this exact problem to its own task — this is that task.

This design was independently produced and reviewed this session (a bounded higher-tier dispatch scoped to just this mechanism, per this repo's escalation-approval convention) and its two flagged pre-implementation checks are folded into this task's acceptance criteria below — do not skip them.

## Current shape (verified 2026-07-11 against HEAD `fa988658`)

- `app/orchestration/scheduler/resources.py`:
  - `EngineClassSemaphore.__init__` — line 174. Constructor signature: `def __init__(self, cap: int = 1, *, class_name: str = "") -> None:`. The `class_name == "exclusive"` branch (lines ~177-181) hard-pins `cap` to 1 and raises if a caller ever requests more — **do not touch this branch**.
  - `EngineClassSemaphore.try_acquire` — line 187. Signature: `def try_acquire(self, task_id: str) -> tuple[bool, Optional[str]]:`. Body acquires `self._lock`, compares `len(self._active_ids) < self._cap`.
  - `EngineClassSemaphore.release` — line 218. No cap logic — releases are unconditional, no change needed here.
  - `EngineClassSemaphore.ensure_min_cap` — line 256. Grow-only by design (a 2026-07-03 fix, per its own docstring) — protects against call-order races among callers requesting the manifest cap. **Keep this exactly as-is**; this task does not touch `ensure_min_cap`, only what value it's called with (see Target shape).
  - `ResourceClaim` class — line 88 (`@dataclass(frozen=True)`, definition at 88). `exclusive_claim()` classmethod at line 123 returns `cls(exclusive=True, engine_class="exclusive", cap=1)` — carries no `engine_id`, so it's structurally exempt from anything this task adds.
  - `reserve_task_resources` — line 535, signature `def reserve_task_resources(*, task_type: str, resource_claims: dict[str, object]) -> dict[str, object]:`.
  - `release_task_resources` — line 709, signature `def release_task_resources(*, task_id: str, resource_claims: dict[str, object]) -> None:`.
- `app/orchestration/scheduler/cap_settings.py`:
  - `resolve_effective_cap(engine_id, manifest_max)` — line 119 (signature 119-124, ends 156). Already computes `min(per-engine override or global cap, manifest_max)`, clamped `>= 1`. **This function already exists and already does the right computation — reuse it, do not reimplement.**
  - `get_engine_caps` — line 89.
  - `get_global_parallel_cap` — line 68.
  - **Known doc bug, fix in this task**: the module docstring (lines 31-33) claims `_normalize_settings` materializes a default of `1` for `tts_parallel_cap`. The actual materialized default is **`2`** (`app/db/state_settings.py:22`, matching `DEFAULT_GLOBAL_CAP = 2` at `cap_settings.py:56`). Fix the docstring in this task's diff.
- `app/orchestration/tasks/synthesis.py`:
  - `_manifest_resource_claim` — line 29, signature `def _manifest_resource_claim(engine_id: str) -> ResourceClaim:`. Currently bakes `resolve_effective_cap(...)` directly into `cap=`.
- `app/api/routers/system.py`: `POST /settings` handler at line 181-182; JSON-body branch parsing `tts_parallel_cap`/`tts_engine_caps` at lines 211-217; final redacted-settings response at line 252. This task adds a new, separate router rather than extending this one (see Target shape).
- `app/db/state_settings.py`: `tts_parallel_cap` default `2` at line 22, `tts_engine_caps` default `{}` at line 23; normalization/clamping at lines 111 (`tts_parallel_cap`) and 115-124 (`tts_engine_caps` coercion). No `set_engine_cap`-style single-key merge helper exists yet — every write today goes through whole-settings-object normalization.
- `app/api/routers/engines.py`: exists with `prefix="/api/engines"` (per this task's target — confirm the exact prefix line when you open the file, it may have shifted since this was last read).

## Target shape

### 1. Separate "structural ceiling" from "live limit" in the semaphore

`EngineClassSemaphore.try_acquire` gains an optional `limit` parameter:

```python
def try_acquire(self, task_id: str, limit: Optional[int] = None) -> tuple[bool, Optional[str]]:
    with self._lock:
        effective = self._cap if limit is None else max(1, min(self._cap, limit))
        if len(self._active_ids) < effective:
            self._active_ids.add(task_id)
            ...admit, same as today...
            return True, None
        ...same rejection path, using `effective` instead of `self._cap` in the reason string...
```

- `self._cap` remains the **structural ceiling** (manifest max), still grown only via the existing `ensure_min_cap` — unchanged.
- `limit`, when passed, is the **live limit** — computed fresh by the caller on every admission attempt, never stored on the semaphore itself.
- This is race-free by construction: the check happens atomically under the existing `self._lock`; `limit` is a call parameter, not mutable shared state, so there is no "shrink in progress" state two threads could race on. A settings write landing between a caller reading settings and calling `try_acquire` is indistinguishable from the write having happened a moment earlier or later — this is expected and fine.
- **Shrink correctness**: if 4 tasks hold slots and the live limit drops to 2, no eviction occurs — `release()` never consults cap (confirmed, line 218) — so the 4 in-flight tasks finish normally, and no new task is admitted until active count drops below 2. This matches "changes take effect for queued segments, not in-flight ones" (design doc, `10-phase2-render-monitor.md:116`).
- **Exclusive-class invariant is untouched**: `min(self._cap, limit)` can only lower the effective value, never raise it, so the `cap=1` pin for `class_name == "exclusive"` is never at risk — and exclusive claims never carry an `engine_id` (confirmed above), so the live-limit path below never even applies to them.

### 2. Thread `manifest_max` through the claim, resolve the live limit at admission time

- `ResourceClaim` (the frozen dataclass at `resources.py:88`) gains a field: `manifest_max: int = 1`.
- `_manifest_resource_claim` (`synthesis.py:29`) changes from baking `resolve_effective_cap(...)` into `cap=` to setting `cap=manifest_max` (the structural ceiling) and `manifest_max=manifest_max` (same value, both fields — `cap` stops being "the effective cap" and becomes purely structural).
- `reserve_task_resources` (`resources.py:535`): for any claim carrying both `engine_id` and `manifest_max`, resolve the live limit fresh on **every call** (lazy import of `cap_settings`, matching the existing lazy-import style already used for `app.db.state` elsewhere in this file — check the file's existing lazy-import convention before adding a new one):
  ```python
  from app.orchestration.scheduler.cap_settings import resolve_effective_cap  # lazy, per attempt
  effective = resolve_effective_cap(engine_id=claim.engine_id, manifest_max=claim.manifest_max)
  sem = get_engine_semaphore(claim.engine_class, claim.manifest_max)   # ensure_min_cap fed the ceiling, not the live limit
  admitted, reason = sem.try_acquire(task_id, limit=effective)
  id_sem = get_engine_id_semaphore(claim.engine_id, claim.manifest_max)
  id_admitted, id_reason = id_sem.try_acquire(task_id, limit=effective)
  ```
  Claims without `engine_id`/`manifest_max` (e.g. exclusive claims) behave exactly as today (`limit=None`).
- `release_task_resources` (`resources.py:709`) needs no behavioral change — it never consults cap — but must feed `manifest_max` (not an effective/live value) to whatever registry lookups it does, for the same reason as above: never call `ensure_min_cap` with anything except the manifest ceiling.
- **This closes two real races**: (a) the orchestrator's ~1s retry loop re-entering `reserve_task_resources`/`release_task_resources` with the same claim used to silently regrow a stale effective cap back up via `ensure_min_cap` — now `ensure_min_cap` only ever sees the stable manifest ceiling, so there's nothing to regrow; (b) a task queued with an old effective cap baked in used to keep being admitted at that stale value — now the limit is resolved fresh every single admission attempt, so a slider change reaches every queued task within about one retry cycle (~1s), with zero new notification plumbing.

### 3. `generation.py` chapter-parent pool sizing

`app/api/routers/generation.py:286-288` currently sizes the chapter-parent `ThreadPoolExecutor` from `_manifest_resource_claim(engine_id).cap` — the *effective* cap at chapter start, under the current code. Under this task's change it naturally becomes `manifest_max` (since `cap` now means the ceiling) — this is the **correct** value, since per-child segment admission (see acceptance criteria's pre-work item below) is what actually enforces the live limit; sizing the pool to the ceiling means a mid-chapter cap *raise* also takes effect (children are still gated individually through `reserve_task_resources`). No code change should be needed here beyond the effect of item 2 above — write a test confirming this, don't silently assume it.

### 4. Settings persistence: single-key merge, not whole-object replace

Add `set_engine_cap(engine_id: str, cap: int) -> None` to `app/db/state_settings.py`, following the file's existing pattern for other single-key settings mutations (read the file's existing update helpers for the exact convention before adding this — likely a read-modify-write under the store's existing lock, merging just the one key into `tts_engine_caps` rather than accepting a whole replacement dict). This closes a real concurrent-write race: today, two clients writing `tts_engine_caps` via the whole-settings-blob `POST /settings` can clobber each other's changes to different engines' caps.

### 5. New API surface

In `app/api/routers/engines.py` (engine-scoped runtime config — not `system.py`, which owns broader app settings):

- `GET /api/engines/concurrency` → 
  ```json
  {
    "global_cap": 2,
    "engines": [
      {
        "engine_id": "tts_xtts",
        "engine_class": "gpu",
        "manifest_max": 4,
        "requested_cap": 2,
        "effective_cap": 2,
        "active_count": 3
      }
    ]
  }
  ```
  Sources: manifest max per plugin (check `app/tts_server/plugin_loader.py` for the existing manifest-max accessor — the design review that produced this task cited `get_manifest_max_concurrent_workers` at `plugin_loader.py:957`, re-verify this line still holds when you write the code), `resolve_effective_cap` for `effective_cap`, and the engine-id semaphore's `active_count` property (already exists on `EngineClassSemaphore`, confirm the exact property name and line when implementing) for `active_count`. All in-process reads, no new I/O.
- `PUT /api/engines/{engine_id}/concurrency` body `{"cap": <int>}` → validate `1 <= cap <= manifest_max`; **reject out-of-range with HTTP 422** including `manifest_max` in the error body (do not silently clamp — a client sending an out-of-range value is a bug worth surfacing, not hiding). On success, call `set_engine_cap` (item 4) and return the same per-engine record shape as the GET. Accept `{"cap": null}` to clear an override back to the global cap.
- Ceiling enforcement is **defense in depth at two layers**: the 422 here (UX-correct feedback for a well-behaved client) and `resolve_effective_cap`'s existing clamp (`cap_settings.py:119-156`) — which stays as the backstop for env-var edits, direct settings writes, or any client that bypasses this endpoint.

## Steps

1. Fix the `cap_settings.py` docstring bug (lines 31-33: default is `2`, not `1`) as a small, separate first commit-worthy change within this task.
2. Add `limit: Optional[int] = None` to `EngineClassSemaphore.try_acquire` (line 187), per the exact snippet in Target shape §1. Update its docstring to document the two-tier ceiling/limit split.
3. Add `manifest_max: int = 1` to `ResourceClaim` (line 88). Update `_manifest_resource_claim` (`synthesis.py:29`) to set both `cap=manifest_max` and `manifest_max=manifest_max`.
4. Update `reserve_task_resources` (line 535) and `release_task_resources` (line 709) per Target shape §2 — resolve `effective` fresh per call via a lazy `cap_settings` import, pass as `limit`, feed only `manifest_max` to any `ensure_min_cap`/semaphore-registry call.
5. **Pre-work verification (do this before finishing step 4, not after)**: trace `generation.py`'s per-child segment dispatch path (find where individual segment tasks are actually admitted — the design review that produced this task confirmed the *parent* pool's sizing at lines 286-288 but explicitly did NOT trace whether *children* are individually reserved through `reserve_task_resources`). If children are NOT individually reserved, a mid-chapter cap shrink will not actually throttle in-flight segment dispatch for that pattern, and this task needs a different admission hook for children before it can claim "live shrink" works end-to-end — stop and report this back rather than shipping a claim this doesn't back up.
6. Add `set_engine_cap` to `state_settings.py` (Target shape §4).
7. Add the two new endpoints to `app/api/routers/engines.py` (Target shape §5).
8. **Pre-work verification #2**: grep the existing W-PAR test suite (`tests/` + `plugins/*/tests`) for any assertion of the form `claim.cap == <effective cap>` or admission-behavior tests for engine-class-only claims (no `engine_id`) that assume the effective cap. Update any that assert the old semantic (`cap` == effective) to the new one (`cap` == manifest ceiling, `manifest_max` == same value, effective computed separately) — these must continue passing with byte-identical *behavior*, only the field-level assertion changes.
9. Write new tests: shrink-under-load (4 active, limit drops to 2, confirm no new admission until active < 2, confirm the 4 in-flight are not evicted), grow-takes-effect-live (limit raised, confirm next `reserve_task_resources` call admits more without a restart), the 422 validation path, and the `set_engine_cap` single-key-merge-doesn't-clobber-other-engines case.

## Acceptance criteria

- [x] `cap_settings.py` docstring default corrected to `2`.
- [x] `EngineClassSemaphore.try_acquire(task_id, limit=None)` — existing callers (no `limit` passed) behave byte-identically to today; a test proves this.
- [x] Shrinking a live cap does not evict in-flight tasks and does block new admissions until active count drops below the new limit — proven by a test that holds N slots then lowers the limit below N.
- [x] Raising a live cap takes effect on the very next `reserve_task_resources` call for queued work, without a process restart — proven by a test.
- [x] `ResourceClaim.cap` now means the manifest ceiling everywhere it's read; no code path anywhere still assumes `cap` means "effective concurrency" (grep for `\.cap\b` on `ResourceClaim` instances and audit every hit).
- [x] The per-child segment dispatch trace (step 5) is done and its outcome (individually reserved, or not) is explicitly stated in the task's completion report — **individually reserved: YES**, verified independently by the orchestrator too (`SegmentSynthesisTask.run()`, `app/orchestration/tasks/segment_synthesis.py:151-194`, calls `reserve_task_resources`/`release_task_resources` per child with its own claim in a retry-wait loop).
- [x] `GET /api/engines/concurrency` and `PUT /api/engines/{engine_id}/concurrency` implemented, tested, and the 422 path verified with an out-of-range value.
- [x] `set_engine_cap` merges under lock without clobbering other engines' overrides — proven by a concurrent-write-style test (two calls for two different engine_ids, both survive).
- [x] Existing W-PAR test suite assertions about `claim.cap`/semaphore sizing updated where they assumed the old (effective-cap) semantic; full suite green.
- [x] `./venv/bin/python -m pytest -q` clean (2291 passed, 3 skipped — orchestrator re-ran independently, confirmed). Relevant spec (`system-architecture.md`, `queue-jobs.md`) gets a changelog row for the new API + the cap-semantic change.
- [x] Append a code-map changelog-queue entry (`design-docs/code-map/queue/`) — this changes a contract (`ResourceClaim`'s `cap` field meaning) and adds new API surface.

## Map links

Part P in `01-map.md`'s Phase 2 section (the deeper backend half of what N's UI configures — P ↔ N connection documented there). Invariants M5 (cap UI never exceeds manifest ceiling — this task makes it enforceable end-to-end, not just at the UI layer) and **M7** (a live cap change reaches admission within one retry cycle, never requires a restart, never evicts in-flight work — P's own invariant). Risk **R-I** (per-child segment admission unverified — this task's step 5 is the verification).

## Dependencies

None — independent backend work. Can run in parallel with 008-011. Task 012 (UI) can optionally be updated to call this task's new `PUT` endpoint once both land (see 012's own "Out of scope" section, updated 2026-07-11) — not required, purely additive.

## Out of scope

Do not change `EngineClassSemaphore.release` — releases are already unconditional and correct. Do not touch `ensure_min_cap`'s grow-only behavior — it protects a different concern (call-order races among callers requesting the manifest ceiling) that this task's design deliberately keeps separate from the live-limit concern. Do not attempt to fix `WarmWorkerManager`'s process-restart-required caching if the pre-work trace in step 5 finds that's a separate, unrelated caching layer — scope that as its own follow-up rather than expanding this task.
