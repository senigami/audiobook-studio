# Task 001 — Additive schema migration (chapter_segments + characters)

Status: pending

Risk: none (purely additive nullable/defaulted columns, no data migration, no existing-row rewrite,
matches this repo's existing migration pattern exactly — same risk class as the `sanitized_text`/
`speaker_profile_name` additions already live in `app/db/core.py`)

## Goal

Add the AI-extraction-pipeline columns to `chapter_segments` and the rich-profile columns to
`characters`, following the exact `add_column_if_missing` pattern already used in
`app/db/core.py` for every prior additive column on these tables.

**This task assumes task 000's reconciliation has already run and its Decision section is filled
in.** The exact column name and shape for the shared performance/rendering JSON field
(`performance_data` vs. the sibling plan's `engine_directives`) is **not this task's call to make** —
it is task 000's. This task file is written against task 000's recommended outcome (one shared
`performance_data` column, provenance tracked via `ai_suggested`/`locked`/`needs_review`/
`review_reasons`) — **before executing this task, re-read task 000's Decision section and confirm
the column list below still matches it.** If task 000's ratified decision differs, edit the column
list below (or re-derive it) before running the migration, not after.

## Why this matters

Per `00-overview.md`'s Schedule decision, this migration is genuinely independent of the sub-sentence
assignment work (which needed zero new columns) and independent of whether the owner greenlights the
AI-extraction pipeline (Part C) — it is small, safe, useful groundwork either way (manual
performance-annotation entry via the sibling plan's Cue Editor doesn't require the AI pipeline to
exist; `01-map.md`'s Connections: "A is the prerequisite for everything else"). Landing it lets B
(canonical JSON format work), the review-state UI, and the sibling plan's manually-authored cues all
build against a real schema instead of a proposal doc.

## Exact files

- `app/db/core.py` — the `CREATE TABLE IF NOT EXISTS chapter_segments` block (currently lines
  232-246) and `CREATE TABLE IF NOT EXISTS characters` block (currently lines 219-228), plus the
  `add_column_if_missing` migration call list (currently lines 279-289, helper defined at
  272-277). Line numbers verified 2026-07-10 against the current file — re-check before editing in
  case other work has shifted them.

## Current shape (verified 2026-07-10)

Read directly from `app/db/core.py`:

```python
# core.py:219-228
CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    speaker_profile_name TEXT,
    default_emotion TEXT,
    color TEXT DEFAULT '#8b5cf6',
    FOREIGN KEY (project_id) REFERENCES projects (id)
)

# core.py:232-246
CREATE TABLE IF NOT EXISTS chapter_segments (
    id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL,
    segment_order INTEGER NOT NULL,
    text_content TEXT NOT NULL,
    sanitized_text TEXT,
    character_id TEXT,
    speaker_profile_name TEXT,
    audio_file_path TEXT,
    audio_status TEXT DEFAULT 'unprocessed',
    audio_generated_at REAL,
    FOREIGN KEY (chapter_id) REFERENCES chapters (id),
    FOREIGN KEY (character_id) REFERENCES characters (id)
)
```

Neither table has any of this plan's proposed columns yet, and (as of 2026-07-10) the sibling
`chapter_editor_catalog_completion` plan's task 005 (`render`/`engine_directives`) has also not
executed — confirmed by the absence of both from the migration list at lines 279-289. **Re-verify
this before starting** — if either plan's schema task has landed since, `app/db/core.py`'s live DDL
is the source of truth, not this task file's "current shape" snapshot.

**Migration pattern to imitate** (`core.py:272-289`):

```python
def add_column_if_missing(sql: str, label: str):
    try:
        cursor.execute(sql)
    except sqlite3.OperationalError as exc:
        if "duplicate column name" not in str(exc).lower():
            logger.warning("Failed to apply %s migration", label, exc_info=True)

add_column_if_missing("ALTER TABLE chapter_segments ADD COLUMN speaker_profile_name TEXT", "chapter_segments.speaker_profile_name")
...
add_column_if_missing("ALTER TABLE chapter_segments ADD COLUMN sanitized_text TEXT", "chapter_segments.sanitized_text")
```

Every prior additive column on these two tables (`speaker_profile_name`, `sanitized_text`,
`chapter_id` on `characters`) follows this exact shape: one `add_column_if_missing(...)` call per
column, appended to the existing list, with a matching line also added to the `CREATE TABLE IF NOT
EXISTS` block so a fresh DB gets the column without depending on the migration path running at all
(both places always agree — this is the same convention the sibling plan's task 005 documents at its
own lines 49-54). Follow this exact two-places-per-column shape here.

**Important scope correction inherited from `00-overview.md` (do not re-introduce this):** the
original proposal doc (`proposals/performance_script_model/03-db-schema-changes.md:46`) also lists
`span_start`/`span_end`/`sentence_index`, describing them as replacing `segment_order` as the
ownership unit. This session's research confirmed that premise is **factually wrong** — sub-sentence
assignment shipped by splitting `text_content` and shifting `segment_order`, never adding those
columns, and nothing in this plan's actual downstream consumers (B/C/D/E in `01-map.md`) needs a byte
offset. **Do not add `span_start`, `span_end`, or `sentence_index` in this migration** — only the
performance/review columns below.

## Target shape

**`chapter_segments`** — add (assuming task 000's recommended reconciliation; verify against task
000's Decision section first):

| Column | SQL type | Nullable / default | Purpose |
|---|---|---|---|
| `render` | `INTEGER` | `NOT NULL DEFAULT 1` | **Owned by the sibling plan's task 005, not this plan** — included here only if task 000's reconciliation concludes this plan's task 001 is the one landing it first (see task 000 step 6). If the sibling plan's task 005 has already added it, skip this column entirely — do not add it twice. |
| `performance_data` | `TEXT` | nullable, no default | JSON-encoded canonical performance object (`proposals/performance_script_model/01-canonical-json-format.md` §3-§5 shape: `{emotion?: {primary, intensity}, delivery?: {volume, pace, pitch}, acting_note?}`). Null on most rows (sparse model — INV per doc 03: "performance_data is null on most rows"). Shared column per task 000's reconciliation — both the AI pipeline (this plan) and the sibling plan's Cue Editor write here. |
| `speaker_confidence` | `REAL` | nullable, no default | `0.0`-`1.0`; null means human-assigned (implicit confidence 1.0). About speaker/character attribution, not performance — no overlap with the sibling plan. |
| `speaker_basis` | `TEXT` | nullable, no default | One of `explicit_source`, `inferred_from_context`, `studio_override` (free-text per doc 03, not an enforced enum at the DB layer — validation belongs to task 002/the API contract, not the DDL). |
| `speaker_evidence` | `TEXT` | nullable, no default | JSON-encoded array of evidence quote strings. |
| `needs_review` | `INTEGER` | nullable, default `0` | Boolean (0/1). Per task 000's reconciliation, this flag also covers `performance_data` review state now that the column is shared — not narrowed to speaker-only review. |
| `review_reasons` | `TEXT` | nullable, no default | JSON-encoded array of reason strings. |
| `locked` | `INTEGER` | nullable, default `0` | Boolean (0/1). `1` = human has confirmed (either the speaker assignment or a manually-authored `performance_data` value) — AI must never overwrite (INV-3). |
| `ai_suggested` | `INTEGER` | nullable, default `0` | Boolean (0/1). `1` = AI-seeded, not yet confirmed by a human. |

**`characters`** — add:

| Column | SQL type | Nullable / default | Purpose |
|---|---|---|---|
| `display_name` | `TEXT` | nullable, no default | Short display name distinct from the existing `name`. |
| `role` | `TEXT` | nullable, no default | One of `narrator`, `major_character`, `minor_character`, `background_character`, `group`, `unknown` (free-text, not DB-enforced — same note as `speaker_basis` above). |
| `character_type` | `TEXT` | nullable, no default | One of `fictional_person`, `group`, `narrator`, `unknown`. |
| `aliases` | `TEXT` | nullable, no default | JSON-encoded array of `{value, type, confidence}` objects. |
| `source_presence` | `TEXT` | nullable, no default | JSON-encoded `{first_seen: {paragraph_index, sentence_index}, speaking_count, mentioned_count}`. |
| `source_profile` | `TEXT` | nullable, no default | JSON-encoded inferred-traits object (age, gender, accent, speech_style, personality_traits, physical_description, social_role — each with basis/confidence/evidence per doc 03). |
| `voice_guidance` | `TEXT` | nullable, no default | JSON-encoded `{casting_notes, default_delivery, accent, avoid[]}`. |
| `needs_review` | `INTEGER` | nullable, default `0` | Boolean (0/1). |
| `review_reasons` | `TEXT` | nullable, no default | JSON-encoded array of reason strings. |
| `locked` | `INTEGER` | nullable, default `0` | Boolean (0/1). |
| `ai_suggested` | `INTEGER` | nullable, default `0` | Boolean (0/1). |

Note: `characters.default_emotion` (existing column) is left in place, unchanged, per doc 03's
migration notes ("kept for legacy UI and deprecated in P2") — this task does not remove or rename it.
`characters.color` also stays as-is.

All new columns on both tables use SQLite's dynamic typing for booleans (`INTEGER` 0/1, matching the
existing `audio_status`-adjacent convention in this codebase — there is no SQLite `BOOLEAN` type) and
plain `TEXT` for JSON payloads (matching `processing_queue.segment_ids`, the existing nullable-JSON
column added at `core.py:288` and its encode/decode helpers in `app/db/queue.py:12-29`
(`_encode_segment_ids`/`_decode_segment_ids`) — the pattern to imitate for this task's own future
encode/decode helpers, though writing those helpers is downstream work for task 002/the AI pipeline
tasks, not this task, which is DDL-only).

## Steps

1. Re-read task 000's Decision section; if it names a different column/shape than the table above,
   update this task's column list to match before proceeding — do not execute against a stale
   assumption.
2. Re-check `app/db/core.py`'s live DDL and migration list for `render`/`performance_data` (or
   whatever task 000 decided) — confirm neither the sibling plan's task 005 nor a prior partial run
   of this task has already added any of these columns, to avoid a duplicate/conflicting
   `add_column_if_missing` call. `add_column_if_missing` itself is idempotent (catches "duplicate
   column name"), so a re-run is safe, but a column added under a *different name or type* by the
   sibling plan would silently create the exact overlap task 000 exists to prevent — check by name,
   not just by re-running.
3. Add each new `chapter_segments` column line to the `CREATE TABLE IF NOT EXISTS chapter_segments`
   block (after `audio_generated_at REAL,` — remember the trailing comma shape SQLite requires
   before the `FOREIGN KEY` lines).
4. Add each new `characters` column line to the `CREATE TABLE IF NOT EXISTS characters` block (after
   `color TEXT DEFAULT '#8b5cf6',`).
5. Add one `add_column_if_missing(...)` call per new column (both tables) to the migration list
   immediately after the existing `add_column_if_missing("ALTER TABLE characters ADD COLUMN
   chapter_id TEXT", "characters.chapter_id")` line — matching the exact `"ALTER TABLE <table> ADD
   COLUMN <name> <type>[ NOT NULL DEFAULT <value>]"`, `"<table>.<column>"` label shape already used
   by every existing call in that list.
6. Write a backend test (new or extended file under `tests/` matching wherever existing
   `app/db/core.py` migration behavior is tested — check for an existing DB-schema/migration test
   file before creating a new one) asserting: (a) a fresh DB created from scratch has all new
   columns via `PRAGMA table_info`; (b) re-running the migration path against an already-migrated DB
   does not raise or duplicate columns (exercises the `add_column_if_missing` idempotency path); (c)
   a pre-existing `chapter_segments`/`characters` row (inserted with none of the new columns set)
   reads back with the documented defaults (`needs_review=0`, `locked=0`, `ai_suggested=0`,
   `performance_data=NULL`, etc.) — the additive/non-breaking guarantee this repo's Owner directive
   requires.
7. Run `./venv/bin/python -m pytest -q` — confirm no existing `chapter_segments`/`characters`-touching
   test regresses (this is the same class of check the sibling plan's task 005 step 9 performs for
   its own additive columns).
8. Bump `spec_version` / add a changelog row in whichever spec under `design-docs/specs/` documents
   the chapter/segment/character data contract (check `design-docs/specs/README.md`'s router index
   for the right doc) — required in the same commit per this repo's binding directive on behavior
   changes.
9. Update `proposals/performance_script_model/03-db-schema-changes.md`'s "Current state" section to
   reflect that these columns now exist (it currently describes the pre-migration schema as
   "current" — that becomes stale the moment this task lands) and correct the `span_start`/`span_end`
   line (doc line 46) per the scope correction noted above, so a future reader of the proposal doc
   isn't misled into thinking those columns are still pending.

## Acceptance criteria

- [ ] Every column in both tables above (adjusted per task 000's actual ratified decision if it
      differs from the assumption here) is present in the `CREATE TABLE IF NOT EXISTS` DDL for its
      table **and** in the `add_column_if_missing` migration list — both places, matching the
      existing two-places-per-column convention.
- [ ] A fresh DB (no prior rows) shows all new columns via `PRAGMA table_info(chapter_segments)` /
      `PRAGMA table_info(characters)`.
- [ ] Running migration against an already-migrated DB a second time does not raise and does not
      duplicate any column (idempotency verified by a test).
- [ ] A `chapter_segments`/`characters` row written before this migration (or written after but
      without setting any new field) reads back with `needs_review=0`, `locked=0`, `ai_suggested=0`,
      and all JSON columns (`performance_data`, `speaker_evidence`, `review_reasons`, `aliases`,
      `source_presence`, `source_profile`, `voice_guidance`) as `NULL` — verified by a test, not
      just inspection.
- [ ] No `span_start`, `span_end`, or `sentence_index` columns are added (scope correction from
      `00-overview.md`).
- [ ] If `render`/`performance_data` (or task 000's actual decided names) already exist in the DB
      from the sibling plan's task 005 having run first, this task adds only the columns still
      missing and does not attempt to re-add or rename anything already present.
- [ ] `./venv/bin/python -m pytest -q` passes with no regressions.
- [ ] Matching spec doc under `design-docs/specs/` updated with a changelog row.
- [ ] `proposals/performance_script_model/03-db-schema-changes.md`'s "Current state" section and the
      `span_start`/`span_end` line are corrected to match what actually landed.

## Map links

Part A in `01-map.md` ("the prerequisite for everything else"). Invariant INV-1 ("No second
migration" — this task's columns are additive and nullable/defaulted; nothing downstream in this plan
should ever require a second schema pass). `02-roadmap.md`'s Workload 1 / M1 milestone.

## Dependencies

Task 000 (schema-overlap reconciliation) — **must be resolved first**. The exact column list this
task adds (specifically whether `performance_data` is a shared column with the sibling plan, and
whether `render` belongs in this migration at all) is task 000's decision, not this task's. Do not
start this task's Step 3 until task 000's Decision section names a concrete, ratified shape.

## Out of scope

- Encode/decode JSON helpers for the new `TEXT` columns (downstream: task 002, the canonical-format
  schema/validation task, and whichever of the AI-pipeline tasks first needs to read/write
  `performance_data` programmatically).
- Any data migration or backfill — every new row is nullable/defaulted; no existing row's data
  changes shape.
- The `render` column's actual consumption in the render pipeline (sibling plan's task 006) — this
  task only adds the column if task 000 assigns it here.
- Updating `app/api/routers/chapters_models.py` or any frontend TypeScript types to expose these new
  columns over the API — that is downstream contract work (task 002 and later), not this DDL-only
  task.
