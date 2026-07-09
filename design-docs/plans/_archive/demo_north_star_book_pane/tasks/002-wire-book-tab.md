# Task 002 — Wire `Book` into the tab strip and default landing state

Status: complete — 2026-07-10

## Goal

Register `'Book'` as a real tab (first in order, mirroring the real app), route it to `BookPane` (Task 001), and make it the default tab a book workspace opens on — mirroring the real app's DC-001 fix (the default used to be `'Contents'`, which defeated the whole point of a front-door tab).

## Exact files

- `frontend/src/demo/stages/siteMockup/shared.tsx` — `BookTab` type + `BOOK_TABS` array (lines 1010-1011).
- `frontend/src/demo/stages/siteMockupStage.tsx` — `activeBookTab` state (line 1087), pane-switch (lines 1068-1071), and the `BookPane`/`ContentsPane` import (line 64).

## Target contract

**1. `shared.tsx:1010-1011`** — current:
```ts
export type BookTab = 'Contents' | 'Cast' | 'Publish' | 'Backups';
export const BOOK_TABS: BookTab[] = ['Contents', 'Cast', 'Publish', 'Backups'];
```
Target — add `'Book'` as the first entry in both:
```ts
export type BookTab = 'Book' | 'Contents' | 'Cast' | 'Publish' | 'Backups';
export const BOOK_TABS: BookTab[] = ['Book', 'Contents', 'Cast', 'Publish', 'Backups'];
```
No other change needed here — the tab strip (`siteMockupStage.tsx:1043-1063`) already renders `BOOK_TABS.map(t => ...)` generically; adding an entry to the array is enough to make it appear as a tab with zero additional per-tab styling code.

**2. `siteMockupStage.tsx:64`** — current:
```ts
import { ContentsPane, CastingPane, BackupsPane } from './siteMockup/panes/book';
```
Target — add `BookPane`:
```ts
import { BookPane, ContentsPane, CastingPane, BackupsPane } from './siteMockup/panes/book';
```

**3. `siteMockupStage.tsx:1087`** — current:
```ts
const [activeBookTab, setActiveBookTab] = useState<BookTab>('Contents');
```
Target:
```ts
const [activeBookTab, setActiveBookTab] = useState<BookTab>('Book');
```

**4. `siteMockupStage.tsx:1068-1071`** — current:
```tsx
{activeTab === 'Contents' && <ContentsPane onSwitchToPublish={() => setActiveTab('Publish')} onOpenChapter={onOpenChapter} />}
{activeTab === 'Cast' && <CastingPane />}
{activeTab === 'Publish' && <PublishPane />}
{activeTab === 'Backups' && <BackupsPane />}
```
Target — add the `Book` case first:
```tsx
{activeTab === 'Book' && <BookPane />}
{activeTab === 'Contents' && <ContentsPane onSwitchToPublish={() => setActiveTab('Publish')} onOpenChapter={onOpenChapter} />}
{activeTab === 'Cast' && <CastingPane />}
{activeTab === 'Publish' && <PublishPane />}
{activeTab === 'Backups' && <BackupsPane />}
```

## Pattern to imitate

The existing three-line shape (`Cast`/`Publish`/`Backups`) at `siteMockupStage.tsx:1069-1071` — no props needed for a parameterless pane, exactly like `<CastingPane />` and `<BackupsPane />` already are.

## Steps

- [x] Edit `shared.tsx`'s `BookTab` type and `BOOK_TABS` array as shown.
- [x] Edit `siteMockupStage.tsx`'s import (line 64) to include `BookPane` — aliased to `BookFrontDoorPane` on import (see Deviation note below); `BOOK_STAGE_LINKS` (line 1012) left untouched, out of scope.
- [x] Edit `siteMockupStage.tsx`'s `activeBookTab` initial state (line 1087) to `'Book'`.
- [x] Edit `siteMockupStage.tsx`'s pane-switch (lines 1068-1071) to add the `Book` case, first (as `<BookFrontDoorPane />`).
- [x] Check `siteMockupStage.tsx:1311` (`breadcrumb = \`Library / The Whispering Vale / ${activeBookTab}\`;`) — confirmed this reads correctly with `activeBookTab === 'Book'`: it's a plain template-literal interpolation with no per-tab special-casing, so it produces `"Library / The Whispering Vale / Book"` with no code change needed.

**Deviation from exact contract:** `siteMockupStage.tsx` already had a pre-existing local `const BookPane: React.FC<{...}>` (the outer book-workspace wrapper — tab strip + chapter-workspace shell, used again at line ~1417) — importing Task 001's `panes/book.tsx` export under the literal name `BookPane` caused a TS2440 name collision. The implementer's first fix aliased the import (`BookPane as BookFrontDoorPane`); the orchestrator judged this a lasting confusion risk (two same-named components with very different jobs) rather than accepting the alias as final, and instead **renamed the pre-existing outer wrapper to `BookWorkspacePane`** (matching its own doc comment, "assembles tab content from imported panes") and reverted the import to a plain `BookPane`, matching the sibling `ContentsPane`/`CastingPane`/`BackupsPane` naming convention. Every reference updated (definition, its one other JSX usage, the import, the pane-switch case) — confirmed via grep, zero stray `BookFrontDoorPane` references remain, `npx tsc -b --force` clean.

## Acceptance criteria

- [x] `Book` appears as the first tab in the demo's book-workspace tab strip.
- [x] Opening the demo's book workspace (dev server) lands on `BookPane` by default, not `ContentsPane`.
- [x] Clicking `Contents`/`Cast`/`Publish`/`Backups` still works exactly as before (no regression to the existing four tabs).
- [x] The breadcrumb correctly shows "... / Book" when the Book tab is active.
- [x] `npx tsc -b --force` clean.

## Dependencies

Task 001 (`BookPane` must exist to import and route to it).

## Map links

- Parts: `BookTab` type/`BOOK_TABS` array, tab strip, `activeBookTab` state, pane switch — `01-map.md`, "The parts"
- Risk: `multi-file` (type, state default, and pane-switch must all agree — a mismatch here silently breaks the tab, e.g. adding to `BOOK_TABS` without a matching pane-switch case renders a tab that does nothing when clicked)

## Out of scope

- Rebuilding `docs/demo/` (Task 003).
