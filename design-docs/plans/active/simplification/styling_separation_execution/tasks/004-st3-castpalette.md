# Task 004 — Convert CastPalette.tsx

Status: complete — 2026-07-10

## Goal

Convert inline styles to classes in `frontend/src/pages/Book/studio/CastPalette.tsx` per the
shared procedure.

## Map links

- Procedure: `000-conversion-procedure.md` (read this first — it's the actual instructions).
- Map: `../01-map.md` Part 3 (this file's row), Invariants I3/I4.
- Shared classes available: `../01-map.md` Part 2 / added by `003-st2-shared-classes.md`.
- Risk flag: `none`.

## Exact target

`frontend/src/pages/Book/studio/CastPalette.tsx` — 48 `style={{` occurrences as of 2026-07-10 (this
count doubled from the original styling-separation doc's 24, due to Director's Console work added
after that doc was written — re-count with `grep -c "style={{" <file>` before starting, in case it
changed again). This file's existing page-level CSS (if any) likely lives in
`theme/components/book.css` or `book-tabs.css` (Casting tab) after task 002's split — check both
for the right home for any new file-local classes.

## Steps

Follow `000-conversion-procedure.md` steps 1–6 against this file. No file-specific deviations
known — if you find one (e.g. a pattern this file uses that doesn't fit the static/dynamic split
cleanly), use judgment per the procedure's guidance and note it in your completion note.

## Acceptance criteria

- [x] `grep -c "style={{" frontend/src/pages/Book/studio/CastPalette.tsx` — remaining count is only
      genuinely-dynamic values (each verified to legitimately depend on props/state/measurement).
- [x] Any new shared-pattern classes used are from `003-st2-shared-classes.md`'s set where they
      match; any new file-local classes live in the correct `theme/components/*.css` file.
- [x] No DOM structure, prop, or handler changes.
- [x] `npm -C frontend run build`, `npm -C frontend run lint`, `npm -C frontend run test -- --run`
      all green.
- [x] One commit.

## Dependencies

- Blocked by: `002-st1-split-components-css.md`, `003-st2-shared-classes.md`.
- Blocks: none (parallel-safe with all other Workload C tasks).

## Completion note (2026-07-10)

Converted all 48 original `style={{...}}` occurrences in
`frontend/src/pages/Book/studio/CastPalette.tsx`. 12 `style={{...}}` remain — 11 hold genuinely
dynamic values (selection state / `char.color` / hover-focus / measurement-free but state-derived
booleans), and one (`VoiceProfileSelect`'s `style` prop) is a deliberate exception: that child
component's own markup applies its base look via an inline `style={{ ...defaults, ...style }}`,
and an inline `style` attribute always wins over any CSS class regardless of specificity — passing
`className` instead would have silently dropped the width/font-size/padding/margin-top overrides,
a real visual regression. Left it inline with a comment explaining why.

Reused `label-micro-muted` (tier count badge, character/narrator subtitle truncation, override-voice
label) from the ST-2 shared set. Added file-local classes to `theme/components/book.css` (this
component isn't part of the Casting-tab/`book-tabs.css` domain — it's the Director's Console
CastTool's side palette, part of book.css's studio/workspace domain): `.cast-palette`,
`.cast-palette__header(-title)`, `.cast-palette__body`, `.cast-palette__footer`,
`.cast-palette__tier-header(-label)`, `.cast-palette__tier-chevron`, `.cast-palette__tier-empty`,
`.cast-palette__tier-list`, `.cast-palette__row`, `.cast-palette__card`, `.cast-palette__label`,
`.cast-palette__avatar`, `.cast-palette__info`, `.cast-palette__name`, `.cast-palette__truncate`,
`.cast-palette__count-badge`, `.cast-palette__variant-indicator`, `.cast-palette__row-menu`,
`.cast-palette__menu-icon`, `.cast-palette__variant-list`, `.cast-palette__variant-btn`,
`.cast-palette__variant-dot`, `.cast-palette__variant-text`, `.cast-palette__variant-label`,
`.cast-palette__variant-ban-icon`, `.cast-palette__narrator(-btn/-icon/-dot/-name)`,
`.cast-palette__override-label`, `.cast-palette__override-caption`, `.cast-palette__empty(-text/
-text--lead/-text--tail/-add-btn)`, `.cast-palette__temp-wrap`, `.cast-palette__temp-btn`.

Tokenization: substituted `gap: 4`/`marginTop: 4`/`top: 4`/`right: 4` → `var(--space-1)` and
`gap: 8` → `var(--space-2)` (exact 4px/8px matches). Token gaps found (no exact match, left as
literal): `fontSize: '0.72rem'` (character-name and narrator-name rows,×2) and `fontSize: '0.7rem'`
(the `VoiceProfileSelect` override, ×1) — between `--type-micro` (0.6875rem) and `--type-caption`
(0.75rem), no exact hit; `gap: 6` (×3, variant button / empty-add-btn / temp-btn) — between
`--space-1` (4px) and `--space-2` (8px), no exact hit; `padding: '3px var(--space-2)'` — the `3px`
has no exact space-token match.

Deviation flagged: mid-task, a concurrent lane's git operation reverted both target files back to
their pre-edit state after the first edit pass (known shared-checkout race per project memory);
redid the conversion in a single `Write`/`cat >>` pass and verified immediately. No content lost
beyond the wasted first pass.
