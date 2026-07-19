# Frontier Calibration — closing the gap with durable mechanisms

**Started 2026-07-18. Status: Phase 1 (setup + Fable reference capture), Fable-gated.**

## What this is

A standing program to calibrate this repo's durable reasoning system (the Opus **reasoning-analyst
twins** — Constance/Petra — run via `fusion-reasoning`) against the frontier model (**Fable**),
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

## Method (per scenario)

1. **Same clean briefing** to both Fable and the twins — states the question and the evidence
   pointers, **never a suspected answer** (Fable's own residual-risk note: a shared briefing that
   pre-frames the answer is the largest remaining correlation channel; avoid it).
2. **Fable reference** (time-boxed — capture NOW): Fable produces its analysis; bank it + the exact
   briefing.
3. **Twins** (Opus, anytime — NOT Fable-gated): Constance + Petra run via `fusion-reasoning`
   (independent blind passes, neutral judge convergence).
4. **Neutral judge diff**: where did the twins fall short of the Fable reference? Missing evidence?
   A framing they didn't try? Insufficient adversarial refutation? A conceptual leap they didn't
   make?
5. **Gap → mechanism**: for each shortfall, propose the durable mechanism (code-map-class) that would
   have closed it. Some become real builds — the way the code-map itself was.

## Scarcity rule

The **only** time-boxed, irreplaceable step is **capturing Fable's reference analyses**. The twins
run on Opus (available anytime); the judge comparison and the mechanism-distillation are not
Fable-gated. Spend the Fable window on reference capture, not on mechanics.

## Sequencing — adaptive, start with the 6

Run **one scenario per activity type first** (RC-1, AR-1, BR-1, AD-2, PL-2, SD-1). For each type,
only escalate to the menu's **second** candidate if the twins-vs-Fable comparison on the first
reveals a real gap — and only after a retrospective on what the gap was and what mechanism would
close it. If the twins are dialed in on the first (they match the Fable reference), the second is
skipped. Coverage is gap-driven, not exhaustive.

## Dual purpose — findings feed the roadmap

The scenarios are real analysis of Studio 2.0, not throwaway test prompts. Every actionable finding
a reference (or a twin run) surfaces — a root cause, a design, a plan, a bug, a drift correction —
routes into the app's plans / `REMAINING_TASKS.md` as implementable work. Calibration improves the
twins **and** advances the product. Findings are catalogued in `findings-summary.md`.

**Benchmark integrity (the one constraint):** do **not** implement a scenario's finding until the
twins have run that scenario. Fixing the RC-1 bug or correcting the SD-1 lesson before Phase 2 would
change the very code the twins analyze and destroy their half of the benchmark. Bank findings now;
implement after the twin run for that scenario, then route to plans. (A finding whose implementation
touches nothing the scenario briefs on — e.g. a brand-new plan doc — can be drafted earlier; the
safe default is twin-run-first.)

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

- **Phase 1 — DONE (2026-07-18):** twins hired (Constance/Petra, PR #163); scenario menu scouted
  (12 candidates); 6 answer-neutral briefings written; **6 Fable references captured**, one per
  activity type (RC-1, AR-1, BR-1, AD-2, PL-2, SD-1). The Fable-gated work is complete — the clock
  is off.
- **Phase 2 (anytime):** run the twins on the same 6 briefings via `fusion-reasoning`; neutral-judge
  diff vs. the Fable reference; write the gap → mechanism catalog; escalate to a type's second
  scenario only on a real gap (adaptive sequencing).
- **Findings routing (ongoing):** `findings-summary.md` catalogues each reference's actionable
  finding and where it routes; implement after each scenario's twin run (benchmark integrity).

## Files

- `scenario-menu.md` — the candidate real problems, tagged by activity type (scout output).
- `references/` — banked Fable reference analyses + their exact briefings (Phase 1 output).
- `runs/` — twin runs + judge diffs (Phase 2).
- `gap-mechanism-catalog.md` — the durable deliverable: shortfalls → proposed mechanisms.
