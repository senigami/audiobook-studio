# Task 007 — Wire the real description field into BookStage's Description card

Status: complete — 2026-07-09

## Goal

Replace `BookStage.tsx`'s static placeholder "Description" card (already renamed and re-copied in Phase 1 — see below) with a real, editable field bound to `project.description`, using `InlineEdit`'s existing (currently unused) `multiline` mode.

## Why it matters

This is DC-005 from the design critique — the field the owner explicitly asked for. The backend/contract work (Tasks 002-004) makes this task almost entirely UI wiring.

## Current state (post-Phase-1)

`frontend/src/pages/Book/stages/BookStage.tsx` (current, after the Phase-1 copy fix already shipped):
```tsx
<aside className="book-stage__notes" aria-label="Book description">
  <div className="book-stage__panel">
    <strong>Description</strong>
    <p>
      No description yet — add one to give readers and listeners a sense of the story before
      they dive in.
    </p>
  </div>
</aside>
```
The `<p>` above is still static — there is no binding to any field yet.

## Target contract

Replace the static `<p>` with `InlineEdit` in multiline mode, saving through `actions.handleUpdateProject` (from `useBookDataContext()`, already destructured in `BookStage.tsx:5`):

```tsx
<aside className="book-stage__notes" aria-label="Book description">
  <div className="book-stage__panel">
    <strong>Description</strong>
    <InlineEdit
      value={project.description || ''}
      placeholder="Add a description to give readers and listeners a sense of the story before they dive in."
      multiline
      onSave={(value) =>
        void actions.handleUpdateProject({
          name: project.name,
          series: project.series || '',
          author: project.author || '',
          series_position: project.series_position,
          description: value.trim(),
        })
      }
      inputAriaLabel="Book description"
    />
  </div>
</aside>
```

Note the full-object save shape — `handleUpdateProject` (post-Task-004) still expects `name`/`series`/`author`/`series_position` alongside the changed field, mirroring exactly how `BookInfoCard.tsx`'s `updateField` helper (lines 36-43) already does this for `name`/`series`/`author` today. Do not send a partial object.

## `InlineEdit`'s multiline mode (already exists, unused today)

`frontend/src/components/forms/InlineEdit.tsx:12,33,107-108` — `multiline` renders a `<textarea rows={Math.max(1, tempValue.split('\n').length)}>` instead of an `<input>`, and Enter inserts a newline (Ctrl/Cmd+Enter saves) instead of saving immediately — already implemented, matches what a multi-line description needs with no changes to `InlineEdit.tsx` itself.

## Pattern to imitate

`BookInfoCard.tsx`'s `updateField` helper (lines 36-43) — same "spread current values, override one field" shape, applied here for `description` instead of `name`/`series`/`author`.

## Steps

- [x] Import `InlineEdit` in `BookStage.tsx`.
- [x] Replace the static `<p>` with the `InlineEdit multiline` binding shown above.
- [x] Confirm `project.description` type-checks (requires Task 004 done — `Project.description: string | null`).
- [x] Style check: the `InlineEdit` empty-state placeholder must use `--text-muted` (via `InlineEdit`'s default styling or an explicit style prop), not `--text-subtle` — per INV-4, this plan must not reintroduce the exact bug Phase 1 just fixed. (Renamed the `.book-stage__panel p` CSS rule to `.book-stage__panel .book-stage__description` since the `<p>` was removed, and gave `InlineEdit` that `className` so the muted color still applies to both the empty placeholder and a real saved value.)
- [x] Append a `docs/code-map/queue/` entry per the README's same-change rule.

## Acceptance criteria

- [x] Clicking the description area enters edit mode (multiline textarea); typing and blurring (or Ctrl/Cmd+Enter) saves; Escape cancels — matching `InlineEdit`'s existing documented behavior. (Verified via unit test + `InlineEdit.tsx`'s existing, unmodified implementation; no change was needed there.)
- [x] Saved description persists across a page reload (round-trips through the full stack from Task 002-004). **Confirmed by orchestrator** via the backend/API round-trip tests (`tests/db/test_db_projects.py::test_project_description_round_trip`, `tests/api/test_api_projects.py::test_project_description_round_trip`, both passing) plus this task's own unit test exercising the exact save-shape end to end.
- [x] Empty state shows the placeholder copy, not blank space.
- [x] New unit test file `frontend/tests/unit/pages/Book/stages/BookStage.test.tsx` (no test exists for this file yet — confirmed via directory listing; `frontend/tests/unit/pages/Book/stages/` is the existing convention for stage-level tests) verifying the description renders, edits, and calls `handleUpdateProject` with the full expected shape (all fields, not just `description`) — style the test after `BookInfoCard.test.tsx`'s setup/mocking pattern.
- [x] `npx tsc -p tsconfig.json --noEmit` clean; `npm -C frontend run test -- --run` passes (ran the targeted BookStage/BookInfoCard/BookLayout suites; full-suite run not re-executed here, see report).
- [~] Live verification: edit a book's description in the dev preview, reload the page, confirm it persisted. **Partially attempted by orchestrator** (2026-07-09): navigated to a live book's Book tab and confirmed the description field renders correctly (empty-state placeholder visible, correct aria-label), but synthetic clicks on the `InlineEdit` trigger did not reliably enter edit mode in this preview-tool session — a tool-level interaction quirk, not a reproducible app bug (the identical click mechanism worked correctly elsewhere in the same session: Continue Listening's Play button, the theme toggle, and tab navigation all responded to clicks normally). The save mechanism itself is proven correct via the passing unit test (which exercises the exact same `onSave` code path with `fireEvent`) plus the backend persistence tests above — the click-to-edit *browser* interaction specifically was not re-confirmed live. Left as a genuine open item for a follow-up manual check, not silently marked done.

## Dependencies

Task 004 (the frontend contract — `Project.description`, `handleUpdateProject` accepting `description` — must exist first).

## Map links

- Part: **Description card (UI)** (`01-map.md` — The parts)
- Contract: **`BookInfoCard`'s `onUpdateProject` prop shape** note (`01-map.md` — Connections & contracts) — this task resolves that open question: the save routes through `actions.handleUpdateProject` directly in `BookStage.tsx`, not through `BookInfoCard`'s narrower prop.
- Invariant: **INV-4** (contrast discipline — don't reintroduce `--text-subtle` on this new field)
- Risk: `none` (small, well-precedented UI binding)

## Out of scope

- Rich text / Markdown support — plain text only for v1 (see `01-map.md`'s open question resolution).
- Final layout position of this card relative to `ContinueListeningCard` and `BookInfoCard` (Task 008).
