# Task 002 — Canonical `performance_data` JSON schema + validation

Status: pending

Risk: multi-file — this schema is a shared contract consumed by both the AI extraction pipeline
(this plan's tasks 005-009) and the manual Cue Editor (`chapter_editor_catalog_completion` plan's
task 008, per `01-map.md`'s R-A). Getting the shape wrong here means fixing it in at least two
other plans' code later.

## Goal

Define the actual typed schema (Pydantic on the backend, a mirrored TypeScript type on the
frontend) for the JSON blob that lives in the `chapter_segments.performance_data` column, matching
`proposals/performance_script_model/01-canonical-json-format.md` exactly — plus a single
`validate_performance_data()` function every writer (AI pipeline output-parsing, manual Cue Editor
API handler) must call before persisting. No code beyond the schema module + validator + tests
exists yet; do not build the AI pipeline or the Cue Editor here.

## Why this matters

Per `01-map.md`'s Connections: *"C ↔ A: the AI pipeline's structured output must match A's column
shapes exactly — build A's exact JSON schema for `performance_data`/`source_profile`/etc. before
writing C's LLM prompt/output-parsing code, or the pipeline will produce data the schema can't hold
cleanly."* This task is that schema. It is also the single most important piece of R-A's shared
surface: whichever plan (this one, or `chapter_editor_catalog_completion`) lands its schema task
first defines the shape, and the other must consume it rather than inventing a second, divergent
JSON blob for "per-segment performance metadata" (see `00-overview.md`'s Cross-plan connection
section and `01-map.md` Risk R-A).

## Exact files

- New backend module: `app/domain/chapters/performance_schema.py` — Pydantic models +
  `validate_performance_data(raw: dict) -> PerformanceData` (raises a clear, typed error on
  malformed input; used identically by AI-pipeline parsing and any manual-write API path).
- New frontend module: `frontend/src/types/performanceScript.ts` — TypeScript types mirroring the
  Pydantic models field-for-field (pattern: `frontend/src/api/contracts/liveEvents.ts` mirrors
  `app/api/contracts/events.py` today for the event-envelope contract; do the same here).
- `app/db/core.py` — no changes in this task; task 001 (schema migration, prerequisite) is the one
  that adds the `performance_data` column. This task defines what's allowed to go *into* it.
- Do NOT touch `app/api/routers/chapters_models.py`'s `ScriptSpan` (the script-view API response
  model, `chapters_models.py:20-30`) in this task — wiring the new type into that response is a
  consumer concern (this plan's later tasks / the sibling plan's Cue Editor), not schema definition.

## Current shape (verified)

- `chapter_segments` today (`app/db/core.py:230-246`) has no `performance_data` column at all —
  `id`, `chapter_id`, `segment_order`, `text_content`, `sanitized_text`, `character_id`,
  `speaker_profile_name`, `audio_file_path`, `audio_status`, `audio_generated_at`. Task 001 adds
  `performance_data JSON` (nullable) plus separately-promoted columns `speaker_confidence`,
  `speaker_basis`, `speaker_evidence`, `needs_review`, `review_reasons`, `locked`, `ai_suggested`
  (`proposals/performance_script_model/03-db-schema-changes.md:44-56`). This task assumes those
  columns exist; there is nothing to validate against yet without task 001.
