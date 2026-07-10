# Task 014 — Convert MetadataEditorModal.tsx + its split children

Status: done (2026-07-10)

## Goal

Convert inline styles to classes across `MetadataEditorModal.tsx` and the 5 smaller files it was
split into by an unrelated 2026-07-04 cleanup (task LF-4), applying the shared procedure to each.

## Map links

- Procedure: `000-conversion-procedure.md`.
- Map: `../01-map.md` Part 3, `../00-overview.md` §3 (why this is 6 files, not 1).
- Risk flag: `none`.

## Important context

The parent doc (`../../03_styling_separation.md`) scoped this as one 717-line file with 52 inline
styles. A **different**, unrelated cleanup (LF-4, commit `aebf70ec`, 2026-07-04) split it into 6
smaller files. The combined inline-style count across all 6 is still ~52 — the work didn't
disappear, it's just spread out. Convert every file below, not just the parent.

## Exact targets (all under `frontend/src/pages/Voices/components/`)

| File | Current `style={{` count (2026-07-10) |
|---|---:|
| `MetadataEditorModal.tsx` | 26 |
| `metadata/IconUpload.tsx` | 10 |
| `metadata/ManySelect.tsx` | 3 |
| `metadata/OneSelect.tsx` | 4 |
| `metadata/TagsInput.tsx` | 7 |
| `metadata/chip.tsx` | 2 |

Re-count each with `grep -c "style={{" <file>` before starting — these child files may have
shifted since 2026-07-10.

## Steps

Apply `000-conversion-procedure.md` steps 1–6 to each of the 6 files above, independently. They can
be converted in any order within this task (no inter-file dependency), but keep to **one commit per
file** per the procedure (6 commits total for this task, not one giant commit).

## Acceptance criteria

- [x] All 6 files have zero remaining `style={{}}` for static/repeated patterns; only genuinely
      dynamic values (if any) remain inline.
- [x] Shared classes from `003-st2-shared-classes.md` reused where patterns match across the child
      files (e.g. if `IconUpload.tsx` and `TagsInput.tsx` share a label pattern, use the same shared
      class in both, not two near-duplicate local classes).
- [x] No DOM structure, prop, or handler changes in any of the 6 files.
- [x] `npm -C frontend run build`, `lint`, `test -- --run` all green after each file's commit.
- [x] 6 commits (one per file).

## Completion note (2026-07-10)

Remaining `style={{}}` per file (genuinely dynamic or trivial one-off only):

| File | Before | After | What's left inline |
|---|---:|---:|---|
| `MetadataEditorModal.tsx` | 26 | 8 | Save-button opacity ternary, small one-off statics (margins, asterisk colors, `pre-wrap`, icon nudge) |
| `metadata/IconUpload.tsx` | 10 | 3 | `img` `objectFit`, Upload-icon color, hidden `<input>` `display:none` |
| `metadata/ManySelect.tsx` | 3 | 0 | — |
| `metadata/OneSelect.tsx` | 4 | 1 | Required-asterisk span (unique margin, not shared with the other 2 asterisk variants) |
| `metadata/TagsInput.tsx` | 7 | 1 | `flex: 1` on the draft `<input>` — left inline per the procedure's explicit `flex:1`/`alignItems:center` carve-out (tracked separately in task 019) |
| `metadata/chip.tsx` | 2 | 2 | `borderColor`/`background`/`color` ternary (active-state conditional token switch) + one-off required-asterisk span |

New classes added to `theme/components/voice-lab.css` (Voices domain), reused across files as
instructed:

- Shared across all 6: `.metadata-field`, `.metadata-field-label` (field wrapper + label pattern).
- Shared across `IconUpload`/`TagsInput`: `.metadata-field-hint` (small muted helper-text line).
- Shared across `ManySelect`/`OneSelect`: `.metadata-chip-row`.
- `MetadataEditorModal.tsx`-only: `.metadata-field-input` (textarea/input base) + the
  `.metadata-editor-modal__*` BEM family (overlay/backdrop/dialog/header/title/subtitle/close-btn/
  body/icon-error/divider/error-banner/footer/required-warning/action-btn).
- `IconUpload.tsx`-only: `.metadata-icon-upload__row/__preview/__actions/__btn`.
- `TagsInput.tsx`-only: `.metadata-tags-input__container/__draft`, `.metadata-tag-pill(__remove)`.
- `chip.tsx`-only: `.metadata-chip` (static base; active-state colors stay inline per Invariant I4).

Tokenization done: `border-radius: 8px/10px` → `var(--radius-button)`/`var(--radius-card)`;
`1.5rem`/`2rem`/`1rem`/`24px`/`12px`/`8px`/`4px` spacing values → `var(--space-*)` where exact;
`0.75rem` font-sizes → `var(--type-caption)`; `'white'` chip text → `var(--text-on-accent)` (matches
the existing on-accent convention used elsewhere in `voice-lab.css`).

Token gaps found (no exact match in `tokens.css`, left as literals — candidates for
`018-st4-spec-bump-and-guard.md`'s gap report):
- `0.8rem` font-size — recurs ~10× across all 6 files (field labels/inputs/subtitle); no type token
  sits between `--type-micro` (0.6875rem) and `--type-caption` (0.75rem)/`--type-callout` (0.875rem).
- `0.85rem`, `0.72rem`, `0.6rem` font-sizes — same gap, smaller recurrence.
- `0.04em` letter-spacing on field labels — no letter-spacing token exists.
- `999px` border-radius (chip pill, tag pill) vs `--radius-round` (`9999px`) — visually equivalent
  but not an exact literal match, left untouched per the "don't force-fit" rule.
- `6px`/`4px`/`2px`/`10px`/`14px`/`20px`/`36px`/`44px`/`64px`/`120px`/`640px` — assorted one-off
  sizes with no adjacent exact token.

## Dependencies

- Blocked by: `002-st1-split-components-css.md`, `003-st2-shared-classes.md`.
- Blocks: none.
