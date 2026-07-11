# Task 005 — Convert ProjectLibraryPage.tsx

Status: complete — 2026-07-10

## Goal

Convert inline styles to classes in `frontend/src/pages/ProjectLibrary/ProjectLibraryPage.tsx` per
the shared procedure.

## Map links

- Procedure: `000-conversion-procedure.md`.
- Map: `../01-map.md` Part 3, Invariants I3/I4.
- Risk flag: `none`.

## Exact target

`frontend/src/pages/ProjectLibrary/ProjectLibraryPage.tsx` — 68 `style={{` occurrences as of
2026-07-10 (the highest count of any ST-3 file — re-count before starting). No existing
`theme/components/*.css` file is obviously dedicated to this page; if file-local classes are
needed, add a `ProjectLibraryPage.css` co-located with the component (following the existing
`ScriptView.css` precedent mentioned in the parent doc) rather than forcing them into an unrelated
domain file.

## Steps

Follow `000-conversion-procedure.md` steps 1–6. Given the high occurrence count, expect several
genuinely repeated file-local patterns beyond the 6 shared classes — that's expected; add file-local
classes per the procedure's rule.

## Acceptance criteria

- [x] Remaining `style={{` count is only genuinely-dynamic values.
- [x] New shared-pattern classes reused from `003-st2-shared-classes.md` where applicable; new
      file-local classes added to a co-located `ProjectLibraryPage.css` or the nearest matching
      domain file.
- [x] No DOM structure, prop, or handler changes.
- [x] `npm -C frontend run build`, `lint`, `test -- --run` all green.
- [x] One commit.

## Dependencies

- Blocked by: `002-st1-split-components-css.md`, `003-st2-shared-classes.md`.
- Blocks: none.

## Completion note

- 68 `style={{` occurrences converted down to 6 remaining, all genuinely dynamic (`isDragging`
  computed): the cover-dropzone `border`/`background` (×2, one per duplicated modal instance) and the
  cover-icon `opacity`/`color` + cover-label `color` (×2 each). Their static properties moved to
  `.project-library-cover-dropzone` / `.project-library-cover-icon` / `.project-library-cover-label`;
  only the dynamic properties stayed inline.
- Reused existing shared class `.label-uppercase-sm` (from `core.css`, ST-2) for all 8 form-label
  occurrences (Title/Author/Series/Series position, ×2 duplicated modals) — exact pattern match.
- The file contains two near-duplicate "Create Project" modals (one in the `projects.length === 0`
  early-return branch, one in the main return), so most patterns repeat exactly 2x. No existing
  shared class matched the modal backdrop/panel shape closely enough to reuse (the closest,
  `.overlay-blur` in `theme/utilities.css`, uses `blur(8px)` + a fade-in animation vs. this file's
  `blur(4px)` with no animation — a real, not cosmetic, difference per the "don't force a near-match"
  guidance), so all modal/cover/form classes below are new file-local classes in a new co-located
  `frontend/src/pages/ProjectLibrary/ProjectLibraryPage.css` (imported from the top of
  `ProjectLibraryPage.tsx`, following the `ScriptView.css` co-location precedent).
- One genuine near-match handled with a modifier class per R2: the 8 form inputs share one base
  shape, but the 4 inputs in the main-branch modal additionally had `outline: 'none'` that the
  4 inputs in the empty-branch modal lacked. Kept as `.project-library-form-input` (base, used by
  all 8) + `.project-library-form-input--no-outline` (added only to the 4 main-branch inputs) so the
  outline behavior difference between the two modal copies is preserved exactly.
