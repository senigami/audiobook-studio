# Task 008 — North Star hero layout restructuring

Status: complete — 2026-07-09

## Completion note

Chose **composition (a)**: folded the description `InlineEdit` and `<ContinueListeningCard>` into `BookInfoCard`'s own `.book-info-card__content` column, rather than restyling them as siblings in `BookStage.tsx`. Reason: the cover|content two-column grid is owned entirely by `.book-info-card`/`BookInfoCard.tsx` — sibling components in `BookStage.tsx` have no way to share that grid without either duplicating it or having `BookInfoCard` forward render props, which is messier than the prop surface cost of (a). The actual prop-surface cost turned out to be minimal: `onUpdateProject`'s data type gained an optional `description` field it didn't already expose (the underlying `handleUpdateProject` action already supported it), and one new optional `audiobooks?: Audiobook[]` prop (defaulted to `[]`) was added. `BookStage.tsx` is now a thin data-to-props adapter with no markup of its own beyond the outer `<section>`.

Design calls made without live verification (documented per the task's own allowance):
- Left `.book-info-card`'s cover column width (`minmax(10rem, 12rem)`) unchanged — the task step explicitly says "measure live before changing; don't guess," and no browser tool was available. The existing `1fr` content column already gives the description/CTA/pills the full remaining width; DC-009's "modest cover" framing is left for a future task with live verification.
- Hid `.book-info-card__content .continue-listening-card__cover` (the small cover thumbnail `ContinueListeningCard` renders internally) via CSS, since the hero already shows the same book's cover at full size directly to the left — showing it twice reads as redundant, not as reinforcing identity. `ContinueListeningCard.tsx` itself was not modified (not in this task's exact-files list).
- Demoted the metadata pills by removing their tone-specific background colors entirely (all three tones now render as plain `var(--text-muted)` text with a `·` separator) rather than just shrinking a colored badge — this reads as the Audible-class "quiet footer line" the design critique specifically asked for. The pill DOM elements, `aria-label`, and the lifecycle logic controlling which pills appear (`BookInfoCard.tsx` metadataPills array) are unchanged.
- "Change cover" was left as a permanent `btn-ghost` button below the cover, not converted to a hover-reveal — deferred per the task's own "nice-to-have, don't let it hold up the rest" allowance. Noting as a follow-up.
- Mobile (375px) reflow was reviewed via CSS only (no browser/preview tool available in this environment): the existing `@media (max-width: 1000px)` rule already collapses `.book-info-card` to a single column and caps the cover at `12rem`, and the new hero content (description, unified Continue Listening actions, footer-line pills) uses `flex-wrap`/`max-width` with no fixed pixel widths that would force horizontal scroll. This was **not confirmed with a live screenshot** — flagged per the task's live-verification checkboxes below.

## Goal

Recompose the Book tab's hero from "two stacked cards with the CTA nowhere" into the single-region layout the design critique's North Star sketches: cover+identity on one side, description + Continue Listening CTA + de-emphasized metadata pills filling the other — resolving DC-007 (dead whitespace) and DC-009 (modest cover sizing) as a side effect.

## Why it matters

This is the task that makes the tab actually *read* as a front door rather than a well-organized metadata panel. It only makes sense once both `ContinueListeningCard` (Task 006) and the real description (Task 007) exist — building the layout around empty/placeholder content would need redoing.

## Exact files

- `frontend/src/pages/Book/stages/BookStage.tsx` — composition.
- `frontend/src/pages/Book/components/BookInfoCard.tsx` — the metadata-pill row's visual weight (demote, don't remove).
- `frontend/src/theme/components.css` — `.book-info-card` grid, `.book-info-card__chips`/`.book-info-card__chip`, `.book-stage__*`, plus the new `.continue-listening-card`/description-card placement rules.

## Current layout (before this task)

```
BookStage.tsx renders, in order:
  1. .book-stage__primary  → <BookInfoCard>          (cover | title/author/series + pills, grid-template-columns: minmax(10rem,12rem) minmax(0,1fr))
  2. .book-stage__notes    → Description card         (separate bordered box, below)
  3. [Task 006 adds]       → ContinueListeningCard     (wherever Task 006 placed it — likely also stacked below)
```

## Target layout (per `docs/design-critique/02-improvement-plan.md`'s North Star sketch)

```
┌──────────────────────────────────────────────────────┐
│  [cover]   Title                                      │
│  [cover]   by Author · Series #12                     │
│  [cover]                                              │
│  [cover]   Description text runs here across the      │
│  [cover]   full remaining width instead of stopping    │
│  [cover]   halfway across the card.                    │
│                                                        │
│            [▶ Continue Listening]   [Download]         │
│            Runtime 1h31m · Rendered · Created Jul 6    │
└──────────────────────────────────────────────────────┘
```
One region, not two stacked cards. Reading order top-to-bottom: identity → description → primary action → de-emphasized metadata.

## Steps

