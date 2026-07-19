# BR-2 reference — blast radius of giving sub-sentence spans a durable structural anchor (the RC-1 fix)

## The question restated

The RC-1 fix replaces `sync_chapter_segments`'s positional whole-sentence-equality
preservation rule with content-anchored preservation of sub-sentence fragment runs (the
built design: a shared `align_segments` doing monotonic run-matching, consumed by both the
real sync and the preview — see `design-docs/plans/active/span_resync_preservation_fix/01-map.md`).
Assess the blast radius of that schema/logic change: what breaks in `get_resync_preview`
(which must stay consistent with the new preservation logic), the render-invalidation path,
migration of existing rows, and the create/update/explicit-resync entry points that all
share the rebuild.

## What I examined

- `app/db/segments.py:492-599` — `sync_chapter_segments` (the function being changed):
  preservation loop :521-539, shared-audio invalidation :541-552, delete-all :555,
  9-column INSERT :566-569, self-committing vs conn-owned branches :573-579,
  post-transaction file cleanup :581-597.
- `app/domain/chapters/operations.py:270-316` — `get_resync_preview`: duplicated equality
  check at :298-299, `lost_assignments_count` :304-307, `is_destructive` :315.
- `app/db/chapters.py:197-234` — `update_chapter`: conn-owned sync call :224, rollback on
  sync failure :225-232, chapter-level `audio_status='unprocessed'` stamp :212-215.
- `app/db/chapters.py:41-66` — `create_chapter` (sync call at :54).
- `app/api/routers/chapters.py:254-260` — explicit resync endpoint `api_sync_segments`
  (self-committing posture, no conn).
- `app/api/routers/chapters_production.py:35-43` — preview endpoint
  (`POST /chapters/{id}/source-text/preview`).
- `app/domain/chapters/helpers.py:116-139` — `_build_base_revision_id` (hashes segment id,
  order, text, character, profile; audio_status deliberately excluded).
- `app/db/core.py:243-264` — `chapter_segments` schema (18 columns);
  `add_column_if_missing` migrations at :323-340.
- `tests/db/test_chapters_sync.py:57-233` — the four sync behavior tests, esp.
  `:94-133` (reordered-duplicates) and `:135`/`:195` (trailing-preservation, shared-audio
  invalidation).
- `frontend/src/pages/ChapterEditor/components/ResyncPreviewModal.tsx:7-12, 67-168` and
  `frontend/src/api/index.ts:245-250` — consumers of the preview response shape.
- Caller sweep: `grep -rn "sync_chapter_segments\|get_resync_preview"` across `app/`,
  `frontend/src/`, `tests/` (full result summarized below).
- `.agent/frontier-calibration/references/RC-1.md` and the fix plan's parts/invariants
  (`01-map.md` P1-P6, I1-I7).

## Blast-radius findings

### 1. Entry points sharing the rebuild — three, in two transaction postures

Production callers of `sync_chapter_segments` are exactly three:

- `create_chapter` — `app/db/chapters.py:54`, **conn-owned** (caller commits).
- `update_chapter` — `app/db/chapters.py:224`, **conn-owned**, inside the same transaction
  as the chapter-row UPDATE, with an explicit `conn.rollback()` on sync exception
  (:225-232). Any new exception surface in the alignment logic is *contained* here — the
  whole text save rolls back and returns False — but that means an alignment bug silently
  turns "save" into a no-op for the user.
- Explicit resync route — `app/api/routers/chapters.py:259`, called via
  `anyio.to_thread.run_sync` with **no conn** → the function's self-committing branch
  (`segments.py:576-579`, under `_db_lock`).

Blast radius: the new alignment must behave identically under both postures (plan invariant
I4). If the fix changes the return value (e.g. to surface a loss count), the route at :259
currently ignores the return and replies `{"status": "ok"}` — additive return data is safe;
a changed signature is not (positional call via `run_sync(sync_chapter_segments, chapter_id, text)`).
`create_chapter` is behaviorally inert for the fix itself (no prior rows to preserve) but
still exercises the new code on every chapter creation — a crash there blocks book import.

### 2. `get_resync_preview` — the mandatory co-change

