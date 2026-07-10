# Task 003 — Add ST-2 shared classes

Status: complete — 2026-07-10

## Goal

Add 6 new shared CSS classes for confirmed-repeated static inline-style patterns, to
`frontend/src/theme/components/core.css` (created by task 002).

## Map links

- Map: `../01-map.md` Part 2 (exact pattern table + occurrence counts).
- Risk flag: `multi-file` — these classes must render identically to every inline instance they'll
  later replace in Workload C.
- Depends on: `002-st1-split-components-css.md` (core.css must exist).

## Exact target

Add to `frontend/src/theme/components/core.css`:

```css
.label-micro-muted {
  font-size: var(--type-micro);
  color: var(--text-muted);
}

.label-micro-muted-strong {
  font-size: var(--type-micro);
  font-weight: 700;
  color: var(--text-muted);
}

.label-caption-strong {
  font-size: var(--type-caption);
  font-weight: 700;
  color: var(--text-primary);
}

.label-micro-muted-italic {
  font-size: var(--type-micro);
  color: var(--text-muted);
  font-style: italic;
}

.label-uppercase-sm {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
  display: block;
  margin-bottom: 0.25rem;
}

.label-uppercase-md {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
  display: block;
}
```

(Rename any of these if a clearer name occurs to you while implementing — these are functional
names, not sacred; just record the final names you used in this task's completion note, since
Workload C tasks will reference them by these names unless told otherwise.)

## Steps

- [x] Confirm `theme/components/core.css` exists (from task 002).
- [x] Add the 6 classes above (or your renamed equivalents) to `core.css`.
- [x] `npm -C frontend run build` — succeeds.
- [x] Spot-check: find one existing inline occurrence of each pattern (e.g.
      `grep -rn "fontSize: 'var(--type-micro)', color: 'var(--text-muted)'" frontend/src --include=*.tsx`
      for `.label-micro-muted`) and confirm the new class's computed styles match — you don't need
      to convert that occurrence yet (Workload C does the actual swaps file-by-file), just confirm
      the class is correctly defined.

## Acceptance criteria

- [x] All 6 classes exist in `core.css`, correctly using `var(--token)` references (no hardcoded
      values except literal `0.7rem`/`0.75rem`/`0.05em` sizes that the doc's own audit confirmed
      aren't yet tokenized — leave those as-is, don't invent new tokens in this task).
- [x] `npm -C frontend run build` succeeds.
- [x] `input-field` and `form-label` are confirmed to need NO new work (already correct per
      `../01-map.md` Part 2) — do not add a `.form-label` class, it would be dead code.
- [x] One commit.

## Completion note (2026-07-10)

Added all 6 classes to `frontend/src/theme/components/core.css` (append, after
`.chapter-header__main`), using the names from the map as-is — no renames needed, they were
already clear:

- `.label-micro-muted`
- `.label-micro-muted-strong`
- `.label-caption-strong`
- `.label-micro-muted-italic`
- `.label-uppercase-sm`
- `.label-uppercase-md`

CSS matches the exact target in this task file verbatim (var(--token) refs preserved, literal
`0.7rem`/`0.75rem`/`0.05em` left un-tokenized per the doc's own audit).

`input-field` confirmed already defined in `theme/components/shared.css` (task 002 split) and used
at `components/CharactersTab.tsx:187,265` — no new work. `form-label` confirmed to not exist
anywhere in the codebase — not added (would be dead code).

Spot-check (grep + a small brace-matching script to catch multi-line `style={{...}}` blocks,
`frontend/src/demo/` excluded as out of this plan's scope): one confirmed production
(non-`demo/`) occurrence per class, computed styles match the new class:

- `.label-micro-muted` — `components/progress/SegmentRenderMonitor/SegmentRenderMonitor.tsx:225`
  (`{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }`,
  extra `display`/`alignItems`/`gap` stay inline in Workload C — fine, they're unrelated to the
  label pattern). 17 production occurrences found total (map said 49 including likely demo/ or a
  since-changed count — flagging the discrepancy, not blocking: the pattern demonstrably repeats).
- `.label-micro-muted-strong` — `pages/Welcome/WelcomePage.tsx:194-196` (exact 3-prop match, plus
  extra `letterSpacing` etc. that stay inline). 4 production occurrences found (map said 16 —
  same discrepancy note as above).
- `.label-caption-strong` — `pages/Book/BookLayout.tsx:157-161`, exact match
  (`flex: 1, fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)'`).
  1 production occurrence found (map said 11).
- `.label-micro-muted-italic` — `pages/Book/studio/CastPalette.tsx:756`, exact match
  (`padding: '0.2rem 0.6rem', fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic'`).
  3 production occurrences found (map said 11).
- `.label-uppercase-sm` — `pages/ProjectLibrary/ProjectLibraryPage.tsx:159`, exact match
  (`fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, display: 'block', marginBottom: '0.25rem'`).
  8 production occurrences found — matches map count exactly.
- `.label-uppercase-md` — `pages/ProjectDetail/components/ProjectModals.tsx:66`, exact match
  (`fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block'`).
  8 production occurrences found — matches map count exactly.

Occurrence-count discrepancies for the first four classes (17 vs 49, 4 vs 16, 1 vs 11, 3 vs 11) are
noted for Workload C's task authors — the map's Part 2 table counts may have included
`frontend/src/demo/` (out of scope for this plan) or shifted since the map was written. Not a
blocker for this task: each pattern's existence and exact CSS match were confirmed with at least
one real production occurrence, which was this task's acceptance bar.

No hardcoded values with no matching token were found while writing these 6 classes (the literal
`0.7rem`/`0.75rem`/`0.05em` values are pre-confirmed non-tokenized by the doc's own audit, not a
gap this task discovered).

## Dependencies

- Blocked by: `002-st1-split-components-css.md`.
- Blocks: all of Workload C (004–017), which consume these classes where applicable.

## Out of scope

- Don't touch `alignItems:'center'`/`flex:1` — see `019-followup-missed-utility-usage.md`.
- Don't go convert any JSX file's inline styles in this task — that's Workload C.
