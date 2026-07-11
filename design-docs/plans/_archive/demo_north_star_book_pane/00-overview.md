# Overview

## The task

The North Star demo mockup (`frontend/src/demo/stages/siteMockup/`, built to `docs/demo/` via `npm run build:demo`) illustrates this app's information architecture for onlookers/stakeholders. It has not been updated since the real Book tab redesign shipped (`design-docs/plans/_archive/book_tab_front_door/`) — it still shows the *pre-redesign* IA: book identity (cover, title, author/series, runtime) merged as a slim inline header directly above the chapter list, with no separate Book tab, no description, no listen/resume affordance.

This plan adds a real `Book` tab + `BookPane` component to the demo, mirroring the real app's shipped pattern: one unified hero (cover+identity | description → primary "Continue Listening" action → de-emphasized metadata footer line), as the first tab ahead of Contents — matching the real app's tab order and default-landing fix (DC-001).

## Scope

**In scope:** a new `BookPane` in `frontend/src/demo/stages/siteMockup/panes/book.tsx`; adding `'Book'` to `BookTab`/`BOOK_TABS` in `shared.tsx`; wiring the pane-switch and default `activeBookTab` in `siteMockupStage.tsx`; rebuilding `docs/demo/` static output.

**Out of scope:** any change to `frontend/src/pages/Book/` (the real app); any change to the demo's other panes (`ContentsPane`'s slim header stays as-is — this plan adds a new tab, it doesn't touch the old inline header, since `ContentsPane` still needs *some* lightweight identity reminder while looking at chapters, same as the real app's Contents tab doesn't duplicate the full hero either); backend/data-layer changes (none exist here — this is a static, illustrative mockup with mock data throughout).

## Success criteria

1. `Book` is the first tab in the demo's book-workspace tab strip, matching the real app's `Book, Contents, Cast, Publish, Backups` order.
2. Opening the demo's book workspace lands on the Book tab by default (mirrors the real app's DC-001 fix — `activeBookTab` initial state is `'Book'`, not `'Contents'`).
3. `BookPane` shows: a real cover treatment sized like a hero (not the old 40×54 thumbnail), title/author/series identity, a mock description/synopsis, a primary "Continue Listening" CTA (using the demo's existing `PlayButton` component, which already documents supporting "Play book <title>"-shaped labels), and a de-emphasized metadata footer line using the demo's existing `·`-separated muted-text convention (confirmed already used elsewhere in `book.tsx` and `activity.tsx`) — not colorful pill badges.
4. `npm run build` (typecheck) and `npm run build:demo` both succeed; `docs/demo/` is regenerated and the rebuilt demo loads without console errors.
5. No file under `frontend/src/pages/Book/` is touched.
