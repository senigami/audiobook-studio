---
name: code-audit-planner
description: Audit a codebase across many dimensions (DRY/reuse, organization, logic errors, redundancy, test quality, UX/Apple-style design, responsive + light/dark theming, and drift from the spec docs) and produce a self-contained implementation-plan folder of ordered, verifiable tasks that a small agent could execute and another agent could pick up later. Use this whenever the user wants to "audit the code", "review where we are", "find what to clean up", "make it DRY / better organized", "reconcile my plans", "figure out what to work on next", "improve the UX", "audit my tests", or wants a prioritized improvement roadmap broken into verifiable chunks — even if they don't say the word "audit". It plans only; it never edits source.
---

# Code Audit & Improvement Planner

Assess where a codebase actually is, find where it can be cleaner and better organized, reconcile that against whatever plans already exist, and write an implementation-plan folder that turns every finding into an ordered, verifiable, self-contained task.

**This skill plans; it does not edit source code or tests.** The whole point is to produce durable, hand-offable work — a plan you (or a Haiku agent, or a future session) can execute later with full context. Mixing in edits makes the audit unrepeatable and the plan stale the moment it's written. If the user wants execution, point them at the plan folder and a separate execution pass (e.g. the `planrunner` skill).

## Operating principles

- **Specs are the source of truth.** If the repo has a spec set (`docs/00-index.md` + numbered specs, or similar), read it first and measure the code against it — every code-vs-spec gap is a finding. If there is no spec system, audit the code on its own terms and say so. Never invent a "correct" design that contradicts an existing spec; if a spec itself seems wrong, flag it as a spec-level discrepancy for the user rather than silently planning around it.
- **You are the brains; fan the work out.** Token efficiency is a primary goal, not an afterthought. The large model running this skill is the orchestrator: it holds the strategy, writes the direction, monitors progress, and verifies every result for accuracy — but it does as little of the raw reading and grinding as possible. Push that work down to the smallest capable agents and judge what comes back. The orchestrator's context is the expensive, scarce resource; protect it.
- **Use the most optimal model for each job, never a bigger one than the job needs.** Mechanical work (list files, grep patterns, map imports, find hardcoded colors) → **Haiku**. Bounded judgment (is this really duplication worth extracting? is this a logic bug? is this UX good?) → **Sonnet**. Cross-cutting synthesis, contract design, sequencing, and verification → the orchestrator. Matching the model to the task is how the cost stays low without losing quality. See [references/orchestration.md](references/orchestration.md).
- **Two-tier fan-out for large repos.** If the surface is too big for one batch of workers, delegate to **sub-orchestrators** (Sonnet) that each own a slice of the repo, run their own small pool of Haiku workers over it, and return a synthesized slice-level result. The top orchestrator directs the sub-orchestrators and checks their output; it does not manage individual workers directly. Keep the hierarchy shallow — one tier of sub-orchestrators is almost always enough.
- **The orchestrator verifies; it doesn't trust blindly.** A returned finding is a claim, not a fact. Spot-check claims against the real code — especially anything critical (a bug, a security gap, a contradicted spec) before it becomes a task. The large model's judgment is the quality gate; that is the reason it stays in the loop rather than just collating.
- **Run audits in parallel.** The dimension audits are independent — dispatch them in one batch and collect structured findings. Don't serialize what can fan out.
- **Findings must be real and located.** Every finding carries `path:line` evidence and a concrete reason. "Could be cleaner" is not a finding; "`formatDate` is reimplemented in 4 files (a.ts:12, b.ts:40, …) with diverging behavior" is.
- **Plan for a stranger.** The reader of a task file has none of your context and may be a small model. Each task must stand alone: why it matters, exactly which files, the target shape, step-by-step, and how to verify it's done.

## Workflow

### Step 1 — Orient (do this yourself, cheaply)

Read the spec index if present, the repo README/AGENTS.md/CLAUDE.md, the package manifest, and any existing plan/roadmap/TODO artifacts. Build a one-screen mental map: stack, entry points, where code lives, what specs exist, what plans exist and their claimed status. This is the brief you'll hand to the discovery agents — keep it tight.

### Step 2 — Fan out discovery (Haiku, parallel, read-only)

Dispatch mechanical inventory agents in parallel. Each returns a compact structured list, not prose. Typical inventory passes:

- **Repo map**: directory tree to 2–3 levels, file count and rough size per area, the layering as it actually is.
- **Plan status**: every existing plan/task/roadmap item, with the evidence in the code for whether it's done, partially done, or untouched.
- **Pattern sweep**: hardcoded colors/spacing, duplicated string/logic literals, dead exports, `any`/casts, TODO/FIXME, missing-error-handling shapes — whatever's grep-able.
- **Test inventory**: every test file, what it actually asserts, whether it hits real behavior or just mocks everything / tautologically passes.

Tell each agent its model is chosen for speed and to return only the structured findings. See [references/orchestration.md](references/orchestration.md) for ready-to-paste dispatch prompts and return schemas.

