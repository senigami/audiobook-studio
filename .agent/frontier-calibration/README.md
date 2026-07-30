# Frontier Calibration — closing the gap with durable mechanisms

**Started 2026-07-18. Status: Phase 1 (setup + Fable reference capture), Fable-gated.**

## What this is

A standing program to calibrate this repo's durable reasoning system (the Opus **reasoning-analyst
twins** — Esther/Tamsin — run via `fusion-reasoning`) against the frontier model (**Fable**),
*while Fable is still available*, and turn every measured shortfall into a **durable mechanism** that
narrows the gap.

## The founding insight (owner's framing)

Fable itself already did this once: **Fable designed the code-map system** — a durable mechanism that
gives non-frontier models frontier-like grounding (flows, invariants, blast-radius, symbol-trace) so
they don't have to re-derive the repo from memory. The code-map is the *exemplar* of what this
program hunts for.

So when we find where the twins fall short of Fable, the question is **not** "how do we become Fable"
(we can't — no retraining, and method cannot exceed the frontier). The correct question, every time,
is:

> **What mechanism can we build or use to bring us closer — knowing it won't be true Fable?**

A *mechanism* means something in the code-map's class: a durable tool, index, ritual, or system that
structurally supplies what the frontier model does from raw capability. Not a one-off prompt tweak.
The deliverable of this program is a **gap → mechanism catalog**.

## The honest ceiling

- We cannot retrain weights or make Opus twins *exceed* Fable.
- What we CAN do: (1) **measure the gap** on the same problem; (2) find where the twins already
  **match or beat a naive frontier pass** (their map-grounded ritual is a repo-specific edge Fable-
  in-general lacks — on some questions they tie or win); (3) **distill durable mechanisms** that
  close the remaining gap and bank them permanently.

## Method — the calibration task is PLAN REVIEW

We do **not** fix anything in this program. The findings are identified and banked; the calibration
compares the twins against Fable on the concrete, high-value job of **reviewing an implementation
plan** — the point where catching a gap, risk, or missed edge case saves real cost before code is
written.

1. **Findings (Phase 1 — done):** Fable analyzed 6 real scenarios → the findings (problems
   identified), banked in `findings-summary.md` + `references/`. No fix is implemented.
2. **Build the plan the normal way (Phase 2):** turn a finding into a real implementation plan via
   the normal planning process (plan-architect / engineer), landing in `design-docs/plans/`. The
   plan-builder is neither Fable nor the twins.
3. **Independent plan review (Phase 3):** the **twins** review the plan (Opus, via `fusion-reasoning`)
   AND **Fable** reviews the same plan — each blind to the other's review. A plan review surfaces
   gaps, risks, missed edge cases, sequencing errors, and unstated assumptions.
4. **Compare** the twins' review findings against Fable's on the same plan: what did Fable catch
   that the twins missed (and vice-versa)?
5. **Gap → mechanism:** for each shortfall, the durable mechanism (code-map-class) that would have
   closed it.

## Scarcity rule

Two Fable-gated steps. (1) The **scenario references** — DONE. (2) **Fable's plan reviews** — the new
critical path: Fable expires soon, and a plan must exist before Fable can review it. So build the
plan promptly and capture Fable's review while it's here; the twins review anytime on Opus. Spend the
remaining Fable window on plan reviews, not on building or fixing.

## Sequencing — adaptive, start with one plan

Build and calibrate on **one plan first**. Compare the twins' plan-review against Fable's on that
plan; if the twins are dialed in (they catch what Fable catches), the calibration is answered and we
don't need more. Only if a real gap shows do we build and review the next plan — after a
retrospective on what the gap was and what mechanism would close it. Gap-driven, not exhaustive.

## Dual purpose — findings feed the roadmap

The scenarios are real analysis of Studio 2.0, not throwaway test prompts. Every actionable finding
routes into the app's plans / `REMAINING_TASKS.md` as implementable work. Calibration improves the
twins **and** advances the product. Findings are catalogued in `findings-summary.md`.

**No fixing in this program.** Findings are banked, then turned into implementation plans built the
*normal* way — and it is the **plan** that the twins and Fable review and that the calibration
compares. Nothing from a finding is implemented as part of calibration; when a plan is later approved
it ships through the normal build/review flow like any other work. This keeps the calibration clean
(the reviewers judge a fixed plan, not a moving codebase) and still advances the product.

## The range of scenarios (activity taxonomy)

Cover the span of what the system actually does — each a REAL, open, beneficial repo problem, not a
synthetic one:

| Activity | What it tests |
|---|---|
| Root-cause analysis | Finding the true cause of a subtle bug/behavior |
| Architecture / design decision | Open-ended judgment with expensive downside — where frontier pulls furthest ahead |
| Blast-radius / refactor-risk | Predicting what a change breaks (most objectively gradeable) |
| Adversarial review | Finding real issues in a real diff/area |
| Planning / decomposition | Turning a rough goal into an executable plan |
| Spec-vs-code drift | Detecting where the paperwork and the code disagree |

The concrete scenario menu is being assembled in `scenario-menu.md` (scouted from
`REMAINING_TASKS.md`, active plans, lessons, and known drift).

## Phases & status

- **Phase 1 — DONE (2026-07-18):** twins hired (Esther/Tamsin, PR #163); scenario menu scouted
  (12 candidates); 6 answer-neutral briefings written; **6 Fable references captured**, one per
  activity type (RC-1, AR-1, BR-1, AD-2, PL-2, SD-1). The Fable-gated work is complete — the clock
  is off.
- **Phase 2 (next):** build an implementation plan from a chosen finding, the *normal* way
  (plan-architect / engineer), into `design-docs/plans/`. No fixing.
- **Phase 3 (Fable-gated):** the twins review the plan (Opus / `fusion-reasoning`) and Fable reviews
  the same plan, each blind to the other; compare the two reviews; write the gap → mechanism catalog.
  Build the plan promptly so Fable can review before it expires. Adaptive: one plan first, escalate
  only on a real gap.
- **Findings routing (ongoing):** `findings-summary.md` catalogues each finding and the plan it
  feeds; plans ship through the normal flow once approved — not as part of calibration.
- **Phase 4 (owner-directed, 2026-07-19):** IMPLEMENT an approved plan's fix as real code (this is
  the one point where calibration produces a shipped change, not just banked analysis), then run
  the same twins-vs-Fable comparison on the resulting **diff** — a code review, not a plan review.
  Standing policy going forward: **Fable signs off on code changes when Fable is available; the
  twins sign off going forward regardless.** Compare the two sign-offs each time and watch for gaps,
  the same discipline as Phase 3. First test case: the RC-1 fix (most-reviewed plan, two full
  rounds already).

## Files

- `scenario-menu.md` — the candidate real problems, tagged by activity type (scout output).
- `references/` — banked Fable reference analyses + their exact briefings (Phase 1 output).
- `runs/` — twin runs + judge diffs (Phase 2).
- `gap-mechanism-catalog.md` — the durable deliverable: shortfalls → proposed mechanisms.
