# RC-1 Task 5 — Code Review (Esther, structural/top-down panelist)

- **Branch/commit:** `implement/rc1-task5-wire-preview` @ `8d5b7e45`
- **Change:** wire `align_segments` into `get_resync_preview` (`app/domain/chapters/operations.py`), replacing the duplicated position-only equality check that produced false "destructive"/loss warnings.
- **Verdict: APPROVE.** The change correctly closes the assignment-loss drift Tamsin's Task 4 review found live. One minor residual (a *different* false-warning channel) noted, non-blocking.
- **Confidence: high.** Falsifier: if the removed-row set in the real sync were ever derived from anything other than `align_segments`' output, parity would break — verified it is not (see Finding 1).

## Framed question
Does the preview now predict exactly what a real `sync_chapter_segments` call does re: assignment loss/preservation, and are the committed tests real (exist + pass + guard the regression)?

## Ground truth loaded (map ritual)
- Code-map shard for `app/domain/chapters/operations.py` (`.agent/code-map/tools/lookup.sh`): confirms `get_resync_preview` is an export of the chapter-orchestration module; `calls` already records `app/db/segments.py#sync_chapter_segments` as a sibling in this module's dependency set.
- Blast radius: `get_resync_preview` is a read-only leaf (preview route only; `called_by: []` in the map, no downstream writers). The single shared dependency is `app/db/segment_alignment.py#align_segments`, which its own module docstring designates as the one place both callers must route through. This change is precisely the map-sanctioned move: collapse two duplicated matchers onto the shared function.

## Finding 1 — PARITY: verified, structurally exact (the load-bearing claim)
Both sides now define "a lost assignment" identically, from the *same* `align_segments` call:
- **Preview** (`operations.py`): `lost = { rid in alignment.unmatched_existing_ids where row.character_id }`.
- **Real sync** (`app/db/segments.py`): deletes exactly `alignment.unmatched_existing_ids` (committed HEAD: `unmatched_ids = alignment.unmatched_existing_ids` → `DELETE ... WHERE id`; preserved rows keep `character_id` untouched in place). The removed set = unmatched set, from one shared pure function. Preservation is by definition the complement.

This is the crux: parity is not coincidental agreement, it is the *same* computation feeding both. Runtime confirmation (executed, not hand-traced), preview-prediction vs real-sync outcome on the same input:

| scenario | preview lost / destructive | REAL sync lost | verdict |
|---|---|---|---|
| reorder of a unique sentence (`Repeat. Middle. Repeat.` → `Repeat. Repeat. Middle.`) | 0 / False | 0 | match — the exact bug Tamsin reproduced, now fixed |
| genuine edit (`Second sentence.` → `Completely different.`) | 1 / True | 1 | match |
| count shrink, assigned row survives (`Alpha. Beta. Gamma. Delta.` → `Alpha. Beta. Gamma.`) | 0 / **True** | 0 | lost-count matches; see Finding 3 |

## Finding 2 — PROCESS COMPLIANCE: pass
- `git diff --stat HEAD~1 -- tests/`: `tests/domain/test_chapter_resync_preview.py` added, +76. File exists.
- Executed: `pytest tests/domain/test_chapter_resync_preview.py` → **3 passed**.
- **Revert-check (R1):** restored pre-fix `operations.py`, reran the suite → `test_preview_does_not_report_destructive_for_a_reorder_the_real_sync_actually_preserves` **FAILS** on old code, passes on new. It is a genuine regression test that goes red for the right reason. (The other two — genuine-loss and pure-read — pass under both old and new algorithms; they are useful guards but are not fix-dependent. Only one of the three truly pins the drift. Acceptable, but worth knowing the regression is guarded by exactly one test.)
- The in-test parity assertion (calls the real `sync_chapter_segments` and checks the assigned row survives) is the right shape — it tests observable DB state, mocks nothing (R2 clean).

## Finding 3 — RESIDUAL (minor, non-blocking): `is_destructive` still fires on pure count-shrink
`is_destructive = lost_assignments_count > 0 or (total_new < total_old and total_old > 0)`.
The second clause is untouched by this task and is a *separate* false-warning channel from the one closed: a save that deletes only unassigned segments (or merges fragments) shows `lost=0` but `is_destructive=True` (S3 above; also confirmed on a merge/shrink where the assigned row is fully preserved). This is defensible — dropping a segment/its audio is arguably "destructive" in a broader sense — so I am **not** calling it a bug. But note: the task's framing was "preview cannot warn about a destructive resync the real save preserves," and this clause can still do exactly that for the assignment-centric reading of "destructive." Recommend either documenting the two-pronged semantics (assignment loss OR segment-count reduction) at the return site, or gating the shrink clause if the UX intent is strictly assignment-loss. Cheap to fix if wrong; owner/UX call, not mine.

## Finding 4 — `preserved_assignments_count` granularity: fine
Now counts one-per-fresh-sentence (a fragment run counts once if any row carries an assignment), documented inline. Display-only; does not feed `is_destructive`. Reasonable and correctly scoped.

## Environment flag (out of scope for the diff, but the orchestrator should see it)
The working tree was **not** clean during this review despite the session-start snapshot saying so. Uncommitted changes appeared mid-review in `app/db/segments.py` (a Task-6 variant: `sync_chapter_segments` returns `{"success", "lost_assignments_count"}` instead of `True`), `app/db/chapters.py`, `app/api/routers/chapters.py`, plus an untracked `tests/domain/test_fable_rc1_task5_parity_probe.py`. These are **not** part of commit `8d5b7e45` and are unrelated to Task 5. Consistent with a concurrent session doing Task 6. I left them **entirely untouched** (no stash — per this repo's shared-checkout lesson, stash has lost real work here before). Parity conclusion is unaffected: I verified both the committed (HEAD) sync and the working-tree Task-6 sync derive their removed-row set from the identical `align_segments` call (`preserved_ids`/`unmatched_existing_ids` are the same set), so my runtime harness — which ran against the working tree — reports the same parity the committed pairing yields.

## Note on ensembling
This is a single un-converged structural pass (Esther only; no Tamsin pass, no neutral judge in this dispatch). It did not get the reliability convergence buys — treat it as one panelist's view, not an ensembled verdict.
