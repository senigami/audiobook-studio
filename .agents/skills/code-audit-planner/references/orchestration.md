# Orchestration & agent dispatch

The orchestrator is the brains: it sets strategy, writes direction, monitors, and **verifies** — while pushing the raw reading and grinding down to the smallest capable agents. The goal is maximum accuracy per token: the large model's context is the scarce resource, so spend it on judgment and checking, not on grunt reading. This file has the model-selection rule, the two-tier fan-out pattern, ready-to-paste dispatch prompts, and the structured return schemas that keep synthesis cheap.

## The chain of command

```
Orchestrator (large model — the brains)
  ├─ sets strategy, writes the direction each agent gets
  ├─ verifies returned findings against real code (esp. critical/major)
  └─ fans out to:
       ├─ Workers (Haiku/Sonnet)          ← small repos: direct
       └─ Sub-orchestrators (Sonnet)       ← large repos: each owns a slice,
            └─ run their own Haiku workers     runs its own workers, returns a
                                               synthesized slice result
```

The orchestrator directs and checks; it does not do the bulk reading itself. On a large codebase it directs **sub-orchestrators** rather than micromanaging individual workers, so no single agent ever has to hold the whole repo. Keep it shallow — one tier of sub-orchestrators is almost always enough; deeper nesting costs coordination tokens without adding accuracy.

## Model selection

| Work | Model | Why |
|------|-------|-----|
| Inventory, grep sweeps, file maps, "list every X" | **Haiku** | Mechanical, high-volume, no judgment. Fast and cheap. |
| Dimension audits, "is this worth fixing?", bug hunting, UX critique, target-shape proposals | **Sonnet** | Needs judgment and design sense, but bounded scope. |
| Owning a repo slice: running workers over it and synthesizing their output | **Sonnet** (sub-orchestrator) | Coordination + judgment over a bounded area; keeps the top orchestrator's context free. |
| Reconciliation, contract design, sequencing, fork decisions, **verifying findings**, writing the plan | **orchestrator** (the large model running this skill) | Cross-cutting judgment and the accuracy gate — needs the whole picture. |

Rule of thumb: if the task can be answered by reading and pattern-matching, send it to Haiku. If it needs taste or a correctness call over a bounded area, send it to Sonnet. If it needs *all* the findings at once, or it's the final accuracy check, keep it yourself. Never send a job up a tier — using the orchestrator for grep, or a sub-orchestrator for a one-file lookup, wastes the expensive context you're trying to protect.

## Verification is the orchestrator's job

A finding from a worker is a *claim*. The reason the large model stays in the loop is to judge those claims, not just collate them. Before any **critical or major** finding becomes a task, the orchestrator spot-checks it against the real code (open the cited `path:line`, confirm the problem is real and the proposed correction is sound). Minor findings can be trusted in bulk and sampled. This is what lets the cheap discovery path stay cheap without the plan inheriting a worker's mistake.

## Dispatch discipline

- **Narrow the scope.** Give each agent a specific area or dimension, not "audit the repo." Overlap wastes tokens and produces duplicate findings.
- **Demand structure.** Always require the agent to return the schema below — no prose essays. You synthesize from structured data, not paragraphs.
- **Read-only.** Discovery and audit agents must not edit anything. Say so.
- **Parallelize.** Dispatch all discovery agents in one batch; then all dimension audits in one batch. Don't serialize independent work.
- **Don't re-read.** Once an agent reports a finding with `path:line`, trust it. Only re-open a file yourself when you're designing the target contract for it.

## Discovery dispatch prompts (Haiku)

**Repo map:**
> Read-only. Map the repository at `<root>`. Return JSON: `{ "tree": [{"path","kind","approx_lines","role"}], "layers": ["how code is actually layered"], "entry_points": [...] }`. Go 2–3 directory levels deep. Do not read full file bodies — use names, sizes, and a glance. Return only the JSON.

**Plan status:**
> Read-only. Find every plan/roadmap/TODO/task artifact under `<root>` (check `docs/`, `docs/plans/`, README, `*.md`, code TODOs). For each planned item, look for evidence in the code that it's implemented. Return JSON array: `[{"item","source_file","claimed_status","code_evidence","actual_status":"done|partial|not-started|contradicted"}]`. Return only the JSON.

**Pattern sweep:**
> Read-only. Grep `<root>` for: hardcoded colors/hex/rgb, hardcoded spacing/pixel values, duplicated literal strings, `any`/unsafe casts, dead/unused exports, TODO/FIXME, empty catch blocks. Return JSON keyed by category, each a list of `{path,line,snippet}`. Cap at 30 per category and note if truncated. Return only the JSON.

**Test inventory:**
> Read-only. List every test file under `<root>`. For each, summarize what it actually asserts and classify: `real` (exercises behavior), `mock-only` (asserts on mocks/stubs, not real logic), `tautological` (always passes / asserts trivial truths), `smoke` (renders/boots, asserts little). Return JSON: `[{path,test_count,classification,what_it_covers,gap_notes}]`. Return only the JSON.

## Dimension-audit dispatch prompts (Sonnet)

Give each a copy of your Step-1 brief plus the relevant discovery output, then the dimension's mandate from [audit-dimensions.md](audit-dimensions.md). Require the **finding schema** below. Example for DRY:

> Read-only. Here is the repo brief and the pattern-sweep output: `<paste>`. Audit for genuine duplication worth extracting — logic or components reimplemented with diverging behavior, copy-pasted blocks, parallel utilities that should be one. Ignore trivial/coincidental similarity. For each, propose the shared shape it should collapse into. Return an array of findings in this schema: `<paste finding schema>`. Return only the JSON.

## Sub-orchestrator dispatch prompt (Sonnet — large repos only)

Use when a slice of the repo is too big to hand to one worker batch from the top. Each sub-orchestrator owns a bounded area and reports a synthesized result, so the top orchestrator reads one summary per slice instead of dozens of raw worker returns.

> You are a sub-orchestrator for `<area, e.g. packages/ui>`. Read-only — neither you nor your workers may edit anything. Run your own small pool of Haiku workers to inventory this area (file map, pattern sweep, test inventory scoped to `<area>`), then apply these audit dimensions yourself: `<list>`. Be token-efficient: have the Haiku workers do the reading; you do the judgment. Verify your own critical/major findings against the code before reporting. Return a single JSON object: `{ "area": "<area>", "summary": "2-3 sentences on health of this slice", "findings": [<finding schema>], "skipped_dimensions": [{ "dimension", "reason" }] }`. Return only the JSON.

The top orchestrator still re-verifies the load-bearing (critical/major) findings a sub-orchestrator reports — delegation of coordination doesn't delegate the final accuracy gate.

## Finding schema (every audit returns this)

```json
{
  "dimension": "dry | organization | logic | tests | spec-drift | ux | theming-responsive",
  "findings": [
    {
      "id": "short-stable-slug",
      "severity": "critical | major | minor",
      "title": "one line",
      "locations": ["path:line", "path:line"],
      "problem": "what's wrong and why it matters, concretely",
      "proposed_correction": "the target shape / fix approach (not the diff)",
      "spec_ref": "docs/NN-*.md#section or null",
      "effort": "S | M | L"
    }
  ],
  "skipped": false,
  "skip_reason": null
}
```

Severity tiers: **critical** = bug, data loss, security, broken contract; **major** = real maintainability/correctness/UX problem that will bite; **minor** = style/polish. Effort is a rough size for sequencing, not an estimate.
