# Improvement Plan — Book Tab

## Impact/effort matrix

| Quadrant | Strategy | Finding IDs |
|----------|----------|-------------|
| **Quick Wins** — High impact, Low effort | Fix immediately, same change | DC-001, DC-002, DC-004, DC-008 |
| **Big Bets** — High impact, High effort | The two features that make this an actual front door | DC-003, DC-005 |
| **Fill-ins** — Low impact, Low effort | Bundle into the Big Bets' layout work | DC-007, DC-009 |
| **Defer** — needs a product decision first | Don't build until scope is chosen | DC-006 |

## Phased roadmap

**Phase 1 — Immediately (same PR, ~1 day):** DC-001, DC-002, DC-004, DC-008.
All four are one-line-to-one-paragraph fixes with zero design risk: swap a default string (`'contents'` → `'book'`), swap a color token (`--text-subtle` → `--text-muted`), bump a CSS dimension (17.9px → ≥24px), rewrite two sentences of copy. Ship these regardless of what happens with Phase 2 — none of them are blocked by or block the bigger work.

**Phase 2 — This sprint / next (~2-4 days, excluding backend schema work):** DC-003 (listen/resume affordance) using the *existing* `availableAudiobooks` data — this alone converts the tab from "metadata panel" to "front door" for every already-rendered book, with no backend changes required. Fold DC-007 (dead whitespace) and DC-009 (cover sizing) into this same pass, since the North Star layout below resolves both as a side effect of where the new content goes.

**Phase 3 — Needs backend work, schedule separately:** DC-005 (description/synopsis field) — requires a schema/migration decision (versioned per this repo's contract convention) before any frontend work starts. Once the field exists, the frontend side is close to free (`InlineEdit multiline` already exists and is unused).

**Defer — decide before building:** DC-006 (duplicate `BookInfoCard` on Publish). This is a product-shape question, not a violation with one obvious fix — see the North Star's closing note.

## North Star — beyond the fixes

The lane findings define the floor (broken defaults, contrast, target size). This section is the ceiling: what would actually make this read as a front door rather than a well-fixed metadata panel.

**Lens: Apple HIG + Audible/Kindle-class product-page precedent.**

1. **What would they remove?** The card's caption about itself. "BOOK OVERVIEW / A compact summary of the cover, metadata, and current production state" (`BookStage.tsx:19-23`) is chrome describing chrome — a real product page never explains what kind of page it is. Remove the eyebrow+subtitle entirely; let the cover and title carry the page's identity the way a book cover always has.

2. **What gets promoted to the one primary action?** Right now there is no primary action on this page at all — "Change cover" (a `btn-ghost`) is the only button, and it's an editing action, not a consuming one. The primary action should be **"Continue listening" / "Download latest" / "Start listening"** (DC-003) — the one thing this whole redesign was asked to enable. Demote "Change cover" to a hover-revealed affordance on the cover itself (the drag-and-drop zone already exists; the button doesn't need to sit permanently below it competing for attention).

3. **How would they group content?** Reading order should be: **who/what** (cover, title, author, series — already correct) → **why you'd care** (description, once DC-005 exists) → **what to do next** (the listen/continue CTA) → **secondary detail** (runtime/predicted/created pills, demoted one visual step down from where they sit today, since Audible-class pages treat "narrator, length, release date" as a quiet footer line, not chips at the same weight as the synopsis).

4. **Layout skeleton (before → after):**

   ```
   BEFORE                                    AFTER
   ┌─────────────────────────────────┐       ┌──────────────────────────────────────┐
   │ BOOK OVERVIEW (eyebrow)         │       │  [cover]   Title                     │
   │ "A compact summary of..."       │       │  [cover]   by Author · Series #12    │
   ├─────────────────────────────────┤       │  [cover]                              │
   │ [cover]  Title                  │       │  [cover]   Description text runs here │
   │ [cover]  by Author · Series #12 │       │  [cover]   across the full remaining  │
   │ [cover]  ●Runtime ●Rendered      │  ==>  │  [cover]   width instead of stopping  │
   │ [cover]  (empty space →)         │       │            halfway across the card.  │
   │          (empty space →)         │       │                                       │
   ├─────────────────────────────────┤       │           [▶ Continue Listening]     │
   │ OVERVIEW NOTES (separate card)   │       │           Runtime 1h31m · Rendered   │
   │ "This area is reserved for..."   │       │           Created Jul 6              │
   └─────────────────────────────────┘       └──────────────────────────────────────┘
   ```
   One region, not two stacked cards — Gestalt proximity says the description belongs physically beside the thing it describes, not in a separate bordered box underneath.

5. **Spacing/typographic rhythm:** the title block already earns real size (`--book-info-title-size: 2.35rem`) — extend that same restraint to the CTA (make it a real button, not another ghost link) and let the pill row drop in both size and visual weight relative to today, so the eye lands on title → description → CTA before it ever reaches the metadata chips.

**Closing note on DC-006 (deferred):** once the CTA above exists on the Book tab, Publish's sidebar copy of `BookInfoCard` should almost certainly shrink to a slim identity strip (cover thumbnail + title + a "View on Book tab" link) rather than a second full editable hero — but that's a scope call worth confirming with the owner before touching Publish, since Publish currently doubles as a fallback "see the book's identity" surface for anyone who lands there first.

## Suggested next steps

- **Phase 1** (DC-001, DC-002, DC-004, DC-008) is small and self-contained enough to implement directly — no plan needed, just do it.
- **Phase 2/3** (the listen affordance + description field) are exactly the kind of multi-file, has-a-shape-decision work `/plan-architect` is for: point it at this file (`02-improvement-plan.md`) and it will decompose the North Star layout + DC-003/DC-005 into a sequenced task set with acceptance criteria, including the backend schema question for DC-005.
- The DC-006 scope call (what Publish's sidebar should show) is the one contested decision here — small enough not to need a full `/fusion-reasoning` panel, but worth a direct answer from you before Phase 2 work touches `PublishStage.tsx`.
- Re-run `/design-critique` on this same scope after Phase 1 + 2 land — the P1 count should drop to zero and this becomes the measurable proof the tab now does its job.
