# Task 006 — Convert VoiceModals.tsx

Status: complete — 2026-07-10

## Goal

Convert inline styles to classes in `frontend/src/pages/Voices/components/VoiceModals.tsx` per the
shared procedure.

## Map links

- Procedure: `000-conversion-procedure.md`.
- Map: `../01-map.md` Part 3, Invariants I3/I4.
- Risk flag: `none`.

## Exact target

`frontend/src/pages/Voices/components/VoiceModals.tsx` — 44 `style={{` occurrences as of
2026-07-10 (unchanged from the parent doc — re-count before starting). This is a Voices-domain
component; check `theme/components/voice-lab.css` (from task 002) first for a home for any new
file-local classes before creating a new file.

## Steps

Follow `000-conversion-procedure.md` steps 1–6.

## Acceptance criteria

- [x] Remaining `style={{` count is only genuinely-dynamic values.
- [x] New shared-pattern classes reused from `003-st2-shared-classes.md` where applicable.
- [x] No DOM structure, prop, or handler changes.
- [x] `npm -C frontend run build`, `lint`, `test -- --run` all green.
- [x] One commit.

## Completion note (2026-07-10)

Converted 36 of the 44 `style={{` occurrences to 8 new file-local classes added to
`frontend/src/theme/components/voice-lab.css` (this is a Voices-domain file, per the task's home
hint — no existing Part 2 shared class matched these patterns, since the Voices modal patterns
carry different property sets than the label patterns in `core.css`):

- `.voice-modal-overlay` — the 4× identical fixed-overlay backdrop div.
- `.voice-modal-panel` — the 4× modal-panel shell (background/border-radius/padding/box-shadow/
  border); the per-modal `width` (`min(520px, ...)` / `min(400px, ...)` / `min(440px, ...)`) differs
  across instances (R2 in `01-map.md`), so it stays as a small inline `style={{ width: ... }}` on
  top of the shared class rather than being force-fit into one class or split into width-modifier
  classes.
- `.voice-modal-title` — the 4× `<h3>` heading style.
- `.voice-modal-subtitle` — the 4× `<p>` intro-copy style.
- `.voice-modal-field-group` — the 6× label+input wrapper (`flex column, gap, marginBottom`).
- `.voice-modal-field-label` — the 6× field `<label>` style.
- `.voice-modal-button-row` — the 4× Cancel/submit button-row wrapper.
- `.voice-modal-btn` — the 8× `flex:1; height:44px; border-radius:12px` shared by every Cancel/
  submit button (kept alongside the existing `btn-ghost`/`btn-primary` classes via a joined
  `className` string, not replacing them).

No existing Part 2 shared class (`.label-micro-muted*`, `.label-caption-strong`,
`.label-uppercase-*`) matched any of these patterns exactly, so none were reused.

Remaining 8 `style={{` occurrences (all left inline, none touched by the conversion beyond
tokenizing what already had literals):

- 4× the per-modal panel `width` (see above — genuinely per-instance, not a shared value).
- 1× a one-off `<div style={{ marginBottom: ... }}>` wrapping the sample dropzone (single
  occurrence, not worth a class per the pragmatism guard) — tokenized `24px` → `var(--space-5)`
  (exact match).
- 3× inline `<span style={{ color: 'var(--accent)' [, fontWeight: 700] }}>` around a name/variant
  string mid-sentence — already token-based, below the 3+ occurrence threshold for a new class
  (1 without `fontWeight`, 2 with), left inline.

Tokenization done (exact matches substituted): `padding: '24px'` → `var(--space-5)` (panel),
`marginBottom: '8px'` → `var(--space-2)` (title), `marginBottom: '24px'` → `var(--space-5)`
(subtitle, field-group, and the standalone dropzone-wrapper div), `gap: '12px'` → `var(--space-3)`
(button row), `fontSize: '0.75rem'` → `var(--type-caption)` (field label, exact token match).

Token gaps found (no exact match in `tokens.css`, left as literals per step 3's "don't force-fit"
rule):
- `border-radius: 24px` (`.voice-modal-panel`) — no radius token matches (`--radius-panel` is 18px).
- `border-radius: 12px` (`.voice-modal-btn`) — no radius token matches (`--radius-button` is 8px,
  `--radius-card` is 10px).
- `height: 44px` (`.voice-modal-btn`) — not on the 8pt spacing scale (nearest are `--space-4`=16px,
  `--space-5`=24px, `--space-6`=32px, `--space-7`=40px, `--space-8`=48px; 44px sits between the
  last two).
- `gap: 6px` (`.voice-modal-field-group`) — not on the 8pt scale (`--space-1`=4px, `--space-2`=8px).
- `font-size: 1.25rem` (`.voice-modal-title`) — between `--type-headline` (1.125rem) and
  `--type-title` (1.5rem), no exact match.
- `font-size: 0.85rem` (`.voice-modal-subtitle`) — between `--type-callout` (0.875rem) and
  `--type-body` (0.9375rem), no exact match.
- `font-weight: 800` (`.voice-modal-title`) and `font-weight: 700` (field label, buttons' inline
  spans) — no `--type-weight-*` token is 800; 700 exists but only under semantically-named
  `--type-weight-title`/`--type-weight-display`, which would be a non-obvious/force-fit
  substitution for a label/span — left as raw numbers, consistent with the precedent already set
  in `core.css`'s own `.label-caption-strong`/`.label-micro-muted-strong` (which also keep
  `font-weight: 700` as a bare literal).

`engineSelectStyle` (the module-level `<select>` style object, used at 2 call sites) was left
untouched — it isn't a `style={{` JSX occurrence (it's a named constant), and its literals
(`padding: '10px 14px'`, `border-radius: '12px'`, `font-size: '0.9rem'`) have no exact token match
either, so there was nothing to change even if it were in scope.

Verification: `npm -C frontend run build` succeeds; `npm -C frontend run lint` shows no new
warnings/errors for `VoiceModals.tsx` or `voice-lab.css`; `npm -C frontend run test -- --run`
(full suite, `--maxWorkers=1`) — 1808/1810 passing. The 2 failures
(`tests/unit/components/overlays/ConfirmModal.test.tsx` and
`tests/unit/pages/ChapterEditor/components/DirectorsConsole/ReviseTool/ReviseTool.test.tsx`) are
pre-existing and unrelated to this task: both read
`frontend/src/theme/components.css` directly by path, and that file no longer exists after the
ST-1 domain split (task 001/002, commit `ed172a03`) moved its contents into
`theme/components/*.css`. Confirmed via `git stash` + re-running just these two tests against the
pre-task-006 tree — they fail identically without this task's changes. Flagging for whoever owns
018/the final cleanup pass to update those two tests' CSS lookup path; out of this task's scope
since neither file is `VoiceModals.tsx` or a file this task touches.

One note on process: mid-task, a concurrent lane's edit to `frontend/src/theme/components/
voice-lab.css` (task 017's `SampleManager` conversion running in parallel on the same shared
checkout) landed and silently dropped this task's earlier append to that file. Re-applied the
8 `.voice-modal-*` classes after task 017's `.sample-manager__*` block and re-verified
build/lint/test before committing.

## Dependencies

- Blocked by: `002-st1-split-components-css.md`, `003-st2-shared-classes.md`.
- Blocks: none.