- New classes added (all in `ProjectLibraryPage.css`): `.project-library-loading`,
  `.project-library-empty-page`, `.project-library-empty-content`, `.project-library-empty-icon`,
  `.project-library-empty-copy`, `.project-library-empty-title`, `.project-library-empty-subtitle`,
  `.project-library-empty-cta`, `.project-library-modal-backdrop`, `.project-library-modal-panel`,
  `.project-library-modal-heading`, `.project-library-modal-form`, `.project-library-form-row`,
  `.project-library-cover-dropzone`, `.project-library-cover-preview`,
  `.project-library-cover-preview-img`, `.project-library-cover-drag-overlay`,
  `.project-library-cover-placeholder`, `.project-library-cover-icon`, `.project-library-cover-label`,
  `.project-library-form-fields`, `.project-library-form-input`,
  `.project-library-form-input--no-outline`, `.project-library-modal-actions`,
  `.project-library-btn-cancel`, `.project-library-btn-submit`, `.project-library-hidden-input`,
  `.project-library-page`, `.project-library-visually-hidden-heading`, `.project-library-header`,
  `.project-library-greeting`, `.project-library-subtitle`, `.project-library-header-cta`,
  `.project-library-no-results`, `.project-library-no-results-icon`,
  `.project-library-no-results-title`, `.project-library-no-results-copy`, `.project-library-grid`.
- Tokenization done (exact matches only, per `01-map.md` Part 5's registry — border-radius is not a
  listed category, so `24px`/`8px`/`6px` radii were left as literals, not tokenized):
  - Spacing (rem/px → `--space-N`, assuming the default 16px root): `0.25rem`→`--space-1`,
    `0.5rem`→`--space-2`, `0.75rem`→`--space-3`, `1rem`/`8px`→`--space-4`/`--space-2` (as applicable),
    `1.5rem`→`--space-5`, `2rem`→`--space-6`, `2.5rem`→`--space-7`. Applied to every gap/margin/padding
    value in the file with an exact match, including per-value substitution inside shorthand strings
    (e.g. `padding: '0.85rem var(--space-7)'`, `margin: '0 auto var(--space-1) auto'`).
  - Type size: `font-size: '0.875rem'` (page subtitle) → `var(--type-callout)` (exact match).
  - No hardcoded hex/rgb colors existed in this file to begin with (all colors already referenced
    `var(--text-*)`/`var(--surface*)`/`var(--accent*)`/`var(--border)`/`var(--overlay-backdrop)`
    tokens) — nothing to change there.
- Token gaps found (no exact match in `tokens.css`, left as literals):
  - Font sizes with no exact type-scale match: `1.25rem` (empty-state title, modal heading ×2),
    `0.9rem` (empty subtitle, all 8 form inputs, header CTA), `1rem` (big CTA button),
    `1.75rem` (page greeting h2), `1.1rem`/`0.85rem` (no-results title/copy), `0.65rem` (cover label),
    `0.7rem` (form labels — inside the pre-existing `.label-uppercase-sm` shared class, out of this
    task's scope to retouch).
  - Spacing with no exact match: `6rem`/`5rem`/`0.6rem`/`0.8rem`/`0.85rem` (vertical padding on the
    empty-state CTA)/`1.25rem` (modal-form gap, button horizontal padding)/`6px` (header CTA gap)/
    `120px`/`520px` (fixed cover/modal dimensions).
  - `font-weight` values (600/700) were intentionally left untokenized — the `--type-weight-*` tokens
    are paired to specific type-scale roles (e.g. `--type-weight-title` with `--type-title`), and none
    of this file's font-sizes matched their paired size token, so substituting the weight alone would
    be a misleading semantic pick rather than an "obvious" match (same reasoning as task 013's note).
  - `border-radius: 24px` / `8px` / `6px` — out of scope: `01-map.md` Part 5's tokenization table has
    no radius category (only colors, spacing, type size/weight), so these were left untouched.

## Note on shared-checkout timing

Mid-task, a concurrent lane's commit (`2ab09909`, "Convert LiveOutputPage.tsx…") incidentally swept
up an in-progress, staged copy of this file's partial conversion (via the shared git index) before
this task's own commit was made. The finished conversion in this task's commit is the authoritative,
complete version described above; no functional content was lost, but `ProjectLibraryPage.tsx`'s
diff is split across that unrelated commit and this task's commit rather than living in one clean
commit end-to-end.