The preview duplicates the exact index+equality rule at `operations.py:298-299`. If the sync
gains fragment-run matching and the preview keeps the old rule, the warning modal
(`ResyncPreviewModal.tsx`) reports losses that will no longer happen — `is_destructive`
(:315) goes true, the modal shows the red "Confirm Resync" path (`ResyncPreviewModal.tsx:67-68,
165-168`) for a resync that is now safe. That's the drift the plan's P1 ("one shared
function") exists to prevent; the preview change is not optional polish, it is part of the
fix's correctness surface.

Consumers of the preview *response shape* (`total_segments_before/after`,
`preserved_assignments_count`, `lost_assignments_count`, `affected_character_names`,
`is_destructive`) are typed in `frontend/src/api/index.ts:245-250` and rendered in
`ResyncPreviewModal.tsx`. The fix changes the **values** (fewer losses) but must not change
the **shape** — no frontend change is required if the six fields keep their names/types.

One semantic wrinkle: with run-matching, a preserved *run* of N fragment rows corresponds to
1 fresh sentence, so `preserved_assignments_count` (today: preserved rows with a
character_id, `operations.py:301-302`) needs a definition decision — count rows or count
sentences. Either is representable in the current shape, but before/after totals
(`total_segments_before=rows`, `total_segments_after=len(sentences)`) already compare
different units once fragments survive; the modal's "N segments, from M" copy
(`ResyncPreviewModal.tsx:102-103`) becomes misleading (after-count undercounts surviving
rows). Cosmetic, but a real drift-from-reality item the scenario asks about.

### 3. Render-invalidation / audio path

Audio identity is coupled to segment identity in three places inside the current sync:

- **New-id ⇒ invalidation:** rows not preserved get `audio_status='unprocessed'` and null
  paths (`segments.py:536-538` else-branch) and their files are physically deleted via
  `cleanup_chapter_audio_files` (`segments.py:581-592`). Preserving fragment rows in place
  means their WAVs are *no longer deleted* on save — the fix's whole point — but the
  cleanup call still receives `removed_rows = existing - preserved_ids` (:581-583).
  `align_segments` must feed `preserved_ids` correctly for every row of a matched run, or a
  half-matched run deletes audio for rows whose DB entries survive (dangling
  `audio_file_path` → 404s in the player and in assembly).
- **Shared-file invalidation (`segments.py:541-552`):** preserved rows whose
  `audio_file_path` is shared with any removed row get force-invalidated. Fragment rows
  created by `_split_segment_at_offset` can share a source sentence's audio lineage; the new
  alignment must keep this pass or reintroduce the stale-shared-audio bug that
  `tests/db/test_chapters_sync.py:195-233` protects.
- **Chapter-level stamp:** `update_chapter` unconditionally sets the *chapter's*
  `audio_status='unprocessed'` on any text update (`chapters.py:212-215`) — independent of
  segment preservation. So even a perfect no-loss alignment still invalidates the chapter's
  assembled output on every save. That is correct (text changed) and out of the fix's scope,
  but graders should not count it as a blast-radius regression.
- **Downstream renders:** synthesis/assembly tasks key work off segment ids and
  `audio_status` (rows read via `get_chapter_segments`). Preserving ids of `done` fragment
  rows means a post-save render now legitimately *skips* them — a behavior change from
  today's re-render-everything, and exactly the intended one. Risk case: a preserved run
  whose sentence text is unchanged but whose `segment_order` shifted (plan I1a) — order is
  rewritten, audio kept; assembly must order by `segment_order`, which it reads fresh, so
  this is safe as long as the sync rewrites order for preserved rows (it must — see I1a).

### 4. Optimistic-concurrency hash (`_build_base_revision_id`)

`helpers.py:127-136` hashes each row's id, order, text, character, profile. Today every save
mints new ids → every open editor's `base_revision_id` goes stale → `RevisionMismatch`
(surfaced as "updated by someone else", `chapters_production.py:~75`). The fix *reduces*
this churn (preserved ids), which is a behavioral improvement, not a break — but a
half-fix that "preserves content with new ids" fails this invariant invisibly (plan P6).
Order changes for preserved rows still legitimately move the hash. No code change needed in
`helpers.py`; it is a *verification* surface, not an edit surface.

### 5. Migration of existing rows

The fix's Task-1 design is **schema-free** (match by content, no stored anchors), so there
is no row migration at all: existing fragment rows (`split_<uuid12>` ids from
`operations.py:526`) are matched by concatenation-equality on their existing
`text_content`. That works retroactively for any DB — fragments created before the fix are
preserved by the first post-fix save, provided the manuscript sentence they came from is
unchanged. Only if Task 2's fallback (stored parent/offset columns) is needed does
migration enter: then it's an additive nullable column via `add_column_if_missing`
(`app/db/core.py:316-340` pattern), backfillable lazily, and per plan I7 not a versioned
contract (internal table). Pre-existing rows *already* misaligned/lost by past saves are
unrecoverable either way — no migration can restore assignments the old sync already nulled.

Adjacent, easy-to-miss migration-shaped hazard: the sync's INSERT writes only 9 of the
table's 18 columns (`segments.py:566-569` vs schema `core.py:243-264`), silently nulling
`sanitized_text`, `performance_data`, `speaker_confidence/basis/evidence`, `review_reasons`
and resetting `needs_review/locked/ai_suggested`. Preserve-in-place accidentally *fixes*
this for preserved rows (they're never re-inserted — if the implementation actually skips
the DELETE-all at :555 for preserved rows; if it keeps delete-all-and-reinsert, it must
widen the INSERT or it keeps destroying these columns even for "preserved" rows — plan I5).
**This is the single most likely silent-regression point: the current code deletes ALL rows
(:555) then re-inserts; "preserve" implemented as "re-insert with old id" preserves the 9
copied fields but still nulls the other 9.**

### 6. Test blast radius

Direct behavioral tests of the sync: `tests/db/test_chapters_sync.py` (4 tests).
- `:94-133` reordered-duplicates — its "Middle. → unprocessed" assertions (:131-133) encode
  the pre-fix positional bug and MUST be updated (Middle preserved at its new position);
  its "Repeat." duplicate-disambiguation assertions (:126-130) must be kept (plan I2).
- `:135` trailing-segment preservation and `:195` shared-audio invalidation must keep
  passing unchanged.
- `tests/utils/test_segmentation_regression.py` exercises sync output shape.

Indirect: ~60+ call sites across `tests/api/test_api_generation.py`, `test_api_queue.py`,
`tests/db/*`, `tests/orchestration/*` use `sync_chapter_segments` as a *fixture* (fresh
chapters, no pre-existing fragments) — they exercise the new code path but should be
behavior-neutral; a crash or ordering bug in `align_segments` fails them en masse, which is
actually good coverage.

Frontend: `ReviseTool/index.tsx:146` explicitly notes whole-chapter resync is out of its
scope — no frontend logic branches on the preservation rule; only the preview modal's
displayed numbers change.

### 7. What does NOT move

- `_split_segment_at_offset` / `_apply_range_assignment` (fragment creation) — untouched
  (plan P4).
- `compact_script_view` (merge, `operations.py:319`) — unaffected under the schema-free
  design (no stored anchors to dangle; plan I6).
- The `chapter_segments` schema, DB indexes, and the `frontend` API contract shapes.
- Chapter-level audio invalidation on save (`chapters.py:212-215`) — intentionally kept.

## Blast-radius summary (ranked by breakage likelihood)

1. **Preview drift** — `operations.py:298-299` must consume the same `align_segments` as
   the sync in the same change, or the warning modal lies (in the newly dangerous
   direction: over-warning at first, under-warning if logic later diverges the other way).
2. **9-column INSERT interaction** — if "preserve" is implemented as delete-all +
   re-insert-with-old-id (`segments.py:555, 566-569`), ids/audio survive but 9 metadata
   columns are still nulled; true in-place preservation (skip delete for preserved rows) is
   required to honor I1 fully.
3. **`preserved_ids` correctness feeding file cleanup** (`segments.py:541-552, 581-592`) —
   a run half-marked preserved deletes audio files that DB rows still reference.
4. **Duplicate-sentence cross-matching** — run-matching plus content-matching must keep
   position authoritative among equal candidates or `test_chapters_sync.py:94` regresses
   (wrong audio attached to wrong duplicate).
5. **Transaction-posture / signature compatibility** at the three call sites
   (`chapters.py:54`, `chapters.py:224` with rollback-on-error, `routers/chapters.py:259`
   positional threadpool call).
6. **Preview-count semantics** (rows vs sentences) — display-level only, but a spec
   decision (`design-docs/specs/data-model.md` / `text-processing.md` should record it).
7. **Migration: none needed** for the schema-free design; old fragment rows are matched
   retroactively by content; already-lost assignments are gone regardless.

## Confidence + what would change it

**High (~90%)** on the enumeration of affected surfaces — the caller set is closed (grep
sweep), the preview/sync duplication and the audio-coupling passes were read line-by-line,
and the plan doc's invariants cross-agree with what the code shows. Moderate (~75%) on
ranking item 2 as the top silent-regression risk — that depends on how Task 4 implements
"preserve" (in-place vs re-insert), which is an implementation choice not yet written.

Would change it:
- Discovery of another production caller of `sync_chapter_segments` outside the three found
  (the grep covered `app/` fully; a dynamic/getattr call would have been missed).
- Evidence that any render/assembly path caches segment ids across a save (I found none —
  tasks re-read rows), which would add a stale-id surface to item 3.
- A decision to go to Task 2 (stored anchor columns), which activates the
  migration/`compact_script_view`-dangling-anchor surfaces currently marked "does not move."

## Not determinable from the evidence here

- Whether assembly/bake tasks tolerate a mid-render sync that preserves ids but rewrites
  `segment_order` (concurrent save-during-render); the orchestration-side locking around
  chapter renders was out of scope.
- The exact rows-vs-sentences choice for `preserved_assignments_count` (owner/product call).
- Whether `sanitized_text` and `performance_data` nulling (item 2) has *user-visible*
  symptoms today — I traced the columns' write path, not every reader; the lexicon/analysis
  readers were not swept.
