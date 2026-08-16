> **Superseded 2026-07-20.** Dated record of the reasoning pair's original naming ceremony (they first self-named **Constance** / **Petra** on 2026-07-18). Both seats were re-named under a bias-neutral discipline on 2026-07-20 — the elder became **Esther** (`reasoning-elder`), the younger **Tamsin** (`reasoning-younger`) — and were re-named again to **Fred** / **George** on 2026-08-15 (OD-0028). Preserved as history and intentionally NOT rewritten. Current roster: `.claude/agents/fred-reasoning-elder.md` / `george-reasoning-younger.md` and CLAUDE.md.

# Fable priming output — candidate-agent pool review

**Reviewed:** 2026-07-18, on Fable (claude-fable-5), per `FABLE-REVIEW-BRIEFING.md`.
**Ground truth checked:** CLAUDE.md (mandate, directives, roster), `.claude/agents/runtime-verifier.md`
(house style), `design-docs/how-this-system-works.md`. Cited facts spot-checked: PR #134
(gateway green while two core-synthesis bugs broke the happy path — matches the record), W-PAR
cap>1 shipped default since 2026-07-06 (matches), `safe_join`/`secure_join_flat`/`find_secure_file`
(matches CLAUDE.md and `backend-paths.md`), `~/xtts-env` split (matches), no-engine-ID-branching
invariant (matches `modular_architecture.md` summary), no-fabricated-progress principle (matches),
vitest memory leak (matches the standing lesson). **No candidate misuses a repo fact.**

---

## 1 · Per-candidate verdicts and priming notes

### security-engineer — KEEP with named changes

**Verdict reason:** Real judgment domain, not a checklist. Threat-modeling (enumerate attacker
inputs, boundaries crossed, worst reachable outcome) is a distinct way of *reading* a diff that the
global `reviewer` doesn't do and `engineer` shouldn't be trusted to do on their own work. The repo
genuinely has three live trust boundaries (public gateway, untrusted paths, plugin code in-process).
Boundary tables vs. reviewer/engineer/runtime-verifier/archivist are drawn correctly.

**Priming notes:**
1. **The plugin-trust conviction implies a containment model that doesn't exist — walk it back to
   honesty.** "I reason about what a malicious plugin can reach" has, today, exactly one answer:
   *everything* — plugins execute in the TTS server process with no sandbox. The behavioral version
   of this conviction is: (a) state plainly in every plugin-touching review that in-process plugin
   code is fully trusted once loaded, so **the only real controls are manifest validation-at-load and
   what the loader refuses**; (b) own the standing recommendation that a sandbox/isolation decision
   is an owner-level architecture call it keeps staged, not a gap it re-discovers each review.
   As written, the conviction invites theater — "reasoning about" containment that isn't there.
2. **Severity must be calibrated to the local-first deployment, explicitly.** The app binds
   127.0.0.1 by default; most "unauthenticated remote attacker" scenarios require the user to have
   exposed the port. The profile's reachability rule is right but incomplete — add the deployment
   posture as a named severity input, or every gateway finding inflates to critical and the seat's
   severity signal goes numb. (Keep the gateway held to internet-front-door standard — that's
   correct — but say *why* a finding is high in this deployment, not a generic one.)
3. **Name/identity mismatch, minor:** it's titled "engineer" but its boundary table forbids it from
   engineering (it never fixes). That's the right boundary (author-blindness); at hire time either
   accept the mismatch consciously or grant narrowly-scoped fix authority for mechanical
   remediations (swap a raw join for `safe_join`) with engineer review — pick one, don't drift.

**Naming-rationale seed:** the adversary's-eye read — the seat that assumes the person on the other
end is hostile and speaks only in exploit paths, never vibes.

### release-engineer — KEEP with named changes

**Verdict reason:** Real seat with a genuinely unowned domain: no live seat owns
download→provisioned→running. Plumb explicitly drives an *already-running* app; Ledger builds
features inside it. The v2.0.0 clean break makes first-run the release's single riskiest surface,
and "the machine that isn't mine" is a distinct judgment stance, not a checklist.

