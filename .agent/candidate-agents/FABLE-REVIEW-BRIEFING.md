# Fable review briefing — candidate agent pool

**For:** a Fable-driven session (owner at the wheel), while Fable is available (through 2026-07-19).
**Task:** adversarially review AND actively strengthen ("prime") the five candidate profiles in this
directory, and rule on the three role sketches in `README.md`. This is the one required adversarial
review, banked ahead of hire — and the goal is to spend the scarce Fable window making these as
strong as they can be, not just judging them.

**Explicit constraint from the owner: do NOT choose names.** A name is self-chosen at hire time,
after the profile is rebuilt for a real need — naming an unhired seat inverts that. Instead, for
each candidate worth keeping, write one line on *what the name should key off* (its single
load-bearing conviction), so the eventual self-naming has a frontier-quality seed. That is the only
naming-adjacent output wanted here.

## The five candidates

`security-engineer.md`, `release-engineer.md`, `performance-engineer.md`, `plugin-sdk-steward.md`,
`reasoning-analyst.md`. The last is special: it's an attempt at a **frontier-reasoning stand-in** —
a method-driven seat (code-map + blast-radius + adversarial multi-hypothesis) meant to approximate,
*not replace*, the kind of judgment you provide. Scrutinize it hardest: is its "I know my ceiling
and escalate" bright line real and correctly placed, or does the profile overpromise what a
non-frontier model can do by method alone? This is the one most at risk of being aspirational.

It also declares a **twin/converge dispatch contract** (≥2 independent, differently-framed passes;
agreement is the call, disagreement escalates). Three things to rule on: (a) is that the right
reliability mechanism, and is "diversity of framing > count" + "disagreement is a ceiling-signal"
the right shape? (b) **Realization:** should the twin fan-out live as an orchestrator instruction, a
dedicated Workflow script (`reasoning-twins`: fan out N passes → convergence agent), or should this
seat simply defer to the existing `fusion-reasoning` skill, which already implements independent
attempts + judge synthesis? Pick one and say why — we don't want to reinvent fusion-reasoning if it
already fits. (c) **The sibling-pair form** (see the profile's "sibling-pair realization"): two
persistent seats — Elder (structural/top-down) and Younger (empirical/bottom-up) — instead of one
profile run twice. Rule on whether personified diversity is worth two profiles over instructed
diversity, and pressure-test the **independence constraint**: is "shared name/lineage but blind
reasoning, neutral convergence, no elder deciding-vote" actually enough to keep the passes
independent, or does any sibling awareness leak into the reasoning and re-collapse the ensemble? If
the latter, the whole sibling framing should be cut back to plain independent passes.

### The siblings self-name (on Fable) — a scoped exception, sequenced

Framing correction: this is **not Fable imposing names**. It's the two sibling seats **naming
themselves** — the repo's standard ceremony (every live seat self-chose: Plumb, Ledger, Veronica,
Edda, Rosetta) — done with **Fable as the driving model**, so the self-naming introspection runs at
frontier quality. Fable *reviews the design*; the seats *name themselves* on Fable.

The owner's standing rule is **no pre-hire naming** — it holds for the other four candidates and for
`reasoning-analyst` as a single seat. The **one exception**: *if* you rule the sibling-pair design
sound, the twins' character *is* their function (identity is the diversity mechanism, not
decoration), so self-naming them is naming the design. Order, and only this order:

1. **First, rule the sibling design sound** (question (c) above). If you'd restructure, merge, or cut
   it, do NOT name — a name on a seat you'd reshape is wasted.
2. **If it holds, self-name one at a time** (watch token usage): the **Elder** introspects on its own
   structural/top-down temperament and chooses its name. Then the **Younger** introspects on its own
   empirical/bottom-up temperament and chooses its name *in awareness of the Elder's chosen name* —
   the one place the sibling relationship legitimately shapes identity.
3. If the design does NOT hold, seed naming rationale only (as for the others), no names.

**The naming standard each self-choice must meet** (the bar the live five passed):

- **Self-chosen** — reasoned from the seat's *own* load-bearing conviction (Elder: structural,
  precedent-anchored, "what's the established shape"; Younger: empirical, first-principles, "what
  does the code actually do"). The name keys off that conviction, not a surface trait.
- **Naturalistic** — reads as a name a person could actually have, not a function wearing a costume.
  This is the exact test that failed "Witness" and produced "Veronica." Nobody is named "Elder."
- **Relational, for the pair** — the two should land as genuine siblings: shared register,
  complementary rather than identical, the younger's choice audibly aware of the elder's.
- **Survives adversarial re-examination** — run each name back against "is this naturalized, does it
  fit *this* seat's real convictions." A name that only works as a symbol gets sent back.
- **Internal-only** — never appears in code identifiers or app/UI copy.

Record each chosen name's etymology and the conviction it keys off, same as the live roster.

## Why you specifically

