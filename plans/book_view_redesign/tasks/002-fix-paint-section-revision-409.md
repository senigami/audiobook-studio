# 002 — Stop consecutive sentence assignments in one section from 409-ing

- **Status:** done
- **Workload:** Real-app bug fixes
- **Severity / type:** major · concurrency
- **Effort:** M
- **Blocked by:** nothing
- **Blocks:** nothing

## Goal
Two (or more) sequential single-sentence reassignments inside the **same** section/chapter must both succeed. Reassigning one sentence currently changes the chapter's computed `base_revision_id`, so the next assignment — sent with the now-stale revision id — fails the `RevisionMismatch` guard and returns HTTP 409 ("changed by somebody else"), even though the same user made both edits back-to-back.

## Why this matters
This is bug **B2** in the audit ([`../00-audit-report.md`](../00-audit-report.md) Track B; [`../../book_view_ia_proposal.md`](../../book_view_ia_proposal.md) §10 B2). The redesign's core gesture is painting voices across sentences; if every second paint in a section errors out, the workflow is unusable. The guard is doing its job (optimistic-concurrency protection) but the client never adopts the new revision id the server hands back, so it self-collides.

## Context an executor needs
Specs / rules: [`docs/specs/testing-standards.md`](../../../docs/specs/testing-standards.md) — R1 (revert-check), R2 (mock boundaries only). Frontend live-event/contract rules don't apply here (this is a request/response path, not a socket frame).

Current-state evidence:

- `app/domain/chapters/operations.py` `save_script_assignments(...)` (~162-208). The guard, lines 179-181:
  ```python
  current_base_revision_id = helpers._build_base_revision_id(chapter_row, current_segments)
  if base_revision_id and base_revision_id != current_base_revision_id:
      raise helpers.RevisionMismatch(current_base_revision_id, base_revision_id)
  ```
- `helpers._build_base_revision_id(...)` (`app/domain/chapters/helpers.py:116-134`) hashes every segment's `character_id`, `speaker_profile_name`, `audio_status`, text, etc. So **any** assignment changes the hash → the revision id changes after each paint.
- `helpers._aggregate_status(...)` (`app/domain/chapters/helpers.py:59-73`) recomputes a section/aggregate status from its members; the proposal §10 notes the section's aggregate status feeding the revision is part of why a single paint shifts the section's identity.
- The response **already returns the fresh revision id**: `save_script_assignments` returns `get_script_view_payload(chapter_id)` (line 208), whose payload includes `"base_revision_id"` (operations.py:125; `ScriptViewResponse.base_revision_id`, `app/api/routers/chapters_models.py:48`). So the server side already gives the client what it needs.
- The client throws it away. `frontend/src/hooks/chapter/useChapterAssignments.ts` `handleScriptAssign` (lines 19-62): it sends `base_revision_id: scriptViewData.base_revision_id`, receives `result`, and calls `setScriptViewData(result)` (line 51). It also calls `handleScriptAssignRange` (lines 64-96) the same way. **Whether `setScriptViewData(result)` actually updates `scriptViewData.base_revision_id` in time for the next call is the crux** — `scriptViewData` is captured in the `useCallback` closure (deps include `scriptViewData`), so the closure used by a rapid second click may still hold the old revision id until React re-renders and the callback is recreated. Verify this is the failure mode with the test.
- Router: `app/api/routers/chapters_production.py:46-65` maps `RevisionMismatch` → 409 with `expected_base_revision_id` / `base_revision_id` fields. The client's 409 handler just calls `onConflict?.()`.

