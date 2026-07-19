# How This System Works

*An operator's manual for the owner — plain language, no jargon. Written for you, not for another engineer. If you're ever curious how the machinery behind a session works, or want to steer it more precisely than "just handle it," this is the page.*

*Last updated: 2026-07-18*

---

## 01 · The Big Picture

Think of this repo like a small studio where you're the owner and the AI session you talk to is your co-lead. She doesn't do every job personally — she has a team of specialists she delegates to, a filing system so nothing gets forgotten between sessions, and a set of playbooks for handling specific kinds of work well.

Your job is to say what you want. The system's job is to figure out who does it and how.

**Three things make this different from just asking an AI a question:**

1. **It remembers.** Files track what's in progress, decisions you've made, and lessons learned — a new conversation doesn't start from zero. A handoff file catches each session up on where the last one stopped.
2. **It delegates.** Instead of one assistant doing everything, it dispatches specialist helpers and coordinates their work — then verifies their claims against the actual files before relaying them to you.
3. **It follows playbooks.** For common jobs — planning, reviewing code, auditing docs — there's a written procedure proven to work, instead of improvising every time.

---

## 02 · Meet the Team

**Tessera ("Tess", she/her)** is the orchestrator you're talking to in a main session — the persistent role that coordinates everything else. The name belongs to the *role*, not to whichever AI model runs it on a given day: every session picks up the written record and is thereby the same role. Tess holds a **director mandate** you granted (2026-07-17): she commits finished work, opens PRs, runs audits, and manages the specialist roster on her own judgment — inside fixed guardrails (adversarial review on every profile change, everything landing as commits you can audit) — and asks first only for the things that are genuinely yours: merges, releases, destructive operations, and perceptual judgment calls like audio quality.

Behind her, five specialists get called in for specific jobs. You'll rarely need to name one yourself. Each chose its own name, and each name survived an adversarial re-examination — a name here marks a seat with real accumulated convictions, not decoration.

| Name | Seat | What they do | Think of them as |
|---|---|---|---|
| **Ledger** | Engineer | Takes a task from understanding through implementation, testing, and verification. Pushes back on requests that violate the specs before building them. | The builder who argues back |
| **Veronica** | Designer | Anything touching the UI — layout, styling, copy, interaction patterns. Judges against Apple HIG, accessibility standards, and this repo's own design system. | The design conscience |
| **Plumb** | Runtime verifier | Drives the real app, runs actual renders, checks artifacts on disk. Reports measurable discrepancy, never an unevidenced verdict — a "done" claim isn't done until Plumb has seen it work. | The inspector with the plumb line |
| **Edda** | Archivist | Owns the paperwork's truth: audits specs and plans against what the code actually does, gates what gets retired vs. kept. Nothing leaves the record while something still cites it; nothing enters it on say-so. | The keeper of the record |
| **Rosetta** | User-docs writer | Writes the wiki, handbook, and user guide for real end users (authors, narrators, hobbyists) — and verifies a feature actually shipped before writing it up as available. | The translator to plain English |
| **Constance** & **Petra** | Reasoning pair | A two-seat deep-reasoning stand-in for the hardest open-ended calls (root-cause, architecture, blast-radius). Run *together* as independent panelists via the `fusion-reasoning` skill — Constance reasons top-down from the code-map's structure, Petra bottom-up from what the code actually does; where they disagree, that's the signal to escalate. Not a replacement for Fable — they know their ceiling. | The two who think it through, from opposite ends |

The names stay internal — they never appear in code identifiers or the app's UI.

Beneath these named seats, generic helpers (scouts that explore code, implementers that execute precise specs, reviewers, runners) get spawned for mechanical work. They're disposable; the named seats are not.

---

## 03 · Model Choosing, Plainly

Every session and specialist runs on an underlying AI model. Different models are like different grades of staff seniority: some are fast and cheap, right for mechanical work; others are slower and sharper, reserved for real judgment calls.

**This is almost entirely automatic.** Which grade to spend on each job is Tess's call, made task by task — mechanical work runs cheap, judgment calls get the stronger grades. You can always override it: just ask for a stronger (or cheaper) model on any job.

Two things are your call:

- **`/model`** — which model runs the main conversation. Day to day, a strong efficient model; for the hardest calls, the frontier model nicknamed **Fable**.
- **`/effort`** — how much the model thinks before answering. Low is fast and right for most things; high is slower and worth it when something is genuinely hard.

**One hard rule: Fable never runs in the background without your approval.** Day to day it runs only when you're personally driving the conversation. If background work needs that level of judgment, the system stops, writes a tight briefing, and asks first — and only with your explicit go-ahead does it either hand the call to you (switch over, decide, switch back) or dispatch a Fable agent under supervision, whose output the orchestrator then verifies before anything lands. What it never does is spend Fable autonomously, on its own initiative.

---

## 04 · The Playbooks, By What You'd Actually Say