- The migration pattern to imitate for any follow-on DDL is `app/db/core.py:272-289`'s
  `add_column_if_missing()` helper (guards on sqlite's "duplicate column name" error) — informational
  only here since 002 adds no columns itself.
- `00-overview.md`'s Schedule decision already corrected doc 03's now-stale claim that
  `span_start`/`span_end` "replace sentence-level position as ownership unit"
  (`03-db-schema-changes.md:46`) — **do not carry that byte-offset concept into this schema.**
  `segment_order` remains the ownership/position unit; `performance_data` is a pure additive
  annotation blob keyed to the existing segment row, nothing more.

## Target shape

Doc 01 describes segments as a flat object (`kind`, `text`, `speaker`, `performance`, `rendering`,
plus kind-specific fields) stored as one JSON blob per segment (§11: *"The `data jsonb` field should
contain the full provider-neutral segment object"*, `01-canonical-json-format.md:409,414`). In this
repo's schema, several of those doc-01 fields are **already promoted to dedicated columns** by task
001 (`speaker.confidence`→`speaker_confidence`, `speaker.evidence`→`speaker_evidence`,
`review.needs_human_review`→`needs_review`, `review.locked`→`locked`). **`performance_data` therefore
holds everything doc 01 puts on a segment that is *not* one of those promoted columns**: `kind`, the
`performance` sub-object, the `rendering` sub-object, and kind-specific extension fields. Define
these Pydantic models (mirror in TS) with these exact fields, cited to doc 01:

- `SegmentKind` (str enum, §5, `01-canonical-json-format.md:79-93`): `narration`, `dialogue`,
  `attribution`, `stage_direction`, `action_context`, `vocalization`, `sfx`, `music`, `ambience`,
  `silence`, `chapter_marker`, `scene_marker`, `production_note`. (12 values.)
- `Emphasis` (§7, `:301-306`): `text: str`, `level: str` (e.g. `"strong"`).
- `EmotionAnnotation` (§7, `:286-292`): `primary: str`, `secondary: list[str] = []`,
  `intensity: float`, `valence: Optional[float] = None`, `arousal: Optional[float] = None`,
  `confidence: Optional[float] = None`.
- `DeliveryAnnotation` (§7, `:294-307`): `pace: Optional[str]`, `volume: Optional[str]`,
  `pitch: Optional[str]`, `range: Optional[str]`, `pause_before_ms: Optional[int]`,
  `pause_after_ms: Optional[int]`, `emphasis: list[Emphasis] = []`.
- `PerformanceAnnotation` (§7, `:283-311`, also the sparse dialogue example §3 `:53-65`):
  `emotion: Optional[EmotionAnnotation] = None`, `delivery: Optional[DeliveryAnnotation] = None`,
  `acting_note: Optional[str] = None`. **All fields optional — §3's "sparse annotation model" means
  this whole object, and every field on it, is null on most segments** (`:26-30`: *"Most lines should
  not have explicit emotion or delivery direction... Only include performance metadata when the line
  needs extra direction."*).
- `RenderingMode` (str enum, §8, `:319-325`): the 5 modes — `standard_audiobook`,
  `enhanced_audiobook`, `audio_drama`, `script_view`, `review_view`.
- `RenderingValue` (str enum, §8, `:329-338`): the 8 values — `spoken`, `spoken_by_narrator`,
  `omit`, `convert_to_vocalization`, `convert_to_sfx`, `use_as_context_only`, `visible`, `hidden`.
- `RenderingOverride` = `dict[RenderingMode, RenderingValue]` — a segment MAY carry a partial map of
  mode→value overrides (examples: attribution §5.3 `:142-147` maps 3 of the 5 modes; action_context
  §5.4 `:168-173` maps the same 3; vocalization §5.5 `:200-204` uses `spoken_text`/`export_strategy`
  instead — see note below). **This field only carries explicit per-segment overrides; it is not
  itself the resolved decision** — resolving the full 5-mode matrix (including modes/kinds the
  segment doesn't explicitly override) is task 003's job, not this one.
- Kind-specific extension fields, all optional and only meaningful for their matching `kind`:
  - `vocalization_type: Optional[str]` (§5.5 `:185`, e.g. `"laugh"`); `spoken_text: Optional[str]`
    and `export_strategy: Optional[str]` (§5.5 `:201-203`, e.g.
    `"engine_vocalization_or_prompt"`).
  - `sfx_type: Optional[str]`, `description: Optional[str]` (§5.6 `:216-217`); rendering-side
    `placement: Optional[str]`, `duration_ms: Optional[int]`, `enabled: Optional[bool]`
    (§5.6 `:219-222`).
  - `duration_ms: Optional[int]`, `purpose: Optional[str]` (§5.7 silence, `:235-236`).
  - `affects_next_segments: Optional[list[str]] = None` (§5.4 `:163`).
  - `InferredState`: `target_character_id: str`, `emotion: str` (§5.4 `:164-167`).
- **Decision to make explicitly in this task, don't silently pick one:** §10's `review` object
  (`:365-373`) has `speaker_reviewed`, `performance_reviewed`, `needs_human_review`, `locked`,
  `review_notes`. `needs_human_review`→`needs_review` and `locked`→`locked` are already promoted to
  dedicated columns (task 001). `speaker_reviewed`, `performance_reviewed`, and `review_notes` are
  **not** promoted anywhere in `03-db-schema-changes.md`'s column list. Decide: either (a) keep those
  three fields inside `performance_data` as a `review` sub-object holding only the non-promoted
  fields (recommended — avoids a 12th ALTER TABLE for a niche field), or (b) flag this as a gap and
  add them to task 001 retroactively before task 001 lands. Do not let `performance_data` silently
  duplicate `needs_review`/`locked` — the promoted columns are the source of truth for those two.

## Steps

1. Confirm task 001 has landed (the `performance_data`, `speaker_confidence`, `speaker_basis`,
   `speaker_evidence`, `needs_review`, `review_reasons`, `locked`, `ai_suggested` columns exist on
   `chapter_segments`) — there is no real column to validate data going into otherwise.
2. Write the Pydantic models in `app/domain/chapters/performance_schema.py` per the Target shape
   above, resolving the `review` sub-object decision explicitly (pick (a) or (b), document the
   choice in the module docstring).
3. Write `validate_performance_data(raw: dict) -> PerformanceData` — parses/validates a raw dict
   (as it would arrive from JSON-decoding the DB column, or from an AI-pipeline structured-output
   parse, or from a manual Cue Editor PATCH body) and raises a typed, specific error (not a bare
   `pydantic.ValidationError` leak) on malformed input.
4. Mirror every model as a TypeScript type in `frontend/src/types/performanceScript.ts`, field name
   and optionality matching the Pydantic side exactly (same pattern as
   `frontend/src/api/contracts/liveEvents.ts` mirroring `app/api/contracts/events.py`).
5. Write round-trip tests: every doc-01 example JSON blob (§3, §5.1-5.7, §7) parses successfully
   through `validate_performance_data()`; a deliberately malformed blob (wrong enum value, wrong
   type) is rejected with a clear error, not a silent coercion.
6. Bump `spec_version` / add a changelog row on whichever `design-docs/specs/` doc governs segment
   data contracts (per this repo's binding directive: behavior/contract changes update the matching
   spec in the same commit) — check `design-docs/specs/README.md`'s router index for the right spec
   file before assuming one doesn't exist.

## Acceptance criteria

- [ ] `app/domain/chapters/performance_schema.py` defines every model/enum listed in Target shape,
      with field names and optionality matching doc 01 exactly (cite line numbers in docstrings/PR
      description for reviewer cross-check).
- [ ] `validate_performance_data()` accepts every example JSON object in doc 01 (§3, §5.1-§5.7, §7)
      without modification, and rejects at least one deliberately malformed input per model with a
      clear error message.
- [ ] `frontend/src/types/performanceScript.ts` mirrors the backend models field-for-field; a
      TypeScript compile (`npm -C frontend run build`) passes with no `any` escape hatches introduced
      for these types.
- [ ] The `review` sub-object promoted-vs-JSON duplication (Target shape's "Decision to make
      explicitly") is resolved and documented, not left ambiguous.
- [ ] `./venv/bin/python -m pytest -q` clean; relevant spec file bumped with a changelog row.
- [ ] A code-map changelog-queue entry appended per this repo's `map-code` convention (new module +
      new cross-plan contract).

## Map links

Part B (`B-schema`) in `01-map.md`'s Parts table and `02-roadmap.md`'s Workload 2. Feeds INV-1 (no
second migration — this task adds no columns, only validates the shape of what's already there) and
is the direct prerequisite for INV-2 (one canonical format, many renderers — task 003 cannot exist
without this task's types). Directly implicated in Risk R-A (`01-map.md`) — read that risk in full
before starting; the schema this task produces IS the reconciliation surface R-A is worried about.

## Dependencies

Task 001 (additive schema migration) — depends on task 001 having landed first; there is no real
`performance_data` column to validate data into otherwise. Also depends on task 000 (cross-plan
schema reconciliation with `chapter_editor_catalog_completion`) having resolved R-A — if that
reconciliation changes the column/JSON shape, this task's models must match the reconciled shape,
not doc 01 in isolation.

## Out of scope

- The rendering-mode resolution/translation logic (task 003) — this task defines the *shape* a
  segment's rendering overrides can take (`RenderingOverride`), not the logic that resolves a full
  5-mode decision from it.
- Wiring `performance_data` into the script-view API response (`ScriptSpan`) or any UI — that's a
  consumer concern for later tasks (review-state UI, task 012) and the sibling plan's Cue Editor.
- The AI extraction pipeline's prompt/output-parsing code (tasks 005-009) — this task only makes
  sure that pipeline has a validator to parse its output through; it does not write the pipeline.
- Character-profile schema (`aliases`, `source_profile`, `voice_guidance`, etc. from
  `03-db-schema-changes.md`'s `characters` table changes) — that's a related but separate schema,
  not covered by doc 01's segment-focused canonical format; do not fold it into this task.
