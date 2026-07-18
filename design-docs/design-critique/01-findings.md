# Design Critique — Findings — Book Tab

## P1 — Blocker

### DC-001: Default landing tab for every existing book is still Contents, not Book

| Field | Value |
|-------|-------|
| **Severity** | P1 — Blocker |
| **Lanes / Framework** | B (Nielsen H4 — consistency, and the stated redesign intent itself) |
| **Location** | `frontend/src/pages/Book/lib/stages.ts:22-38` (`getLastStage`), `frontend/src/pages/Book/BookLayout.tsx:40-48` (`BookIndexRedirect`) |
| **Effort** | XS (one-line default change) |
| **Theme impact** | None |

**Issue:** `BookIndexRedirect` sends every "open this book" navigation to `getLastStage(bookId)`, which reads `localStorage['studio.book.<id>.lastStage']` and **falls back to `'contents'`** when nothing is stored:

```ts
export function getLastStage(bookId: string): BookStage {
  if (typeof window === 'undefined') {
    return 'contents';
  }
  try {
    const stored = window.localStorage.getItem(getBookStageStorageKey(bookId));
    const storedStage = stored ?? undefined;
    if (isBookStage(storedStage)) {
      return storedStage;
    }
    return 'contents'; // <-- fallback
  } catch {
    return 'contents';
  }
}
```

Every book that existed before this feature shipped has no `lastStage` key yet (confirmed live: the library backing this review has 6 real projects, all pre-dating the tab split). The very next time any of them is opened, this fallback fires and the user lands on **Contents** — exactly the "I don't want to immediately just see chapters" experience the redesign was built to prevent. The tab bar correctly lists Book first, but the router never routes there unless a browser has already visited that specific book's Book tab once. This isn't a one-time cold-start edge case — it silently defeats the redesign's stated goal for the entire existing library, indefinitely, until each book is manually visited via `/book/:id/book` at least once.

**Current:**
```ts
return 'contents';
```

**Fix:** Default to `'book'`. If "last visited tab" behavior is still wanted for *returning* sessions, only apply it once a chapter-workspace visit has actually happened for that book (i.e., track "last non-book stage visited" separately, or simply always default cold opens to `book` and let explicit tab clicks still set `lastStage` for same-session navigation). The simplest correct fix is a one-line default swap:
```ts
return 'book';
```
Also update `getLastStage`'s two other `'contents'` fallbacks (window-undefined SSR guard, and the `catch` block) to `'book'` for consistency.

---

### DC-002: Empty-field placeholder text uses `--text-subtle` for body text — violates the project's own binding rule, fails WCAG in both themes

| Field | Value |
|-------|-------|
| **Severity** | P1 — Blocker (Route-A canon violation + independently verified WCAG failure — cross-lane promotion) |
| **Lanes / Framework** | A (WCAG SC 1.4.3, Level AA) + Route A canon (`design-docs/specs/design-system.md` §2.4/§8.3, binding) |
| **Location** | `frontend/src/pages/Book/components/BookInfoCard.tsx:264` (`color: 'var(--text-subtle)'` on the empty-author trigger) and `:284` (empty-series); `frontend/src/theme/components.css:2684, 2745, 2769-2784, 2799-2804, 2809` |
| **Effort** | XS (swap the token) |
| **Theme impact** | Low — stays within the existing gray text ladder, just a different rung |

**Issue:** `design-docs/specs/design-system.md` §2.1 documents `--text-subtle` as **"large/chrome only; MUST NOT carry body text"**, and §2.4/§8.3 states this explicitly and by name: *"`--text-subtle` is chrome/large-only in both themes... `--text-subtle` MUST NOT carry body text in either theme — use `--text-muted` or `--text-secondary` instead."* This is the one contrast restriction the project's own binding spec calls out as still active (the other two known failures are marked RESOLVED).

`BookInfoCard`'s empty-author and empty-series placeholder text ("Add author", "Add series") is exactly the case the rule warns about: 16.32px (`1.02rem`)/14.08px (`0.88rem`) italic text — not large by the SC 1.4.3 definition (≥24px regular or ≥18.67px bold) — styled with `color: 'var(--text-subtle)'` plus `opacity: 0.8` stacked on top (further dimming it).

Live-measured computed color: `rgb(105, 120, 143)` (light) / `rgb(107, 122, 146)` (dark), both at `opacity: 0.8`, on `--surface` (`#ffffff` light / `#1a1d27` dark):

- **Light:** effective contrast ≈ **3.11:1** — fails SC 1.4.3's 4.5:1 requirement by 1.4:1.
- **Dark:** effective contrast ≈ **2.96:1** — fails by an even wider margin, and would fail even the 3:1 large-text threshold.