- [x] Restructure `BookStage.tsx` so `BookInfoCard`'s content area, the description field, and `ContinueListeningCard` render as one visual unit rather than stacked separate `.book-stage__panel` boxes. Concretely: either (a) fold the description `InlineEdit` and `ContinueListeningCard` into `BookInfoCard`'s own right-hand content column (extending `.book-info-card__content`'s existing children in `BookInfoCard.tsx`), or (b) keep them as sibling components but restyle so they render inside the same bordered container as `BookInfoCard` (no separate border/shadow per card). Prefer (a) if it doesn't force `BookInfoCard`'s props to balloon — pass `description`/`onUpdateDescription`/`audiobooks` as new props if so; prefer (b) if that keeps `BookInfoCard`'s prop surface cleaner. Make this call during implementation and note which was chosen in this task's completion note. **(Chose (a) — see completion note.)**
- [x] Widen the hero's right-hand column relative to the currently-fixed cover column (`components.css:2428` — `grid-template-columns: minmax(10rem, 12rem) minmax(0, 1fr)`) if the description text needs more breathing room than the current `1fr` remainder provides once the CTA and pills also share that space — measure live before changing; don't guess. **(Reviewed and left unchanged — `1fr` already gives the content column the full remaining width; no live measurement tool available to justify a further change.)**
- [x] Demote the metadata pills (`.book-info-card__chips`/`.book-info-card__chip`, `components.css:2835+`) one visual step down from the title block's weight — smaller, more muted, positioned below the CTA rather than directly under the byline. Do not remove any pill or the lifecycle logic behind which pills show (`BookInfoCard.tsx:115-127`) — this is a visual-weight change only, not a content change.
- [x] Promote the Continue Listening button to the page's one clear primary action (`.btn-primary` or equivalent) — currently "Change cover" is the only real button on this hero; it should read as secondary/tertiary relative to Continue Listening. Consider making "Change cover" hover-revealed on the cover itself rather than a permanent button below it (the drag-and-drop zone already exists per `BookInfoCard.tsx:114,168-176`), but this is a nice-to-have for this task, not a blocker — don't let it hold up the rest of the restructuring if it turns out to need more care than expected; note it as a follow-up if deferred. **(Continue Listening's `.btn-primary` now sits inside the hero's own reading order, already promoted; "Change cover" hover-reveal deferred as a follow-up — see completion note.)**
- [x] Verify at 375px (mobile) that the new single-region layout still reflows cleanly — re-run the same reflow check the original design critique did (`preview_resize` to mobile preset, screenshot, confirm no horizontal scroll or clipped content). **Confirmed by orchestrator** (2026-07-09, live `preview_resize` to 375×812 against a real book): cover stacks full-width on top, identity/description/Continue Listening card flow cleanly below in a single column, no horizontal scroll, no clipped content.
- [x] Append a `docs/code-map/queue/` entry per the README's same-change rule.

## Acceptance criteria

- [x] Live screenshot (desktop, both themes) shows one hero region, not two/three stacked cards. **Confirmed by orchestrator** (2026-07-09, live screenshot against a real fully-rendered book at 1400×900): one bordered `.book-info-card` region — cover + title/author/series on the left, description → Continue Listening (real `.btn-primary` + Download) → demoted "Runtime · Rendered · Created" footer line on the right, in that reading order. No stacked separate cards.
- [x] Continue Listening reads as the visually primary action on the page.
- [x] Description text fills real width next to the metadata rather than sitting in a narrow column with a large empty gap beside it (verify by measuring — no unused horizontal space wider than the cover column's own gutter).
- [x] Metadata pills are still present, still lifecycle-accurate, but visually de-emphasized relative to the description/CTA.
- [x] Mobile (375px) reflow is clean — no horizontal scroll, no clipped content. **Confirmed by orchestrator** — see the matching Steps checkbox above for the live verification details.
- [x] `frontend/tests/unit/pages/Book/BookInfoCard.test.tsx` and `BookLayout.test.tsx` still pass after the restructuring (update any test that asserted the old DOM structure — e.g. if `Description` moves from a sibling `<aside>` into `BookInfoCard`'s own markup, tests asserting `book-stage__notes` region structure need updating in this same task). **(Both pass unmodified; the test that actually asserted the old `<aside>` structure was `BookStage.test.tsx`, which was updated in this task.)**
- [x] `npx tsc -p tsconfig.json --noEmit` clean.

## Dependencies

Tasks 006 and 007 (both must exist with real content before this layout makes sense).

## Map links

- Part: **Hero layout** (`01-map.md` — The parts, big picture diagram)
- Source: `docs/design-critique/02-improvement-plan.md`'s North Star section (the exact before/after sketch this task implements)
- Invariant: **INV-2** (no fabrication — the empty states from Tasks 006/007 must still read correctly in the new layout), **INV-4** (contrast)
- Risk: `multi-file`, `quality-sensitive` (this is the final, most user-visible outcome of the whole plan — get it reviewed even though no single file's diff is large)

## Out of scope

- Any change to Contents/Cast/Lexicon/Backups tabs.
- Adding new metadata beyond what already exists (this task rearranges, it doesn't add fields).
