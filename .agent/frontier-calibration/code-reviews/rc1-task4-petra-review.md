# Petra review — RC-1 Task 4: wire `align_segments` into `sync_chapter_segments`

Branch `implement/rc1-task4-wire-sync` @ `7ccd0f3a`. Empirical/bottom-up lens: every named risk
below was instantiated as a concrete input and **executed against the real code**, not hand-traced.
Ground truth loaded: code-map shard for `app/db/segments.py`, and the three actual call sites of
`sync_chapter_segments` (`app/db/chapters.py:54`, `:224`; `app/api/routers/chapters.py:259`).

## Verdict

**APPROVE the diff as scoped.** Task 4's differential-write logic is correct at its own layer:
matched runs (including multi-row fragment runs) are preserved in place with no DB write when
unchanged; `segment_order` updates only for shifted rows (I1a); shared-audio invalidation is
retained. All 5 `tests/db/test_chapters_sync.py` pass unmodified — the no-regression claim holds.

Two findings, neither a blocker for Task 4, both worth tracking (details below).

## Risk-instantiation gate — what I actually ran

### 1. Duplicate × fragment-run intersection (pure `align_segments`)
Input: existing `[A "The cat sat.", B "The ", C "cat ", D "sat.", E "The cat sat."]`, fresh
`["The cat sat."]×3`. Executed:
- Output: `preserved=[(0,['A']), (1,['B','C','D'])]`, `new=[2]`, `unmatched={'E'}`.
- Expected & correct: the multi-row fragment run `B+C+D` is preserved **despite** the whole-text
  being duplicate-sensitive (the 2026-07-19 correction working as intended). `E` (a whole duplicate
  at existing-position 4, beyond fresh length) is dropped — this is the deliberate I2 conservatism
  (duplicates only match by strict position, never by search), not a defect.
- **Gate result: confirms correctness; no new bug on this dimension.**

### 2. Chunk-group audio re-invalidation on READ (the owner's flagged finding) — CONFIRMED
Minimal DB repro: chapter `"Solo."`, assign `Solo.` `done` with its own canonical `<id>.wav`
(alone → canonical of its own group → valid). Then resync to `"New intro. Solo."`. Executed and
inspected DB directly vs. the read path:
- **DB / write-time:** `Solo.` = `done`, `audio_file_path` intact. The diff preserved the row.
- **`get_chapter_segments` / read-time:** `Solo.` → `unprocessed`, `audio_file_path=None`.
- Mechanism (verified in `app/db/segments.py:189-220` + `app/domain/chunk_groups.py:build_chunk_groups`):
  the new `New intro.` row and the preserved `Solo.` row both carry `profile_name=None`, so
  `build_chunk_groups` merges them into ONE group whose canonical name is `New intro.`'s id. `Solo.`'s
  `audio_file_path` (`<solo_id>.wav`) no longer equals `segment_to_canonical[solo_id]` → the
  `audio_status == 'done'` canonical check invalidates it on read.
- **This is a pre-existing, independent mechanism** (`get_chapter_segments` is untouched by the diff),
  and the invalidation is **behaviorally correct**: a merged group must be re-rendered as one WAV, so
  the old solo-only WAV is genuinely stale. The commit message's characterization ("the ROW is
  preserved, its RENDERED AUDIO can still be correctly re-invalidated") is accurate.
- **Consequence to state plainly:** Task 4's "preserve in place" guarantee is, for audio in the
  merged-group case, effectively cosmetic — but the thing the span_resync fix actually exists to save,
  the **manual character/profile assignment**, survives (id + character_id + speaker_profile_name are
  untouched). The audio re-render is orthogonal and correct. So the fix meets its real goal.
- Minor latent (pre-existing, not a regression): the stale `<solo_id>.wav` is left on disk (the
  preserved row isn't in `removed_files`, so the post-commit `cleanup_chapter_audio_files` at
  `segments.py:640-651` doesn't delete it); the separate on-open orphan GC collects it later.

### 3. Transaction posture across the three call sites
- `create_chapter` (`chapters.py:54`) and `update_chapter` (`chapters.py:224`) pass `conn`; sync does
  not commit; caller owns commit/rollback. Correct per the docstring contract.
- One pre-existing ordering note (NOT introduced by this diff — the cleanup block at `segments.py:640`
  is unchanged): `cleanup_chapter_audio_files` performs **disk deletes before the caller's commit**.
  On the success path this is fine (cleanup then commit). If `_sync_with_conn` raises, the exception
  propagates before cleanup runs and `update_chapter` rolls back cleanly — so there is no
  files-gone-but-DB-intact window in the current callers. Flagging only as a latent sharp edge, not a
  Task-4 action item.

## Finding worth tracking (out of Task-4 scope, but the record currently overclaims)

**`get_resync_preview` still uses old position-only preservation → user-facing preview lies.**
`app/domain/chapters/operations.py:298-307` does NOT call `align_segments`; it still compares by
position index. Executed repro: chapter `"Repeat. Middle. Repeat."` with `Middle.` assigned to
character "Hero", resync to `"Repeat. Repeat. Middle."`:
- `get_resync_preview` → `is_destructive=True, lost=1, affected=['Hero']`.
- Actual `sync_chapter_segments` → `Middle.` character_id **preserved** (align's unique-content search).
- So the preview warns the user of a data loss that will not happen.

This is legitimately **Task 005** (`tasks/005-wire-resync-preview.md`), so it is NOT a Task-4 defect —
the wiring is deliberately deferred. **However**, `app/db/segment_alignment.py:5-8` already asserts in
present tense that this "is the SINGLE shared alignment function for both `sync_chapter_segments` and
`get_resync_preview`" and that the drift "existed because those two callers duplicated the same rule
and drifted." That claim is currently false: the drift is live and reproducible until Task 5 lands.
Recommend either softening the docstring to future/intended tense until 005, or landing 005 before the
plan marks the shared-alignment invariant closed — so nobody reads the module and believes the drift
is already eliminated. (Bedrock-vs-design note: the design doc claims a shared invariant; the trace
shows one wired caller; running it proved the divergence is user-visible.)

## Confidence & falsifier
High confidence on all three gate results and both findings — each was executed, not reasoned. What
would change the audio-invalidation call: if the render model were one-WAV-per-segment rather than
one-per-chunk-group, the read-time invalidation would be a real data-loss bug rather than correct
staleness; it is not (`group_wav_path` / `build_script_entry_for_group` confirm the per-group model).

## Escalation
None required. No owner's-call category triggered; findings are correctly scoped and the diff is safe
to merge as Task 4.
