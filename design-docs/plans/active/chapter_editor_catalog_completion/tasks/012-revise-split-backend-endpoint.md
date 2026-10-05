# Task 012 — Backend endpoint: persist a two-way segment split

Status: pending

Risk: quality-sensitive (new backend endpoint that inserts/reorders/audio-invalidates live segment DB rows; a bug here corrupts a chapter's segment ordering)

## Goal

Add a backend endpoint that takes two pre-computed text halves for an over-long segment and persists them as two real segment rows — truncating the original row in place, shifting every later row's `segment_order` by +1, and inserting a new row for the second half. This is the missing persistence primitive Revise mode needs; it does **not** re-implement the split-point algorithm (that already exists, in TypeScript, on the frontend).

## Why this matters

`SegmentSplitter.ts` (`frontend/src/pages/ChapterEditor/components/DirectorsConsole/ReviseTool/SegmentSplitter.ts`, 74 lines) is a pure, already-tested function `splitSegmentText(text, maxChars, minFloor=80)` that finds the sentence-boundary split point nearest an over-long segment's midpoint. It is already called from `ReviseTool/index.tsx`'s edit-commit path (`handleCommit`, lines 138–187) — but its result is thrown away. The comment at `ReviseTool/index.tsx:144–156` says exactly why: **there is no backend endpoint to insert a second segment row**, so v1 always persists one long segment plus a passive "running long" badge (`ReviseTool/index.tsx:259–266`, `305–309`). This task builds that endpoint. Task 013 wires the frontend to call it instead of discarding the computed split.

## Contract decision (binding for this task)

Two shapes were possible for the new endpoint:
- **(A)** Accept a raw character offset and re-derive both halves server-side using the same midpoint/sentence-boundary heuristic — this duplicates `SegmentSplitter.ts`'s algorithm in Python, a second source of truth that can drift from the TypeScript one.
- **(B)** Accept the two pre-computed text strings directly (the frontend already ran `SegmentSplitter.ts`) and have the endpoint do pure persistence: row-truncate/reorder/insert, no split-point math.

**Use (B).** The backend becomes a persistence operation, not a re-implementation of the splitting heuristic. Do not add any sentence-boundary or midpoint logic to this endpoint.

## Current shape (verified)

- `app/domain/chapters/operations.py:464–502` — `_split_segment_at_offset(conn, chapter_id, segment_id, offset) -> (left_id, right_id)` is the existing, battle-tested split primitive, currently reachable **only** via Cast mode's range-assignment path (`_apply_range_assignment`, `operations.py:385–461`, called from `save_script_assignments`, `operations.py:162–267`, wired at `PUT /chapters/{chapter_id}/script-view/assignments`, `app/api/routers/chapters_production.py:46–58`). It:
  - reads the segment row (`text_content`, `segment_order`, `character_id`, `speaker_profile_name`),
  - computes `left_text = text[:offset]`, `right_text = text[offset:]`,
  - `UPDATE`s the original row's `text_content` to `left_text` and invalidates its audio (`audio_status='unprocessed'`, `audio_file_path=NULL`, `audio_generated_at=NULL`) — lines 481–484,
  - shifts every later row in the chapter: `UPDATE chapter_segments SET segment_order = segment_order + 1 WHERE chapter_id = ? AND segment_order > ?` — lines 485–488,
  - `INSERT`s a new row (`id = f"split_{uuid.uuid4().hex[:12]}"`) for `right_text` at `order + 1`, inheriting the original's `character_id`/`speaker_profile_name`, `audio_status='unprocessed'` — lines 489–500.
- **Locking pattern to reuse, not reinvent**: `save_script_assignments` (`operations.py:162–267`) wraps its whole read-modify-write sequence in `with _db_lock: with get_connection() as conn:` (lines 171–172; `_db_lock` is a module-level `threading.RLock()` from `app/db/core.py:10`, imported at `operations.py:7`). `_split_segment_at_offset`/`_apply_range_assignment` themselves take a bare `conn` and rely on the caller already holding `_db_lock` — they have no locking of their own. The new endpoint's domain function **must** acquire `_db_lock` + `get_connection()` around the entire read→shift→insert sequence, exactly like `save_script_assignments` does, so it cannot race with Cast's range-assignment writes (or the mutation-batching collector from task 001) touching the same chapter's `segment_order` column concurrently. `get_connection()` (`app/db/core.py:59–73`) takes no arguments, opens WAL-mode sqlite, and commits on the `with` block's clean exit (Python's `sqlite3.Connection.__exit__` behavior) — no separate `BEGIN IMMEDIATE` exists anywhere in this codebase; `_db_lock` is the only concurrency guard.
- `app/db/segments.py` has no insert/split function at all — only `update_segment(segment_id, broadcast=True, **updates)` (line 295, single-row `UPDATE`) and `update_segments_bulk(segment_ids, **updates)` (line 425, multi-row `UPDATE`). The only existing `INSERT INTO chapter_segments` outside `sync_chapter_segments` (a whole-chapter resync, unrelated) is inside `_split_segment_at_offset` itself.
- `app/db/segments.py:117` — `get_chapter_segments(chapter_id) -> List[Dict[str, Any]]` is the exact serializer already used by `GET /api/chapters/{chapter_id}/segments` (`app/api/routers/chapters.py:192–194`, `return JSONResponse({"segments": get_chapter_segments(chapter_id)})`). It queries `SELECT s.*, c.color ..., c.name ..., c.speaker_profile_name ... FROM chapter_segments s LEFT JOIN characters c ...` and converts rows to dicts directly (`app/db/segments.py:123–130`), so every field the frontend's `ChapterSegment` type needs (`id`, `chapter_id`, `segment_order`, `text_content`, `character_id`, `speaker_profile_name`, `audio_file_path`, `audio_status`, `audio_generated_at` — `frontend/src/types/index.ts:89–100`) comes through verbatim. **Reuse this function for the new endpoint's response** — do not hand-roll a second serializer.
- `app/api/routers/chapters.py:207–208` — the existing single-segment route `PUT /segments/{segment_id}` (`api_update_segment_route`) is the closest existing single-`{segment_id}`-scoped route to model the new one after: it reads the body via `Request` (`await request.form()` fallback pattern), validates against an explicit field whitelist (`SEGMENT_UPDATE_ALLOWED_FIELDS`, line 204), and dispatches the actual DB write via `anyio.to_thread.run_sync(...)` since the domain/db layer is synchronous. The new split route belongs in this same file, near this route — not in `chapters_production.py` (which only hosts the whole-chapter script-view/assignments routes).
- `app/api/routers/chapters_models.py` has no split-request Pydantic model yet. `ScriptRangeAssignment` (lines 60–66, `start_span_id`/`start_offset`/`end_span_id`/`end_offset`/`character_id`/`speaker_profile_name`) is the closest existing shape but is offset-based (option A) — do not reuse it as-is; this endpoint's body is two raw strings (option B), simple enough to read directly off `request.form()` the same way `api_update_segment_route` does, rather than adding a new Pydantic model.
- No existing test anywhere in `tests/` exercises `_split_segment_at_offset`, `_apply_range_assignment`, or `range_assignments` (confirmed via repo-wide grep) — there is no regression test to accidentally break here, only a new one to write.

## Target shape

1. **Refactor, don't duplicate** — extract the row-mutation mechanics that are common to both the offset-based caller (Cast) and the new text-based caller (Revise) out of `_split_segment_at_offset` (`operations.py:464–502`) into a small private helper:
   ```python
   def _split_segment_rows(conn, chapter_id: str, segment_id: str, seg_row, left_text: str, right_text: str) -> tuple[str, str]:
       """Truncates seg_row's row to left_text, shifts later rows' segment_order by +1,
       inserts a new row for right_text inheriting seg_row's character/speaker. Returns (left_id, right_id)."""
       # body = operations.py:475-502 today, minus the offset-derived left_text/right_text computation
   ```
   `_split_segment_at_offset` becomes a thin wrapper: compute `left_text = text[:offset]` / `right_text = text[offset:]` from the fetched row, then call `_split_segment_rows(...)`. `_apply_range_assignment`'s existing calls to `_split_segment_at_offset` are unaffected — this is a pure internal refactor, verify via existing behavior (no dedicated test exists today, but exercise Cast's range-assignment path manually or via `tests/api/test_api_chapters_script_view.py` if it covers range assignments).

2. **New public domain function** in `app/domain/chapters/operations.py`:
   ```python
   def split_segment_with_text(segment_id: str, first_text: str, second_text: str) -> dict | None:
       """Splits segment_id into two rows using pre-computed text halves (Revise mode).
       Returns the refreshed {"segments": [...]} payload for the segment's chapter,
       or None if segment_id doesn't exist."""
       with _db_lock:
           with get_connection() as conn:
               cursor = conn.cursor()
               cursor.execute(
                   "SELECT chapter_id, text_content, segment_order, character_id, speaker_profile_name "
                   "FROM chapter_segments WHERE id = ?", (segment_id,)
               )
               seg = cursor.fetchone()
               if not seg:
                   return None
               chapter_id = seg["chapter_id"]
               _split_segment_rows(conn, chapter_id, segment_id, seg, first_text, second_text)
               conn.commit()
           return {"segments": get_chapter_segments(chapter_id)}
   ```
   Note this takes **no `chapter_id` argument from the caller** — it derives it from the segment row itself, same as `update_segment(segment_id, ...)` in `app/db/segments.py` does. Import `get_chapter_segments` from `app.db.segments` at the top of `operations.py` (check it isn't already imported under a different alias before adding a new import line).

3. **New route** in `app/api/routers/chapters.py`, placed near the existing `PUT /segments/{segment_id}` route (line 207):
   ```python
   @router.post("/segments/{segment_id}/split")
   async def api_split_segment(segment_id: str, request: Request):
       form = await request.form()
       first_text = str(form.get("first_text") or "").strip()
       second_text = str(form.get("second_text") or "").strip()
       if not first_text or not second_text:
           return JSONResponse({"status": "error", "message": "Both halves must be non-empty"}, status_code=400)
       data = await anyio.to_thread.run_sync(split_segment_with_text, segment_id, first_text, second_text)
       if data is None:
           return JSONResponse({"status": "error", "message": "Segment not found"}, status_code=404)
       return JSONResponse(data)
   ```
   Before writing this, read `api_update_segment_route` (`chapters.py:207` onward) in full and mirror its exact not-found-handling / import style (`anyio`, `Request`, `JSONResponse`) rather than inventing a different error shape for this one route.

4. Response body is `{"segments": [...]}` — byte-for-byte the same shape `GET /api/chapters/{chapter_id}/segments` returns, so frontend can parse it with zero new type-mapping logic (task 013 relies on this).

## Steps

1. Write the failing backend test first (TDD, per `design-docs/engineering-rules/verification.md`): a new test (extend `tests/api/test_api_chapters.py` or add a sibling file next to it, matching the `TestClient`/`clean_db` fixture pattern already used in `tests/api/test_api_chapters_script_view.py:10–31`) that POSTs to `/api/segments/{segment_id}/split` with `first_text`/`second_text` form fields and asserts: the original segment's `text_content` becomes `first_text` with audio invalidated; a new segment appears immediately after in `segment_order` with `text_content == second_text`, inheriting `character_id`/`speaker_profile_name`, `audio_status == 'unprocessed'`; every segment previously after the original has its `segment_order` shifted by exactly +1; the response's `segments` list matches `GET /api/chapters/{chapter_id}/segments`'s shape. Confirm it fails (404/405, route doesn't exist yet).
2. Extract `_split_segment_rows` out of `_split_segment_at_offset` (`operations.py:464–502`) per step 1 above; re-run any existing test coverage touching Cast's range-assignment path to confirm the refactor is behavior-preserving.
3. Add `split_segment_with_text` to `operations.py`.
4. Add the `POST /segments/{segment_id}/split` route to `chapters.py`.
5. Add the 400 (empty text) and 404 (missing segment) test cases.
6. Run `./venv/bin/python -m pytest -q` (full suite — this touches shared `operations.py`/`chapters.py` code paths).
7. Update `design-docs/specs/api-conventions.md` (new route in the REST URL pattern table) and `design-docs/specs/text-processing.md` (the split stage now has a second entry point — Revise's explicit-text path, alongside Cast's offset-based range-assignment path) — bump each file's `spec_version` and add a `## Changelog` row, per this repo's binding rule that a behavior change updates the matching spec in the same commit.
8. Append a code-map changelog entry per the code-map convention (new route + new domain function).

## Acceptance criteria

- [ ] `POST /api/segments/{segment_id}/split` exists, accepts `first_text`/`second_text` form fields, returns `{"segments": [...]}` matching `GET /api/chapters/{chapter_id}/segments`'s exact shape.
- [ ] Original segment row is truncated to `first_text` in place (same `id`), audio invalidated (`audio_status='unprocessed'`, `audio_file_path=NULL`, `audio_generated_at=NULL`).
- [ ] A new row is inserted immediately after with `text_content == second_text`, inheriting `character_id`/`speaker_profile_name` from the original, `audio_status='unprocessed'`.
- [ ] Every subsequent segment's `segment_order` is shifted by exactly +1 — no gaps, no duplicate orders.
- [ ] 400 when either text is empty/whitespace-only after trim; 404 when `segment_id` doesn't exist.
- [ ] The whole read→shift→insert sequence is covered by `_db_lock` (verify by reading the code, not just testing happy-path — no separate/second lock is invented).
- [ ] `_split_segment_at_offset`'s existing behavior (Cast's range-assignment path) is unchanged after the `_split_segment_rows` extraction.
- [ ] Test written first, confirmed failing pre-implementation, then passing (R1 per `design-docs/specs/testing-standards.md`).
- [ ] `./venv/bin/python -m pytest -q` clean.
- [ ] `design-docs/specs/api-conventions.md` and `design-docs/specs/text-processing.md` updated with bumped `spec_version` + changelog row.
- [ ] Code-map changelog entry appended.

## Map links

Part H in `01-map.md` (`Revise: two-way split (backend)`). Roadmap item 012, Workload 5. Risk flag: quality-sensitive (per `02-roadmap.md`'s risk table — "new backend endpoint touching segment DB rows (insert/reorder/audio-invalidation)").

## Dependencies

None — this is the Workload 5 prerequisite. Task 013 depends on this.

## Out of scope

Do not implement any split-point/sentence-boundary logic server-side (that's the frontend's `SegmentSplitter.ts`, already built — see the contract decision above). Do not touch `ReviseTool/index.tsx` or any frontend code — that's task 013. Do not add a general-purpose "insert arbitrary segment" endpoint — this is a two-way split of one existing segment, nothing broader.
