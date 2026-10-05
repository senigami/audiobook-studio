# Task 000 — Reconcile schema overlap with chapter_editor_catalog_completion (task 005)

Status: done (2026-07-16, W-PERF safe-foundation PR)

Risk: quality-sensitive (cross-plan schema decision)

## What this was

A decision/reconciliation task (not a build task): pick one shared schema shape for "per-segment
performance/rendering metadata" so this plan's task 001 and the sibling `chapter_editor_catalog_completion`
plan's task 005 didn't each add a divergent JSON column for the same concept (`01-map.md`'s R-A).

## Ratified decision (RATIFIED by the owner, 2026-07-10 — durable, still binding on downstream tasks)

- **One shared `performance_data` column** (not two) on `chapter_segments` — this plan's canonical
  shape (`emotion.{primary,intensity}`, `delivery.{volume,pace,pitch}`, `acting_note`) is a strict
  superset of the sibling plan's flat `{rate, pitch, volume, style_prompt}`; a manually-authored cue
  writes only the `delivery` sub-object.
- **Provenance via row-level flags** (`ai_suggested`, `locked`, `needs_review`, `review_reasons`),
  not a JSON-internal discriminator. Cue Editor write → `ai_suggested=0, locked=1`. AI-pipeline write
  → `ai_suggested=1, locked=0, needs_review=1`.
- **`render` (INTEGER NOT NULL DEFAULT 1)** stays the sibling plan's column, unchanged, no overlap.
- Confirmed shipped: `app/db/core.py` has `performance_data`/`speaker_confidence`/`speaker_basis`/
  `speaker_evidence`/`needs_review`/`review_reasons`/`locked`/`ai_suggested` on `chapter_segments`.

## Map links

`01-map.md`'s R-A (RESOLVED note there points back to this task) and Connections. `02-roadmap.md`'s
Workload 0 / M0.

## Dependencies / Out of scope

None — first task in the plan. Did not touch migration code (task 001), the plugin-contract flag
(task 004), or any frontend UI (task 012 / sibling task 008).
