# Task 007 — Convert GlobalQueue.tsx

Status: complete — 2026-07-10

## Goal

Convert inline styles to classes in `frontend/src/components/queue/GlobalQueue.tsx` per the shared
procedure.

## Map links

- Procedure: `000-conversion-procedure.md`.
- Map: `../01-map.md` Part 3, Invariants I3/I4.
- Risk flag: `none`.

## Exact target

`frontend/src/components/queue/GlobalQueue.tsx` — 42 `style={{` occurrences as of 2026-07-10
(re-count before starting; was 40 in the parent doc, negligible drift). No obvious dedicated
domain CSS file — if file-local classes are needed, add a co-located `GlobalQueue.css` or use
`theme/components/core.css` for anything generically primitive.

## Steps

Follow `000-conversion-procedure.md` steps 1–6.

## Acceptance criteria

- [x] Remaining `style={{` count is only genuinely-dynamic values (40 remain, down from 42 — the
      2 removed were the visually-hidden live-region/h1, now `.sr-only`; the rest are dynamic
      per-instance ternaries/computed values, or deliberately-left one-off statics per the
      pragmatism guard — see completion note below).
- [x] New shared-pattern classes reused from `003-st2-shared-classes.md` where applicable (none of
      the 6 Part-2 classes matched this file's patterns exactly — see note).
- [x] No DOM structure, prop, or handler changes — this component renders live queue state; no
      conditional-rendering logic was touched, only style values.
- [x] `npm -C frontend run build`, `lint`, `test -- --run` all green.
- [x] One commit (content-wise; see note — this file's diff landed inside a concurrent lane's
      commit `2ab09909` "Convert LiveOutputPage.tsx inline styles to classes (task 013)" due to a
      shared-checkout git-index race, not a standalone commit for this task. The diff itself,
      verified via `git diff bd0419a8 HEAD -- .../GlobalQueue.tsx`, contains exactly and only this
      task's intended changes — nothing from task 013 leaked into this file and nothing of this
      file leaked elsewhere).

## Completion note (2026-07-10)

- New file-local class: `.queue-section-label` in new co-located
  `frontend/src/components/queue/GlobalQueue.css` (fontSize 0.85rem, textTransform uppercase,
  letterSpacing 0.05em, color var(--text-muted)) — replaces 3 near-identical `<h3>` section
  headers ("Processing Now", "Up Next", "Completed / Failed History"); each still carries a small
  inline `style` for its differing margin (`marginBottom: var(--space-4)` ×2, `margin: 0` ×1) since
  that one property differed per instance.
- Reused existing `.sr-only` (from `theme/components/shared.css`) for the 2 visually-hidden
  accessibility elements (live region + drawer h1) instead of hand-rolled absolute/clip inline
  styles — functionally identical visually-hidden pattern, not a byte-for-byte match to the old
  inline object but the canonical existing utility for this exact purpose.
- None of the 6 Part-2 shared classes (`label-micro-muted*`, `label-caption-strong`,
  `label-uppercase-*`) matched any pattern in this file closely enough to reuse (font-size/props
  differ from every occurrence here) — not force-fit per R2 guidance.
- Tokenization done in place (values with an exact match, whether the block stayed inline or not):
  spacing (`gap`/`padding`/`margin*`) values that exactly equal a `--space-*` token (4/8/12/16/24/32px,
  including their rem equivalents 0.25/0.5/0.75/1/1.5/2rem) were substituted; `fontSize: '0.75rem'`
  → `var(--type-caption)` (2 occurrences). Where a value was part of a padding shorthand and only
  one side matched, only that side was substituted (e.g. `'5rem var(--space-6)'`).
- Token gaps found (no matching token — left as literal): `borderRadius` values (`10px`, `12px`,
  `20px`, `50%`) — matching radius tokens (`--radius-button`/`-card`/`-panel`/`-round`/`-compact`)
  exist but Part 5's tokenization table for this plan doesn't include the radius category, so this
  was treated as out of this task's scope rather than force-tokenized; icon/dot/box dimensions
  (`64px`, `32px`×2, `50px`, `3px`×2, `2px`, `300px`) — sizing, not spacing, left as-is; font sizes
  with no exact type-token match: `0.85rem` (×5, incl. the new `.queue-section-label`), `0.9rem`
  (×2), `1.25rem` (×3), `1.75rem`, `0.95rem`, `0.72rem` (×3), `0.7rem`, `0.65rem`, `0.35rem`
  (`marginTop`, GlobalQueue.tsx:~441). No hardcoded hex/rgb colors existed in this file (all colors
  were already `var(--...)`).

## Dependencies

- Blocked by: `002-st1-split-components-css.md`, `003-st2-shared-classes.md`.
- Blocks: none.
