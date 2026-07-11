# Task 008 — Convert ResyncPreviewModal.tsx

Status: complete — 2026-07-10

## Goal

Convert inline styles to classes in
`frontend/src/pages/ChapterEditor/components/ResyncPreviewModal.tsx` per the shared procedure.

## Map links

- Procedure: `000-conversion-procedure.md`.
- Map: `../01-map.md` Part 3, `../00-overview.md` §5 (this file is LIVE, keep it — do not treat it
  as dead-tree code despite its path suggesting the ChapterEditor tree).
- Risk flag: `none`.

## Important context

This file lives under `pages/ChapterEditor/components/`, which might look like the dead
ChapterEditor tree — **it is not, for this file.** `ResyncPreviewModal.tsx` is imported by
`pages/ChapterEditor/components/DirectorsConsole/CastTool/index.tsx` and
`pages/Book/components/ChapterTextPanel.tsx`, both of which are reachable from the live-routed Book
workspace (`BookLayout.tsx`). Convert it normally.

## Exact target

`frontend/src/pages/ChapterEditor/components/ResyncPreviewModal.tsx` — 37 `style={{` occurrences
as of 2026-07-10 (unchanged from the parent doc — re-count before starting).

## Steps

Follow `000-conversion-procedure.md` steps 1–6.

## Acceptance criteria

- [x] Remaining `style={{` count is only genuinely-dynamic values.
- [x] New shared-pattern classes reused from `003-st2-shared-classes.md` where applicable.
- [x] No DOM structure, prop, or handler changes.
- [x] `npm -C frontend run build`, `lint`, `test -- --run` all green.
- [x] One commit.

## Dependencies

- Blocked by: `002-st1-split-components-css.md`, `003-st2-shared-classes.md`.
- Blocks: none.

## Completion note (2026-07-10)

Converted all 37 `style={{...}}` occurrences. Remaining count: **2**, both genuinely dynamic
(close-button `cursor` tied to `loading`; confirm-button `opacity` tied to `loading`/`data`).

None of the 6 Part-2 `core.css` label classes matched exactly (this file's font sizes are
0.7/0.8/0.9rem etc., not the `--type-micro`/`--type-caption` values those classes use), so no
Part-2 shared class was reused for labels. Did reuse one pre-existing shared class not listed in
Part 2: **`.modal-close-btn`** (already defined in `theme/components/misc.css`, already consumed by
`components/overlays/ConfirmModal.tsx`) for the close button — kept the dynamic `cursor` as a
1-property inline style since `.modal-close-btn` hardcodes `cursor: pointer`.

Also followed this file's own existing convention (see original `btn-primary`/`btn-danger`
ternary on the confirm button) for the icon-circle's conditional background/color: replaced the
`data?.is_destructive ? ... : ...` inline style with a ternary `className` switch between two new
modifier classes, rather than leaving it inline.

New classes added to `frontend/src/theme/components/book.css` (appended at end of file, new
`/* ─── ResyncPreviewModal ─── */` section — chosen over `book-tabs.css` because this modal is a
general chapter-workspace overlay, not casting/lexicon-tab-specific):

`.resync-modal-overlay`, `.resync-modal-backdrop`, `.resync-modal-card`, `.resync-modal-header`,
`.resync-modal-icon` (+ `--warning`/`--success` modifiers), `.resync-modal-title-block`,
`.resync-modal-title`, `.resync-modal-description`, `.resync-modal-loading`,
`.resync-modal-loading-text`, `.resync-modal-body`, `.resync-modal-stats-grid`,
`.resync-modal-stat-card`, `.resync-modal-stat-label`, `.resync-modal-stat-row`,
`.resync-modal-stat-value` (+ `--success` modifier), `.resync-modal-stat-note`,
`.resync-modal-warning-box`, `.resync-modal-warning-heading`, `.resync-modal-warning-text`,
`.resync-modal-affected-list`, `.resync-modal-affected-label`, `.resync-modal-affected-chip`,
`.resync-modal-success-box`, `.resync-modal-success-text`, `.resync-modal-info-box`,
`.resync-modal-info-icon`, `.resync-modal-info-text`, `.resync-modal-actions`,
`.resync-modal-btn` (+ `--confirm` modifier).

**Tokenized** (exact matches found): `padding: 1.5rem` → `var(--space-5)`; `padding: 2rem` →
`var(--space-6)`; `gap: 1.5rem`/`gap: 8px`/`gap: 1rem`/`gap: 0.75rem`/`gap: 0.5rem`/`gap: 12px` →
`var(--space-5)`/`var(--space-2)`/`var(--space-4)`/`var(--space-3)`/`var(--space-2)`/
`var(--space-3)` respectively (per exact px/rem value); `padding: 0.75rem 1rem` →
`var(--space-3) var(--space-4)`; `margin-top: 0.5rem` → `var(--space-2)`; `border-radius: 10px`
(info box) → `var(--radius-card)`; `font-size: 1.5rem` (the two stat values) →
`var(--type-title)`; `font-size: 0.75rem` (affected-label) → `var(--type-caption)`. All colors in
this file were already `var(--token)` — no hardcoded hex/rgb found.

**Token gaps found (no exact match — left as literal, flagged for 018's report):**
- `border-radius: 12px` — used 4× (icon circle, both stat cards, warning/success/info boxes all
  use it too) — nearest tokens are `--radius-button` (8px) and `--radius-card` (10px); neither
  equal, not force-fit per the "don't force-fit close-but-not-equal" rule.
- `border-radius: 20px` (card), `border-radius: 4px` (affected-chip) — no matching radius token.
- `backdrop-filter: blur(8px)` — no matching blur token (`--blur-glass`/`--blur-glass-strong` are
  `saturate(180%) blur(20px/28px)` compound values, not equal).
- `max-width: 520px` — not a spacing-token candidate (component sizing, not spacing).
- `width/height: 48px` on `.resync-modal-icon` — numerically equals `--space-8` (48px), but left
  as a literal sizing dimension: no existing precedent in this codebase of applying `--space-*`
  tokens to component width/height (checked `misc.css` — an analogous 48px icon-circle sizing
  value there is also left as a raw literal), so treated space tokens as spacing-only (margin/
  padding/gap), consistent with that precedent.
- Font sizes with no exact token match (left as literals): `1.25rem` (title), `0.925rem`
  (description), `0.9rem` (loading text, warning heading), `0.7rem` (stat label, affected chip),
  `0.8rem` (stat note ×2, info text), `0.85rem` (warning text), `0.88rem` (success text). Nearest
  tokens (`--type-caption` 0.75rem, `--type-body` 0.9375rem, `--type-headline` 1.125rem,
  `--type-title` 1.5rem) don't equal any of these.
- Small spacing fractions with no exact match: `margin-bottom: 0.4rem`, `margin-right: 0.2rem`,
  `gap: 1.25rem`, `gap: 0.4rem`, `padding: 0.15rem 0.4rem`, `margin-top: 0.15rem`.

Build/lint/test: all green for this file. Full-suite `npm -C frontend run test -- --run` has 2
pre-existing unrelated failures (`ConfirmModal.test.tsx`, `ReviseTool.test.tsx`) — both read
`src/theme/components.css`, which no longer exists after the ST-1 domain split; confirmed via
`git stash` that these fail identically without this task's changes. Out of scope for this task
(likely 018's guard/spec-bump territory).
