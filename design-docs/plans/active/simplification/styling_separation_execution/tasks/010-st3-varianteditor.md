# Task 010 — Convert VariantEditor.tsx

Status: complete — 2026-07-10

## Goal

Convert inline styles to classes in `frontend/src/pages/Voices/components/VariantEditor.tsx` per
the shared procedure.

## Map links

- Procedure: `000-conversion-procedure.md`.
- Map: `../01-map.md` Part 3, Invariants I3/I4.
- Risk flag: `none`.

## Exact target

`frontend/src/pages/Voices/components/VariantEditor.tsx` — 31 `style={{` occurrences as of
2026-07-10 (unchanged from the parent doc). Voices-domain component; check
`theme/components/voice-lab.css` first for a home for any new file-local classes.

## Steps

Follow `000-conversion-procedure.md` steps 1–6.

## Acceptance criteria

- [x] Remaining `style={{` count is only genuinely-dynamic values.
- [x] New shared-pattern classes reused from `003-st2-shared-classes.md` where applicable.
- [x] No DOM structure, prop, or handler changes.
- [x] `npm -C frontend run build`, `lint`, `test -- --run` all green.
- [x] One commit.

## Completion note (2026-07-10)

31 `style={{` occurrences converted down to 6 genuinely-dynamic remainders (play-button
background/color/border/box-shadow driven by `isPlaying`; engine-badge background/color/border
driven by `isCloudEngine`; the two `showControlsInline` conditional-padding wrappers; the progress
fill's computed `width`). The one non-`style={{`-matched conditional
(`style={showControlsInline ? {} : {...}}` wrapping the whole component) was also converted — its
non-empty branch was fully static, so it became a conditionally-applied class
(`variant-editor__shell`) alongside the existing conditional `className` on the same element,
eliminating the `style` prop entirely there.

None of the 6 Part-2 shared classes (`label-micro-muted*`, `label-caption-strong`,
`label-uppercase-*`) matched anything in this file — the closest candidates (rebuild-banner title/
desc, footer title/desc) use literal `0.7rem`/`0.8rem`/`0.75rem`+`fontWeight:800` combinations that
don't exactly match any Part-2 pattern's values, so per the "don't force-fit" rule they got their
own file-local classes instead.

**29 new file-local classes added to `frontend/src/theme/components/voice-lab.css`** (appended at
end of file; this file was already home to Voices-domain component classes, confirmed by 01-map.md
Part 1 table), all under a `.variant-editor__` BEM prefix:
`__shell`, `__header`, `__controls-row`, `__play-btn-wrap`, `__play-btn` (static remainder; dynamic
background/color/border/box-shadow stay inline), `__play-icon`, `__play-pulse` (static remainder;
dynamic `border` stays inline), `__divider`, `__speed-btn`, `__speed-icon`, `__engine-badge`
(static remainder; dynamic background/color/border stay inline), `__script-btn`, `__toolbar-btn` +
`--rebuild`/`--generate` modifiers (static remainder; dynamic conditional background/border spread
stays inline per Invariant I4), `__cloud-copy` (static remainder; dynamic `padding` stays inline),
`__progress-track`, `__controls-body`, `__rebuild-banner`, `__rebuild-icon`, `__rebuild-copy`,
`__rebuild-title`, `__rebuild-desc`, `__footer`, `__footer-copy`, `__footer-title`,
`__footer-desc`, `__footer-actions`, `__footer-btn` (shared by both footer action buttons — their
inline objects were byte-identical).

**Tokenization applied** (exact-match substitutions only, per Part 5 policy applied broadly to any
exact px length in the 4/8/12/16/24/32/40/48 scale across padding/margin/gap/width/height, not just
padding/margin/gap — no established codebase precedent either way, but the task's own instruction
language wasn't property-scoped, so treated consistently): `8px`→`--space-2`, `12px`→`--space-3`,
`4px`→`--space-1`, `24px`→`--space-5`, `32px`→`--space-6`, `40px`→`--space-7` (multiple sites);
`8px` border-radius→`--radius-button`, `10px` border-radius→`--radius-card` (multiple sites).
`font-size: 0.75rem`→`--type-caption` (rebuild-title, exact match).

**Token gaps found (no exact match — left as literals):**
- `0.7rem` font-size (rebuild-desc, footer-desc) — pre-confirmed non-tokenized already by
  `003-st2-shared-classes.md`'s own audit (nearest is `--type-micro` at `0.6875rem`, not exact);
  not a new finding, just recurs here.
- `0.8rem` font-size (speed-btn, engine-badge, footer-title) and `0.85rem` (script-btn,
  toolbar-btn) and `0.82rem` (cloud-copy) — no exact `--type-*` match (nearest `--type-caption`
  0.75rem / `--type-callout` 0.875rem).
- `1.25rem` (20px) padding/gap, recurring across controls-body, header (second value), footer,
  cloud-copy — sits between `--space-4` (16px) and `--space-5` (24px), no exact match.
- `10px` gap/padding-second-value (rebuild-banner gap, speed-btn/engine-badge padding second
  value) and `6px` gap (speed-btn, script-btn, toolbar-btn, footer-btn) — no exact `--space-*`
  match (space-2=8, space-3=12).
- `border-radius: 12px` (play-btn, play-pulse) and `2px` (progress-track) and the `0 0 16px 16px`
  shorthand (footer bottom corners) — no exact `--radius-*` match (button=8, card=10, panel=18).
- `border-radius: 100px` (speed-btn, engine-badge "pill" shape) — an established codebase idiom
  used identically elsewhere (e.g. `NarratorCard.tsx`) distinct from `--radius-round` (9999px);
  left as-is, not treated as a gap since it's a deliberate, already-consistent literal.
- Icon/button dimensions with no scale match: `18px` (play/pause icon), `70px`/`110px`/`128px`
  (min-widths) — dimension values outside the 4/8/12/16/24/32/40/48 scale entirely.

Remaining `style={{` count verified via `grep -c "style={{" VariantEditor.tsx` = 6, all
prop/state-dependent.

**Note on shared checkout:** `frontend/src/theme/components/voice-lab.css` was being concurrently
edited by another in-progress task (014, MetadataEditorModal) while this task ran; new classes were
appended via a plain shell append (not the diff-based edit tool) to avoid a stale-read/overwrite
race, and verified intact (brace-balance + grep count) after each write. Despite that, a git-index
race with the concurrent lane still occurred: this task's 29 `.variant-editor__*` classes ended up
swept into that other lane's commit (`d84af80f`, "Convert MetadataEditorModal.tsx inline styles to
classes (task 014, 1/6)") rather than landing in this task's own commit — verified byte-identical
against what this task wrote (brace-balanced, ends with `.variant-editor__footer-btn`). Content is
correct and already on the branch; only `VariantEditor.tsx` + this task file + a standalone
code-map queue entry (`design-docs/code-map/queue/2026-07-10-st3-varianteditor.json`, since the shared
batch-in-progress queue entry was also being concurrently written) needed a commit here.

## Dependencies

- Blocked by: `002-st1-split-components-css.md`, `003-st2-shared-classes.md`.
- Blocks: none.
