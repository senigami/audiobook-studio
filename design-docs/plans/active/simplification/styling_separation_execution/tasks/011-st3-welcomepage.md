# Task 011 — Convert WelcomePage.tsx

Status: complete — 2026-07-10

## Goal

Convert inline styles to classes in `frontend/src/pages/Welcome/WelcomePage.tsx` per the shared
procedure.

## Map links

- Procedure: `000-conversion-procedure.md`.
- Map: `../01-map.md` Part 3, Invariants I3/I4.
- Risk flag: `none`.

## Exact target

`frontend/src/pages/Welcome/WelcomePage.tsx` — 30 `style={{` occurrences as of 2026-07-10
(unchanged from the parent doc). No dedicated domain CSS file — a co-located `WelcomePage.css` is
appropriate for any file-local classes.

## Steps

Follow `000-conversion-procedure.md` steps 1–6.

## Acceptance criteria

- [x] Remaining `style={{` count is only genuinely-dynamic values.
- [x] New shared-pattern classes reused from `003-st2-shared-classes.md` where applicable.
- [x] No DOM structure, prop, or handler changes.
- [x] `npm -C frontend run build`, `lint`, `test -- --run` all green (see completion note re: 2
      pre-existing unrelated failures).
- [x] One commit.

## Dependencies

- Blocked by: `002-st1-split-components-css.md`, `003-st2-shared-classes.md`.
- Blocks: none.

## Completion note (2026-07-10)

Converted all 30 `style={{...}}` occurrences in `frontend/src/pages/Welcome/WelcomePage.tsx`; 1
remains (the `StatusChip` base span), which is inherently dynamic (`chipStyles[variant]` spread —
a conditional token switch per I4) — its static portion was pulled out into `.welcome-status-chip`
and only the variant-dependent colors stay inline.

**Reused existing classes** (no new CSS needed):
- `.label-micro-muted-strong` (`theme/components/core.css`, from task 003) — for `SectionLabel`,
  confirming the task-file hint that this file already used this pattern.
- `.text-accent` (`theme/utilities.css:411`) — for the "Studio" accent span and the step-card icon
  wrapper's color (the icon wrapper's `display:flex; alignItems:center` stayed inline per the
  "don't touch alignItems/flex" rule in `000-conversion-procedure.md`).

**New file-local classes** added to a new co-located `frontend/src/pages/Welcome/WelcomePage.css`
(imported via `import '@/pages/Welcome/WelcomePage.css'`, matching the `ScriptView.tsx` precedent):
`.welcome-status-chip`, `.welcome-step-card` (+ `__header`, `__number-badge`,
`__number-badge-text`, `__heading`, `__body`), `.welcome-doc-card` (+ `__icon`, `__label`,
`__external-icon`), `.welcome-section-label` (modifier paired with `.label-micro-muted-strong`),
`.welcome-page` (+ `__container`), `.welcome-hero` (+ `__logo`, `__intro`, `__title`,
`__subtitle`, `__chips`), `.welcome-section` (shared by both "Getting started"/"Learn more"
wrappers — identical inline object, 2 literal occurrences), `.welcome-steps`, `.welcome-docs`,
`.welcome-ctas`, `.welcome-cta-primary` (+ `__arrow`), `.welcome-cta-secondary`.

**Tokenization done** (exact matches substituted):
- `.welcome-page` padding `'40px 24px 48px'` → `var(--space-7) var(--space-5) var(--space-8)`
  (all three components matched exactly).
- `.welcome-hero` gap `16` → `var(--space-4)`.
- `.welcome-hero__chips` gap `8` → `var(--space-2)`.
- `.welcome-doc-card` gap `8` → `var(--space-2)`.
- `.welcome-steps` gap `12` → `var(--space-3)`.
- `.welcome-docs` gap `8` → `var(--space-2)`.

**Token gaps found** (no exact match in `tokens.css`, left as literal — for `018`'s aggregation):
- `padding: '3px 10px'` (chip base) — neither value matches a `--space-*` token.
- `padding: '18px 18px 16px'` (step card root) — `16px` alone would match `--space-4`, but the
  shorthand mixes it with non-matching `18px`; left as one literal per the "don't force-fit"
  guidance rather than mixing `var()` with raw px in one shorthand (no precedent for that pattern
  found elsewhere in the codebase).
- `gap: 10` — recurring (step card root, step card header row, CTAs row) — between
  `--space-2` (8) and `--space-3` (12), no exact match.
- `width: 28` / `height: 28` (step number badge circle) — no matching token (element sizing, not
  on the spacing scale).
- `padding: '10px 14px'` (doc card) — neither value matches.
- `gap: 36` (page container) — between `--space-6` (32) and `--space-7` (40).
- `gap: 6` (hero intro column) — between `--space-1` (4) and `--space-2` (8).
- `gap: 14` (section wrapper, both occurrences) — between `--space-3` (12) and `--space-4` (16).
- `padding: '8px 28px'` (primary CTA) / `padding: '8px 20px'` (secondary CTA) — the `8px` matches
  `--space-2` but `28px`/`20px` don't; shorthand left as literal for the same reason as above.
- `width: 96` / `height: 96` (hero logo) — no matching token.
- No hardcoded hex/rgb colors found in this file (all colors were already `var(--token)`).

**Verification:** `npm -C frontend run build` and `npm -C frontend run lint` are clean for the
touched files. `npm -C frontend run test -- --run --maxWorkers=1` is green except for 2
pre-existing, unrelated failures (`tests/unit/components/overlays/ConfirmModal.test.tsx` and
`tests/unit/pages/ChapterEditor/components/DirectorsConsole/ReviseTool/ReviseTool.test.tsx`), both
failing on `ENOENT: frontend/src/theme/components.css` — that file was deleted by task
`002-st1-split-components-css.md` (already committed, `ed172a03`) and these two tests were never
updated to point at the new split files. Confirmed pre-existing (fails identically with this
task's changes reverted) and out of scope for this task — flagging for whoever owns follow-up on
the ST-1 split.

**Note on parallel-lane execution:** this repo's shared checkout had many other ST-3 lanes (004,
005, 007, 008, 009, 010, 012–017) actively committing in parallel while this task ran. A `git
stash`/`stash pop` used mid-task to test in isolation briefly reverted several other lanes'
in-flight tracked-file edits; all were cross-checked against the stash contents afterward and
recovered (`MetadataEditorModal.tsx` needed an explicit restore from the stash — its lane's commit
landed after, absorbing the recovered content; every other touched file was confirmed either
already re-progressed past the stash snapshot or already safely committed). No other lane's work
was lost. Flagging so the pattern is visible: avoid `git stash` in this shared checkout — use a
worktree or targeted `git diff`/`git show` inspection instead.
