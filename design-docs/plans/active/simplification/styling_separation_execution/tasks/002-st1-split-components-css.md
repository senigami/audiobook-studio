# Task 002 — Split components.css into 11 domain files

Status: complete — 2026-07-10

## Goal

Split `frontend/src/theme/components.css` into `frontend/src/theme/components/*.css` (11 files, by
domain), assembled through one `@import`-ordered index, so the rendered cascade is byte-identical
to today.

## Map links

- Map: `../01-map.md` Part 1 (full domain table + boundaries), Invariant I1 (cascade order),
  Invariant I2 (pure move).
- Risk flag: `multi-file` — this is the highest-blast-radius task in the whole plan; every page in
  the app depends on this cascade.
- Depends on: `001-st1-delete-dead-selectors.md` (must be complete — line numbers below assume the
  5 dead selectors are already gone, which shifts everything after line ~170 down by roughly
  20 lines versus the 2026-07-10 boundaries cited in `01-map.md`).

## Exact target

Source: `frontend/src/theme/components.css`.
Destination: 11 new files under `frontend/src/theme/components/` (create the directory):

1. `core.css` — `.btn-*` + primitives
2. `nav.css` — `.nav-rail`, `.rail-book-block`, `.mobile-nav-drawer`, `.top-bar`
3. `book.css` — `.book-layout`, `.book-stage-tabs`, `.chapter-workspace*`, `.chapter-table*`,
   `.manuscript-stage*`, `.studio-analysis-strip`, `.studio-header-actions`
4. `book-tabs.css` — `.casting-stage*`, `.lexicon-stage*`
5. `publish.css` — `.publish-stage*`, `.book-info-card*`, `.assembly-picker`,
   `.book-identity-strip*`, `.continue-listening-card*`
6. `activity.css` — `.activity-page*`
7. `shared.css` — the orphan utility block: `.sr-only`, `.input-group*`, `.input-field*`,
   `.popover-panel*`, `.icon-circle*`, `.as-*`, `.form-input*`
8. `player.css` — `.player-bar*` family
9. `voice-lab.css` — `.voice-catalog-card*`, `.voice-lab-page*`, `.voice-lab-phase-stepper*`,
   `.voice-lab-section*`, `.voice-dropzone*`
10. `review-tools.css` — `.review-main*`, `.revise-tool*`, `.write-tool*`
11. `misc.css` — `.switch*`, `.modal-close-btn`, `.color-swatch-picker*`, `.control-target*`,
    `@keyframes segment-render-monitor-pulse` and related `.segment-render-monitor*` rules (if any
    live at the tail of the file — grep to confirm exact extent)

**Note on the split point between `shared.css` (7) and `player.css` (8) vs `misc.css` (11):**
`shared.css` and `misc.css` are two DIFFERENT, non-contiguous pieces of the original file. Do not
merge them into one file — see Invariant I1 in the map for why (cascade-order preservation).

## Tokenization (owner-requested addition — relaxes "pure move" slightly)

While cutting each domain's rules into its new file, also tokenize: for any hardcoded hex/rgb color
or raw px/rem length in the rule you're moving, check it against `frontend/src/theme/tokens.css`
(colors: `--surface*`/`--accent`/`--action-*`/`--text-*`/`--border*`/`--success*`/`--warning*`/
`--action-danger*`; spacing: `--space-1`…`--space-8`; type: `--type-*`). If it's an exact or
clearly-intended match for an existing token, substitute the token as part of the move. If there's
no matching token, leave the literal as-is and note the file:line + value for the token-gap report
in `018-st4-spec-bump-and-guard.md` — don't invent new tokens here. This is the one deliberate
exception to "no rule edits" below: structure/selectors/property order stay untouched, only bare
literal values that have an obvious token equivalent get substituted.

## Steps

- [x] Confirm task 001 is complete (`.btn-home` etc. no longer present).
- [x] `wc -l frontend/src/theme/components.css` — get the current total.
- [x] For each of the 11 domains above, `grep -n` the anchor selectors from `../01-map.md` Part 1's
      table to find the current start line of that domain's first rule, and the next domain's
      start line marks this domain's end (exclusive). Re-derive boundaries fresh — don't trust the
      exact line numbers in `01-map.md`, they predate task 001's edit.
- [x] Cut each domain's line range into its new file **verbatim** — no rule edits, pure move.
- [x] Find the current import point for `components.css` (likely `frontend/src/theme/index.css` or
      similar — `grep -rn "components.css" frontend/src/theme/`) and replace it with 11 `@import`
      statements in the exact order listed above (1→11).
- [x] Delete the original `frontend/src/theme/components.css`.
- [x] `npm -C frontend run build` — must succeed with no missing-selector/import errors.
- [x] `grep -rn "components.css" frontend/src` — should return 0 hits (fully retired, not just
      emptied).

## Acceptance criteria

- [x] 11 new files exist under `frontend/src/theme/components/`, each containing only its domain's
      rules, none exceeding ~950 lines (the largest, `book.css`, is expected around 915).
- [x] The union of all 11 files' line counts plus the 5-selector deletion from task 001 accounts
      for the original file's full content — nothing lost, nothing duplicated (spot check: total
      `wc -l` across the 11 new files should be close to the pre-split total minus the ~20 deleted
      dead-selector lines).
- [x] The old `components.css` file no longer exists.
- [x] The import order in the index file exactly matches the 1→11 sequence above.
- [x] `npm -C frontend run build` succeeds.
- [x] One commit (this is one atomic move — don't split across multiple commits, since a partial
      split would leave broken imports).

## Dependencies

- Blocked by: `001-st1-delete-dead-selectors.md`.
- Blocks: `003-st2-shared-classes.md` and all of Workload C (004–017) — they target the new split
  files, not the monolith.

## Out of scope

- No rule content changes beyond the dead-selector deletion (001) and the tokenization
  substitutions described above — no selector renames, no restructuring, no new rules.
- Don't add the new ST-2 shared classes here — that's 003.
- The final pixel-identical visual confirmation is an owner check batched into
  `../02-roadmap.md`'s final checklist, not something to self-verify here.
