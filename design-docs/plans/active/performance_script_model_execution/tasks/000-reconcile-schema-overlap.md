# Task 000 — Reconcile schema overlap with chapter_editor_catalog_completion (task 005)

Status: pending

Risk: quality-sensitive (this is a decision/reconciliation task, not a build task — get the shape
wrong here and two independently-executed plans silently diverge into two overlapping JSON blobs on
the same table, which is exactly the outcome R-A exists to prevent)

## Goal

Decide, and write down, **one reconciled schema shape** for "per-segment performance/rendering
metadata" on `chapter_segments`, so that whichever of these two plans executes its schema task first
(this plan's task 001, or the sibling `chapter_editor_catalog_completion` plan's task 005) builds the
column(s) both plans actually need, and the other plan's schema task becomes a **no-op / pointer
update** instead of a second, divergent migration.

This task produces a decision document and updates to both plans' task files (this plan's 001, and —
if the sibling plan's task 005 hasn't executed yet — a note in that plan flagging the reconciled
shape). **It does not write migration code, encode/decode helpers, or touch `app/db/core.py`** — that
is task 001 (this plan) or task 005 (sibling plan), whichever runs first, executing the shape this
task decides on.

## Why this matters

Both plans propose additive JSON columns on `chapter_segments` describing "how this segment should be
rendered/performed," developed independently and never cross-checked against each other:

- **This plan** (`proposals/performance_script_model/03-db-schema-changes.md`) proposes
  `performance_data` (JSON, nullable) — **AI-extracted** performance metadata. Per the canonical
  format spec (`proposals/performance_script_model/01-canonical-json-format.md` §3, §5.2 example at
  lines 51-63, and the richer example at lines ~290-308), the shape is a `performance` object with
  `emotion: {primary, intensity}`, `delivery: {volume, pace, pitch}`, and `acting_note`, produced by a
  multi-pass LLM pipeline with provenance/confidence attached at the row level (`ai_suggested`,
  `needs_review`, `review_reasons`, `locked` — doc 03 lines 49-56).
