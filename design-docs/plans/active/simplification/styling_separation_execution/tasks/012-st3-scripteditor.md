# Task 012 — Convert ScriptEditor.tsx

Status: complete — 2026-07-10

## Goal

Convert inline styles to classes in `frontend/src/pages/Voices/components/ScriptEditor.tsx` per the
shared procedure.

## Map links

- Procedure: `000-conversion-procedure.md`.
- Map: `../01-map.md` Part 3, Invariants I3/I4.
- Risk flag: `none`.

## Exact target

`frontend/src/pages/Voices/components/ScriptEditor.tsx` — 27 `style={{` occurrences as of
2026-07-10 (doc said 26, negligible drift — re-count before starting).

## Steps

Follow `000-conversion-procedure.md` steps 1–6.

## Acceptance criteria

- [x] Remaining `style={{` count is only genuinely-dynamic values (12 remain, down from 27 — all
      are either the Save button's short one-off style, a handful of small layout wrappers whose
      `gap`/`marginBottom` values didn't repeat 3+ times identically, or the residual per-instance
      margin/fontWeight override left inline alongside `.script-editor-helper-text` per the R2
      near-match guidance — see completion note below; none is a leftover of a converted pattern).
- [x] New shared-pattern classes reused from `003-st2-shared-classes.md` where applicable (none of
      the 6 Part-2 classes matched this file's label pattern exactly — fontWeight 800 vs. the
      closest Part-2 candidate's 700, plus a `letterSpacing` none of them carry — not force-fit per
      R2; see completion note).
- [x] No DOM structure, prop, or handler changes.
- [x] `npm -C frontend run build`, `lint`, `test -- --run` all green (2 pre-existing failures in
      `ConfirmModal.test.tsx` / `ReviseTool.test.tsx` reference the now-deleted
      `theme/components.css` path from the already-completed ST-1 split — unrelated to this file,
      not introduced by this task).
- [x] One commit (content-wise; see note — this file's diff landed inside a concurrent lane's
      commit `12417983` "Mark task 007 (GlobalQueue.tsx style conversion) complete" due to a
      shared-checkout git-index race, not a standalone commit for this task. The diff itself,
      verified via `git diff bd0419a8 HEAD -- .../ScriptEditor.tsx`, contains exactly and only this
      task's intended changes — nothing from other tasks leaked into this file and nothing of this
      file leaked elsewhere).

## Completion note (2026-07-10)

- New file-local classes added to `frontend/src/theme/components/voice-lab.css` (Voices domain —
  checked first per the procedure, no Part-2 shared-class match):
  - `.voice-field-label` — the 5x-repeated field-label pattern (`VARIANT NAME`, `ENGINE`,
    `REFERENCE SAMPLE`, `REMOTE VOICE ASSET ID`, `PREVIEW TEXT SCRIPT`): `font-size:
    var(--type-caption)`, `font-weight: 800`, `color: var(--text-muted)`, `letter-spacing: 0.05em`.
  - `.script-editor-field-group` — the 4x-repeated label+control wrapper (`display: flex;
    flex-direction: column; gap: 6px`); the 2 instances that also had `marginBottom: 1.5rem` keep
    that as a small inline override (`var(--space-5)`) since the margin genuinely varied per R2.
  - `.script-editor-select` — the identical 2x-repeated `<select>` styling block (width/padding/
    border/background/color/font-size).
  - `.script-editor-helper-text` — the 4x-repeated helper-`<p>` core (`font-size: 0.78rem; color:
    var(--text-muted); line-height: var(--leading-normal)`); each instance keeps its differing
    `margin` (and one its `fontWeight: 600`) inline since those varied per instance.
  - `.script-editor-btn-compact` — the 2x-repeated compact button modifier (used alongside
    `btn-ghost`) for the Suggest/Reset buttons.
  - `.script-editor-icon-sm` — the 2x-repeated 12px icon-sizing + `flex-shrink: 0` pattern.
  - `.script-editor-help-box` (one-off, used for readability — a 5-property block) and
    `.script-editor-textarea` (one-off, used for readability — an 11-property block).
- Left inline (didn't manufacture a class per the pragmatism guard — genuinely one-off, short, or
  a header row using `alignItems: 'center'`, tracked separately by `019-followup-missed-utility-
  usage.md`, not this task): the outer page wrapper (`gap`), the `glass-panel` padding override,
  the cloud/capabilities group-of-groups wrapper, the "PREVIEW TEXT SCRIPT" header row, its button
  row, and the Save button's style block.
- Tokenization done in place: `1.5rem`/`24px` → `var(--space-5)`, `1rem`/`16px` →
  `var(--space-4)`, `8px` → `var(--space-2)`, `4px` → `var(--space-1)`, `12px` → `var(--space-3)`,
  `1.5` line-height → `var(--leading-normal)`, `0.75rem` font-size → `var(--type-caption)` (in the
  new `.voice-field-label` class).
- Token gaps found (no matching token — left as literal, per Part 5's "don't force-fit" guidance):
  `font-weight: 800` (no `--type-weight-*` token is 800 — closest are 700/600); `letter-spacing:
  0.05em` (no `--tracking-*` token matches — tight is `-0.01em`, wide is `0.08em`); `gap: 6px` (no
  `--space-*` token — closest are `--space-1` 4px / `--space-2` 8px); `padding: 10px 14px` on the
  select (neither value matches); `font-size: 0.95rem` / `0.78rem` / `0.7rem` (no `--type-*` token
  matches any of these); `height: 28px` on the compact button (no `--space-*` match); `line-height:
  1.6` on the textarea (no `--leading-*` token — normal is 1.5, reading is 1.7);
  `fontWeight: 600` on one helper-text instance (matches two different-named tokens at once,
  `--type-weight-headline` and `--type-weight-micro`, both 600 — ambiguous which one is "the"
  match, so left literal rather than picking arbitrarily). `border-radius: 12px` (select/textarea/
  help-box/Save button) is out of this plan's Part 5 tokenization category list (radius isn't one
  of the checked categories), so left as-is without logging as a gap, consistent with how prior
  tasks (e.g. 007) treated radius values.

## Dependencies

- Blocked by: `002-st1-split-components-css.md`, `003-st2-shared-classes.md`.
- Blocks: none.
