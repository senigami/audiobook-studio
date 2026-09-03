# Plan — correct the stale admission-gate always-on lesson

**Status:** DRAFT — awaiting plan review (proportionate to the change — a one-line doc
fix still gets the same review treatment for consistency). No code changes made producing this plan.
**Feeds from:** a spec-drift reference (SD-1).

## Problem

The project's always-on lessons index (line 7, an *auto-loaded-every-session* lesson) states the
engine-class admission gate "still defaulted OFF … so every synthesis claim kept routing through the
legacy single-flight exclusive gate and renders stayed genuinely sequential." The code
(`app/orchestration/scheduler/resources.py:49-68`) has defaulted **ON** since commit `7c3d5b9d`
(2026-07-06, owner directive) — confirmed by the docstring, git history (no reversion since), and
existing project memory (`wpar-parallel-render-shipped`). The lesson is a dated incident narrative
read as present-tense fact — a future session skimming it would wrongly conclude parallel rendering
is dark today.

## Fix (exact text, per SD-1.md)

In the always-on lessons index, line 7, change the incident description to past tense with the
resolution appended — approximately:

> "…had at that point never flipped) still defaulted OFF — so renders stayed sequential regardless
> of the cap setting. Fixed same day in `7c3d5b9d` (gate now defaults ON; parallel rendering is the
> shipped default)."

**The lesson's `Apply:` sentence (the durable meta-lesson — "a raised cap with the gate still off
changes nothing, grep for the admission gate") stays unchanged** — it's still generically useful
guidance, independent of this specific incident's current status.

## Task

1. Apply the exact correction above to the always-on lessons index, line 7.
2. Confirm no other lesson/doc references the same stale claim (a repo-wide grep for
   "defaulted OFF" as a sanity check).
3. No test needed — this is a documentation-only fix with no code/behavior change.

## Note

AD-2's Task 5 depends on this plan landing — do not fix the same claim twice in two places.

## Out of scope

Verifying parallel rendering is *observably* correct at runtime (a runtime-verification concern,
not this doc fix) — this plan only settles what the gate's default *is*, already confirmed by SD-1.
