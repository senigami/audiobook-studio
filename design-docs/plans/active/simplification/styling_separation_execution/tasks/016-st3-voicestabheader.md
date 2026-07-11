# Task 016 — Convert VoicesTabHeader.tsx

Status: complete — 2026-07-10

## Goal

Convert inline styles to classes in `frontend/src/pages/Voices/components/VoicesTabHeader.tsx` per
the shared procedure.

## Map links

- Procedure: `000-conversion-procedure.md`.
- Map: `../01-map.md` Part 3, Invariants I3/I4.
- Risk flag: `none`.

## Exact target

`frontend/src/pages/Voices/components/VoicesTabHeader.tsx` — 21 `style={{` occurrences as of
2026-07-10 (unchanged from the parent doc).

## Steps

Follow `000-conversion-procedure.md` steps 1–6.

## Acceptance criteria

- [x] Remaining `style={{` count is only genuinely-dynamic values (5 remain, down from 21 — the tab
      pill's isActive-driven border/background/color, the search `GlassInput`'s
      compact/focus-driven width, and each of the 3 facet chips' active-driven border/background/
      color; all other properties from those same blocks were static and moved into the new
      classes below).
- [x] New shared-pattern classes reused from `003-st2-shared-classes.md` where applicable (none of
      the 6 Part-2 classes matched this file's patterns — see completion note).
- [x] No DOM structure, prop, or handler changes — same elements, same conditional-rendering
      logic, same event handlers; only `style={{...}}` → `className` (plus new class defs).
- [x] `npm -C frontend run build`, `lint`, `test -- --run` all green.
- [x] One commit (content-wise; see note — this file's diff landed inside a concurrent lane's
      commit `12417983` "Mark task 007 (GlobalQueue.tsx style conversion) complete" and the new CSS
      classes landed inside `d84af80f` "Convert MetadataEditorModal.tsx inline styles to classes
      (task 014, 1/6)", both due to a shared-checkout git-index race, not standalone commits for
      this task. Verified via `git diff bd0419a8 HEAD -- frontend/src/pages/Voices/components/
      VoicesTabHeader.tsx` that the file's diff since baseline contains exactly and only this
      task's intended changes, and the 14 new classes listed below are present verbatim in HEAD's
      `theme/components/voice-lab.css`.)

## Completion note (2026-07-10)

14 new file-local classes added to `frontend/src/theme/components/voice-lab.css` (Voices domain —
checked first per this task's instructions, no reuse from Part 2 shared classes since none matched):
`.voices-tab-header`, `.voices-tab-header__toolbar-row`, `.voices-tab-header__search-row`,
`.voices-tab-header__tab-pills`, `.voices-tab-pill`, `.voices-tab-header__toolbar`,
`.voices-tab-header__hidden-file-input`, `.voices-toolbar-divider`,
`.voices-tab-header__search-wrap`, `.voice-chip-row` (reused for both the engine-filter-chip row
and the facet-chip row — identical static pattern), `.voices-engine-filter-btn`,
`.voice-facet-label` (reused 3× for the CLASS/GENDER/AGE labels), `.voice-facet-chip` (reused 3×
for the class/gender/age chip buttons, dynamic border/background/color per `active`/tint stay
inline), `.voice-facet-divider` (reused 2× for the gender/age separators).

For the tab-pill button and the 3 facet-chip buttons, only the props that actually vary with
`isActive`/`active` (border/background/color) were left inline; every static prop (fontSize,
fontWeight, padding, borderRadius, cursor, transition, height) moved into the new class.

Tokenization done in place: `padding: '4px 14px'` → `padding: var(--space-1) 14px` (4px is an exact
`--space-1` match, 14px has no token); `gap: '12px'` → `var(--space-3)`; `padding: '0 12px'` →
`padding: 0 var(--space-3)`; `margin: '0 4px'` → `margin: 0 var(--space-1)`; `height: '24px'` →
`var(--space-5)`. The `0.75rem`/`0.5rem 2rem 0.75rem` row paddings were left as literal rem values
— consistent with task 003's own audit, which already confirmed these rem sizes are pre-existing,
deliberately non-tokenized values across this codebase (not a new gap this task introduced).

Token gaps found (no matching token — left as literal, logged for `018`'s report): `18px` (facet
divider height — between `--space-4`=16 and `--space-5`=24, not exact), `28px`/`30px` (facet-chip
and engine-filter-btn heights — between `--space-5`/`--space-6`, not exact), `10px` (facet-chip
horizontal padding — between `--space-2`=8 and `--space-3`=12, not exact), `0.72rem` (engine-filter
button font size — no `--type-*` match; same value already appears un-tokenized elsewhere in this
file, e.g. `.voice-lab-page__back`, `.voice-lab-section-label`), `0.7rem`/`0.65rem` (facet chip /
facet label font sizes — no exact `--type-*` match; both values already recur un-tokenized
elsewhere in `voice-lab.css`, e.g. `.voice-lab-page__edit-meta-btn` and
`.voice-catalog-card__description`), `zIndex: 10` (no z-index token category in this plan's
registry). No hardcoded hex/rgb colors existed in this file — all colors were already
`var(--...)` tokens.

## Dependencies

- Blocked by: `002-st1-split-components-css.md`, `003-st2-shared-classes.md`.
- Blocks: none.