This is independently confirmed by two lanes at once (WCAG measurement, and the project's own documented token-usage rule), which is why it's promoted to P1 rather than sitting at P2.

**Current:**
```tsx
style={{
  ...
  color: 'var(--text-subtle)',
  fontStyle: 'italic',
  opacity: 0.8,
}}
```
```css
.book-info-card__byline.inline-edit-trigger { color: var(--text-subtle); ... opacity: 0.8; }
.book-info-card__metadata-read--empty { color: var(--text-subtle); ... }
```

**Fix:** Replace `--text-subtle` with `--text-muted` (already AA at normal weight in both themes per §2.4: 5.49:1 light / 5.57:1 dark) everywhere it's used for the empty-field placeholder states, and drop the extra `opacity: 0.8` multiplier (it's redundant once the token itself carries the right amount of de-emphasis, and it's what's pushing the ratio down further). Keep the italic style as the "this is a placeholder, not a value" signal — italics plus a legible gray reads as "empty" without sacrificing contrast.

---

### DC-003: No listen/resume affordance — the stated primary goal of this tab is 0% implemented

| Field | Value |
|-------|-------|
| **Severity** | P1 — Blocker (the explicit, single most important requirement for this surface) |
| **Lanes / Framework** | B (Nielsen H1 — visibility of system status; H6 — recognition rather than recall) + D (Apple HIG — give people a clear, immediate path to their content) + Persona 27 (Casual Listener, INFERRED — red flag: *"a completed render that does not surface a play button immediately"*) |
| **Location** | `frontend/src/pages/Book/stages/BookStage.tsx:36-44` (the entire "Overview notes" aside is static placeholder copy); data already available at `frontend/src/pages/Book/useBookData.ts:84,103-107` (`availableAudiobooks`) |
| **Effort** | M for a proper "Continue listening" card; S if scoped to a simple "latest assembly" link |
| **Theme impact** | None |

**Issue:** `BookStage.tsx` renders:
```tsx
<aside className="book-stage__notes" aria-label="Book overview notes">
  <div className="book-stage__panel">
    <strong>Overview notes</strong>
    <p>
      This area is reserved for a description, synopsis, or any higher-level notes you want
      visible before you go into Contents, Cast, Lexicon, or Publish.
    </p>
  </div>
</aside>
```
This is a hard-coded string — there is no field behind it, and nothing here reflects whether the book has ever been rendered or assembled. Meanwhile, one tab over, `PublishStage.tsx` is already fetching and displaying exactly the data this tab needs: `availableAudiobooks` — each with `title`, `cover_url`, `duration_seconds`, `size_bytes`, `created_at`, `url` (download), and a per-file `description` (`frontend/src/types/index.ts:445-455`). `useBookData.ts` already loads this array for every book (`api.fetchProjectAudiobooks`, line 103) — it flows straight into `BookDataContext` and is sitting unused by `BookStage`.

For a book like the one used in this review — fully rendered, "Runtime 1h 31m," chip reading "Rendered" — a user opening the Book tab today sees **zero indication that a finished, listenable file exists**, let alone a way to play or download it. This directly contradicts the goal stated for this surface: *"if somebody wanted to just simply get in and read the book or listen to the book, that homepage would be the starting point."* Right now that homepage has no listening starting point at all.

