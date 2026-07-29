# Decision index — GENERATED, do not hand-edit

Regenerate with `tools/build-index.sh`. **Grep this file by scope before adding a rule** to any
auto-loaded spec, and open only the records that match. The Ruling column is each entry's TITLE:
the operative wording is the `Decision:` field inside the file, and only that is authoritative.

`OD-NNNN` is deliberately a different series from any product `ADR-NNNN`. Never cite one as
the other.

| OD | Status | Scope | Ruling (title) | Disconf. | Undo |
|---|---|---|---|---|---|
| [OD-0001](0001-orchestrator-is-a-persistent-role.md) | accepted | CLAUDE.md orchestrator identity & mandate | The orchestrating session is a persistent named role, not a session | yes | — |
| [OD-0002](0002-director-mandate-and-definition-of-done.md) | accepted | CLAUDE.md orchestrator identity & mandate; .claude/agents/_shared/crew-doctrine.md | The director mandate — do-then-report vs ask-first, and Ada's definition of done | yes | — |
| [OD-0003](0003-partnership-binds-every-seat.md) | accepted | CLAUDE.md Partnership clause; .claude/agents/_shared/crew-doctrine.md; every seat profile's Partnership section | The partnership disposition binds every seat, not only the orchestrator | yes | — |
| [OD-0004](0004-bias-neutral-naming-discipline.md) | accepted | CLAUDE.md roster paragraph; all seat profile frontmatter and headers; roster.json; roster.html | Bias-neutral naming discipline; all eight seats re-named | yes | — |
| [OD-0005](0005-inherit-default-reasoning-pair-exception.md) | accepted | roster.json seat entries; .claude/agents/esther-reasoning-elder.md; .claude/agents/tamsin-reasoning-younger.md; every other profile's frontmatter comment | Quality seats ride model:inherit; the reasoning pair is pinned to opus as a deliberate exception | yes | — |
| [OD-0006](0006-no-invented-reasoning-effort-key.md) | accepted | roster.json conventions.reasoning_effort; seat profile frontmatter | No reasoning-effort key is invented for a profile | yes | — |
| [OD-0007](0007-roster-json-owns-tabular-facts.md) | accepted | roster.json; CLAUDE.md orchestrator section; every seat profile's "Team Boundaries" section | Tabular roster facts live in roster.json; no seat count in prose | yes | — |
| [OD-0008](0008-shared-crew-doctrine-single-source.md) | accepted | .claude/agents/_shared/crew-doctrine.md; .claude/agents/_shared/reasoning-pair-contract.md; every seat profile's "Crew doctrine" section | Shared crew doctrine is written once; each profile inlines a compact pointer block | yes | — |
| [OD-0009](0009-shared-pointer-must-resolve-from-every-dispatching-repo.md) | accepted | .claude/agents/_shared/; any profile or shared-doctrine pointer crossing repo boundaries (e.g. the awaken-orchestrator primer's shared files) | A pointer into a shared file must resolve from every repo that dispatches the seat | yes | — |
| [OD-0010](0010-no-time-triggered-content-in-mandate-or-profile.md) | accepted | CLAUDE.md orchestrator section; every seat profile | Nothing time-triggered goes in the mandate or a profile; session state goes in the handoff | yes | — |
| [OD-0011](0011-do-the-work-yourself.md) | accepted | .claude/agents/_shared/crew-doctrine.md "Do the work yourself" section; all dispatch briefs | Do the work yourself — no re-delegation, and findings must exist on disk before a report is believed | yes | — |
| [OD-0012](0012-shipped-claims-are-claims-to-check.md) | accepted | .claude/agents/astrid-archivist.md; design-docs/plans/ retirement lifecycle; wiki changelog | A "shipped"/"complete" claim in a summary doc is a claim to check, never a fact | yes | — |
| [OD-0013](0013-user-docs-must-match-real-shipped-status.md) | accepted | .claude/agents/cecilia-user-docs-writer.md; wiki/*.md; docs/handbook/; docs/user-guide/ | A shipped feature with no user-facing documentation is a finding; a placeholder described as live is the same failure in the other direction | yes | — |
| [OD-0014](0014-green-suite-is-not-a-working-happy-path.md) | accepted | .claude/agents/amina-runtime-verifier.md; end-to-end behavioral verification of any shipped/verified/done claim | A green check suite is not a working happy path; verification is driven against the real artifact | yes | — |
| [OD-0015](0015-no-sed-sweeps-over-identifiers.md) | accepted | .claude/agents/_shared/crew-doctrine.md "No sed sweeps over identifiers" section; any redesign or find-and-replace across identifiers | A mechanical sweep is re-read wherever it compares two changed things | yes | — |
| [OD-0016](0016-review-skill-is-a-floor-never-the-scope.md) | accepted | CLAUDE.md "Review doctrine" paragraph; every review of a change in this repo | A review skill is a floor, never the scope: every review names the governing sources it consulted and the ones it did not | yes | — |
| [OD-0017](0017-orchestration-layer-edited-only-from-rooted-session.md) | accepted | CLAUDE.md orchestrator section; .claude/agents/ profiles; .claude/decisions/; roster.json; roster.html | This repo's orchestration layer is edited only from a session rooted in this repo | yes | — |
| [OD-0018](0018-worktrees-are-not-the-default-and-are-removed-on-merge.md) | accepted | `CLAUDE.md` (Orchestrator identity & mandate); `.agent/rules/memory-queue.md`; agent dispatch decisions | Worktrees are not the default workflow, and a worktree is removed when its PR merges | yes | — |
| [OD-0019](0019-a-functional-affordance-survives-a-redesign-only-if-defended.md) | accepted | `.claude/agents/junia-designer.md` (designer convictions); any redesign, visual migration, or screen-parity work | A functional affordance survives a redesign only if it is defended explicitly | yes | — |
