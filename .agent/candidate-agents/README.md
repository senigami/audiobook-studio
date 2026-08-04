# Candidate agents — a pre-reviewed hiring pool

These are **draft agent profiles for seats we do not yet have**, held here so that when a
real need arises we pull a candidate, modify it to the moment, name it (OD-0021), run
the one required adversarial review, and commit it into `.claude/agents/`. They are **not
active** — nothing in this directory is dispatchable by the harness (only `.claude/agents/`
is). Think of it as résumés on file, not employees.

## Why this exists

Frontier-model (Fable) judgment is the scarce resource, and it is *most* valuable on
profile-craft — whether a role is real or a function wearing a costume, whether it collides
with an existing seat, whether its pushback authority is genuine and its convictions are
behavioral rather than decorative. Drafting candidates while Fable is available (and banking
its adversarial review) means a future hire starts from a frontier-reviewed primer instead of
a cold draft. See `design-docs/how-this-system-works.md` for the "tight briefing → switch to
Fable → decide → switch back" pattern this follows.

## Conventions these follow

- **No personal names.** A candidate carries no name. The name is assigned by the orchestrator
  *at hire time*, after the profile is rebuilt for the actual need — write the profile first, then
  name it. Frontmatter uses the role name only. Naming is orchestrator-owned and never
  self-chosen (OD-0021); the method is
  `~/.claude/orchestration-primer/naming-discipline.md` and the charter is `roster.json`'s
  `naming` object — do not restate either here.
- **`model: inherit`** — the repo's quality seats ride the dispatching session's model
  (downshift per-spawn for mechanical slices). Don't pin a dated slug. **One deliberate exception:**
  `reasoning-analyst` pins `model: opus` and is meant to run at max reasoning effort — reasoning
  depth is its whole purpose, so it rides the strongest background-reachable tier rather than
  inheriting a possibly-weaker session model.
- **Seven-section anatomy** (agent-profiles skill): frontmatter → identity → convictions →
  scope boundaries → quality criteria → deliverable protocol → memory hook.
- **Convictions are grounded in real repo facts**, the way the live profiles are — each cites
  the actual bug class, invariant, or contract the seat would defend.

## The current pool (drafted 2026-07-18, pending Fable priming)

| File | Seat | Strongest case for it | Collision risk to adjudicate |
|---|---|---|---|
| `security-engineer.md` | Application security | Public `/api/v1/tts` gateway (auth + rate-limit), untrusted-path handling everywhere, CodeQL in CI, third-party plugin code running in the TTS server | vs. global `reviewer` (generic code review) and `engineer` (who fixes) |
| `release-engineer.md` | Release & packaging | v2.0.0 clean-break release imminent; `run.sh`/`run.ps1` cross-platform provisioning, `~/xtts-env`, `demo.zip`, Pinokio wrapper | vs. `engineer` (feature work) and `runtime-verifier` (drives the app) |
| `performance-engineer.md` | Performance | Render pipeline, parallel-segment render (cap>1 default), GPU/exclusive gates, ETA/progress math, test-suite memory safety | vs. `runtime-verifier` (measures outcomes) and `engineer` (implements) |
| `plugin-sdk-steward.md` | Plugin/SDK ecosystem | `studio_plugin_sdk`, versioned `manifest.json` contracts, engine registry + voice bridge, the "no engine-ID branching in core" invariant, third-party engine authors | vs. `engineer` (builds engines) and `archivist` (owns contract-doc drift) |
| `reasoning-analyst.md` | Deep reasoning / frontier stand-in | The hard open-ended calls (root-cause, architecture, blast radius) you'd want Fable for — method-driven: code-map + blast-radius + adversarial multi-hypothesis, run as ≥2 converging twin passes (Opus/max), with honest escalation past its ceiling. Proposes a **sibling-pair form** (Elder=structural/top-down, Younger=empirical/bottom-up) — personified diversity, independence-sacred, Fable to rule + name if sound | vs. `engineer` (implements), `runtime-verifier` (checks disk reality), global `reviewer` (critiques one diff) |

## Role sketches — existence not yet decided (for Fable to rule on)

Drafted only as one-liners on purpose; promote to a full profile only if the role is real and
non-overlapping:

- **QA / test-architecture engineer** — owns the testing standards (R1–R4), coverage strategy,
  test-suite health. *Risk:* substantially overlaps `engineer` (writes the tests) and
  `runtime-verifier` (verifies outcomes). Is there a distinct seat here, or is this a
  responsibility of the existing two?
- **Data / migration engineer** — owns the v1→v2 migration (the one surviving compat path),
  SQLite schema, `state.json`. *Risk:* may be a bounded *task* the `engineer` owns, not a
  standing seat.
- **Accessibility specialist** — owns WCAG 2.2 AA conformance end-to-end. *Risk:* `designer`
  (Junia) already owns accessibility floors and design-system conformance. Distinct seat or
  her mandate?

## Hire-time checklist (when pulling a candidate)

1. Copy the candidate into `.claude/agents/<seat>.md`, delete from this pool (or leave if the
   pool copy stays a template).
2. Rewrite for the actual triggering need — the primer is a starting point, not final.
3. Name the seat yourself and report it — do not ask it to name itself, and do not spawn anything
   to name it (OD-0021). Record the rationale line in the profile, add the seat to `roster.json`
   and `roster.html` in the same change, and write the name to the owner-wide registry
   (`~/.claude/orchestration-primer/name-registry.md`), which is the only ledger of taken names.
4. Run the one required adversarial review before commit (mandate guardrail).
5. Update `design-docs/how-this-system-works.md`'s team table.