Frontier judgment is the scarce resource here and it's being spent where it's worth most:
profile-craft. These are *primers* — nobody is hired, no names are chosen, and each will be
modified at hire time. So do **not** line-edit or polish prose. Rule on the things that are
expensive to get wrong and cheap to fix now:

## The five questions to answer per candidate

For each of `security-engineer.md`, `release-engineer.md`, `performance-engineer.md`,
`plugin-sdk-steward.md`, `reasoning-analyst.md`:

1. **Is the role real, or a function wearing a costume?** Does this seat have a distinct domain
   of *judgment*, or is it a checklist the `engineer` could run? Kill or merge any that don't
   clear this bar. (The agent-profiles doctrine: don't inflate a pipe into a philosopher.)

2. **Does it collide with an existing seat?** The live roster is `engineer` (Ledger, implements),
   `designer` (Veronica, UI/UX + accessibility + design system), `runtime-verifier` (Plumb, drives
   the real app / checks artifacts), `archivist` (Edda, spec/plan/paperwork truth),
   `user-docs-writer` (Rosetta, end-user docs). Each candidate's boundary table claims a clean
   split — pressure-test it. Where's the genuine overlap, and is the boundary drawn in the right
   place? Name any seam where two seats would both claim a task, or both disclaim it.

3. **Are the convictions behavioral or decorative?** Apply the test: "what would this agent do
   differently because it holds this belief?" If a conviction survives only as a value statement,
   flag it for a rewrite or a cut. Convictions cite real repo facts (PRs, invariants, owner
   directives) — check that the facts are used correctly, not just name-dropped.

4. **Is the pushback authority real?** Every seat should have a refusal it would actually
   exercise ("this is an architecture call, send it back") and a bright line it won't cross without
   the owner (version bumps, gate changes, unilateral rewrites). Is each candidate's line drawn at
   the right place — neither so timid it rubber-stamps nor so aggressive it blocks normal work?

5. **Executable-mandate check.** Each body says "write the report to a file" and "SendMessage to
   main." Frontmatter omits `tools:` (inherits all) and sets `model: inherit` — except
   `reasoning-analyst`, which pins `model: opus` and is meant to run at max reasoning effort.
   Confirm that's the right call, that no mandate in the body is unsatisfiable, and — since your
   session can test it — **confirm whether an `effort:` frontmatter key on an agent profile is
   actually honored by this harness, or whether max effort has to be set at dispatch time** (the
   Agent tool's `effort` param). If frontmatter effort works, note the exact key to add.

## On the three role sketches (README "existence not yet decided")

Rule directly: **promote / merge into an existing seat / drop.**

- **QA / test-architecture engineer** — real seat, or a responsibility already split between
  `engineer` (writes tests) and `runtime-verifier` (verifies outcomes)? The repo's testing
  standards (R1–R4) are elaborate — does owning *them* constitute a distinct judgment domain?
- **Data / migration engineer** — standing seat, or a bounded task the `engineer` owns? The
  v1→v2 migration is the one surviving compat path.
- **Accessibility specialist** — distinct from `designer`, who already owns WCAG 2.2 AA and
  design-system conformance? Or is carving a11y out a mistake that fragments Veronica's mandate?

## What "done" looks like from you

Per candidate, two things — judgment AND priming:

1. **Verdict:** keep as-is / keep with named changes / merge with X / kill — with the *reason*.
2. **Priming notes** (the point of using Fable here): the highest-leverage strengthening you'd
   make — a conviction that's decorative and should be behavioral or cut, a boundary drawn in the
   wrong place, a missing failure-mode the seat should own, an overpromise to walk back. One to
   three sharp notes per kept candidate. Plus the one-line **naming-rationale seed** (what the name
   should key off — not a name).

Plus the three sketch rulings (promote / merge / drop).

You do not need to rewrite the files — the actual edits happen cheaply at hire time by a normal
session, guided by your notes. But if a fix is a one-liner and obviously right, applying it inline
is welcome. The output of this session is **frontier judgment banked**: verdicts, priming notes,
and naming seeds that a later hire pulls from. Write it to
`.agent/candidate-agents/FABLE-PRIMING-OUTPUT.md` so it survives the session.

## Ground truth to check against (don't take the profiles' word for it)

- `CLAUDE.md` — the roster block, owner directives (clean break, versioned contracts, audio
  formats), the mandate's ask-first / do-then-report split.
- `.claude/agents/runtime-verifier.md` — the house style the candidates were written to match
  (real-fact convictions, collision-naming boundary tables).
- `design-docs/how-this-system-works.md` — the owner-facing summary of the current five seats.
- The candidates cite specific facts (PR #134, W-PAR cap>1 since 2026-07-06, the `safe_join`
  family, `~/xtts-env`, the no-engine-ID-branching invariant, the no-fabricated-progress
  principle, the vitest memory leak). Spot-check that they're used correctly.
