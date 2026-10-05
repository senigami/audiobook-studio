# Performance Script Model — Execution Plan

**What this is:** an execution plan for W-PERF (per-span performance metadata / rich character
profiles / casting export), built from the existing proposal docs at
`design-docs/plans/proposals/performance_script_model/`. That proposal was marked "not scheduled"
in `TASKS.md`, gated on a "Design decision: schedule it?" that itself claimed W-PERF "shares the
span/DB model with sub-sentence assignment (012) — the two must ship together or the DB migrates
twice."

**Key finding (2026-07-10 research, read `00-overview.md`'s "Schedule decision" section before
anything else):** that coupling claim is false as of today. Sub-sentence assignment shipped with
**zero schema migration** — it achieves sub-sentence spans by splitting `text_content` strings and
shifting `segment_order`, never the `span_start`/`span_end` byte-offset columns the W-PERF proposal
assumed would need to exist first. W-PERF's own proposed schema is a set of independent, additive,
nullable columns. **The scheduling decision can be made now, on its own merits, not blocked on a
migration-ordering concern that never materialized.** This plan surfaces that finding and asks the
owner to decide GO/NO-GO on genuine merits (cost, priority, AI-pipeline reliability risk) — see
`00-overview.md`.

**This plan does NOT execute anything.** Produced by `/plan-architect` in research-only mode. Run
`/plan-run` pointed at this folder to execute it — but only after the schedule decision below is
answered.

## Where this fits

Source proposal docs (kept as-is, this plan's tasks cite them rather than duplicating):
[`design-docs/plans/proposals/performance_script_model/`](../../proposals/performance_script_model/)
(README, 00-overview, 01-canonical-json-format, 02-character-profiles-and-extraction-spec,
03-db-schema-changes, 04-export-targets, 05-ai-extraction-agent-prompt). Companion research:
[`research_character_brief_extraction_and_persona_casting.md`](../../proposals/research_character_brief_extraction_and_persona_casting.md).

## How to read this folder

| File | Purpose |
|---|---|
| `00-overview.md` | The task, scope, **the schedule decision** (read first), success criteria |
| `01-map.md` | Parts, connections, invariants, risks — the corrected DB-schema picture |
| `02-roadmap.md` | Ordered workloads + dependency graph, sized realistically (this is large, multi-milestone work) |
| `tasks/NNN-slug.md` | One self-contained, map-linked task per unit of work |

## Status protocol

Whoever executes a task updates its `Status:` line and ticks its checkboxes in the same change as
the work. When every task is complete, move this folder to
`design-docs/plans/_archive/performance_script_model_execution/`, and either archive or clearly
mark the original `proposals/performance_script_model/` docs as superseded-by-implementation (do not
delete them — they remain the design record).