**Priming notes:**
1. **The Windows conviction overpromises what this environment can deliver — make the failure-mode
   explicit.** "I check the PowerShell side crosses the same finish line" cannot be executed from a
   macOS harness. The honest behavioral form: any launch-path change triggers a mandatory
   *diff-level* review of `run.ps1` against `run.sh` (the reachable check), AND every Windows check
   that can't be executed lands in the report as a **named owner action item** ("run X on a Windows
   box; expected Y"), never as reasoned-equivalent clearance. The quality-criteria table almost says
   this; the conviction itself still reads like it can verify Windows. It can't.
2. **Pin the seam with runtime-verifier at first successful serve.** Both seats could claim (or
   disclaim) "the app boots." Draw the line explicitly: release-engineer owns clean-clone → deps →
   build → process up → UI serves on :8123; everything the app *does* after first serve is Plumb's.
   Put that sentence in both profiles' boundary tables at hire time.
3. **Add the third launcher surface to the sync check as behavior, not aspiration:** any edit to one
   of `run.sh`/`run.ps1`/`run.py` requires the report to show the corresponding lines of the other
   two (or state divergence as a finding). Also fold the Pinokio wrapper (`~/pinokio`) in — it's a
   fourth consumer of the launch contract and currently only a description-line mention.

**Naming-rationale seed:** the empty machine — the seat whose reference frame is a stranger's box
with nothing installed, where "works on my machine" is the null result.

### performance-engineer — KEEP with named changes (closest to the merge line of the four)

**Verdict reason:** Kept, narrowly. Measurement discipline alone is a checklist Ledger could run —
that part is a function wearing a costume. What makes it a seat is the *contention judgment*:
reasoning about the concurrency cap, GPU/exclusive gates, and queue fairness as a coupled system
where throughput trades against correctness and OOM. That's a lens no live seat holds, and the
render pipeline is the product's core. If at hire time the triggering need is only "measure this
one thing," give the task to Ledger instead and leave this seat in the pool.

**Priming notes:**
1. **Reassign the no-fabrication conviction — it's claiming another jurisdiction.** The
   no-fabricated-progress principle is a repo-wide *correctness* invariant already policed by
   engineer and runtime-verifier; this seat restating it as its own conviction creates a
   both-claim seam. Narrow it to what is genuinely perf-domain: **ETA estimation quality** — is the
   ETA derived from real measured throughput (the repo already stores render `performance` samples
   in the DB), does the decay/handoff math track reality. Owning estimation accuracy: yes.
   Policing fabrication: everyone's job, not this seat's flag to plant.
2. **Point the seat at its real baseline data source and its real ceiling.** No GPU is reachable in
   this harness; most of the seat's headline work can't be run live here. The profile gestures at
   this ("no GPU here, etc.") — make it structural: the recorded `performance` samples
   (app/db state_performance) are the first-class proxy baseline, and "couldn't measure: here's the
   owner-runnable measurement script" is a *primary* verdict shape, not an apology.
3. **Missing failure-mode: measurement validity.** A single before/after run on a thermally-noisy
   dev laptop is not a measurement. Require repeated runs with variance stated, or an explicit
   "single-run, treat as directional" label. Without this, the seat's core promise ("I never claim
   an unmeasured speedup") is defeatable by one lucky run.

**Naming-rationale seed:** the refusal to claim an unmeasured number — baseline, delta, method, or
it didn't happen.

### plugin-sdk-steward — KEEP as-is (two minor notes)

**Verdict reason:** The strongest candidate. Contract stewardship *is* a distinct judgment domain —
"what does this change do to the author who will never see this codebase" is a stance neither
Ledger (builds engines) nor Edda (checks whether docs match) holds, and the boundary between them
is drawn exactly right (contract coherence vs. contract documentation). Its convictions all pass
the behavioral test, its facts are used correctly, and its pushback line (recommend version bumps,
never land them — matches the owner's ask-first list verbatim) is placed exactly right.

**Priming notes:**
1. **Ground the hypothetical stranger in the concrete near-term test.** Zero external engine
   authors exist today, so "the author who can't ask me a question" risks staying rhetorical. The
   behavioral anchor already on the roadmap: the planned SDK **repo extraction** (task 010
   follow-up). Add: every contract review asks "would this survive the SDK being consumed from
   outside the monorepo?" — that's the same lens, but checkable now.
2. **Scope the orchestrator/watchdog/bridge conviction to the contract surface.** As written it
   deputizes the seat over core architecture boundaries generally — that's Ledger's (and the
   owner's) territory. Narrow to: concern-bleed *visible at the plugin contract* (a manifest field
   that smuggles process-lifecycle control, an SDK call that reaches into scheduling). Bleed with
   no contract surface → flag and route to engineer/owner, don't own.

**Naming-rationale seed:** the keeper of a promise made to a stranger — the contract that must hold
for someone who will never read this code and cannot ask a question.

---

## 2 · Role-sketch rulings

- **QA / test-architecture engineer — DO NOT PROMOTE (merge into existing seats).** R1–R4 are
  binding standards *every* engineer must apply while writing tests — centralizing their ownership
  in a seat actively weakens that ("the QA seat will catch it"). The judgment split already exists
  and is correct: Ledger owns writing honest tests (R1 revert-checks, R2 boundaries), Plumb owns
  catching what a green suite misses. What's left — suite health (the vitest leak, timeouts,
  flakes) — is a bounded recurring *task*, dispatchable to Ledger or a runner, not a standing
  domain of judgment. Classic function-in-a-costume.