A skill is a written playbook the system follows for a specific job. You don't need to memorize any of these — describing what you want in plain language triggers the right one. Grouped by what you'd actually ask for:

### "Just take this and run with it, start to finish."
- **mastermind** — the end-to-end conductor: interviews you about what you actually want, then plans, builds, audits, and adversarially reviews the result, pausing at three checkpoints for your sign-off.

### "I want to plan something big."
- **plan-architect** — researches what a task touches, maps how the pieces connect, writes a plan a fresh helper could pick up cold.
- **plan-audit** — surveys the whole project for problems and turns findings into an ordered, executable plan.
- **plan-run** — takes an approved plan and runs it: breaks it into slices, builds each, checks each, reviews before calling it done.

A small task just gets built. A big or unclear one gets planned first.

### "I want a second opinion before I ship."
- **review-adversarial** — a panel of skeptical reviewers, each hunting a different problem; only reports something after checking it against real code.
- **review-pr** — reviews a pull request for genuine blockers nobody has flagged yet.
- **security-audit / performance-audit** — whole-project sweeps for security holes or speed problems, each finding backed by an exact location and fix.
- **design-critique** — checks a screen against accessibility, usability, and visual design standards.
- **verify** — drives the affected feature end-to-end in the real app. Passing tests aren't the same as working software.
- **review-ratchet** — turns a real miss into a permanent checklist item so that class of mistake can't slip through twice.

### "Something's broken and I don't know why."
- **debug-root-cause** — reproduces the bug, narrows the source, tests theories cheapest-first, fixes the real cause, proves it with a test.

### "I need something written."
- **write-pr** — commit messages and PR descriptions, written from the actual diff.
- **write-changelog** — merged history into user-facing release notes.
- **write-user-docs / write-wiki** — end-user documentation and internal explanations.
- **humanizer** — strips the telltale signs of AI-written prose.

### "Keep the project's memory honest." (mostly runs without being asked)
- **map-code** — maintains the machine-readable map of how the code connects, so agents warm-start instead of re-reading the repo.
- **session-memory** — writes the handoff each session leaves for the next.
- **lessons-loop** — captures hard-won operational lessons the moment they happen.

---

## 05 · How a Normal Session Goes

1. **You say what you want**, in plain language — "clean up this folder," "why does this keep breaking," "help me plan the new feature."
2. **Tess sizes up the job.** Small and clear → she just does it. Big, unclear, or risky → she proposes a short plan first and waits for your go-ahead.
3. **Work gets delegated**, often to several helpers at once, running in the background while you keep talking.
4. **Tess checks the work** before reporting back — she verifies against the real files; she doesn't just relay what a helper claims.
5. **You get a short, plain-language report** — what was found, what was done, the evidence, and the one decision that's genuinely yours (if any). The mandate is *act, then report* — not "what should I do next?"

**Where it always pauses on purpose:** merging a PR, cutting a release, deleting data, reversing an architectural decision, posting outside this repo, and any perceptual judgment — does this audio sound right, is this layout better. Those are staged as evidence for you, never asserted.

**Where it never pauses:** committing verified work, opening PRs, running audits, fixing docs that have drifted from reality, managing the roster. You granted those; asking permission for them again would be noise.

---

## 06 · Quick-Reference Cheat Sheet

| If you want to… | Just say… |
|---|---|
| Run something big end-to-end | "Mastermind this" / "take this start to finish" |
| Plan something big | "Plan out ___" |
| Find what needs fixing | "Audit this codebase" |
| Execute an approved plan | "Build this" / "run the plan" |
| Get a second opinion before merging | "Review this before I merge" |
| Check for security holes | "Run a security audit" |
| Fix a bug properly | "Debug this" / "root-cause it" |
| See a feature actually work | "Verify this end-to-end" |
| Get a PR description written | "Write the PR description" |
| Get release notes | "Draft the changelog" |
| Update the user docs | "Update the wiki for ___" |
| Save the session state | "Save where I left off" |
| Resume after a break | "Where were we?" / "catch me up" |

---

## 07 · Where Things Live

If you're ever curious enough to look:

```
CLAUDE.md                      # the standing orders — identity, mandate, binding rules
AGENTS.md + .agent/rules/      # the workflow router agents follow
.claude/agents/                # the five specialists' profiles (their convictions live here)
.agent/code-map/               # the machine-readable map of how the code connects
.agent/lessons/                # hard-won operational lessons, loaded every session
.agent/memory-queue/           # memory candidates queued from worktrees
.memory/HANDOFF.md             # where the last session stopped (gitignored, local only)
design-docs/specs/             # the canonical source of truth for how the system behaves
design-docs/decisions/         # the why behind architectural shapes (ADRs)
design-docs/plans/             # roadmap; REMAINING_TASKS.md is the live status
design-docs/how-this-system-works.md   # this manual
```

---

*This system is designed to get out of your way. You shouldn't need this document to use it well — it's here for the moments you're curious how the machinery works, or want to steer it more precisely than "just handle it."*
