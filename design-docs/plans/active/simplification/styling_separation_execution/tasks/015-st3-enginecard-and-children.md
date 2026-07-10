# Task 015 — Convert EngineCard.tsx + its split children

Status: complete — 2026-07-10

## Goal

Convert inline styles to classes across `EngineCard.tsx` and the 3 smaller files it was split into
by an unrelated 2026-07-04 cleanup (task LF-2), applying the shared procedure to each.

## Map links

- Procedure: `000-conversion-procedure.md`.
- Map: `../01-map.md` Part 3, `../00-overview.md` §3 (why this is 4 files, not 1).
- Risk flag: `none`.

## Important context

The parent doc scoped this as one 792-line file with 52 inline styles. A **different**, unrelated
cleanup (LF-2, commit `b9b1dcc6`, 2026-07-04) split it into `EngineCard.tsx` (now 562 lines) plus 3
new extracted files. Convert every file below, not just the parent.

## Exact targets (all under `frontend/src/pages/Engines/components/`)

| File | Current `style={{` count (2026-07-10) |
|---|---:|
| `EngineCard.tsx` | 30 |
| `EngineCalibrationSection.tsx` | 14 |
| `EngineSettingsForm.tsx` | 2 |
| `EngineTestSample.tsx` | 6 |

Re-count each with `grep -c "style={{" <file>` before starting.

## Steps

Apply `000-conversion-procedure.md` steps 1–6 to each of the 4 files above, independently, one
commit per file (4 commits total).

## Acceptance criteria

- [x] All 4 files have zero remaining `style={{}}` for static/repeated patterns; only genuinely
      dynamic values (if any) remain inline (remaining occurrences per file are flex/gap utility
      combos out of scope per `000-conversion-procedure.md`'s "what NOT to do", small one-offs kept
      per the pragmatism guard, or genuinely dynamic values — see completion note breakdown below).
- [x] Shared classes from `003-st2-shared-classes.md` checked — none of the six Part 2 classes
      (`.label-micro-muted[-strong|-italic]`, `.label-caption-strong`, `.label-uppercase-sm/-md`)
      matched any of these 4 files' actual property combinations (their `fontSize` literals never
      hit an exact `var(--type-micro)` = 0.6875rem or other token match), so none were reused. New
      Engines-domain classes were shared **across the 4 files** instead (`.engine-highlight-panel`,
      `.engine-eyebrow`) per this task's explicit instruction.
- [x] No DOM structure, prop, or handler changes in any of the 4 files.
- [x] `npm -C frontend run build`, `lint`, `test -- --run` all green after each file's commit.
- [x] 4 commits (one per file) — see timing note below for file 2.

## Completion note (2026-07-10)