- **The sibling plan's task 005**
  (`chapter_editor_catalog_completion/tasks/005-stage-direction-data-model.md`) proposes
  `engine_directives` (JSON, nullable, target shape at lines 56-63 of that task file) —
  **manually-authored** via a Cue Editor UI (that plan's task 008), a flat
  `{rate?, pitch?, volume?, style_prompt?}` object, alongside a `render INTEGER NOT NULL DEFAULT 1`
  column (an orthogonal "exclude this segment from TTS" flag used for Stage Direction, which **has no
  analog in this plan and does not need reconciling**).

Both columns describe the same underlying concept — per-segment rendering/performance directives —
with two different names, two different shapes, and two different provenance models, developed for
two different authors (AI pipeline vs. human Cue Editor). If both plans' schema tasks execute
independently without reading each other, the DB ends up with **both** `performance_data` and
`engine_directives` on `chapter_segments`, and every downstream consumer (this plan's rendering-mode
translation layer, part B; the sibling plan's render pipeline, task 006; the shared review-state UI,
part E / that plan's task 008) has to guess which column is authoritative, or duplicate logic to
merge both. This is the single most important cross-plan coordination point in this whole two-plan
effort (`01-map.md`'s R-A, `02-roadmap.md`'s Workload 0 gate).

## Exact files to compare

- **This plan's proposal**: `design-docs/plans/proposals/performance_script_model/03-db-schema-changes.md`
  (`chapter_segments` target-state table, lines 40-60) and
  `design-docs/plans/proposals/performance_script_model/01-canonical-json-format.md` (the
  `performance` object shape — read §3-§5 in full, not just the table in doc 03, since doc 03 only
  says "JSON — see §01" and doesn't repeat the shape).
- **Sibling plan's task**:
  `design-docs/plans/active/chapter_editor_catalog_completion/tasks/005-stage-direction-data-model.md`
  in full — target shape (lines 46-151), especially the `EngineDirectives` TS interface (lines
  116-121) and the encode/decode helper pattern (lines 56-76), since that task is already
  fully-specified down to file/line and may execute before this plan's task 001 does.
- **Current actual DB state** (verified 2026-07-10 by reading `app/db/core.py` directly): neither
  column exists yet. `chapter_segments`' current columns (CREATE TABLE block, `core.py:232-246`) are
  `id, chapter_id, segment_order, text_content, sanitized_text, character_id, speaker_profile_name,
  audio_file_path, audio_status, audio_generated_at`. The `add_column_if_missing` migration list
  (`core.py:279-289`) has not yet added either `performance_data`/`engine_directives` or `render`. Both
  plans' schema tasks are starting from the same clean baseline — whichever runs first is not
  "fixing" or "migrating away from" anything the other already shipped; this is a pure design-time
  reconciliation, not a data-migration problem.

## Steps

1. Read both schema proposals side by side (files listed above) and tabulate every field either
   proposes for "segment performance/rendering metadata": name, type, nullability, who writes it
   (human vs. AI), and whether it has a direct counterpart in the other proposal.
2. Confirm the `render` column (sibling plan only) has no counterpart in this plan and needs no
   reconciliation — it answers a different question ("is this segment synthesized at all," for Stage
   Direction) than `performance_data`/`engine_directives` ("how should a synthesized segment sound").
   Carry `render` forward unchanged into whichever plan's schema task lands first.
3. Decide the reconciled shape for the performance/rendering JSON column using the recommendation
   below as the starting position — accept it, or write down a specific reason to deviate.
4. Write the decision into this file's "Decision" section (below) as the durable record — this task
   file itself is the reconciliation artifact once the decision is filled in.
5. Update this plan's task 001 (`001-additive-schema-migration.md`) so its column list matches the
   decision exactly (that task is written to assume the recommendation below; revise it if the
   decision differs).
6. Flag the decision to whoever next touches the sibling plan's task 005 — since these are two
   separate plan folders that may be picked up by different executors at different times, task 005's
   own file cannot be assumed to have been updated by this task. At minimum, leave a pointer comment
   in this file's Decision section stating whether task 005 has already executed (columns already
   exist in the live DB — check `app/db/core.py` before starting task 001) or is still pending (task
   001 should be the one to add the shared column(s), and task 005 should be revised to consume them
   rather than adding its own).

## Decision (fill in before starting task 001 — do not leave this section a template)

**Recommendation (starting position, not yet an owner-ratified decision):**

- **One shared column**, not two: add `performance_data` (JSON, nullable) to `chapter_segments` — use
  this plan's name, since this plan's canonical-format spec (doc 01) already defines a richer shape
  (`emotion.{primary,intensity}`, `delivery.{volume,pace,pitch}`, `acting_note`) that is a strict
  superset of the sibling plan's flat `{rate, pitch, volume, style_prompt}`. A manually-authored
  Performance Cue (sibling plan's Cue Editor, that plan's task 008) writes a `performance_data` value
  using only the `delivery` sub-object (`{delivery: {pace, pitch, volume}, acting_note}` — `pace` maps
  1:1 to the sibling's `rate`, `acting_note` maps 1:1 to `style_prompt`); the AI pipeline (this plan's
  part C) can additionally populate `emotion` on the same shape. No consumer needs to read two
  columns and decide which wins.
- **Provenance via this plan's existing row-level flags, not a JSON discriminator field.** This plan
  already proposes `ai_suggested` (INTEGER, boolean), `locked` (INTEGER, boolean), `needs_review`
  (INTEGER, boolean), `review_reasons` (JSON) on `chapter_segments` (doc 03, target-state table). Use
  these directly: a Cue Editor write sets `ai_suggested = 0, locked = 1` (a human typed it, it's
  authoritative, the AI pipeline must never overwrite it — this is already INV-3's rule, "AI
  suggestions are never silently auto-applied," applied in the other direction: human edits are never
  silently overwritten either). An AI-pipeline write sets `ai_suggested = 1, locked = 0,
  needs_review = 1` until a human confirms. This means the sibling plan does **not** need a separate
  `source: "manual"|"ai_suggested"` field inside the JSON blob itself — the existing top-level columns
  already carry that distinction, and duplicating it inside the JSON would create a second place the
  two states could disagree.
- **Keep `render` (INTEGER NOT NULL DEFAULT 1) exactly as the sibling plan's task 005 specifies** — no
  overlap, no rename, carry it forward as-is regardless of which plan's schema task executes first.
- **Naming consequence for the sibling plan**: if `chapter_editor_catalog_completion`'s task 005
  executes first, it should add `render` + `performance_data` (not `engine_directives`) to match this
  decision, and its `EngineDirectives` TypeScript interface (task 005 lines 116-121) should be renamed
  to match the canonical `performance` shape (or kept as a narrower type alias over the same field,
  documented as such) rather than shipping as a separate `engine_directives` column. If this plan's
  task 001 executes first, task 005 should be revised to skip its own `ADD COLUMN engine_directives`
  step entirely and just consume the already-existing `performance_data`/`render` columns.

**Why not two separate columns:** the two proposals don't actually need different *fields* — the
AI-extracted shape is a superset, not a divergent structure. Two columns would only be justified if
the AI pipeline needed fields (e.g. `confidence`, `evidence`) that must live *inside* the
per-annotation JSON itself and would never apply to a manual cue. That's not the case here: this
plan's confidence/evidence tracking (`speaker_confidence`, `speaker_basis`, `speaker_evidence`) is
about **speaker/character attribution**, not about the performance-directive JSON, and stays as its
own separate set of columns regardless of this decision (no overlap with the sibling plan, which
doesn't touch speaker attribution at all).

**This recommendation is not self-executing.** It is written by this session's research, not ratified
by the owner or by whichever executor actually picks up task 001 or task 005 first. Before starting
either schema task, the executor must either (a) confirm this recommendation still holds by re-reading
both proposals (they may have changed since this was written), or (b) get an explicit owner call if
they want to deviate — do not silently implement a different shape than what's written here without
updating this section first.

## Acceptance criteria

- [ ] The "Decision" section above is filled in with an actual accepted shape (the recommendation
      above, or a documented deviation) — not left as an open question.
- [ ] This plan's `001-additive-schema-migration.md` column list for `chapter_segments` matches the
      decision exactly (verify by re-reading task 001 after this task is done).
- [ ] Before task 001 or the sibling plan's task 005 begins implementation, the executor has checked
      `app/db/core.py`'s live DDL to confirm neither plan's columns have already landed via the other
      plan (avoiding a redundant or conflicting second migration).
- [ ] No new column names are introduced by this task itself — it only decides which of the two
      already-proposed shapes (or a merge of them) is authoritative.
- [ ] The decision is written down in a location both plans' future executors can find: this file, and
      (if practical at the time this task executes) a short pointer added to the sibling plan's task
      005 file noting the reconciled column name and provenance model, so that plan doesn't have to
      rediscover this file to know what changed.

## Map links

`01-map.md`'s R-A (the risk this task exists to close) and Connections section ("E ↔
chapter_editor_catalog_completion's Cue Editor... this is the single most important cross-plan
coordination point"). `02-roadmap.md`'s Workload 0 / M0 milestone.

## Dependencies

None — this is the first task in the plan (Workload 0), gating task 001.

## Out of scope

- Writing the actual `ALTER TABLE` migration (task 001, or the sibling plan's task 005 — whichever
  executes the decision this task makes).
- Deciding whether to schedule the AI-extraction pipeline at all (`00-overview.md`'s Schedule
  decision — a separate, larger owner call this task does not touch).
- Reconciling F (the plugin-manifest SSML-capability flag shared with the sibling plan's task 006) —
  that is `01-map.md`'s separate shared-plumbing item, tracked under this plan's task 004, not this
  task.
- Any frontend UI work (review-state visual treatment, Cue Editor) — those are this plan's task 012
  and the sibling plan's task 008, both downstream of the schema shape this task fixes.
