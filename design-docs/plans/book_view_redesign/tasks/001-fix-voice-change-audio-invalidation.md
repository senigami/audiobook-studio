# 001 — Invalidate and delete a segment's audio whenever its voice/speaker changes

- **Status:** done
- **Workload:** Real-app bug fixes
- **Severity / type:** major · logic
- **Effort:** M
- **Blocked by:** nothing
- **Blocks:** nothing

## Goal
When a segment's `character_id` or `speaker_profile_name` changes, its previously rendered audio must be both **invalidated** (`audio_status='unprocessed'`, `audio_file_path` and `audio_generated_at` cleared) **and** its audio file deleted from disk — so the stale clip is no longer playable — regardless of whether an `audio_status` value was included in the same update.

## Why this matters
This is bug **B1** in the audit (see [`../00-audit-report.md`](../00-audit-report.md) Track B table, and [`../../book_view_ia_proposal.md`](../../book_view_ia_proposal.md) §10 B1). The whole render/voice workflow the Book View redesign is built on assumes that changing who speaks a line throws away the old rendering. Today the stale WAV keeps playing, so the author hears the wrong voice and can't tell what still needs re-rendering. The invalidation *logic* already exists in the code — it is simply gated on the wrong condition.

## Context an executor needs
Specs / rules: [`design-docs/specs/testing-standards.md`](../../../design-docs/specs/testing-standards.md) (R1 revert-check — a bug-fix test must fail on the pre-fix code). Audio render format is **WAV** for chapter/segment audio (CLAUDE.md, audio-format conventions).

Current-state evidence — `app/db/segments.py`, `update_segment(...)` (starts ~line 260):

- The metadata/invalidation branch runs only when something relevant changed (~line 311-313):
  ```python
  if changed:
      keys = updates.keys()
      if "character_id" in keys or "speaker_profile_name" in keys or "text_content" in keys or ("audio_status" in keys and updates["audio_status"] == 'unprocessed'):
  ```
  So the branch *is* entered on a `character_id` / `speaker_profile_name` change — good.
- Inside it, the per-segment audio reset is gated again (~line 324):
  ```python
  if updates.get("audio_status") != "done":
      cursor.execute(
          "UPDATE chapter_segments SET audio_status = 'unprocessed', audio_file_path = NULL, audio_generated_at = NULL WHERE id = ?",
          (segment_id,))
  ```
  This `!= "done"` is True for a pure speaker-change (no `audio_status` key), so the DB row *does* get reset — verify this with the test; the visible symptom (audio still playable) points at the **file-deletion** branch.
- The file-deletion branch is the real culprit — `cleanup_chapter_audio_files(...)` call (~line 336-359). It only ever lists the segment's own file when `updates.get("audio_status") != "done"`:
  ```python
  cleanup_chapter_audio_files(
      cleanup_project_id, cleanup_chapter_id,
      [segment_id] if updates.get("audio_status") != "done" else [],
      explicit_files=explicit_files or None,
  )
  ```
  and `explicit_files` (the old/stale path) is only populated when `stale_audio_path` was captured. `stale_audio_path` is read (~line 270-281) under the same condition set, so on a speaker-change it *should* be present — confirm with the test whether the stale file is actually removed on disk.
- Caller path: `app/domain/chapters/operations.py` `save_script_assignments(...)` does a bulk `UPDATE chapter_segments` (~line 194-206) that flips `audio_status` to `'unprocessed'` in SQL **directly**, bypassing `update_segment(...)` entirely — so the file-cleanup code never runs for script-view assignments. This is the most likely place the regression lives: the assignment path mutates rows in bulk and never deletes files. Confirm by reading lines 194-206.

The fix must make the disk file deletion happen for **any** `character_id` / `speaker_profile_name` change, independent of the `audio_status` key, **and** cover the `save_script_assignments` bulk path (which currently never deletes files).

## Target shape / contract
- Changing a segment's `character_id` and/or `speaker_profile_name` (via `update_segment`, `update_segments_bulk`, OR `save_script_assignments`) results in:
  - `audio_status = 'unprocessed'`
  - `audio_file_path = NULL`, `audio_generated_at = NULL`
  - the previously-referenced audio file removed from disk (no longer servable/playable)