### Step 3 — Fan out dimension audits (Sonnet, parallel, judgment)

Using the discovery output as raw material, dispatch the judgment audits in parallel — one agent per dimension, scoped to only the dimensions the repo actually has. The full battery and what each one looks for is in [references/audit-dimensions.md](references/audit-dimensions.md). The core dimensions:

1. **DRY & reuse** — real duplication worth extracting into shared components/utilities; the proposed shared shape.
2. **Organization & boundaries** — misplaced files, leaky layers, modules that should split/merge, naming drift.
3. **Logic errors & redundancy** — actual bugs, dead branches, redundant work, contradictory logic.
4. **Test quality** — which tests are fake/tautological/over-mocked and should be removed or rewritten; which real scenarios are untested.
5. **Code-vs-spec drift** — where the code disagrees with the spec set (only if specs exist).
6. **UX & visual design** — Apple-style critique: clarity, hierarchy, consistency, restraint; loading/empty/error states; affordances. (UI repos only.)
7. **Responsive & theming** — breakpoint coverage, touch targets, and whether light/dark theming is token-driven and complete. (UI repos only.)

Each audit returns findings in the shared finding schema (severity, location, problem, proposed correction). Skip a dimension cleanly if it doesn't apply, and note that it was skipped and why.

### Step 4 — Reconcile and synthesize (you)

Pull all findings together and resolve the messy parts yourself — this is the high-judgment core that shouldn't be delegated:

- **Coordinate the plans.** Fold existing plans and new findings into one coherent set. Mark done items done, drop items the code already satisfies, and surface any plan that contradicts another plan, the specs, or the code. The user explicitly wants the plans to stop disagreeing with each other — make that happen.
- **De-duplicate findings.** The same root cause often shows up in several audits (e.g. duplicated logic *and* a logic bug in one of the copies). Merge them into one task addressing the root cause.
- **Decide the target shape.** For each cluster, define the contract/structure things should converge on — the interface, the shared component, the folder layout, the token set. This is what makes the plan executable rather than aspirational.
- **Surface genuine forks.** If a structural decision is a real judgment call with no clear winner (and the specs don't settle it), ask the user with a crisp either/or rather than guessing. Otherwise make the call and record it.

### Step 5 — Write the plan folder

Default location: `docs/plans/` (alongside the specs, which remain authoritative). If the repo already has a plans directory, extend it rather than starting a parallel one. Read [references/plan-folder.md](references/plan-folder.md) for the exact file formats; the structure is:

```
docs/plans/
├── README.md            # what this folder is, how status is tracked, how to pick up a task
├── 00-audit-report.md   # current state, what's healthy, findings by dimension, plan reconciliation
├── 01-roadmap.md        # ordered workloads, dependency graph, verifiable milestones
└── tasks/
    └── NNN-slug.md      # one self-contained, Haiku-followable task per unit of work
```

Each task file is the load-bearing artifact: goal, why-it-matters, exact files, the target contract/shape, ordered steps, explicit acceptance criteria a reviewer can check, dependencies (blocked-by / blocks), and out-of-scope. Written so a small model can execute it and a future agent can pick it up without this conversation.

### Step 6 — Sequence into verifiable workloads

In `01-roadmap.md`, order the tasks into a recommended sequence and group them into **workloads** — batches small enough to implement and verify as a unit, ordered so each builds on verified ground. Lead with foundation/contract tasks that unblock others (shared utilities, token system, layering fixes) before dependent cleanup. For each workload state its goal, the tasks in it, why it comes when it does, and the single check that proves it landed. Note dependencies explicitly so work can be parallelized safely.

### Step 7 — Self-review before handoff

Re-read the plan as the stranger who'll execute it: could a Haiku agent open one task file and do it correctly with nothing else? Verify every finding has real `path:line` evidence, every task has a verifiable acceptance criterion, the sequence has no forward dependencies, and no two tasks contradict each other. Then give the user a short summary: health assessment, top findings by severity, the recommended first workload, and any forks you left for them.

## Token discipline

Cost efficiency is a primary goal of this skill, so treat the orchestrator's context as the scarce resource it is:

- **Delegate the reading.** Don't open whole files you could have a Haiku agent inventory and summarize. Don't re-read what a subagent already reported — read back into a file only when designing its target contract or verifying a high-severity claim.
- **Demand structured returns.** Workers return the finding schema, not prose essays, so synthesis is cheap and you can scan many results fast.
- **Right-size every agent.** Haiku for mechanical, Sonnet for bounded judgment or as a sub-orchestrator, the orchestrator only for cross-cutting synthesis and verification. Spending a large model on grunt work, or a small model on a call that needs taste, both cost more than they should — one in tokens, the other in rework.
- **Scale the hierarchy to the repo.** A small project needs one batch of workers. A large one needs sub-orchestrators so no single agent (including you) ever holds the whole codebase at once.
- **Show the work.** In the audit report, note how the work was divided across models so the user can see where tokens went and trust that the cheap path didn't cost accuracy — which is exactly why the orchestrator verified the load-bearing findings itself.
