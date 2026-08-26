# Plan — harden the cap-resolution / admission clamp chain

**Status:** DRAFT — awaiting plan review. No code changes made producing this plan.
**Feeds from:** an adversarial review (AD-2, 2026-07-18) — 5 findings (F1-F5) plus F6 (sound
axes, not touched here).

**2026-08-26 note (still valid, not stale — read before executing):** `reserve_task_resources`
gained a new exemption the same day this plan sits untouched, from issue #228/#229: claims with
`engine_class == CHAPTER_ADMISSION_ENGINE_CLASS` now skip the global cap backstop entirely (a
chapter-level admission claim consumes no real resource itself, only its children do). Task 1's
"unconditionally attempt release on all gates" fix below is still the right shape and doesn't
conflict with that exemption — `release_task_resources` already mirrors it correctly (a no-op for
a gate never acquired) — but whoever executes this plan should read the current
`reserve_task_resources`/`release_task_resources` bodies fresh rather than assume they match this
plan's original line numbers, since both functions moved.

## Findings addressed, by task

### Task 1 — F3: mid-flight gate toggle leaks semaphore slots (highest severity, real deadlock mechanism)

`ENGINE_CLASS_ADMISSION` is read independently at reserve (`resources.py:657-670`) and release
(`:783-785`) time — a designed-in per-call read (docstring: "so tests can toggle it without
re-importing"). If the env value flips between a task's reserve and release, the release routes
down the wrong branch and leaks the class/engine-id/global-backstop slots permanently (ON→OFF) or
wedges the exclusive gate (OFF→ON). Enough leaks and every future synthesis is denied until restart.

**Fix — CORRECTED (all 3 reviewers found the original "record in the reservation result" phrasing
underspecified/wrong; adopting the simplest fix, which all reviewers' fact-finding
independently supports):** `release_task_resources` never actually receives the reservation
result — there are 4 release call sites (`orchestrator.py:220,260,796`, `segment_synthesis.py:197`),
and the cancel path (`orchestrator.py:796`) rebuilds its claim dict fresh from `task.resource_claim`,
with no access to reserve-time state at all; `ResourceClaim` is also frozen, so nothing can be
stamped onto it either. **Do NOT thread a token through callers.** Instead: since every individual
gate's `release()` is already idempotent (a release on a gate you never held is a safe no-op) and
task ids are unique, make `release_task_resources` unconditionally attempt release on **all**
gates a claim could possibly hold (global backstop, class semaphore, engine-id semaphore, exclusive
gate) — never branch on re-reading `_engine_class_admission_enabled()` at release time at all. This
requires zero caller/plumbing changes and is robust to the env flipping at any point, including the
cancel path. Test: toggle the env between a task's reserve and its release (cover the NORMAL
completion path AND the cancel path at `:796` specifically — the earlier fix proposals silently
missed the cancel path); assert no slots leak and nothing double-releases incorrectly, regardless of
toggle direction or which release site runs (confirm current code fails this first, R1).

### Task 2 — F4: per-engine live limit applied to the wrong (class) semaphore — latent starvation

`resources.py:698-699` applies a *per-engine* `live_limit` as the admission threshold against the
*class* semaphore's total active count, which mixes every engine in that class. Not observable
today (only one "gpu"-class engine exists), but a second same-class engine with a lower effective
cap would be starved by a sibling's activity even with room in its own per-engine-id semaphore.

**Fix (confirmed correct as originally specified by all 3 reviewers — verified to lose no
live throttling, since `live_limit` is only ever resolved when `engine_id` is present, the same
condition the id-gate itself runs on):** apply the live limit to the per-engine-id semaphore only;
let the class semaphore continue to gate on the class's own (grow-only) structural cap, uncoupled
from any single engine's live limit. **Guard required (both independent reviews flagged it):** assert
`engine_class` implies `engine_id` is non-empty at claim-build or reserve-entry time — do NOT ship
this fix unguarded, since a future claim with `engine_class` set but `engine_id` empty would silently
skip live-cap enforcement entirely (the exact latent-hole class this fix exists to close). Test: two
same-class engines, one throttled to limit=1 with the sibling occupying the class semaphore — assert
the throttled engine is NOT denied at the class gate when its own per-engine-id semaphore has room;
plus a test that a claim with `engine_class` set and `engine_id` empty is rejected/asserted, not
silently under-enforced. (Requires a test double / second synthetic engine-class.)

**Sequencing note:** Task 1 and this task both rewrite the reserve/release body —
land them together or in strict sequence, not as independently-parallelized slices, or they will
conflict.

### Task 3 — F5: clearing a `tts_engine_caps` override via Settings can't override a set env var

An *empty* `{}` in stored settings is treated as absent (`cap_settings.py:94`), falling through to
`TTS_ENGINE_CAPS` env — so an operator who launched with an env override and later clears it in
Settings sees no effect. Same shape, smaller, for a malformed `tts_parallel_cap` value silently
falling through rather than erroring.

**Fix — CORRECTED (review found the originally-proposed sentinel/presence-flag mechanism is
infeasible: `_normalize_settings` (`state_settings.py:129-138`) always materializes
`tts_engine_caps`, so nothing distinguishes cleared-from-absent by the time `cap_settings.py:94`
sees it). Correct, simpler fix:** drop the `and raw` truthiness gate at `cap_settings.py:94` entirely
— an explicitly-stored empty dict should mean "no per-engine overrides," full stop, and take
precedence over the env var like every other stored setting does. Test: set env override, clear via
settings (stores `{}`), assert the global/default cap now applies. **Verify before building a
fix+test for the malformed-`tts_parallel_cap` sub-variant** — review flagged it's likely
unreachable at runtime because normalization coerces the value first; confirm reachability before
spending the effort.

### Task 4 — F1: silent clamp UX (known, accepted debt — lower priority, ties to FUTURE_WORK)

`resolve_effective_cap` clamps silently with no signal distinguishing "clamped" from "honored," and
the global-backstop clamp is worse (bites later as a generic denial). `engines_registry.py` already
exposes `effective_cap` next to `manifest_max` — the gap is at write time, not read time.

**Fix**: surface a warning at the settings-write boundary when the requested value exceeds what will
actually take effect (manifest ceiling or global backstop) — reuses the `effective_cap` field
already computed. This directly closes the existing FUTURE_WORK "Settings UI silent-clamp warning"
item — do not duplicate a separate backlog entry once this lands.

### Task 5 — F2: correct the stale always-on lesson (near-zero code risk, pure doc fix)

A recorded lesson describes the admission gate as still defaulting OFF; the code has
defaulted ON since `7c3d5b9d` (2026-07-06). See the dedicated SD-1 finding/plan for the exact
correction text — **do not duplicate this fix in two places; this task just confirms SD-1's
correction has landed before this plan is considered closed.**

## Sequencing

Task 1 (F3) first — it's the only one with a live correctness/availability impact (a real, if
narrow-trigger, deadlock). Tasks 2-4 are independent of each other and of Task 1; Task 5 is a
dependency check on the separate SD-1 plan, not new work.

## Tests required across all tasks (per testing-standards.md R1)

Each fix's regression test must be written first and confirmed red on current code before the fix
lands — these are concurrency/resource-gating bugs; a test that can't demonstrate the bug on old
code isn't testing the bug.

## Out of scope

F6's sound axes (clamp arithmetic, live-limit freshness, per-engine-id keying, rollback) — verified
correct in the reference; no work needed. Verifying whether any existing test toggles
`ENGINE_CLASS_ADMISSION` mid-reservation (Task 1 should check this as part of its own test-writing
step, not as separate exploratory work).