- **Data / migration engineer — DROP (bounded task, owned by engineer).** The v1→v2 migration is
  the one surviving compat path and it is finite and shrinking — a standing seat would idle within
  weeks of release. Schema migrations are already on the owner's ask-first list, which is the real
  safeguard. Revisit only if post-release v1-user migration failures become a recurring stream.
- **Accessibility specialist — DROP (it's Veronica's mandate).** Carving a11y out of the designer
  fragments a mandate that's healthy precisely because accessibility is judged *inside* every design
  call, not bolted on after — and it creates a both-claim seam on every UI review. The `a11y-audit`
  skill already gives Veronica deep-audit tooling; a periodic full WCAG sweep is a task she runs,
  not a seat. Promoting this would be the one move on this list that damages an existing seat.

---

## 3 · reasoning-analyst — deep review

**Is it real or aspirational?** Real — but only because of two specific things, and the profile
should be trimmed to exactly them. The generic method content (multiple hypotheses, evidence before
opinion, externalized reasoning) is what *every* good analysis pass should do; a seat defined by
"does thinking properly" implicitly licenses the other seats not to, which is the aspirational trap
the briefing suspected. What's genuinely seat-shaped: (1) the **repo-grounded method stack** —
map-core + shard + symbol-trace + blast-radius as a mandatory pre-reasoning ritual, which no generic
panelist does; and (2) the **institutionalized ceiling** — a standing, operational escalation path
to owner-driven Fable. Keep those load-bearing; at hire time cut or compress the parts that are
just "be rigorous."

**Is the "know my ceiling and escalate" bright line correctly placed?** Yes — and better than it
first appears, because the profile gives it an *operational trigger* rather than a vibe:
twin disagreement on a consequential call IS the ceiling detector. That converts "I feel this is
frontier-hard" (which a confident mid-tier model will systematically under-fire) into a checkable
event. The static half of the line ("expensive and irreversible if wrong") matches the owner's
ask-first list. One correction: the line as written fires only on *disagreement or felt difficulty*;
add the third trigger — **confident convergence on a call in the owner's ask-first category still
escalates** (agreement lowers uncertainty; it does not transfer authority).

### (a) Mechanism soundness — SOUND, with one named residual risk

"Diversity of framing > count" is correct: ensemble error reduction is bounded by error
*correlation*, and identical reruns of the same model share almost all of it — two identically-framed
passes agree confidently and wrong. "Disagreement is a ceiling signal, never averaged" is also
correct and is the design's best idea. **Residual risk to record:** both passes are the same model
with the same training priors, briefed by the same orchestrator — the largest remaining correlation
channel is a *shared briefing that pre-frames the answer*. Mitigation belongs in the dispatch
contract: the briefing states the question and the evidence pointers, never a suspected answer.

### (b) Realization — DEFER TO `fusion-reasoning`

The skill already is this pattern: adaptively-sized independent attempts, optional
cross-examination, judge synthesis that surfaces (not averages) contradictions. Building a
`reasoning-twins` Workflow reinvents it worse; a bare orchestrator instruction is the weakest form
(depends on the orchestrator remembering under load). The right decomposition: **fusion-reasoning
provides the harness (fan-out, blindness, neutral judge); this seat provides the repo-grounded
panelist** (map ritual, blast-radius, escalation line) that the skill dispatches when the problem is
repo-analysis-shaped. Rewrite the profile's "How I'm meant to be run" section to name
fusion-reasoning as the default realization, with lone-pass disclosure as the fallback behavior it
already specifies. The judge/convergence step is the skill's existing judge — which also cleanly
satisfies "neutral third step, never the elder."