**Fix:** Replace (or supplement) the "Overview notes" placeholder with a **"Continue listening" / "Latest assembly" card** driven by `availableAudiobooks` (most-recent by `created_at`):
- Cover thumbnail (falls back to the book cover), title, duration, "created X ago."
- A primary action — at minimum a **Download** action (the data/URL already exists via `Audiobook.url`); if in-browser playback is in scope, an `<audio>` element or a link into a player view is the "Audible-grade" version.
- Empty state (`hasRendered === false` or `availableAudiobooks.length === 0`): a calm, honest "Nothing rendered yet — head to Contents to start casting and rendering" message, not a broken/empty card. This keeps the no-fabrication principle intact (`[[progress-no-fabrication-principle]]`-equivalent for this repo: never imply a file exists that doesn't).

This is the highest-leverage single change available — it turns the tab from "metadata panel" into an actual front door, using data the codebase has already wired up everywhere except the one place that needs it most.

---

## P2 — Major

### DC-004: Series-position stepper buttons fail WCAG Target Size Minimum

| Field | Value |
|-------|-------|
| **Severity** | P2 — Major (verified WCAG failure, off the primary critical path) |
| **Lanes / Framework** | A (WCAG SC 2.5.8, Level AA) |
| **Location** | `frontend/src/theme/components.css:2564-2570` (`.book-info-card__stepper`) |
| **Effort** | XS |
| **Theme impact** | None |

**Issue:** Live-measured (via computed styles on the actual rendered `-`/`+` buttons): **17.9 × 17.9 CSS px**. SC 2.5.8 requires pointer targets to be **≥24×24 CSS px** (or ≥24px of spacing to the next small target — these are directly adjacent to the number input with no such spacing). Apple HIG's own guidance is more generous still (44×44pt) — 17.9px sits well under even the AA floor.

**Current:**
```css
.book-info-card__stepper {
  width: 1.12rem;   /* 17.92px at 16px root */
  height: 1.12rem;
  ...
}
```

**Fix:** Raise to at least `1.5rem` (24px) — pair with a larger icon glyph (currently `font-size: 0.82rem` on the `+`/`-` glyph) so the visual weight scales with the new hit area rather than looking like a big empty circle around a tiny mark. If the compact circular look is intentional, keep the *visual* circle small and expand only the invisible hit area via `padding`/a pseudo-element, matching the pattern this project already uses elsewhere for compact icon buttons (per `design-docs/specs/design-system.md` §8.4's own carve-out for compact controls) — but the interactive target itself must reach 24px either way.

---

### DC-005: No `description`/synopsis field exists anywhere in the data model

| Field | Value |
|-------|-------|
| **Severity** | P2 — Major (explicitly requested capability, currently entirely absent — not degraded, missing) |
| **Lanes / Framework** | B (Nielsen H2 — match with what the product now claims to offer) |
| **Location** | `frontend/src/types/index.ts:65-76` (`Project` interface — no `description`/`synopsis` field); `frontend/src/pages/Book/stages/BookStage.tsx:36-44` (placeholder copy in its place) |
| **Effort** | M — needs a backend column/migration + API field + frontend wiring, not just UI |
| **Theme impact** | None |

**Issue:** The owner wants an actual book description/overview, editable in place, the way an Audible or Kindle product page leads with one. Today `Project` has no such field at any layer — this isn't a rendering bug, the data simply doesn't exist yet. The "Overview notes" card is inert static copy standing in for a feature that hasn't been built.

**Fix:** Add a `description` (or `synopsis`) field to the `Project` model (backend schema + migration, per this repo's versioned-contract convention — `CLAUDE.md`'s "every contract declares an explicit version" applies to any schema touch) and thread it through `fetchProject`/`updateProject`. On the frontend, this is nearly free once the field exists: `InlineEdit` **already supports a `multiline` prop** (`frontend/src/components/forms/InlineEdit.tsx:12,33,107-108`) that was built for exactly this shape and is currently unused anywhere in `BookInfoCard`/`BookStage`. Swap the placeholder `<p>` for an `<InlineEdit multiline>` bound to the new field, with a real empty-state placeholder ("Add a description...") instead of the current "this area is reserved for..." scaffolding note.

---

### DC-006: `BookInfoCard` is duplicated verbatim on the Publish tab sidebar

| Field | Value |
|-------|-------|
| **Severity** | P2 — Major |
| **Lanes / Framework** | E (visual hierarchy — redundant focal point) + C (cognitive load — two live edit surfaces for the same fields) |
| **Location** | `frontend/src/pages/Book/stages/BookStage.tsx:27-34` and `frontend/src/pages/Book/stages/PublishStage.tsx:114-121` both render the full, fully-editable `<BookInfoCard>` |
| **Effort** | S |
| **Theme impact** | None |

**Issue:** The exact same component — full cover, editable title/author/series, series-position stepper, metadata pills — appears twice: once as the Book tab's entire reason for existing, and again as Publish's sidebar. This works against the goal of Book being *the* front door: if the identical hero card is available (and independently editable) from Publish too, Book's claim to being the definitive landing surface is diluted, and a user can edit the same fields from two different tabs with no indication the other exists. It also means any future addition to `BookInfoCard` (like DC-003's listen affordance, once built) will show up in Publish's sidebar too unless explicitly excluded — worth deciding intentionally rather than by inertia.

**Fix:** Decide what Publish's sidebar actually needs (likely just a slim identity strip — cover thumbnail, title, author — not the full editable hero) and split a lighter-weight `BookIdentityStrip`-style component out of `BookInfoCard` for that context, reserving the full editable card for the Book tab alone. This is a product decision, not just a refactor — flag it in the improvement plan rather than deciding unilaterally here.

---

## P3 — Polish (grouped)

| ID | Finding | Lane | Location | Effort |
|----|---------|------|----------|--------|
| DC-007 | Roughly 29% of the hero card's width (right of the metadata block, left of the card edge) sits completely empty on desktop — precisely where a description/CTA belongs | E | `frontend/src/theme/components.css:2426-2430` (`.book-info-card` grid) | S (resolves itself once DC-003/DC-005 land) |
| DC-008 | Copy speaks in internal/developer terms ("A compact summary of the cover, metadata, and current production state," "reserved for a description, synopsis, or any higher-level notes... before you go into Contents, Cast, Lexicon, or Publish") rather than reader-facing product framing | D | `frontend/src/pages/Book/stages/BookStage.tsx:19-23, 38-42` | XS |
| DC-009 | Cover column is a fixed `minmax(10rem, 12rem)` — modest next to an Audible/Kindle-style hero cover; revisit once the right-hand content actually fills the row (see North Star) | E/F | `frontend/src/theme/components.css:2428` | S |

No P4 items were found in this scope.
