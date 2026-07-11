# Task 005 — Stage Direction / Performance Cue data model (schema + contracts)

Status: pending

Risk: quality-sensitive, multi-file (adds a nullable DB column + a JSON-bag column to `chapter_segments`, touches every read/write path for segments, and extends two API request/response contracts — must not break any existing segment read/write for rows that never set the new fields)

## Goal

Add the backend DB columns, the JSON-encode/decode plumbing, the API request/response contract fields, and the frontend TypeScript type fields needed to represent:
1. **Stage Direction** — a segment excluded from TTS entirely (`render = 0`), identified by the sentinel `character_id = "_stage_direction"`.
2. **Performance Cue** — a segment excluded from TTS entirely (`render = 0`) that carries a structured `engine_directives` JSON payload (`{rate?, pitch?, volume?, style_prompt?}`) consumed by the render pipeline (task 006) for whichever renderable segment follows it.

This task is data model + contract plumbing only. It does **not** implement the render-pipeline skip/merge logic (task 006), the gutter glyph rendering (task 007), or the Cue Editor popover (task 008) — but all three depend on the fields this task adds existing and round-tripping correctly.

## Why this matters

Per `design-docs/workflows/chapter-editor-modes.md` §5 (lines 153–178) and §13 (lines 349–353), Stage Direction and Performance Cue are v1-shipping features of Cast mode, explicitly deferred by the 2026-07-10 activation pass (see `CastTool/index.tsx`'s own doc comment, lines 29–31: "Deliberately deferred... Stage Direction, Performance Cue, mutation-batching"). Nothing in the current data model supports either concept: `frontend/src/types/index.ts`'s `ChapterSegment` (lines 89–100) and `ScriptSpan` (lines 102–114) carry only `character_id`/`speaker_profile_name` — no render flag, no annotation bag. Per `01-map.md`'s R-A, this is flagged as the largest single item in the whole catalog-completion plan and must be its own multi-task workload — this is the foundation task all three others in that workload build on.

## Exact files

**Backend:**
- `app/db/core.py` — DDL for `chapter_segments` (lines 230–246) + the `add_column_if_missing` migration block (lines 271–289).
- `app/db/segments.py` — `update_segment` (lines 295–423), `update_segments_bulk` (lines 425–451), `get_chapter_segments` (lines 117–130+).
- `app/domain/chapters/operations.py` — `save_script_assignments` (lines 162–267, esp. the `flat_assignments` construction at 186–192 and the `executemany` at 223–246), `_apply_range_assignment` (lines 385–462, esp. the `executemany` at 449–461), `get_script_view_payload` (lines 13–~52, the `span_payload` dict at 36–49).
- `app/domain/chapters/helpers.py` — `_load_segment_rows` (lines 29–43), `_clean_optional_text` (79–83), `_resolved_speaker_profile_name` (86–89).
- `app/api/routers/chapters_models.py` — `ScriptSpan` (lines 20–31), `ScriptAssignment` (54–57), `ScriptRangeAssignment` (60–66).
- `app/api/routers/chapters.py` — `SEGMENT_UPDATE_ALLOWED_FIELDS` (line 204), `PUT /segments/{segment_id}` (207–230), `POST /segments/bulk-update` (239–251).

**Frontend:**
- `frontend/src/types/index.ts` — `ChapterSegment` (lines 89–100), `ScriptSpan` (102–114), `ScriptAssignment` (147–151), `ScriptRangeAssignment` (153–160).

## Current shape (verified)

- **No FK enforcement on `character_id`.** `chapter_segments.character_id` has a `FOREIGN KEY (character_id) REFERENCES characters (id)` clause in the DDL (`app/db/core.py:238,244`), but `app/db/core.py`'s `get_connection()` (lines 59–73) never runs `PRAGMA foreign_keys=ON`. Confirmed no `PRAGMA foreign_keys` anywhere in `app/db/*.py`. This means `character_id = "_stage_direction"` is safe to write as a plain sentinel string **without** creating a real `characters` row for it — SQLite will not reject the insert/update. Every join against `characters` (`get_chapter_segments`'s `LEFT JOIN`, `helpers._load_segment_rows`'s `LEFT JOIN`, `chunk_groups.py`'s `load_chunk_segments`'s `LEFT JOIN`) is already a `LEFT JOIN`, so a sentinel with no matching character row just yields `NULL` for `character_name`/`character_color`/`character_speaker_profile_name` — no crash, but callers that assume "has `character_id` ⇒ has character metadata" must special-case the sentinel (this matters for task 007's glyph logic, not this task's).
- **Existing nullable-JSON-column precedent:** `app/db/queue.py` lines 12–29 define `_encode_segment_ids`/`_decode_segment_ids`, a pair of `json.dumps`/`json.loads` helpers wrapping a nullable `TEXT` column (`processing_queue.segment_ids`, added via `add_column_if_missing("ALTER TABLE processing_queue ADD COLUMN segment_ids TEXT", ...)` at `core.py:288`). This is the exact pattern to replicate for `engine_directives` — a nullable `TEXT` column storing a JSON-encoded object, `None` when absent.
- **Migration pattern:** `app/db/core.py:272–289` defines `add_column_if_missing(sql, label)` (catches `sqlite3.OperationalError` for `"duplicate column name"`, logs+swallows anything else) and calls it once per column directly after the `CREATE TABLE IF NOT EXISTS` block for `chapter_segments` (lines 230–246). New columns go in this same list, same style.
- **`update_segment`/`update_segments_bulk` are already fully generic** (`app/db/segments.py:295–451`): they build `UPDATE chapter_segments SET {col} = ? ...` dynamically from `**updates` kwargs — no signature change needed to accept new column names. **However**, both bind values straight into `cursor.execute`/`executemany` with no type coercion. If a caller passes a Python `dict` for `engine_directives` (e.g. from a JSON request body already parsed by FastAPI), `sqlite3` will raise `InterfaceError: Error binding parameter — probably unsupported type` — there is no existing coercion step. This must be added centrally in these two functions (not left to callers) per this repo's "extend the chokepoint" convention (see `docs/lessons` re: systemic bug classes).
- **`PUT /segments/{segment_id}` and `POST /segments/bulk-update` (`app/api/routers/chapters.py:204,207–230,239–251`) whitelist request-body keys against `SEGMENT_UPDATE_ALLOWED_FIELDS = {"character_id", "speaker_profile_name", "audio_status", "text_content"}`** because those keys are used directly as SQL column names (values are parameterized/safe; column names are not — see the security comment at lines 197–203). `render` and `engine_directives` must be added to this set or every future caller (including task 008's Cue Editor) gets a 400.
- **`save_script_assignments`** (`operations.py:162–267`) builds a `flat_assignments: list[tuple[str|None, str|None, str]]` (character_id, profile_name, span_id) from the request's `assignments` list (186–192), then runs one `executemany` (223–246) that unconditionally overwrites `character_id`/`speaker_profile_name` (and resets `audio_status`/`audio_file_path`/`audio_generated_at` if the assignment changed) for every span in the batch. There is no partial-patch concept anywhere in this path — whatever the caller sends is the new full state for that field. Follow this convention: `render`/`engine_directives` should be treated the same way (always fully specified by the caller, never a "leave unchanged if omitted" default).
- **`_apply_range_assignment`** (`operations.py:385–462`) is a structurally separate write path (splits segments at offsets, then does its own `executemany` at 449–461) used for painting a sub-segment range. It currently writes only `character_id`, `speaker_profile_name`, and resets audio fields — same extension needed here.
- **`get_script_view_payload`** (`operations.py:13–~52`) builds `span_payload` dict-by-dict (not a raw passthrough of the DB row) at lines 36–49 — this is where new response fields get added explicitly, not via `SELECT *` magic.
- **Backend Pydantic contracts** (`app/api/routers/chapters_models.py:20–31,54–66`) are separate from the frontend TS types — both need updating, they do not share a schema generator.
- **Frontend types** (`frontend/src/types/index.ts:89–160`) mirror the backend contracts by convention but are hand-maintained, not generated.
- **`approval_state`** is named in the design doc's "Segment annotation bag" line (§13 line 350) but its only concrete use (draft/locked toggle) is scoped to the **Inspector drawer**, which the same doc marks **"(post-v2)"** (line 351) — i.e. explicitly out of scope for this plan (`00-overview.md`'s Scope section excludes "Future / post-v2" items). Do not add an `approval_state` column in this task.

## Target shape

**DB (`app/db/core.py`):**
- New nullable columns on `chapter_segments`, added via `add_column_if_missing` immediately after the existing `chapter_segments.sanitized_text` line (`core.py:282`):
  ```python
  add_column_if_missing("ALTER TABLE chapter_segments ADD COLUMN render INTEGER NOT NULL DEFAULT 1", "chapter_segments.render")
  add_column_if_missing("ALTER TABLE chapter_segments ADD COLUMN engine_directives TEXT", "chapter_segments.engine_directives")
  ```
  `render` defaults to `1` (renderable) so every existing row is unaffected — this is additive per the Owner directive on versioned/additive schema changes. SQLite backfills the `DEFAULT 1` onto pre-existing rows automatically on `ADD COLUMN` with a constant default; no separate backfill UPDATE is needed. Also add the same two lines to the `CREATE TABLE IF NOT EXISTS chapter_segments (...)` block itself (lines 232–245) so a fresh DB gets the columns without relying on the migration path (matches how `speaker_profile_name`/`sanitized_text` already appear in both the `CREATE TABLE` and the migration list).

**Encode/decode helpers (`app/db/segments.py`, near the top, following `queue.py`'s `_encode_segment_ids`/`_decode_segment_ids` naming):**
```python
def _encode_engine_directives(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value  # already-encoded passthrough (defensive)
    return json.dumps(value)

def _decode_engine_directives(raw_value):
    if raw_value in (None, ""):
        return None
    if isinstance(raw_value, dict):
        return raw_value
    try:
        decoded = json.loads(str(raw_value))
    except (TypeError, json.JSONDecodeError):
        return None
    return decoded if isinstance(decoded, dict) else None
```
(Add `import json` to `segments.py` if not already present — check first.)

**`update_segment`/`update_segments_bulk` (`app/db/segments.py:295–451`):** before building the `fields`/`values` lists, special-case the `engine_directives` key in `updates` — if present, replace its value with `_encode_engine_directives(updates["engine_directives"])`. This is the single chokepoint fix; no caller needs to pre-encode.

**`get_chapter_segments` (`app/db/segments.py:117–130`):** after `rows = [dict(row) for row in cursor.fetchall()]`, decode each row's `engine_directives` in place: `for row in rows: row["engine_directives"] = _decode_engine_directives(row.get("engine_directives"))`. `render` needs no decode (SQLite `INTEGER` round-trips as Python `int`; the API/frontend layers coerce to `bool` where they build response payloads, per the "Target shape" API section below).

**API contracts (`app/api/routers/chapters_models.py`):**
```python
class ScriptSpan(BaseModel):
    ...
    render: bool = True
    engine_directives: Optional[dict] = None

class ScriptAssignment(BaseModel):
    span_ids: List[str]
    character_id: Optional[str] = None
    speaker_profile_name: Optional[str] = None
    render: bool = True
    engine_directives: Optional[dict] = None

class ScriptRangeAssignment(BaseModel):
    ...
    render: bool = True
    engine_directives: Optional[dict] = None
```

**`app/api/routers/chapters.py`:** add `"render"`, `"engine_directives"` to `SEGMENT_UPDATE_ALLOWED_FIELDS` (line 204). In `api_update_segment_route` (207–230), `updates["engine_directives"]` will already be a `dict`/`None` (parsed straight from JSON) by the time it reaches `update_segment(segment_id, **updates)` — this is fine because `update_segment`'s new encode step (above) handles the dict→JSON-string conversion; do not add a second encode step here.

**`operations.py`:**
- `save_script_assignments`'s `flat_assignments` (186–192) becomes a 5-tuple: `(char_id, prof_name, render, engine_directives_json, span_id)`, reading `entry.get("render", True)` and `_encode_engine_directives(entry.get("engine_directives"))` (import the encode helper from `app.db.segments`, or duplicate the tiny function locally if that creates a layering problem — check whether `app/domain/chapters/` already imports from `app/db/segments.py` elsewhere before deciding). The `executemany` SQL (223–246) gains `render = ?, engine_directives = ?` in the `SET` clause with matching bind values, threaded through the existing `CASE`-based audio-invalidation logic unchanged (render/engine_directives changes do not need to invalidate cached audio — a Stage Direction/Performance Cue segment was never rendered as audio in the first place under the old model, and under the new model task 006 makes render:false segments skip synthesis entirely).
- `_apply_range_assignment`'s `executemany` (449–461) gains the same two columns/bind values, reading `render`/`engine_directives` off `range_req` the same way `character_id`/`speaker_profile_name` are read at lines 393–394.
- `get_script_view_payload`'s `span_payload` dict (36–49) gains:
  ```python
  "render": bool(row.get("render", 1)),
  "engine_directives": _decode_engine_directives(row.get("engine_directives")) if hasattr(helpers, ...) else ...,
  ```
  (Use whichever decode helper you placed the function in — see the layering note above; do not duplicate JSON-decode logic inline here if a shared helper already exists.)

**Frontend types (`frontend/src/types/index.ts`):**
```ts
export interface EngineDirectives {
  rate?: string;
  pitch?: string;
  volume?: string;
  style_prompt?: string;
}

export interface ChapterSegment {
  ...
  render: boolean;
  engine_directives: EngineDirectives | null;
}

export interface ScriptSpan {
  ...
  render: boolean;
  engine_directives: EngineDirectives | null;
}

export interface ScriptAssignment {
  span_ids: string[];
  character_id?: string | null;
  speaker_profile_name?: string | null;
  render?: boolean;
  engine_directives?: EngineDirectives | null;
}

export interface ScriptRangeAssignment {
  ...
  render?: boolean;
  engine_directives?: EngineDirectives | null;
}
```
Note the frontend request types keep `render`/`engine_directives` optional (existing callers like Brush-size/Match Voice/Variation assignment code in tasks 002–004 don't set them and must keep compiling and behaving exactly as before — they should default server-side to `render: True`/`engine_directives: None` via the Pydantic model defaults above).

**Sentinel constant:** define `STAGE_DIRECTION_CHARACTER_ID = "_stage_direction"` once, in `frontend/src/types/index.ts` (exported) — this task only needs to define/export it; wiring the actual CastPalette "Stage Direction" system entry and its `S` keyboard shortcut to *use* this constant when painting is **not** part of this task (see Out of scope).

## Steps

1. Add the two `ADD COLUMN` migration lines to `app/db/core.py` (after line 282) and mirror them in the `CREATE TABLE IF NOT EXISTS chapter_segments` block (lines 232–245).
2. Add `_encode_engine_directives`/`_decode_engine_directives` to `app/db/segments.py`; wire the encode step into `update_segment` and `update_segments_bulk`'s `updates` dict handling (before the `fields`/`values` loop in each); wire the decode step into `get_chapter_segments`'s row post-processing.
3. Add `render`/`engine_directives` to `ScriptSpan`, `ScriptAssignment`, `ScriptRangeAssignment` in `app/api/routers/chapters_models.py`.
4. Add `"render"`, `"engine_directives"` to `SEGMENT_UPDATE_ALLOWED_FIELDS` in `app/api/routers/chapters.py`.
5. Extend `save_script_assignments`'s `flat_assignments` tuple + `executemany` SQL and `_apply_range_assignment`'s `executemany` SQL in `app/domain/chapters/operations.py` to read/write the two new fields (decide during implementation whether the encode/decode helpers live in `app/db/segments.py` and get imported, or get a small duplicate in `app/domain/chapters/helpers.py` — check for an existing import boundary/circular-import constraint between `app/domain/chapters/` and `app/db/` before choosing; either is acceptable, just don't have two divergent JSON shapes).
6. Extend `get_script_view_payload`'s `span_payload` construction with the two new fields.
7. Add `EngineDirectives`, and extend `ChapterSegment`, `ScriptSpan`, `ScriptAssignment`, `ScriptRangeAssignment` in `frontend/src/types/index.ts`.
8. Write/extend backend tests: round-trip a segment through `update_segment(segment_id, engine_directives={"rate": "slow"})` and confirm `get_chapter_segments` returns it as a decoded dict, not a JSON string. Round-trip `render=False` through `save_script_assignments`'s `assignments` path and confirm `get_script_view_payload` reflects it. Confirm a segment with **no** `render`/`engine_directives` ever written still reads back as `render=True`/`engine_directives=None` (the additive/non-breaking guarantee).
9. Run `./venv/bin/python -m pytest -q` — confirm no existing segment/chapter/queue tests regress (this column addition must not change behavior for any row that never sets the new fields).
10. Bump `spec_version`/add a changelog row in whichever spec under `design-docs/specs/` documents the segment/chapter-editor data contract (check `design-docs/specs/README.md`'s router index for the right doc before editing).

## Acceptance criteria

- [ ] `chapter_segments` has `render INTEGER NOT NULL DEFAULT 1` and `engine_directives TEXT` columns, present both in the `CREATE TABLE` DDL and the `add_column_if_missing` migration list.
- [ ] `update_segment`/`update_segments_bulk` accept `engine_directives` as a Python `dict` and persist it JSON-encoded; a segment written with a dict and re-read via `get_chapter_segments` comes back as an equivalent `dict`, not a raw JSON string.
- [ ] `PUT /segments/{id}` and `POST /segments/bulk-update` accept `render`/`engine_directives` in the request body without a 400 (whitelist updated).
- [ ] `ScriptSpan`/`ScriptAssignment`/`ScriptRangeAssignment` (backend Pydantic) and `ChapterSegment`/`ScriptSpan`/`ScriptAssignment`/`ScriptRangeAssignment` (frontend TS) all carry `render`/`engine_directives` with matching shapes.
- [ ] `save_script_assignments` and `_apply_range_assignment` persist `render`/`engine_directives` when present in the request, defaulting to `render=True`/`engine_directives=None` when omitted — existing callers (brush/Match-Voice/Variation assignment flows) that never set these fields continue to work unchanged.
- [ ] A pre-existing segment row (created before this migration, or created without ever touching the new fields) reads back as `render=True`, `engine_directives=None` — the additive/non-breaking guarantee, verified by a test.
- [ ] `./venv/bin/python -m pytest -q` passes with no regressions in existing segment/chapter/script-view tests.
- [ ] Matching spec doc under `design-docs/specs/` updated with a changelog row for this schema change.

## Map links

Part E (schema half) in `01-map.md`. Invariant INV-1 (no second data model — this reuses the existing `chapter_segments` table and existing assignment endpoints rather than inventing a parallel annotations table). Risk R-A (this workload's own largest-item flag).

## Dependencies

None — this is the foundation task for the whole Stage Direction / Performance Cue workload (006, 007, 008 all depend on this).

## Out of scope

- The render-pipeline skip logic and SSML merge/consumption (task 006).
- The gutter glyph rendering component (task 007).
- The Cue Editor popover UI (task 008).
- Wiring the `S`/`P` keyboard shortcuts in `CastTool`, and adding "Stage Direction"/"Performance Cue" as clickable system entries in `CastPalette.tsx` (analogous to the existing "Narrator" entry, `CastPalette.tsx:507–542`) — this task only makes the sentinel constant and the DB/API fields available; the actual paint-gesture UI wiring is not one of the four tasks in this workload and should be tracked separately if not already covered by another task in this plan.
- `approval_state` — explicitly post-v2 (Inspector drawer), not added in this task.
- Backfilling/auto-painting Stage Direction on Fountain import (§16 of the design doc) — explicitly future/not-v1.
