# Plan — harden the cap-resolution / admission clamp chain

**Status:** DRAFT — awaiting twin + Fable plan review. No code changes made producing this plan.
**Feeds from:** `.agent/frontier-calibration/references/AD-2.md` (Fable adversarial-review reference,
2026-07-18) — 5 findings (F1-F5) plus F6 (sound axes, not touched here).

## Findings addressed, by task

### Task 1 — F3: mid-flight gate toggle leaks semaphore slots (highest severity, real deadlock mechanism)

`ENGINE_CLASS_ADMISSION` is read independently at reserve (`resources.py:657-670`) and release
(`:783-785`) time — a designed-in per-call read (docstring: "so tests can toggle it without
re-importing"). If the env value flips between a task's reserve and release, the release routes
down the wrong branch and leaks the class/engine-id/global-backstop slots permanently (ON→OFF) or
wedges the exclusive gate (OFF→ON). Enough leaks and every future synthesis is denied until restart.

**Fix**: record which admission path was taken *in the reservation result itself* (not re-derived
from re-reading the env at release time), and release by that record. Test: toggle the env between
a task's reserve and release; assert the correct slots are released regardless of the toggle
(this is the regression test — confirm it fails on current code first, R1).

### Task 2 — F4: per-engine live limit applied to the wrong (class) semaphore — latent starvation

`resources.py:698-699` applies a *per-engine* `live_limit` as the admission threshold against the
*class* semaphore's total active count, which mixes every engine in that class. Not observable
today (only one "gpu"-class engine exists), but a second same-class engine with a lower effective
cap would be starved by a sibling's activity even with room in its own per-engine-id semaphore.

**Fix**: apply the live limit to the per-engine-id semaphore only; let the class semaphore continue
to gate on the class's own (grow-only) structural cap, uncoupled from any single engine's live
limit. Test: two same-class engines, one throttled to limit=1 with the sibling occupying the class
semaphore — assert the throttled engine is NOT denied at the class gate when its own per-engine-id
semaphore has room. (Requires a test double / second synthetic engine-class to make this checkable
without a real second GPU engine.)

### Task 3 — F5: clearing a `tts_engine_caps` override via Settings can't override a set env var

An *empty* `{}` in stored settings is treated as absent (`cap_settings.py:94`), falling through to
`TTS_ENGINE_CAPS` env — so an operator who launched with an env override and later clears it in
Settings sees no effect. Same shape, smaller, for a malformed `tts_parallel_cap` value silently
falling through rather than erroring.

**Fix**: distinguish "no override stored" from "override explicitly cleared" (e.g., a sentinel or a
presence flag) so settings precedence over env holds for the clear case too. Test: set env override,
clear via settings, assert the global/default cap now applies.

### Task 4 — F1: silent clamp UX (known, accepted debt — lower priority, ties to FUTURE_WORK)

`resolve_effective_cap` clamps silently with no signal distinguishing "clamped" from "honored," and
the global-backstop clamp is worse (bites later as a generic denial). `engines_registry.py` already
exposes `effective_cap` next to `manifest_max` — the gap is at write time, not read time.

**Fix**: surface a warning at the settings-write boundary when the requested value exceeds what will
actually take effect (manifest ceiling or global backstop) — reuses the `effective_cap` field
already computed. This directly closes the existing FUTURE_WORK "Settings UI silent-clamp warning"
item — do not duplicate a separate backlog entry once this lands.

### Task 5 — F2: correct the stale always-on lesson (near-zero code risk, pure doc fix)

`.agent/lessons/INDEX.md` line 7 describes the admission gate as still defaulting OFF; the code has
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
