# RC-1 Task 5 code review — wire `align_segments` into `get_resync_preview`

- Reviewer: Petra (empirical / bottom-up panelist)
- Commit: `8d5b7e45` on `implement/rc1-task5-wire-preview`
- Date: 2026-07-19
- Files: `app/domain/chapters/operations.py::get_resync_preview` (lines 270-327), `tests/domain/test_chapter_resync_preview.py`, cross-checked against `app/db/segments.py::sync_chapter_segments` and `app/db/segment_alignment.py::align_segments`

## Verdict: APPROVE (ship). One non-blocking doc-drift fix and one process gap noted.

The change does exactly what it claims. Both callers now feed the *same* input to the *same*
function — `align_segments(existing_rows, split_into_sentences(new_text))` — so structural drift
between preview and real sync is eliminated at the source, not patched at the caller. My original
Task-4 finding (preview falsely reporting a reorder as destructive) is closed, and I verified parity
by execution, not by reading.

## Gate 1 — risk-instantiation (executed, not hand-traced)

Built 6 concrete chapters, assigned characters, ran `get_resync_preview` then the real
`sync_chapter_segments` against the *same* new text, and compared the preview's predicted loss to the
assignments that actually survived on disk:

| scenario | preview lost / destructive | real sync lost | parity |
|---|---|---|---|
| reorder unique sentence (the Task-4 bug) | 0 / False | 0 of 1 | OK |
| sentence genuinely edited | 1 / True | 1 of 1 | OK |
| sentence deleted | 1 / True | 1 of 1 | OK |
| multi-assignment full reorder | 0 / False | 0 of 3 | OK |
| partial loss (1 of 3 dropped) | 1 / True | 1 of 3 | OK |
| duplicate multi-row reorder | 0 / False | 0 of 1 | OK |

Every case: preview's `lost_assignments_count` equals the count of assignments the real sync actually
destroyed. No false positives, no false negatives across reorder / edit / delete / duplicate paths.

## Gate 3 — parity claim (directly verified)

Parity is structurally sound, not just empirically lucky:
- `sync_chapter_segments` deletes exactly `alignment.unmatched_existing_ids` (segments.py:532, 589-593).
- `get_resync_preview` counts loss from exactly `alignment.unmatched_existing_ids` filtered to rows
  carrying a `character_id` (operations.py:312-318).
Same alignment object, same unmatched set → an assignment is "lost" in the preview iff its row is
deleted by the sync. The one deliberate asymmetry is granularity, and it's correct: `preserved_count`
is counted per fresh-sentence (a multi-row fragment run counts once, operations.py:307-310), which is
a display metric, not a correctness claim, and does not feed `is_destructive`.

## Gate 2 — process compliance

- Committed tests exist and pass: `3 passed` (`tests/domain/test_chapter_resync_preview.py`).
- Broader suite green: `tests/domain` + `tests/db` → `500 passed`.
- Revert-check (R1) confirmed by hand: restored the pre-fix `get_resync_preview` from `8d5b7e45^`,
  reran — the reorder test fails with exactly `assert 1 == 0` (predicts 1 lost where real sync
  preserves 0), the other two still pass. Restored the fix; `3 passed` again; working tree left
  byte-identical to the commit (`git diff 8d5b7e45 -- operations.py` empty). The bug-fix test
  genuinely catches the bug.

## Findings

### F1 (non-blocking, doc drift — ironic given the task) — stale STATUS block in `segment_alignment.py`
`app/db/segment_alignment.py` lines 11-17 still read: *"only `sync_chapter_segments` is wired to this
module so far (Task 4). `get_resync_preview` still uses the old position-only rule (Task 5, not yet
landed) -- until it lands, the preview can report a false 'destructive'/loss warning..."* That is now
false — Task 5 landed in this very commit. The whole point of Task 5 was to kill preview/sync drift;
leaving a docstring that says the drift is still live is the documentation-layer version of the same
defect. Fix: update that STATUS paragraph to record both callers are wired as of `8d5b7e45`.

### F2 (non-blocking, process) — no code-map changelog-queue entry
`.agent/code-map/queue/` has no entry for this change, though `get_resync_preview` is mapped source
and the same-change rule (CLAUDE.md, map-code) makes the queue entry part of "done." Append one.

### Out of scope (flagged, not acted on)
The working tree at review time carried unrelated uncommitted edits to `app/db/segments.py`,
`app/db/chapters.py`, `app/api/routers/chapters.py` and two `tests/domain/_tmp_parity.py` /
`test_tmp_parity.py` scratch files — none authored by this review and not part of commit `8d5b7e45`.
Likely a concurrent session. Left untouched. Whoever owns them should clean up the `_tmp_parity`
scratch files before they get committed by accident.

## Confidence
High on the correctness/parity verdict — it's execution-backed on both the happy path and the
loss/edit/delete paths, and the structural argument (same alignment set drives both) makes the parity
robust to inputs I didn't enumerate. Falsifier that would change the call: a code path where preview
and sync receive *different* `existing_rows` ordering or a different sentence split for the same
input — I confirmed both read `ORDER BY segment_order ASC` and both call `split_into_sentences`, so I
don't believe one exists, but that's the thing that would break parity if it did.

No escalation warranted — this is a confident, reversible, in-scope call.