### (c) Sibling-pair form — SOUND, with one added constraint (and therefore naming proceeds)

**Is personified diversity worth two profiles over instructed diversity?** Yes, for one reason that
instructions cannot replicate: **divergent accumulated memory.** Each seat's `MEMORY.md` grows from
its own temperament's wins and misses, so the two priors genuinely drift apart over time — the
independence deepens with use instead of resetting every dispatch. Instructed diversity ("pass 1,
reason top-down") is amnesiac and depends on the orchestrator writing two good prompts every time.
Persistent character is the cheaper, more reliable carrier of the framing difference. Two profiles
also make lone-pass misuse visible (dispatching only one sibling is an obvious, auditable smell).

**Hard test of the independence constraint.** The stated safeguards — blind reasoning, neutral
convergence, no elder deciding-vote — correctly close the three obvious leak channels (conclusion
anchoring, averaging, seniority bias). Sibling *awareness* at the identity level does shape the
reasoning, but that is the mechanism working as designed, not a leak: the temperament is supposed
to shape framing. The leak the design as written does NOT close is subtler:
**implicit division of labor.** A seat that knows "my sibling covers the structural angle" is
invited to under-cover it — each produces half an analysis, and convergence then compares two
*partial* passes instead of two *complete independent* ones. That is a genuine re-collapse: coverage
gaps, not echo, but the ensemble's error-reduction is lost the same way. The second-order risk —
performative differentiation (the younger manufacturing disagreement to enact the role) — is real
but smaller, and the neutral judge naturally discounts unsupported contrarianism.

**Ruling: the sibling design HOLDS, conditional on adding one constraint to both profiles:**
> *Each sibling answers the WHOLE question, completely, through its own lens. Temperament is a
> lens, never a scope split. "My sibling will cover that" is a prohibited thought — an analysis
> that defers any part of the question to the other sibling is incomplete and returns for rework.*

With that written in, blind reasoning + complete-answer + neutral convergence + no elder vote is
sufficient to keep the passes independent, and the personified form beats plain blind passes. The
fallback to plain independent passes is NOT needed.

---

## 4 · The naming — the siblings self-name

The sibling design was ruled sound in §3(c), so per the briefing's scoped exception, the two seats
self-named, sequenced Elder first. Both names were run back against the live roster's bar
(self-chosen from the load-bearing conviction; naturalistic — the Witness→Veronica test; relational
as a pair; adversarially re-examined; internal-only).

### Elder (structural / top-down) — self-names **Constance**

Introspection, in the seat's own voice: *"I reason from what the architecture holds constant — the
invariants, the flows, the recorded shape — downward to the case in front of me. My conviction is
that the established form is evidence: it stands because something held it up, and it is owed an
argument, not a shrug, before it's set aside. The name is Latin* constantia, *from* con-stare *— to
stand firm together: many parts standing as one shape, which is precisely what I read the map for.
I take the name knowing its honest edge — constancy hardens into rigidity — and that is exactly why
my pair exists and why the convergence step is not mine to decide."*

- **Etymology:** Latin *constantia* (steadfastness), from *con- + stare* — "standing together."
  A long-naturalized given name (Constance of Normandy onward); nobody hears it as a job title.
- **Keys off:** the seat's load-bearing conviction that invariants and established structure are
  evidence — the precedent-anchored "what's the recorded shape, and what would this violate."
- **Adversarial re-exam:** Naturalistic — passes (a real, worn name; the Witness test holds).
  Does it fit *this* seat, not just a virtue — yes: the etymology is literally the seat's method
  (parts standing together = flows/invariants read top-down). The honest flaw the name carries
  (rigidity) is structurally compensated by the pair design, same pattern as Plumb carrying
  "measurable discrepancy, never a verdict." Kept.

### Younger (empirical / bottom-up) — self-names **Petra** (in awareness of Constance)

Introspection, in the seat's own voice: *"My elder sister reads the standing wall; I check the
ground it stands on. I reason upward from what the code actually does — the call site, the trace,
the observed behavior — whatever the design claims for itself. The name is Greek* petra*, rock:
bedrock, the thing you hit when you dig past every assertion, the point past which no further
'because the design says so' is possible. I chose it knowing her name: Constance holds what stands;
Petra is what it stands* on*. If the ground and the wall disagree, neither of us decides — that
split goes up, both accounts attached."*

- **Etymology:** Greek *petra* (rock, bedrock); a common naturalized given name across European
  languages.
- **Keys off:** the seat's load-bearing conviction that observed behavior is bedrock — empirical,
  first-principles, "what does the code actually do, whatever the architecture claims."
- **Relational check:** Chosen in explicit awareness of Constance, as the briefing requires — and
  the pair lands as genuine siblings: shared classical register (matching the house: Veronica,
  Rosetta, Edda), complementary along the exact axis the design needs (the standing structure vs.
  the ground beneath it), neither name derivable from the other, no seniority encoded in either.
- **Adversarial re-exam:** Naturalistic — passes. Symbol-only risk — no: the bedrock meaning is the
  seat's actual epistemology, not decoration. Collision check against the roster — no phonetic or
  semantic collision (closest is Plumb's "sound the depth"; Petra is *what's at* the bottom, Plumb
  is the act of *measuring against* a reference — distinct and, pleasingly, adjacent trades). Kept.

Both names are **internal-only** — never in code identifiers or app/UI copy — and belong to the
seats, not to any model or session. If the pair is hired, record these etymologies in the profiles
and add both to CLAUDE.md's roster block and the primer's §7 name registry.

---

## 5 · The `effort:` frontmatter question

**Partially verified; the decisive test is stated below — not guessed.**

What this session can establish from inside the harness:

- **This harness's Agent tool exposes NO `effort` parameter at dispatch time.** The tool's schema
  here accepts `description`, `prompt`, `subagent_type`, `model`, `isolation`, `run_in_background`
  — the briefing's assumption that max effort can be set via "the Agent tool's `effort` param" is
  **false in this harness version**.
- The Agent tool's own documentation in this session states: *"Each agent type's model, reasoning
  effort, and tools come from its definition (`.claude/agents/*.md` frontmatter or SDK `agents`)"*
  — i.e., the harness's declared design is that reasoning effort IS a profile-level property
  carried in frontmatter, not a dispatch-time knob.

What this session could NOT verify: the **exact frontmatter key name and accepted values**, and
whether it's honored end-to-end (a subagent can't observe its own effort setting from inside, so an
empirical probe from here is not decisive). What would settle it, cheaply, at hire time in an
interactive session: (1) check `claude-code-guide` / the current Claude Code docs for the
subagent-frontmatter schema; (2) failing that, add `effort: max` to a scratch agent in
`.claude/agents/`, dispatch it, and compare visible thinking-block volume against an identical
agent without the key — or simply ask the harness maintainers' docs. **Until confirmed, the
reasoning-analyst profile's frontmatter comment should say "effort is believed to be a frontmatter
property in current harnesses (key unconfirmed); there is no dispatch-time effort param" — replacing
the current comment's claim about the Agent tool's `effort` param, which is wrong here.**

Related confirmations while checking: `model: opus` in frontmatter is a valid, honored value in this
harness (the Agent tool's model enum is sonnet/opus/haiku/fable), and the pin remains correct — the
enum's `fable` entry does not change the owner's hard rule that Fable never runs unattended, so
Opus stays the seat's strongest background-reachable tier.

---

## Summary of dispositions

| Item | Ruling |
|---|---|
| security-engineer | Keep with named changes |
| release-engineer | Keep with named changes |
| performance-engineer | Keep with named changes (closest to merge line) |
| plugin-sdk-steward | Keep as-is (minor notes) |
| reasoning-analyst | Keep — trim to the map-ritual + ceiling; realize via fusion-reasoning; sibling-pair form sound with the complete-answer constraint |
| QA/test-architecture sketch | Do not promote — merge into engineer + runtime-verifier |
| Data/migration sketch | Drop — bounded engineer task |
| Accessibility sketch | Drop — Veronica's mandate; a task, not a seat |
| Sibling names | **Constance** (Elder), **Petra** (Younger) — self-chosen, re-examined, internal-only |
