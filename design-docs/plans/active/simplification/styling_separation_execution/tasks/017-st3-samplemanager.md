# Task 017 — Convert SampleManager.tsx

Status: complete — 2026-07-10

## Goal

Convert inline styles to classes in `frontend/src/pages/Voices/components/SampleManager.tsx` per
the shared procedure.

## Map links

- Procedure: `000-conversion-procedure.md`.
- Map: `../01-map.md` Part 3, Invariants I3/I4.
- Risk flag: `none`.

## Exact target

`frontend/src/pages/Voices/components/SampleManager.tsx` — 21 `style={{` occurrences as of
2026-07-10 (unchanged from the parent doc).

## Steps

Follow `000-conversion-procedure.md` steps 1–6.

## Acceptance criteria

- [x] Remaining `style={{` count is only genuinely-dynamic values (5 remain, down from 21 — the
      outer drop-zone's `isDragging`-driven border/background, the chevron's
      `isSamplesExpanded`-driven `transform`, the sample row's `idx`/`is_new`-driven
      background/border, the play/pause button's `playingSample`-driven background/border/color,
      and the delete button's `hoveredSampleIdx`-driven opacity/pointerEvents; every other static
      property in those same blocks was moved into the new classes below).
- [x] New shared-pattern classes reused from `003-st2-shared-classes.md` where applicable (none of
      the 6 Part-2 classes matched this file's patterns — this file's labels use one-off font
      sizes like `0.65rem`/`0.8rem`/`0.85rem`, not the `--type-micro`/`--type-caption` values the
      shared classes are keyed on).
- [x] No DOM structure, prop, or handler changes — same elements, same conditional-rendering
      logic, same event handlers; only `style={{...}}` → `className` (plus new class defs).
- [x] `npm -C frontend run build`, `lint`, `test -- --run` all green (the 2 vitest failures seen
      — `ConfirmModal.test.tsx` and `ReviseTool.test.tsx`, both `ENOENT` on the now-deleted
      `theme/components.css` — pre-date this task, confirmed via `git stash`/re-run against a
      clean checkout; unrelated to `SampleManager.tsx` or `voice-lab.css`).
- [x] One commit (content-wise; see note — both this file's diff and its new CSS classes landed
      inside concurrent lanes' commits (`12417983` "Mark task 007 (GlobalQueue.tsx style
      conversion) complete" for the `.tsx`, `d84af80f` "Convert MetadataEditorModal.tsx inline
      styles to classes (task 014, 1/6)" for the CSS), due to a shared-checkout git-index race —
      same pattern already documented in task 016's completion note. Verified byte-for-byte via
      `git show HEAD:frontend/src/pages/Voices/components/SampleManager.tsx` (16 `sample-manager__`
      references, 5 remaining `style={{`, matches the intended conversion exactly) and via a direct
      diff of the `.sample-manager__*` block in `git show HEAD:.../voice-lab.css` (lines 530-661)
      against the locally-authored block — identical.)

## Completion note (2026-07-10)

15 new file-local classes added to `frontend/src/theme/components/voice-lab.css` (Voices domain —
checked first per this task's instructions, no reuse from Part 2 shared classes since none
matched): `.sample-manager__drag-overlay`, `.sample-manager__drag-label`,
`.sample-manager__header`, `.sample-manager__toggle-btn`, `.sample-manager__title`,
`.sample-manager__icon-row` (reused 2× — the header's upload/collapse icon row and the sample
row's WAV-label/delete-button row share the identical `display:flex; align-items:center;
gap:var(--space-2)` pattern), `.sample-manager__file-input`, `.sample-manager__add-btn`,
`.sample-manager__collapse-btn`, `.sample-manager__body`, `.sample-manager__row-main`,
`.sample-manager__new-badge`, `.sample-manager__name`, `.sample-manager__format-label`,
`.sample-manager__empty`.

The 5 genuinely-dynamic blocks (outer drop-zone, chevron rotate, sample row, play/pause button,
delete button) stay inline per Invariant I4, but their hardcoded `border-radius` literals were
tokenized in place where an exact match exists: `borderRadius: '6px'` → `var(--radius-compact)`
(sample row and play button, both exact 6px matches) and `padding: '4px'` → `var(--space-1)`
(delete button, exact 4px match). `borderRadius: '12px'` (outer drop-zone) and `borderRadius: '4px'`
(delete button) have no exact token match — see gaps below.

Tokenization done in place (moved into the new classes above): `gap: '8px'` → `var(--space-2)`
(drag overlay, icon-row); `gap: '12px'` → `var(--space-3)` (header row); `padding: '4px 0'` →
`padding: var(--space-1) 0` (toggle button); `padding: '4px'` → `var(--space-1)` (add button);
`padding: '0 16px 16px'` → `padding: 0 var(--space-4) var(--space-4)` (body wrapper); `minHeight:
'40px'` → `var(--space-7)` (body wrapper, exact 40px match); `padding: '2px 4px'` →
`padding: 2px var(--space-1)` (NEW badge, only the 4px half matches).

Token gaps found (no matching token — left as literal, logged for `018`'s report):
`border-radius: 12px` (outer drop-zone wrapper + drag overlay — between `--radius-card`=10px and
`--radius-panel`=18px, not exact); `border-radius: 4px` (NEW badge, delete button — no token below
`--radius-compact`=6px); `padding: 6px` (collapse button) and `padding: '6px 10px'` (sample row —
between `--space-1`=4px and `--space-2`=8px, not exact); `padding: 20px` (empty state — between
`--space-4`=16px and `--space-5`=24px, not exact); `font-size: 0.65rem` (NEW badge, WAV label),
`0.8rem` (drag label, sample row, empty state), `0.85rem` (title) — none match any `--type-*`
token exactly (closest are `--type-micro`=0.6875rem and `--type-caption`=0.75rem); `gap: 10px`
(toggle button, row-main) — no exact `--space-*` match. No hardcoded hex/rgb colors existed in this
file — all colors were already `var(--...)`/`rgba(var(--...))` tokens.

## Dependencies

- Blocked by: `002-st1-split-components-css.md`, `003-st2-shared-classes.md`.
- Blocks: none.
