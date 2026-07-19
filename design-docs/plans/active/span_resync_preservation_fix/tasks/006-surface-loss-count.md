Status: pending
Depends on: Task 4

# Task 6 — surface `lost_assignments_count` on the save response

**Map links:** Part P5 (`01-map.md`). Risk: `multi-file` (backend + frontend).

## Goal

Today, the destructive sync on an ordinary save runs silently — only the explicit resync route has
a preview/warning. Surface the same loss count Task 4 now computes on the actual save path, so the
UI can warn the user when a save destroyed real assignments (this should be rare after Tasks 0/1/4,
but still possible for genuinely-edited sentences).

## Exact locations

- `app/db/segments.py` — `sync_chapter_segments`'s return value (currently returns `True`,
  `segments.py:599`). Change to return the loss count (or a small result object) instead of a bare
  bool.
- `app/db/chapters.py` — `update_chapter` (~197-234), which currently ignores the return value.
- `app/api/routers/chapters.py` — the chapter-update endpoint (~79-101) and the explicit resync
  route (~259) both call this chain; check `app/db/__init__.py:5`'s re-export stays consistent.
- Frontend: `frontend/src/hooks/chapter/useChapterPersistence.ts` (~16-38) — surface a warning if
  the save response includes a non-zero loss count. Reuse the explicit-resync warning modal's
  copy/pattern if one already exists (check `frontend/src` for the resync-preview warning
  component) rather than inventing new UI.

## Steps

1. Change `sync_chapter_segments`'s return type from `bool` to something carrying the loss count
   (e.g., a small dataclass or a dict `{success: bool, lost_assignments_count: int}`). Check all
   three call sites (`chapters.py:54`, `chapters.py:224`, `routers/chapters.py:259`) and update each
   to handle the new shape — none of them currently use the return value, so this should be additive,
   but verify (Invariant I4 — two different transaction postures).
2. Thread the count through `update_chapter`'s return to the API response.
3. Add the count to the chapter-update endpoint's response schema.
4. Frontend: if the save response's count is non-zero, show a warning (reuse existing resync-warning
   UI pattern if found).
5. Test: an ordinary save that causes genuine loss (edited a split sentence) returns a non-zero
   count in the API response.
6. Test: an ordinary save with no loss returns 0 (this should be the overwhelmingly common case
   after Task 4 lands).

## Acceptance criteria

- [ ] `sync_chapter_segments`'s new return shape doesn't break any of its 3 call sites.
- [ ] The chapter-update API response includes the loss count.
- [ ] Frontend shows a warning when the count is non-zero, reusing existing UI pattern if one exists.
- [ ] Test confirms a genuine-loss save surfaces a non-zero count; a clean save surfaces 0.

## Out of scope

Redesigning the warning UI from scratch if no reusable pattern exists — in that case, a minimal
inline message is acceptable; a full modal redesign is out of scope for this task.
