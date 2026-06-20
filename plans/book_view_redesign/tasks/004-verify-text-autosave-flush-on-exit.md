# 004 — Verify (and if needed restore) text autosave flush on chapter exit

- **Status:** done
- **Workload:** Real-app bug fixes
- **Severity / type:** minor · logic
- **Effort:** S
- **Blocked by:** nothing
- **Blocks:** nothing

## Goal
Pending chapter-text edits must be persisted when the editor unmounts or the user leaves the chapter — a fast exit (within the 1500ms autosave debounce window) must not silently drop edits. This task is **verify-first**: if a flush already exists somewhere, document it and add a test that proves it; if it does not, change the cleanup to flush the pending save.

## Why this matters
This is bug **B3** ([`../00-audit-report.md`](../00-audit-report.md) Track B; [`../../book_view_ia_proposal.md`](../../book_view_ia_proposal.md) §10 B3). Losing the author's text edits because they switched chapters a beat too quickly is a quiet data-loss bug that erodes trust in the whole workspace. The owner believes exit-save was already fixed — so this may already be handled by a route-leave / `beforeunload` handler elsewhere. The job is to find the truth and lock it in with a test.

## Context an executor needs
Specs / rules: [`docs/specs/testing-standards.md`](../../../docs/specs/testing-standards.md) — R1 (revert-check; if you *change* behavior, the test must be red on pre-change code), R2 (mock only boundaries — `api.updateChapter` is the network boundary; the hook under test is not), R4 (no sleep-based timing — use vitest fake timers).

Current-state evidence — `frontend/src/pages/Book/lib/useChapterText.ts`, the autosave effect (lines 58-75):
```ts
useEffect(() => {
  if (!loadedChapter || isProduced || !hasTextChanges) return;
  setSaveState('editing');
  const timer = setTimeout(async () => {
    setSaveState('saving');
    try {
      const result = await api.updateChapter(loadedChapter.id, { text_content: text });
      setLoadedChapter(result.chapter);
      setSaveState('saved');
      await onSaved?.();
    } catch (error) { ... setSaveState('error'); }
  }, 1500);

  return () => clearTimeout(timer);   // <-- cancels debounce on unmount, NO flush
}, [hasTextChanges, isProduced, loadedChapter, onSaved, text]);
```
The cleanup `clearTimeout(timer)` cancels the pending save with no flush. On unmount within 1500ms of the last keystroke, the edit is lost **unless** a flush is performed somewhere else.

Discovery — search for an existing exit-save before changing anything:
- `grep -rniE "beforeunload|visibilitychange|pagehide" frontend/src` — page-level flush handlers.
- Search the chapter/book route components that *use* `useChapterText` (e.g. `frontend/src/pages/Book/**`, `ChapterEditor` components) for an `onSaved` flush, a "save before navigate" router guard, a `useBeforeUnload`/blocker, or an explicit `api.updateChapter` call on chapter switch / unmount.
- Check the consumer that owns chapter switching (the switcher / `Contents ▾` path) for a save-on-change.

## Target shape / contract
- Leaving a chapter (component unmount or route change) with unsaved text changes triggers the pending save (`api.updateChapter` with the latest `text_content`) before the editor tears down — instead of cancelling it.
- The normal debounced autosave during editing is unchanged (still 1500ms).
- No double-save / race: a flush-on-exit should not fire if the debounced save already completed.
- Produced chapters (`isProduced`) keep their existing behavior (autosave disabled; resync flow handles those).

## Steps
1. **Verify first.** Run the discovery greps above and read the components that consume `useChapterText`. Determine whether a flush-on-exit already exists (route-leave guard, `beforeunload`, save-on-switch). Record the finding.
2. **Write a test that captures the contract** (TDD), in `frontend/tests/unit/` mirroring the hook's location (e.g. `frontend/tests/unit/pages/Book/lib/useChapterText.test.ts` if absent, else extend it). Using `@testing-library/react` + vitest fake timers (R4):
   - Render the hook with a non-produced chapter, set text via `setText` so `hasTextChanges` is true.
   - **Unmount before the 1500ms debounce elapses** (do not advance timers past 1500ms first).
   - Assert `api.updateChapter` was called with the latest text. Mock only `api.updateChapter` (R2).
3. **Branch on the verification result:**
   - **If a flush already exists:** ensure the test exercises the *real* flush path (it may live in the consuming component, not the hook — in that case write the test against that component or the hook's documented contract). Document where the flush lives in the eventual commit message. The test still must be red if that flush is removed (revert-check by deleting the flush, confirming red, restoring).
   - **If no flush exists:** change the effect cleanup in `useChapterText.ts` (lines 73-75) to **flush** the pending save instead of just `clearTimeout`. Implementation: on cleanup, if a save is pending and `hasTextChanges`, fire the save (call the same `api.updateChapter(...)` with the current `text`) rather than discarding it. Guard against firing after a completed save and against produced chapters. Keep the debounced behavior intact.
4. Confirm the test is **green** with the fix/flush present, and **red** without it (revert-check: stash/remove the flush, run, confirm red, restore).
5. Verify: `npm -C frontend run test -- --run` (targeted) and `npm -C frontend run build`; `npm -C frontend run lint`.

## Acceptance criteria
- [ ] Verification recorded: whether an exit/route-leave/`beforeunload` flush already existed, and where.
- [ ] Unmounting (or leaving the chapter) with unsaved text triggers `api.updateChapter` with the latest text.
- [ ] Normal 1500ms debounced autosave during editing still works; produced-chapter behavior unchanged.
- [ ] No duplicate save when the debounced save already completed.
- [ ] Test mocks only `api.updateChapter` (R2) and uses fake timers, not sleeps (R4).
- [ ] **Revert-check: test fails on pre-fix code** (flush removed → red → restored → green).
- [ ] `npm -C frontend run test -- --run`, `npm -C frontend run build`, and `npm -C frontend run lint` green.

## Out of scope
- The source-text resync preview/confirm flow (`requestResyncPreview` / `confirmResync`) — separate path, already explicit.
- Autosave for produced/rendered chapters (intentionally gated by `isProduced`).
- Mock/redesign UI work (Track A tasks 005-013).
- B1/B2/B4 (tasks 001/002/003).
