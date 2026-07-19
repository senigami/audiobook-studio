# Review — `design-docs/plans/active/ad2_cap_resolution_hardening/00-plan.md`

Reviewer: the same session that produced `.agent/frontier-calibration/references/AD-2.md`.
Review only — no edits made to the plan or to code.

## Verdict

Directionally sound on all five tasks; two real gaps worth closing before this plan is
implemented as written — one in Task 1 (F3) that could let the "fix" ship without actually
closing the leak, one in Task 4 (F1) that overclaims scope. Task 2 (F4) is correct as
specified. Task 3 (F5) is correct but incomplete versus its own stated problem. Task 5 (F2)
is fine as a dependency check.

## Task 1 — F3 (mid-flight gate toggle leaks slots): fix direction is right, plan text is ambiguous about *where* the record lives, and that ambiguity matters

Verified the call graph the plan doesn't mention: `reserve_task_resources` returns a
`reservation` dict that is a **local variable** at every call site
(`app/orchestration/scheduler/orchestrator.py:176`,
`app/orchestration/tasks/segment_synthesis.py:173`) — but every corresponding
`release_task_resources` call passes only `claim_dict`/`resource_claims`
(`orchestrator.py:220,260,796`; `segment_synthesis.py:197`), never the `reservation` object.
`claim_dict` is rebuilt fresh from `task.resource_claim` via `_claim_to_dict`
(`orchestrator_helpers.py:1968-1990`) and carries no admission-path field today.

The plan's fix text — "record which admission path was taken *in the reservation result
itself* … and release by that record" — is satisfiable two different ways, and they are not
equivalent:

1. **Thread the reservation dict through to release.** This requires changing all four
   release call sites (and `segment_synthesis.py`'s one) to capture and pass forward the
   `reservation` dict from step-176/173, not just `claim_dict`. Nontrivial: `orchestrator.py`
   calls `release_task_resources` from at least three separate code paths (`:220`, `:260`,
   `:796`), and it isn't obvious every one of them still has the original `reservation`
   value in scope (e.g. `:796` is far from the `:176` reservation call — likely a different
   method/branch entirely, possibly a cancel/cleanup path that never reserved via the
   `:176` call at all).
2. **Keep an internal `task_id -> admission_path` registry inside `resources.py` itself**,
   written at the moment `reserve_task_resources` decides its branch, read (and popped) by
   `release_task_resources` using the `task_id` it already receives. This requires zero
   changes to any caller.

Option 2 is almost certainly the intended and correct design — it's the only one consistent
with "release by that record" not requiring caller changes, and it mirrors the existing
idempotent-by-task_id pattern already used throughout `resources.py` (e.g.
`EngineClassSemaphore.release`, `resources.py:252-271`). But **the plan doesn't say this
explicitly**, and if implemented as a literal reading of "record in the reservation result"
(option 1), it either silently fails at the call sites that don't have `reservation` in
scope, or requires an unplanned, wider-blast-radius change to `orchestrator.py`/
`segment_synthesis.py` signatures that the plan doesn't scope, review, or test for.

Second gap in Task 1: if option 2 is chosen, the plan's test ("toggle the env between
reserve and release; assert correct slots are released") doesn't cover **crash-recovery /
never-released tasks** — an internal `task_id -> path` dict needs its own cleanup story
(process restart clears it for free since it's in-memory, but a task that reserves and is
never released via the normal path, e.g. hard task-crash recovery outside `release_task_resources`,
would leak an entry in this new dict too — small, since it's just a string not a semaphore
slot, but worth a one-line note and ideally a `reset()`-style test hook mirroring
`EngineClassSemaphore.reset()`).

**Recommendation:** amend Task 1's fix text to explicitly specify the internal-registry
approach (keyed by `task_id`, popped on release, not touching any caller signature), and add
that this registry itself needs no persistence/GC concern beyond process lifetime — but
should be exercised by the regression test alongside the semaphore-release assertions so a
future refactor doesn't quietly move it back to an env re-read.

Severity of this gap: **would matter at implementation time**, not a flaw in the diagnosis —
the plan correctly identifies R1 (regression test first) as the safety net, so a wrong
implementation should get caught, but the plan doesn't currently force the right one.

## Task 2 — F4 (per-engine limit on the wrong semaphore): fix correctly preserves the class semaphore's structural role

Traced the interaction the fix changes: today, `resources.py:698-699` applies
`live_limit` (a per-engine value from `resolve_effective_cap`) as the threshold against the
class semaphore's `_active_ids`, which counts every engine in that class. The proposed fix —
apply `live_limit` only at the per-engine-id semaphore (`resources.py:705-706`, already
gated by `if admitted and engine_id`) and let the class gate use only its grow-only
structural `cap` — is correct and sufficient:

- The class semaphore's structural cap is grown via `ensure_min_cap` to the max single
  `cap` value any same-class engine has requested (`resources.py:290-329` — grow-only,
  never shrinks, never sums). That's a shared-resource ceiling (e.g. total GPU slots), not a
  per-engine throttle — so removing `live_limit` from this gate doesn't loosen the actual
  resource-contention protection it exists for.
- Overall effective concurrency for any single engine is still bounded correctly after the
  fix: the class gate admits up to the structural cap (possibly generous, shared across
  siblings), and the id gate then narrows to that specific engine's `live_limit` — with the
  existing rollback (`resources.py:707-719`: id-deny releases the class + global-backstop
  slots) already handling the "admitted at class, denied at id" case. No new leak is
  introduced by moving the check.
- Worked through the two-engine scenario from the reference (engine A cap=3 active=2,
  engine B live_limit=1 sharing the class): under the fix, B's class-gate check passes
  (2 < class structural cap 3), then B's id-gate check passes (B's own active count 0 < 1) —
  B is admitted instead of wrongly starved. This is the exact fix the finding calls for.

