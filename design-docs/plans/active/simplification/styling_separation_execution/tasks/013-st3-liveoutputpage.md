# Task 013 — Convert LiveOutputPage.tsx

Status: complete — 2026-07-10

## Goal

Convert inline styles to classes in `frontend/src/pages/LiveOutput/LiveOutputPage.tsx` per the
shared procedure.

## Map links

- Procedure: `000-conversion-procedure.md`.
- Map: `../01-map.md` Part 3, Invariants I3/I4.
- Risk flag: `none`.

## Exact target

`frontend/src/pages/LiveOutput/LiveOutputPage.tsx` — 26 `style={{` occurrences as of 2026-07-10
(unchanged from the parent doc).

## Steps

Follow `000-conversion-procedure.md` steps 1–6.

## Acceptance criteria

- [x] Remaining `style={{` count is only genuinely-dynamic values.
- [x] New shared-pattern classes reused from `003-st2-shared-classes.md` where applicable.
- [x] No DOM structure, prop, or handler changes.
- [x] `npm -C frontend run build`, `lint`, `test -- --run` all green.
- [x] One commit.

## Dependencies

- Blocked by: `002-st1-split-components-css.md`, `003-st2-shared-classes.md`.
- Blocks: none.

## Completion note

- 26 `style={{` occurrences converted down to 2 remaining, both genuinely dynamic/out-of-scope:
  - The consumer-list button (`showConsumerTopics`) keeps an inline `style={{ cursor: ... }}` — the
    only dynamic property (computed from `consumerTopicIds(consumer.id).length`); its static
    properties moved to `.live-output-page__consumer-btn`.
  - The `LiveOutputTable` wrapper div's `style={{ flex: 1, minHeight: 0 }}` was left untouched per
    the procedure's "What NOT to do" — `flex: 1` is explicitly reserved for the
    `019-followup-missed-utility-usage.md` follow-up, not this task.
- None of the Part 2 shared classes (`.label-micro-muted*`, `.label-caption-strong`,
  `.label-uppercase-*`) matched this file's patterns exactly (different color/size/weight
  combinations), so no reuse from `core.css` — this file has no existing domain CSS file either, so
  all new classes are file-local in a new co-located `frontend/src/pages/LiveOutput/LiveOutputPage.css`
  (imported from the top of `LiveOutputPage.tsx`, matching the existing `ScriptView.css` co-location
  convention).
- New classes added (all in `LiveOutputPage.css`): `.live-output-page`, `.live-output-page__intro`,
  `.live-output-page__title-row`, `.live-output-page__title`, `.live-output-page__subtitle`,
  `.live-output-page__section`, `.live-output-page__section-summary`, `.live-output-page__event-map`,
  `.live-output-page__event-map-intro`, `.live-output-page__consumer-list`,
  `.live-output-page__topic-row`, `.live-output-page__consumer-btn`, `.live-output-page__topic-value`,
  `.live-output-page__topic-label`, `.live-output-page__trace`, `.live-output-page__trace-value`,
  `.live-output-page__trace-pre`.
- Tokenization done (exact matches only, per `01-map.md` Part 5's registry — border-radius is not
  a listed category so `border-radius: 20px`/`8px` were left as literals, not tokenized):
  - `gap: 1rem` → `var(--space-4)`; the `2rem` inside the root `calc()` → `var(--space-6)`.
  - `padding: 1.25rem 1.5rem` → `padding: 20px var(--space-5)` (only the `1.5rem`/24px half matches
    `--space-5`; the `1.25rem`/20px half has no match, left literal — see gap below).
  - `margin-bottom: 0.25rem` → `var(--space-1)`.
  - `gap: 0.5rem` → `var(--space-2)` (×2: event-map grid, trace grid).
  - `gap: 0.75rem` / `margin-top: 0.75rem` / `padding: 0.75rem` → `var(--space-3)` (topic-row gap ×3,
    trace margin-top, pre padding).
  - `font-size: 1.5rem` (h1) → `var(--type-title)` (exact match).
- Token gaps found (no exact match in `tokens.css`, left as literals):
  - `padding` first value `1.25rem` (20px) in `.live-output-page__intro` — nearest spacing tokens are
    `--space-4` (16px) and `--space-5` (24px); no exact match.
  - `gap: 0.6rem` (title row), `gap: 0.45rem` (×2, section summaries), `gap: 0.35rem`
    (consumer-list), `margin-top: 0.9rem` / `padding-top: 0.85rem` (×2, `.live-output-page__section`)
    — none land on the 4/8/12/16/24/32/40/48px spacing scale.
  - Assorted one-off font sizes not on the type scale: `0.9rem` (subtitle), `0.92rem` (section
    summary), `0.82rem` (event-map intro + topic rows), `0.85rem` (trace), `0.78rem` (trace pre) —
    none match `--type-caption` (0.75rem), `--type-callout` (0.875rem), `--type-body` (0.9375rem), or
    `--type-micro` (0.6875rem) exactly.
  - `font-weight: 800` (h1) has no matching `--type-weight-*` token (nearest is
    `--type-weight-title`/`--type-weight-display` at 700). `font-weight: 600`/`700` literals
    elsewhere in the file numerically match `--type-weight-headline`/`--type-weight-micro` (600) and
    `--type-weight-title`/`--type-weight-display` (700), but since two same-valued tokens exist with
    different semantic names for non-heading UI text (button/label/summary), substituting either
    would be a misleading semantic pick rather than an "obvious" match — left as literals per the
    "don't force-fit" guidance.
  - `border-radius: 20px` / `8px` — out of scope: `01-map.md` Part 5's tokenization table has no
    radius category (only colors, spacing, type size/weight), so these were left untouched.
