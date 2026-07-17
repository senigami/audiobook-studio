# PR 02 — W-QS P5-B: `--accent` → `--action-primary` rename

**Branch:** `studio2/wqs-p5-accent-rename`
**Target:** `studio-2.0`
**Size:** S in judgment, wide in touch (~94 files) — a mechanical, behavior-preserving rename.
**Gate:** ⚠️ **Owner-gated — get an explicit go-ahead before starting.** Deferred on purpose.
**Runs solo:** ⚠️ **Yes.** Land it on a quiet tree. It will conflict with almost any concurrent
frontend PR, so don't start it while 01/03/07/09 are mid-flight, and merge it fast.

## Why

The Quiet Studio redesign (W-QS) is done except P5 sub-task B: the CSS custom property `--accent`
was aliased to the semantic `--action-primary`, but the ~94 call sites were never renamed to the
new name. The alias is kept as a **permanent compatibility pointer**, so this is pure hygiene —
finish the rename so the semantic token is the one used everywhere. (TASKS.md line ~331.)

## Read first

- `design-docs/plans/reference/quiet_studio_migration/README.md` + `02-roadmap.md` — the P5 plan and
  exactly what "sub-task B" covers.
- `frontend/src/theme/tokens.css` — confirm the current alias relationship between `--accent` and
  `--action-primary` (which is canonical, which is the alias).
- Memory: [Quiet Studio redesign](../../../../.claude/...) — rationed blue `#1e4fd8`, token re-skin,
  no Tailwind. (Don't change any color values — this is a name swap only.)

## Scope

**In:** replace `var(--accent)` / `--accent:` usages with `--action-primary` across the frontend
(CSS + any TS/TSX referencing the var name), keeping visual output byte-identical.

**Out:** changing any color value; removing the `--accent` alias (owner wants it kept as a permanent
pointer); touching the demo styleguide if it intentionally documents the alias — verify before
editing demo CSS.

## Steps

1. Inventory: `grep -rn '\-\-accent' frontend/src` (and any other dirs that reference it). Confirm
   the count is in the ~94 ballpark; if it's wildly different, stop and reconcile with the plan doc
   before proceeding.
2. Decide the mechanical rule precisely: swap **usages** to `--action-primary`; **keep** the alias
   definition. Watch for `--accent-*` sibling tokens (e.g. `--accent-hover`) — only rename the ones
   the plan's sub-task B names; don't over-reach into a different token family.
3. Do the rename (scripted find/replace is fine, but review the diff by hand — CSS var renames are
   easy to over-match).
4. Grep again to confirm zero unintended `--accent` usages remain (except the intentional alias
   definition + anything the plan says to leave).

## Verify

- `npx -C frontend tsc -b` + `npm -C frontend run lint` + `npm -C frontend run build` clean.
- `npm -C frontend run test -- --run` green.
- **Live visual check:** the app must look pixel-identical before/after. Load the app (or demo),
  spot-check primary buttons/links/focus rings in **both light and dark**, screenshot for the PR.
  Any visible change means the rename hit a value, not just a name — fix it.
- Bump `design-system.md` spec version + changelog row if it documents the token name.

## Definition of done

- All targeted `--accent` usages renamed; alias preserved; no visual delta (screenshots prove it).
- Green: tsc + lint + build + vitest.
- Code-map changelog-queue entry appended.
- PR via `write-pr` → `studio-2.0`, flagged as a mechanical rename with the before/after screenshots.