No correctness gap found here. The plan's stated test (two same-class engines via a test
double) is the right shape and necessary since no second real GPU-class engine exists today.

## Task 3 — F5 (settings can't clear an env override): correct as far as it goes, but doesn't cover the plan's own second sub-bug

The core fix (distinguish "absent" from "explicitly cleared," e.g. via a sentinel/presence
flag so `{}` in settings wins over `TTS_ENGINE_CAPS`) is the right shape for
`cap_settings.py:94`'s `if isinstance(raw, dict) and raw:` bug.

Gap: Task 3's own description explicitly calls out a second, smaller instance of the same
shape — "a malformed `tts_parallel_cap` value silently falling through rather than erroring"
(`cap_settings.py:72-77`) — but the **Fix** and **Test** bullets only describe the
`tts_engine_caps` clear-case test. There is no fix behavior or test specified for the
malformed-scalar case. Left as written, an implementer following the letter of the task
would close the dict-clearing bug and leave the malformed-value case exactly as it is today
(silently ignored, not surfaced). That may be an acceptable, deliberate scope cut (the
malformed-value case requires deciding *what* should happen — error at write time? log a
warning? — which is a genuine design choice, not just a sentinel), but the plan should say
so explicitly rather than naming the sub-bug and then dropping it silently.

**Recommendation:** either fold an explicit test + behavior decision for the malformed
`tts_parallel_cap` case into Task 3, or add one sentence carving it out as deliberately
out of scope with a reason.

## Task 4 — F1 (silent clamp UX): fix covers the manifest-ceiling clamp but not the backstop clamp it names as worse, while claiming to close the FUTURE_WORK item outright

The plan's own Task 4 write-up correctly restates the reference: "the global-backstop clamp
is worse (bites later as a generic denial)." But the **Fix** — surface a warning at the
settings-write boundary reusing the already-computed `effective_cap` field
(`app/api/routers/engines_registry.py:65-74`, which is `resolve_effective_cap(engine_id,
manifest_max)` — manifest-ceiling only) — has no mechanism to know about
`MAX_GLOBAL_CONCURRENT_SYNTHESIS` (`resources.py:44-46`) at all. That backstop is a
runtime/queue-depth-dependent gate checked inside `reserve_task_resources`
(`resources.py:676-690`), not a static function of a requested setting value the way
`resolve_effective_cap` is — there is no `effective_cap`-shaped number to compare against at
settings-write time (it depends on how many *other* engines' tasks are concurrently active
across all classes, not just this one engine's declared cap). A settings-write-time warning
literally cannot detect "your cap of 8 will sometimes get denied once 8 tasks across all
engines are in flight" the same way it detects "your cap of 8 exceeds this engine's manifest
max of 2."

The plan's claim — "This directly closes the existing FUTURE_WORK 'Settings UI silent-clamp
warning' item… do not duplicate a separate backlog entry once this lands" — is therefore
**overclaimed**. It closes the manifest-ceiling half of the silent-clamp problem, not the
backstop half. Per `design-docs/plans/FUTURE_WORK.md:61-65`, the FUTURE_WORK entry names both
"a manifest ceiling **or** the global backstop" in one sentence — Task 4 as scoped resolves
only the first disjunct.

**Recommendation:** either (a) scope Task 4's fix explicitly to the manifest-ceiling case and
leave a residual FUTURE_WORK note for the backstop-denial UX (a different mechanism — e.g.
surfacing `waiting_reason` more visibly in the queue UI when it names the global backstop,
which is a runtime/queue-status affordance, not a settings-write-time one), or (b) expand
Task 4 to genuinely cover both before claiming the FUTURE_WORK item is closed.

## Task 5 — F2 (stale lesson correction): no issues

Deferring to the separate SD-1 plan and just gating on its landing is the right call — this
avoids the two-places-say-the-same-thing risk the task text itself warns against. Confirmed
independently in the AD-2 reference that the code (`resources.py:49-68`) has defaulted
`ENGINE_CLASS_ADMISSION` ON since the docstring-cited 2026-07-06 change, so the correction
direction (code is authoritative, lesson is stale) is right.

## Sequencing and scope

Task ordering (F3 first, as the only live availability/correctness risk) is correct and
matches the reference's severity ranking. The "Out of scope" section correctly leaves F6
(sound axes) untouched. No sequencing issues found.

## Summary of required plan changes before implementation

1. Task 1: pin down the F3 fix to the internal `task_id`-keyed registry approach (no caller
   signature changes), and extend its test to cover release-not-called cleanup, not just the
   toggle-mid-flight case.
2. Task 3: explicitly resolve or explicitly scope out the malformed-`tts_parallel_cap`
   sub-bug it names but doesn't fix/test.
3. Task 4: narrow the "closes FUTURE_WORK" claim to the manifest-ceiling axis only, or widen
   the fix to also address the global-backstop axis before claiming closure.

Everything else in the plan (Task 2/F4 design, Task 5/F2 deferral, sequencing) checked out
against the actual code paths cited in the AD-2 reference.