## Target shape / contract
- Recommended approach **(b) — client adopts the returned revision id:** the assignment response already returns the new `base_revision_id`; ensure the client **stores it and sends it on the next request**, robust against rapid consecutive clicks (i.e. the second request must use the revision id returned by the first response, not a stale closure value). Two sequential single-sentence assignments in the same section both succeed.
- Alternative approach **(a) — scope the revision check to the affected span:** instead of hashing the whole chapter, validate only that the segments being reassigned haven't changed under the client (e.g. per-span/segment revision), so unrelated aggregate-status shifts don't invalidate the chapter revision. This is a larger backend change to `_build_base_revision_id` / the guard; document it as the fallback if (b) proves insufficient.
- The genuine concurrency protection must remain: a real out-of-band edit by another writer still 409s.

## Steps
1. Reproduce and write the revert-checked test first (TDD). Choose the layer the bug actually lives in:
   - **Backend test** (`tests/` — extend the closest existing `test_*script*assignment*` / `test_*chapters*` file, else create `tests/domain/test_script_assignment_revision.py`): call `save_script_assignments(chapter_id, assignments=[...], base_revision_id=R0)` for span A; capture the returned payload's `base_revision_id` (R1); call again for span B using R1; assert **both succeed** and the second returns 200-equivalent (no `RevisionMismatch`). Also assert a *stale* id (R0 reused on the second call) still raises `RevisionMismatch` (protection intact). This proves the server contract.
   - **Frontend test** (`frontend/tests/unit/hooks/...`, vitest): render the hook, fire two `handleScriptAssign` calls in sequence (mock only `api.saveScriptAssignments` / `api.fetchSegments` at the network boundary — R2; the first mock resolves with a payload carrying a *new* `base_revision_id`). Assert the **second** call's request body carries the revision id returned by the first response, not the original. Use fake timers / `waitFor`, no sleeps (R4).
   - If reproduction shows the server already accepts R1→R1 correctly (likely), the defect is the client closure not adopting the new id — put the failing assertion in the frontend test.
2. Run the test, confirm **red** on current code; record exactly which call 409s / which request carries the stale id.
3. Implement approach (b):
   - In `useChapterAssignments.ts`, make the next request use the most recent `base_revision_id`. Options: store the latest revision in a `useRef` updated synchronously when a response arrives and read it when building the next request; or thread the returned revision id forward so rapid consecutive clicks chain correctly. Keep optimistic UI behavior; on a true 409 still call `onConflict`.
   - Apply the same fix to `handleScriptAssignRange` (lines 64-96).
   - Do not blindly overwrite canonical server state with local drafts (frontend-state rule): adopt the server's returned `base_revision_id` as canonical.
4. Re-run → green. **Revert-check:** stash the fix (keep the test), confirm red, restore.
5. If approach (b) cannot be made reliable (e.g. genuinely parallel in-flight requests), implement approach (a): narrow the guard to the affected span/segment in `save_script_assignments` + `_build_base_revision_id`, and add a backend test that an unrelated-section aggregate-status shift does not invalidate a pending paint. Note which approach was taken in the task's eventual commit message.
6. Verify: `npm -C frontend run test -- --run` (targeted) and `npm -C frontend run build`; if backend touched, `./venv/bin/python -m pytest -q` + `ruff check .`.

## Acceptance criteria
- [ ] Two sequential single-sentence assignments in the same section both succeed (no 409).
- [ ] A genuinely stale revision id (real concurrent edit) still produces a `RevisionMismatch`/409 — protection intact.
- [ ] Fix applied to both `handleScriptAssign` and `handleScriptAssignRange` (if approach (b)).
- [ ] Test mocks only the network boundary (`api.*`), not the hook/function under test (R2); no sleep-based timing (R4).
- [ ] **Revert-check: second assignment 409s (or sends stale id) on pre-fix code** (fix stashed → red → restored → green).
- [ ] Targeted frontend tests + `npm -C frontend run build` green; backend suite green if backend changed.

## Out of scope
- Range/span selection UX (Track A task 011).
- Redesigning the optimistic-concurrency model beyond what's needed to fix B2.
- B1/B3/B4 (tasks 001/004/003).
- The status-regression guard in `app/db/state_job_guards.py` (related but a different surface).
