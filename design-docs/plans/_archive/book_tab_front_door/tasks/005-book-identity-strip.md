# Task 005 — Extract `BookIdentityStrip`, swap into Publish's sidebar

Status: complete — 2026-07-09

## Goal

Implement DC-006: Publish's sidebar currently renders the full editable `<BookInfoCard>` (cover, editable title/author/series/series-position, metadata pills) — the same component the Book tab uses as its entire reason for existing. Replace Publish's copy with a new, read-only `BookIdentityStrip` (cover thumbnail + title + author only), so the Book tab becomes the only place identity fields are edited.

## Why it matters

Per the design critique (DC-006), having the full editable hero duplicated on Publish dilutes the Book tab's claim to being the definitive front door, and lets a user edit the same fields from two different tabs with no indication the other exists.

## Exact files

- `frontend/src/pages/Book/components/BookIdentityStrip.tsx` — **new file**.
- `frontend/src/pages/Book/stages/PublishStage.tsx` — swap the sidebar render (currently lines 114-121).
- `frontend/src/theme/components.css` — new `.book-identity-strip*` rules.

## Target contract

**New component** — read-only, no `InlineEdit`, no cover-change button, no series stepper (per `01-map.md`'s explicit invariant that this strip must not duplicate edit affordances):

```tsx
// frontend/src/pages/Book/components/BookIdentityStrip.tsx
import type { Project } from '@/types';

interface BookIdentityStripProps {
  project: Project;
}

export function BookIdentityStrip({ project }: BookIdentityStripProps) {
  return (
    <div className="book-identity-strip" aria-label="Book identity">
      <div className="book-identity-strip__cover">
        {project.cover_image_path ? (
          <img src={project.cover_image_path} alt="Book cover" />
        ) : (
          <div className="book-identity-strip__cover-placeholder" aria-hidden="true" />
        )}
      </div>
      <div className="book-identity-strip__text">
        <p className="book-identity-strip__title">{project.name}</p>
        {project.author && <p className="book-identity-strip__author">by {project.author}</p>}
      </div>
    </div>
  );
}
```
(Adjust markup/classnames to match this project's existing conventions if a closer precedent is found while implementing — the shape above is the minimum contract: cover, title, author, nothing editable.)

**`PublishStage.tsx`** — current sidebar (lines 111-122):
```tsx
<aside className="publish-stage__sidebar">
  <BookInfoCard
    project={project}
    totalRuntime={totalRuntime}
    totalPredicted={totalPredicted}
    hasRendered={hasRendered}
    hasUnrendered={hasUnrendered}
    onUpdateProject={actions.handleUpdateProject}
  />
</aside>
```
Target:
```tsx
<aside className="publish-stage__sidebar">
  <BookIdentityStrip project={project} />
</aside>
```
Verified: `totalRuntime`, `totalPredicted`, `hasRendered`, `hasUnrendered` (destructured from `useBookDataContext()` at `PublishStage.tsx:19-22`) are used **only** in the `BookInfoCard` call being removed — grep confirms no other reference in the file. Remove all four from the destructuring along with the `BookInfoCard` import once the swap is made, rather than leaving unused variables behind.

## Pattern to imitate

`BookInfoCard.tsx`'s cover-rendering block (`components/BookInfoCard.tsx:168-201`) for the cover image handling shape (though vastly simplified — no drag-drop, no click-to-view-modal, no change button).

## Steps

- [x] Create `frontend/src/pages/Book/components/BookIdentityStrip.tsx` per the contract above.
- [x] Add `.book-identity-strip*` CSS rules to `frontend/src/theme/components.css` — small: a flex row, thumbnail-sized cover (e.g. `3rem` wide, matching the compact scale of a sidebar, not the Book tab's `10-12rem` hero cover), title/author text using `--text-primary`/`--text-secondary` (not `--text-subtle`, per INV-4).
- [x] Edit `PublishStage.tsx`: import `BookIdentityStrip`, replace the `<BookInfoCard ...>` sidebar render with `<BookIdentityStrip project={project} />`, remove the now-unused `BookInfoCard` import, and remove `totalRuntime`/`totalPredicted`/`hasRendered`/`hasUnrendered` from the `useBookDataContext()` destructuring (confirmed unused elsewhere in this file).
- [x] Append a `docs/code-map/queue/` entry per the README's same-change rule.

## Acceptance criteria

- [x] Publish tab's sidebar shows cover + title + author, with no editable fields, no series stepper, no "Change cover" button.
- [x] Book tab is unaffected — still renders the full `<BookInfoCard>` with all edit affordances.
- [x] `npx tsc -p tsconfig.json --noEmit` clean.
- [x] `frontend/tests/unit/pages/Book/PublishStage.test.tsx` still passes — `npm -C frontend run test -- --run tests/unit/pages/Book/PublishStage.test.tsx` from `frontend/`. **Deviation:** the task's claim that this test "does not currently assert anything about `BookInfoCard`/the sidebar card directly" was incorrect — it asserted `getByRole('region', { name: 'Book info' })`. Updated that one assertion to `'Book identity'` (matching `BookIdentityStrip`'s new aria-label) in the same commit; also changed the strip's outer element from `<div>` to `<section>` so it exposes a landmark `region` role, mirroring `BookInfoCard`'s own convention.
- [x] Live verification: open a book's Publish tab in the dev preview, confirm the sidebar reads as a slim non-interactive strip, not a form. **Confirmed by orchestrator** (2026-07-09, live dev preview): Publish tab's sidebar shows `BookIdentityStrip` — cover thumbnail + title only (this test book has no author set) — zero editable affordances, no stepper, no "Change cover" button. `preview_inspect` confirmed `reactComponent: "BookIdentityStrip"`.

## Dependencies

None — independent of every other task in this plan, can land any time.

## Map links

- Part: **BookIdentityStrip**, **Publish sidebar** (`01-map.md` — The parts)
- Invariant: **`BookIdentityStrip` must not duplicate edit affordances** (`01-map.md` — Connections & contracts)
- Risk: `none` (isolated, additive-only change; the removed `BookInfoCard` render on Publish is the only "removal," and it's exactly what DC-006 asked for)

## Out of scope

- Any change to `BookInfoCard.tsx` itself — it stays exactly as-is, used only by the Book tab.
- A "View on Book tab" link from Publish — the `02-improvement-plan.md` North Star mentions this as a possible follow-up, not required for this task's acceptance criteria.
