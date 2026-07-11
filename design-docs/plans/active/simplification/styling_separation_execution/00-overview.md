# Overview — Styling separation execution

## The task

Move styling out of frontend JSX into token-keyed CSS with semantic class names, per the
conversion rule in `../03_styling_separation.md`:

| Inline style is… | Action |
|---|---|
| Static + tokens + **repeated** | → shared class in `theme/components/*.css` |
| Static + tokens + **one-off** | → local class if it aids readability, else stays inline |
| **Dynamic** (computed from props/state/measurement) | → stays inline, must use `var(--token)` |
| Hardcoded color/length | → fixed to a token |

Sequence: **ST-1** (split `theme/components.css`) → **ST-2** (add shared classes for confirmed
repeats) → **ST-3** (convert the 14 highest inline-style-count files) → **ST-4** (bump specs, add a
regression guard).

## Explicit scope boundary

- **In scope:** `frontend/src/theme/components.css` split; the 4 new + 2 uppercase-label shared
  classes; the 14 named ST-3 files; `code-organization.md`/`design-system.md` spec bumps; a new
  CI-wired hardcoded-color/inline-style guard script; **tokenization** (owner-requested,
  2026-07-10) — every hardcoded color/spacing/type literal touched by ST-1's CSS split or ST-3's
  file conversions gets substituted for its matching existing token in `theme/tokens.css` where an
  exact match exists (see `01-map.md` Part 5). This is standardizing usage of the *existing* token
  registry against the code this plan already touches, not a repo-wide retokenization sweep and
  not inventing new tokens.
- **Out of scope:** any markup or behavior change (styling only), `frontend/src/demo/` (separate
  demo-build codebase, not production UI — see project memory "Demo build separate from launch"),
  the `alignItems:'center'`/`flex:1` missed-utility-usage cleanup (real bug, but a distinct task —
  see `tasks/017-followup-missed-utility-usage.md`), `EditTab.tsx` (dead code — see below).

## Corrections vs. the parent doc (2026-07-10 fact-check — trust these)

1. **`components.css` is 4,440 lines**, not 3,772 (it kept growing after the doc's own
   2026-07-01 correction). Full current domain boundaries are in `01-map.md`.
2. **The domain split is 11 files, not 5** — two whole new feature areas (Voice Lab; Review/Revise
   /Write tools) and a "book tabs" (Casting/Lexicon/Publish) sub-domain were added to the file
   after the doc was written. Same rule as the doc (one domain per file, ~600-line norm), just
   applied to more real content.
3. **`MetadataEditorModal.tsx` and `EngineCard.tsx`** were split into several smaller files by an
   unrelated 2026-07-04 cleanup (LF-4/LF-2). Convert each of their child files now, not one
   monolith — task files 012/013 list every child.
4. **`EditTab.tsx` is dead code** — confirmed via router trace (`App.tsx` → `ProjectDetailPage.tsx`
   → `StudioShell.tsx`): its only render condition is structurally always false today. **Dropped
   from ST-3 entirely** — do not create a task for it.
5. **`ResyncPreviewModal.tsx` is live** (imported by `DirectorsConsole/CastTool` and
   `Book/components/ChapterTextPanel.tsx`, both in the actively-routed Book workspace) — kept in
   ST-3, despite the parent doc's framing of it as part of a "dead ChapterEditor tree."
6. **`CastPalette.tsx` doubled** (24→48 inline styles since the doc was written, Director's Console
   work) — re-ranked to the top of the ST-3 order.
7. **`design-system.md` is at 1.13.0 today**, not 1.2.0 as the parent doc assumed. ST-4 bumps it to
   1.14.0, not 1.3.0 — see `tasks/018-st4-spec-bump-and-guard.md`.

## Success criteria (definition of done)

- [ ] `theme/components.css` no longer exists; its content lives in `theme/components/*.css` (11
      files per `01-map.md`), imported in original order from one index so the rendered cascade is
      byte-identical (verified by an owner visual diff, not just build success).
- [ ] The 5 dead selectors (`.btn-home`, `.btn-menu-destructive`, `.action-menu-item`,
      `.select-glass`, `.engine-chunk`) are deleted, not moved.
- [ ] The 4 new shared classes + 2 uppercase-label variants exist in the appropriate
      `theme/components/*.css` file and are actually used by at least the files converted in ST-3.
- [ ] All 14 ST-3 files (20 files counting the already-split children) have zero remaining
      `style={{}}` blocks for static/repeated patterns; dynamic values remain inline as
      `var(--token)`; no markup or behavior changed (props, DOM structure, event handlers
      untouched).
- [ ] Every hardcoded color/spacing/type literal encountered while doing the above (in the CSS
      split and in the 20 ST-3 files) has been substituted for its matching existing token where
      one exists; any with no matching token are compiled into a token-gap report (task 018), not
      silently left as-is or invented ad hoc.
- [ ] `code-organization.md` → 1.2.0, `design-system.md` → 1.14.0, both with changelog rows.
- [ ] A CI-wired script rejects new hardcoded hex/rgb colors or raw px literals inside
      `style={{}}` (and in `theme/components/*.css`) in `frontend/src` (excluding `demo/` and
      `tokens.css` itself).
- [ ] `npm -C frontend run build`, `npm -C frontend run lint`, `npm -C frontend run test -- --run`
      all green throughout; no regressions.
- [ ] Owner has visually confirmed every converted screen in light + dark (batched checklist in
      `02-roadmap.md`, not per-file pauses).
- [ ] A changelog-queue entry is appended to `docs/code-map/queue/` per this repo's CLAUDE.md
      code-map convention.
- [ ] `../../TASKS.md`'s Milestone 3 / 005 / "Styling separation" line items are ticked.