No dedicated Engines-domain `theme/components/*.css` file exists, so a co-located stylesheet was
created: `frontend/src/pages/Engines/components/EngineCard.css`, imported by all 4 files (per
000's step 2 "core.css or a co-located stylesheet" — chose co-located specifically to avoid
staging/committing into the actively-being-split-and-edited shared `core.css`/`components.css`
files during this session's parallel-lane execution).

**Per-file breakdown** (`style={{` count before → after):

- `EngineCard.tsx`: 30 → 17. New classes: `.engine-card`, `.engine-card__header`,
  `.engine-card__logo` (+ `.engine-card__logo img`), `.engine-card__title`,
  `.engine-card__dev-badge`, `.engine-card__subtitle`, `.engine-card__body`,
  `.engine-status-badge` (static shell only — the tone-driven color/background/border from
  `getBadgeStyles()` stays inline, genuinely dynamic), `.engine-card__footer`, `.engine-icon-btn`
  (shared shell for the 4 footer buttons — Run Test/Verify/Install Deps/Uninstall; each keeps its
  own dynamic `opacity` and, for Install Deps/Uninstall, static tone `color`/`background`/`border`
  inline), `.engine-setup-notice`, `.engine-setup-notice__title`. Remaining 17: pure flex/gap
  layout combos (out of scope, tracked by `019-followup-missed-utility-usage.md`), the dynamic
  cloud-privacy banner (ternary on `uiMetadata?.privacy_tone`), and a handful of small (2-3
  property) one-offs left inline per the pragmatism guard.
  Tokenization: `width/height: '32px'` on the logo wrapper → `var(--space-6)` (exact match, only
  tokenizable literal in this file — no hex/rgb colors present, all already `var(--token)`).
- `EngineCalibrationSection.tsx`: 14 → 12. New/reused classes: `.engine-highlight-panel` (shared
  panel shell, margin/padding differ per usage and stay inline), `.engine-eyebrow` (shared
  uppercase micro-label), `.engine-calibration-chip__value`, `.engine-calibration-chip__reset`
  (dynamic `cursor` stays inline). Remaining 12: the low-confidence-driven readout box (dynamic
  ternary on `border`/`background`), several small one-off spans/paragraphs (2-3 properties each).
  No tokenizable literals found (no hex/rgb; no rem value hit an exact `--type-*`/`--space-*`
  match under the strict "raw px/rem literal" reading — see gap note below).
  **Timing note:** this file's code (+ the `EngineCard.css` additions above) was verified clean
  (build/lint/test green, diff matched exactly as authored) then staged for its own commit, but by
  the time of committing, a concurrent lane's activity in this shared checkout had already swept
  both files into commit `12417983` ("Mark task 007 (GlobalQueue.tsx style conversion) complete") —
  verified byte-identical to the intended diff via `git show 12417983 -- <paths>`. Same race
  pattern already documented in that commit and in `3314a839`/`009`'s completion note. From this
  point on, `git commit -m "…" -- <paths>` (pathspec-limited) was used instead of `git add` +
  `git commit` to avoid recurrence — confirmed each subsequent commit touched only its intended
  file(s).
- `EngineSettingsForm.tsx`: 2 → 2 (unchanged count, but the 6-property panel style block was
  replaced with `.engine-highlight-panel` (reused) + a 2-property inline override; the remaining
  1-property `marginBottom` wrapper was left inline as a genuine one-off).
- `EngineTestSample.tsx`: 6 → 3. New classes: `.engine-test-sample` (container),
  `.engine-eyebrow` (reused), `.engine-test-sample__play-btn`. Remaining 3: header flex/justify
  row, the "Generated at" one-off label, and a flex/gap wrapper — all out of scope or trivial
  one-offs.

**Token gaps found** (no matching token in `tokens.css`; left as literal per the pragmatism
guard/"don't force-fit" rule):
- Font sizes throughout all 4 files (`0.62rem`, `0.65rem`, `0.7rem`, `0.72rem`, `0.78rem`,
  `0.8rem`, `0.82rem`, `0.85rem`, `0.86rem`, `0.88rem`, `1.05rem`, etc.) — none equal an existing
  `--type-*` token (0.6875/0.75/0.875/0.9375/1.0625/1.125rem etc.).
- `padding: '1px 4px'` (DEV badge) and `'2px 8px'` (calibration chip) — first side (`1px`/`2px`)
  has no `--space-N` equivalent, so left as literal rather than a partial substitution.
- `border-radius` px values (`4/6/8/10/12/16/999px`) were **not** checked against `--radius-*`
  tokens, matching the same scoping reading task 009 used: `000-conversion-procedure.md` step 3's
  explicit registry only lists colors/spacing/type, not radius, so radius substitution was treated
  as out of this task's tokenization scope (flagging in case that reading is wrong —
  `--radius-card`=10px and `--radius-button`=8px would be exact matches for several of these
  buttons/logo-wrapper occurrences if radius is meant to be in-scope).
- **Divergence flag:** task 009's completion note records that lane choosing to tokenize rem-based
  spacing/margin/padding values against `--space-N` by assuming a 16px root font size (e.g.
  `0.5rem` → `var(--space-2)`). This task did **not** apply that same rem→px-token assumption
  (treated it as outside the procedure's literal "raw px number" wording), so none of this file
  set's many rem-based margin/padding/gap values (`0.25rem`, `0.5rem`, `0.75rem`, `1rem`, `1.25rem`,
  etc. — several of which are exact px-equivalents of `--space-1..6`) were substituted. Flagging
  this cross-lane inconsistency for `018-st4-spec-bump-and-guard.md`'s consolidation pass to
  resolve one way or the other.

## Dependencies

- Blocked by: `002-st1-split-components-css.md`, `003-st2-shared-classes.md`.
- Blocks: none.