- This holds whether or not the caller passed an `audio_status` field.
- A no-op assignment (same character + same profile) need not delete audio (matches the existing SQL `CASE` guard in `save_script_assignments`).
- Chapter-level rollups (`chapters.audio_status` etc.) continue to be invalidated as today.

## Steps
1. Read `app/db/segments.py` `update_segment` (~260-388) and `update_segments_bulk` (~390+), and `app/domain/chapters/operations.py` `save_script_assignments` (~162-208). Determine empirically (via the failing test in step 2) which path leaves the on-disk file: most likely `save_script_assignments`'s direct bulk SQL never invokes file cleanup.
2. **Write the revert-checked test first** (TDD). Backend pytest, in a segment-focused test file under `tests/` — prefer extending an existing `tests/db/test_segments*.py` or `tests/.../test_*assignment*` if present (search `tests/` for the closest existing home; create `tests/db/test_segment_voice_invalidation.py` only if none fits). The test must:
   - Create a chapter + segment, write a real audio file on disk at the segment's `audio_file_path`, set `audio_status='done'`.
   - Change the segment's `speaker_profile_name` (and a second case: `character_id`) through the **same code path the app uses** — call `save_script_assignments(...)` for the script-view case and `update_segment(...)` for the direct case. Do **not** mock `update_segment` / `save_script_assignments` (R2: never mock the unit under test).
   - Assert: row `audio_status == 'unprocessed'`, `audio_file_path is None`, `audio_generated_at is None`, **and** `os.path.exists(old_path) is False`.
   - Filesystem is a legitimate boundary, but exercise the real cleanup function; only the storage root is the temp dir provided by `conftest.py`.
3. Run the test, confirm it is **red** on current code, and capture which assertion fails (file-still-exists vs. row-not-reset). This tells you the precise gate to fix.
4. Implement the minimal fix:
   - If the gap is in `save_script_assignments`: after the bulk `UPDATE`, collect the segment ids whose assignment actually changed and route their file cleanup through the shared helper (call `update_segment`'s cleanup helper / `cleanup_chapter_audio_files`), or perform the same deletion the single-segment path does. Keep it inside the existing `_db_lock`/connection scope where consistent with the surrounding code; broadcast/cleanup happens outside the lock as in `update_segment`.
   - If the gap is in `update_segment`: decouple the file-deletion branch from `audio_status`. Delete the stale file whenever `"character_id" in updates or "speaker_profile_name" in updates` and the value actually changed, independent of whether `audio_status` is in `updates`.
   - Do **not** branch on engine IDs (modular_architecture rule). Reuse existing helpers (`cleanup_chapter_audio_files`); do not hand-roll path math — use the path-safety helpers already used by the cleanup function.
5. Re-run the test → green. Then **revert-check**: `git stash` the source fix (leave the test), run the test, confirm red for the right reason, `git stash pop` to restore.
6. Run the full backend suite for regressions: `./venv/bin/python -m pytest -q` and `ruff check .`.

## Acceptance criteria
- [ ] Changing a segment's `speaker_profile_name` via `save_script_assignments` clears the DB audio fields **and deletes the on-disk audio file**.
- [ ] Changing a segment's `character_id` does the same.
- [ ] Behavior is independent of whether `audio_status` was in the update payload.
- [ ] A no-op (same character + same profile) assignment does not delete audio.
- [ ] New test does not mock `update_segment` / `save_script_assignments` (R2); filesystem/storage-root is the only boundary.
- [ ] **Revert-check: test fails on pre-fix code** (fix stashed → red → restored → green), and the failing assertion was recorded.
- [ ] `./venv/bin/python -m pytest -q` green; `ruff check .` clean.

## Out of scope
- Re-rendering the segment after invalidation (the orchestrator handles that on the next render request).
- The mock/redesign UI (Track A tasks 005-013).
- B2/B3/B4 (tasks 002/004/003).
- Chapter-level M4A/bundle cleanup beyond what the existing cleanup helper already does.
