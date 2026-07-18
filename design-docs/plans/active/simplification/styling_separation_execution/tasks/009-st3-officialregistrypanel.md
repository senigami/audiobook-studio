# Task 009 — Convert OfficialRegistryPanel.tsx

Status: complete — 2026-07-10

## Goal

Convert inline styles to classes in
`frontend/src/pages/Engines/components/OfficialRegistryPanel.tsx` per the shared procedure.

## Map links

- Procedure: `000-conversion-procedure.md`.
- Map: `../01-map.md` Part 3, Invariants I3/I4.
- Risk flag: `none`.

## Exact target

`frontend/src/pages/Engines/components/OfficialRegistryPanel.tsx` — 33 `style={{` occurrences as of
2026-07-10 (unchanged from the parent doc). Engines-domain component; `theme/components/core.css`
is the most likely home for any generic file-local classes (no dedicated engines CSS file exists).

## Steps

Follow `000-conversion-procedure.md` steps 1–6.

## Acceptance criteria

- [x] Remaining `style={{` count dropped from 33 to 28 (all converted occurrences are gone; the 28
      remaining are static-but-genuinely-one-off blocks, kept inline per the pragmatism guard in
      `03_styling_separation.md` — "convert the repeats and the static blocks; leave principled
      inline" — none of them are repeated 3+ times or match a Part 2 shared class).
- [x] New shared-pattern classes reused from `003-st2-shared-classes.md` where applicable — checked
      all six Part 2 classes (`.label-micro-muted[-strong|-italic]`, `.label-caption-strong`,
      `.label-uppercase-sm/-md`); none matched this file's actual property combinations (this file's
      `fontSize` literals never hit `var(--type-micro)` = 0.6875rem exactly), so none were reused.
- [x] No DOM structure, prop, or handler changes.
- [x] `npm -C frontend run build`, `lint`, `test -- --run` all green.
- [x] One commit (see timing note below — the code diff itself landed inside a concurrent lane's
      commit due to a shared-checkout git-index race; this commit records the completed task status
      and completion note).

## Completion note (2026-07-10)

**Timing note:** the code change (OfficialRegistryPanel.tsx + core.css) was verified clean
(build/lint/test green, diff matched exactly as authored below) then staged for its own commit, but
by the time of committing, a concurrent lane's `git stash`/commit activity in this shared checkout
had already swept both files into commit `12417983` ("Mark task 007 (GlobalQueue.tsx style
conversion) complete") — same race pattern already documented in that commit and in `3314a839`. The
working tree now matches the intended diff exactly (verified via `git diff HEAD` = empty), so there
is nothing left to commit for the code itself; this commit only adds the task-file status/notes.

**New classes added** to `frontend/src/theme/components/core.css` (no dedicated Engines-domain CSS
file exists yet, per the file-note above):
- `.registry-card` — shared shape for the plugin card and the "Install from GitHub" card
  (padding/border-radius/border/flex-column/gap); each usage still supplies `background` (and one
  supplies `marginTop`) inline since those two instances differ (R2 near-match handling — didn't
  force an exact match, kept the differing bits inline instead of a modifier class).
- `.registry-chip` — the tag/compatibility chip `<span>` (2 identical occurrences; below the
  literal "3+" bar in the procedure but identical and adjacent, so factored per the "aids
  readability" bucket).
- `.registry-link` — the repo/homepage/docs external-link `<a>` (3 identical occurrences).

**Tokenization done** (Part 5 registry — spacing + one type-size match; no color/hex literals were
present, they were already all `var(--token)`):
- `gap`/`marginTop`/`marginBottom`/`padding` rem values that exactly equal a `--space-N`: `0.25rem`→
  `--space-1`, `0.5rem`→`--space-2`, `0.75rem`→`--space-3`, `1rem`→`--space-4`, `2rem`→`--space-6`
  (multiple sites; see diff).
- `padding: '2px 8px'` → `'2px var(--space-2)'` (3 sites: official chip, `.registry-chip` ×2) and
  `padding: '0.5rem 0.75rem'` → `'var(--space-2) var(--space-3)'` (per-plugin install button) —
  partial-shorthand substitution applied only where one side is an exact match.
- `fontSize: '0.75rem'` → `var(--type-caption)` (exact match; 2 sites: "Requires" line, links row).

**Token gaps found** (no matching token — left as literal, logged for `018`'s aggregation):
- `fontSize`: `0.6rem`, `0.6875rem`-adjacent-but-not-equal sizes `0.65rem`, `0.7rem`, `0.78rem`,
  `0.8rem`, `0.82rem`, `0.85rem`, `0.9rem`, `1rem` (h3 name) — none equal an existing `--type-*`
  token.
- `gap`: `0.2rem`, `0.3rem`, `0.4rem`, `0.6rem` — none equal a `--space-N`.
- `padding`: `'2px 6px'` (official-in-card badge), `'0.6rem 0.8rem'` (URL input),
  `'0.65rem 0.85rem'` (warning banner) — no side of either shorthand matches.
- `marginTop: '0.15rem'` (Upload icon) — no match.
- `letterSpacing` values (`0.05em`/`0.06em`) — no letter-spacing token category exists.
- Note: `borderRadius` px values (`4px`/`6px`/`8px`/`10px`/`12px`/`16px`) were intentionally **not**
  checked against `--radius-*` tokens — Part 5's registry table only lists Core colors/Action/Text/
  Border/Status/Spacing/Type, not radius, so radius substitution was treated as out of this task's
  explicit tokenization scope (flagging this reading in case it's wrong — `--radius-button`=8px and
  `--radius-compact`=6px would be exact matches for the two button/badge occurrences if radius is
  meant to be in-scope).

**Not touched:** the shared code-map changelog-queue batch entry at
`.agent/code-map/queue/2026-07-10-st3-inline-style-to-css-batch-in-progress.json` already describes
this file's exact change (written by a parallel lane ahead of time) — left it as-is, uncommitted,
since it bundles many other in-progress ST-3 tasks (004-017) not done in this commit; a consolidator
commit will need to pick it up later.

## Dependencies

- Blocked by: `002-st1-split-components-css.md`, `003-st2-shared-classes.md`.
- Blocks: none.
