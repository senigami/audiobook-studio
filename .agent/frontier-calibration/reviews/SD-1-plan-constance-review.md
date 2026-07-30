# SD-1 plan review — Esther (structural panelist)

**Reviewing:** `design-docs/plans/active/sd1_lesson_correction/00-plan.md`
**Verdict:** APPROVE — proceed as written. Confidence: high.
**Scope note:** Un-ensembled lone pass (no Tamsin, no judge dispatched). Proportionate to a
one-line doc fix; flagging per protocol that this did not get convergence.

## Independent verification of the gate's actual default

Verified directly against source, not the plan's summary:

- `app/orchestration/scheduler/resources.py:49-68` — `_engine_class_admission_enabled()` returns
  `raw not in {"0","false","no","off"}`, i.e. **enabled unless explicitly disabled**. Unset env ⇒
  **ON**. This is an independent read of the actual control flow, and it defaults ON.
- Module docstring (`resources.py:14-18`, `49-57`) corroborates: "Admission is on by default … that
  transitional period is over."
- `git log 7c3d5b9d` → `fix: ENGINE_CLASS_ADMISSION now defaults on (owner directive)` — the commit
  the plan cites is real and does what the plan says.
- `git log 92bbb443` → `feat: parallel rendering is now the default …` — the commit the *lesson*
  cites is also real.
- Spec `design-docs/specs/queue-jobs.md:673-681` independently states Default ON since 2026-07-06,
  superseding the task-001/007 dark default.

The plan's characterization is accurate on every checkable point: gate defaults ON, has since
`7c3d5b9d` (2026-07-06), no reversion since. The lesson at `.agent/lessons/INDEX.md:7` reads as a
present-tense "still defaulted OFF … renders stayed genuinely sequential," which is a dated incident
narrative misreadable as current fact. The correction is warranted.

## Correction text accuracy

The proposed replacement text (plan lines 23-25) is accurate: past-tense incident + "Fixed same day
in `7c3d5b9d` (gate now defaults ON; parallel rendering is the shipped default)." Keeping the
`Apply:` meta-lesson unchanged is the right call — it's the durable, status-independent guidance and
survives the incident's resolution.

## Blast radius (enumerated, not asserted)

Documentation-only; zero code/behavior surface. The one structural risk in a "fix the stale claim"
task is over-reach in step 2's grep sweep. I ran `grep -rn "defaulted OFF" .agent/ design-docs/`
myself. Beyond the frontier-calibration reference/briefing files (which are *about* this correction
and must keep the quoted stale text verbatim), two hits describe "default OFF" as fact:

- `design-docs/specs/queue-jobs.md:677`
- `design-docs/plans/active/parallel-segment-rendering/tasks/001-per-engine-cap-and-semaphores.md:6`

Both are **correct in context** — they describe the transitional task-001-through-007 dark-ship
period, which historically *was* default OFF, and queue-jobs.md:675 explicitly frames it as
superseded. **These must NOT be edited.** The plan's step 2 is worded as a "sanity check" (confirm no
*other* lesson repeats the stale claim), and its scope section correctly confines the fix to INDEX.md
line 7. No change needed to the plan, but the executor should treat step 2 as read-only reconnaissance
and not touch the historically-accurate spec/task-doc hits.

## Findings

1. **No blockers.** Plan is accurate and correctly scoped.
2. **Minor — call out the false-positive grep hits for the executor.** Step 2's grep will surface
   queue-jobs.md:677 and task-001 doc:6; both are historically correct and out of scope. The Fable
   review already noted this; recording it here too so a small-model executor doesn't "helpfully"
   rewrite them.
3. **AD-2 dependency (plan line 40) is real** — `.agent/frontier-calibration/references/AD-2.md:53`
   also targets `INDEX.md:7`. The "don't fix twice" note is correct; whichever lands first satisfies
   the other.

## Confidence & falsifier

High confidence the gate defaults ON. This would be falsified only if a commit after `7c3d5b9d`
reverted the default — git history shows none, and the live source at :67-68 confirms the ON-unless-
disabled logic today.
