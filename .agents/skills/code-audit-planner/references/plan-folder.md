# Plan folder format

The output. Default home is `docs/plans/` so it sits beside the specs (which stay authoritative). If a plans directory already exists, extend it. Everything here is plain Markdown.

The guiding constraint for every file: **a stranger executes this.** The reader may be a small model (Haiku) with no memory of the audit and none of the codebase loaded. If a task can't be done correctly by opening one file and reading it, the file is underspecified. Over-link to specs and source paths; never rely on "as we discussed."

```
docs/plans/
├── README.md            # what this is, status protocol, how to pick up a task
├── 00-audit-report.md   # findings + plan reconciliation (the "where we are")
├── 01-roadmap.md        # ordered workloads + dependency graph (the "what next")
└── tasks/
    └── NNN-slug.md      # one self-contained task each (the "how")
```

## README.md

Short. State: this folder is the live improvement plan; specs in `docs/` remain the source of truth; tasks are executed one at a time and their **Status** field is updated as work lands; how an agent should pick up work (read `01-roadmap.md`, take the next unblocked task in the current workload, read that task file in full, execute, update status). Include a one-line status legend: `not-started | in-progress | blocked | done`.

## 00-audit-report.md

The honest assessment. Sections:

```markdown
# Audit Report — <date>

> **TL;DR:** Overall health in one or two sentences, and the single highest-leverage thing to do first.

## Scope
What was audited, which dimensions ran, which were skipped and why. How the work was divided across agents (so the cost is visible).

## What's healthy
Genuinely. Don't manufacture problems — call out what's working so the reader trusts the rest and doesn't "fix" good code.

## Findings by dimension
For each dimension, its findings as a table: ID · severity · location(s) · problem · proposed correction · → task. Critical/major first.

## Plan reconciliation
Existing plans mapped to reality: what's actually done (with code evidence), what's stale and dropped, what's still pending and folded into the new tasks, and any plans that contradicted each other or the specs — and how that contradiction is resolved here.

## Open decisions for the owner
Genuine forks you didn't resolve, each as a crisp either/or with your recommendation. Empty if none.
```

## 01-roadmap.md

```markdown
# Roadmap

> **TL;DR:** N workloads, ordered so each builds on verified ground. Start with <workload 1>.

## Sequencing rationale
Why this order — foundation/contract work (shared utilities, token system, layering) before the cleanup that depends on it; critical correctness/security before polish.

## Dependency graph
Which tasks block which. A simple list or Mermaid graph — enough to parallelize safely.

## Workloads
### Workload 1 — <name>
- **Goal:** what this batch achieves
- **Tasks:** NNN, NNN, NNN
- **Why now:** what it unblocks / why it's first
- **Verify the workload:** the single check that proves the batch landed (build passes + specific behavior observable + tests green)
```

A **workload** is a batch small enough to implement and verify as a unit — roughly a sitting's worth, not a month. Each task belongs to exactly one workload.

## tasks/NNN-slug.md — the load-bearing file

Number tasks `001`, `002`, … in suggested execution order (order can be refined by the roadmap's dependency graph; the number is just a stable id). Use this exact template:

```markdown
# NNN — <imperative title>

- **Status:** not-started
- **Workload:** <name from roadmap>
- **Severity / type:** major · dry
- **Effort:** M
- **Blocked by:** 003 (or "nothing")
- **Blocks:** 011, 012 (or "nothing")

## Goal
One sentence: what is true after this task that wasn't before.

## Why this matters
The reason, concretely — the bug it prevents, the duplication it removes, the spec it aligns to. Two or three sentences so an executor understands intent and makes good micro-decisions, and a reviewer knows what "done well" means.

## Context an executor needs
Everything required to do this without prior knowledge: relevant spec links (`docs/NN-*.md#section`), the current state with `path:line` evidence, and any convention that applies. Assume the reader has not seen the rest of this plan.

## Target shape / contract
What the code should look like after — the interface signature, the shared component's props, the folder layout, the token names. Be concrete; this is what turns the task from "clean this up" into something checkable. Include a small before→after sketch when it clarifies.

## Steps
1. Ordered, concrete steps. Small enough that a Haiku agent can follow each without inventing approach.
2. Name the files to touch and what to do in each.
3. Note where to add/adjust tests for this change.

## Acceptance criteria
- [ ] Verifiable checks a reviewer (or the executor) confirms. Behavioral and concrete: "X renders correctly in dark mode at 360px", "no file still imports the old helper", "build + typecheck + the new test pass".
- [ ] Tests for the new/changed behavior exist and pass.

## Out of scope
What NOT to touch while here — prevents scope creep and keeps the task verifiable. Point to the follow-up task if the temptation belongs elsewhere.
```

### Why the template is shaped this way

- **Status / blocked-by / blocks** let any agent resume the plan cold: read the roadmap, find the next task whose blockers are `done`, go.
- **Why this matters + Target shape** are what separate a Haiku-followable task from a vague chore. Without intent and a concrete target, a small model guesses; with them, it executes.
- **Acceptance criteria as checkboxes** make "done" objective and give the executor a built-in self-review — and give you a verification gate at the workload level.
- **Out of scope** is what keeps a cleanup task from sprawling into the whole module — essential when the executor is autonomous.

## Keeping it coordinated

When extending an existing plan folder, don't leave two task files describing the same work. Merge or supersede, update the roadmap, and make sure the dependency graph still has no cycles or forward references. The user's recurring pain is plans that drift out of sync with each other and with the code — the audit's job is to leave exactly one coherent plan behind.
