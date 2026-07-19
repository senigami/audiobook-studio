# Fable review briefing — candidate agent pool

**For:** a Fable-driven session (owner at the wheel), while Fable is available.
**Task:** adversarially review the four candidate profiles in this directory and rule on the three
role sketches in `README.md`. This is the one required adversarial review, banked ahead of hire.

## Why you specifically

Frontier judgment is the scarce resource here and it's being spent where it's worth most:
profile-craft. These are *primers* — nobody is hired, no names are chosen, and each will be
modified at hire time. So do **not** line-edit or polish prose. Rule on the things that are
expensive to get wrong and cheap to fix now:

## The five questions to answer per candidate

For each of `security-engineer.md`, `release-engineer.md`, `performance-engineer.md`,
`plugin-sdk-steward.md`:

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
   main." Frontmatter omits `tools:` (inherits all) and sets `model: inherit`. Confirm that's the
   right call for this repo's quality seats, and that no mandate in the body is unsatisfiable.

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

A short verdict per candidate — **keep as-is / keep with named changes / merge with X / kill** —
with the *reason*, not a rewrite. Plus the three sketch rulings. If a candidate is worth keeping
but a specific conviction, boundary, or the whole framing is wrong, say which and why in one or
two lines; the actual rewrite happens (cheaply) at hire time by a normal session. The output of
this session is **judgment banked**, not polished files.

## Ground truth to check against (don't take the profiles' word for it)

- `CLAUDE.md` — the roster block, owner directives (clean break, versioned contracts, audio
  formats), the mandate's ask-first / do-then-report split.
- `.claude/agents/runtime-verifier.md` — the house style the candidates were written to match
  (real-fact convictions, collision-naming boundary tables).
- `design-docs/how-this-system-works.md` — the owner-facing summary of the current five seats.
- The candidates cite specific facts (PR #134, W-PAR cap>1 since 2026-07-06, the `safe_join`
  family, `~/xtts-env`, the no-engine-ID-branching invariant, the no-fabricated-progress
  principle, the vitest memory leak). Spot-check that they're used correctly.
