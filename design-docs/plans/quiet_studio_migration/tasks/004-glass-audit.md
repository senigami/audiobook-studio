# Task 004 — Glass Material Audit
STATUS: done

## Goal

Apply the "pinned = solid + hairline, floating = glass" material rule across the app shell. Pinned chrome (sidebar, top bar, nav rail) loses `backdrop-filter` and becomes solid `var(--surface-alt)` + hairline border. Floating layers (ActionMenu popover, modals, drawers, player while overlapping) keep glass. Tighten `--blur-glass-strong` from 40px to 28px for menus/sheets/palette.

Total file footprint: approximately 10 files.

## Why it matters

The current nav rail and top bar use the same glass treatment as floating overlays, making the hierarchy ambiguous — chrome looks like it's hovering over content it actually contains. The proposed-quiet-studio.html spec is explicit: the styleguide topbar is `background: var(--surface-alt); border-bottom: 1px solid var(--hairline)` with a comment "NO backdrop-filter — pinned chrome is opaque structural material." Applying this rule reduces visual noise, improves legibility on lower-end hardware (fewer composited layers), and sharpens the hierarchy.

## Map links

- `PART-glass` — the named part this task implements
- `INV-1` — app builds at every phase boundary (alias-first; no token-name deletions)
- `INV-2` — AA in both themes (surface-alt over bg must remain AA for any text rendered on it)
- `INV-3` — spec lockstep (design-system.md §2 Material section updated same commit)

## Files to touch

### Pinned chrome — remove backdrop-filter, use solid + hairline

```
frontend/src/theme/components.css      (.nav-rail, .top-bar classes)
frontend/src/app/layout/NavRail.tsx    (inline style or class referencing glass)
frontend/src/app/layout/TopBar.tsx     (inline style or class referencing glass)
frontend/src/app/App.tsx               (AppShell layout root if it carries any glass bg)
```

### Floating layers — keep glass, tighten blur

```
frontend/src/components/ui/ActionMenu.tsx    (popover — glass stays; audit blur value)
frontend/src/components/overlays/ConfirmModal.tsx  (backdrop blur stays; audit value)
frontend/src/theme/tokens.css                (--blur-glass-strong: 40px → 28px; P1 may have done this — verify)
frontend/src/theme/components.css            (.glass-panel if referenced)
```

### Drawers and player (verify-only unless changes needed)

```
frontend/src/app/layout/PlayerBar.tsx        (player-bar — floating/overlapping = glass; confirm)
frontend/src/app/layout/MobileNavDrawer.tsx  (drawer — floating = glass; confirm)
frontend/pages/Voices/components/VoiceUtils.tsx  (Drawer component — floating = glass; confirm)
```

## Target shape / contract

### The rule (from `PART-glass` in 01-map.md)

| Layer type | Rule | CSS pattern |
|---|---|---|
| Pinned chrome (top bar, nav rail, sidebar) | Solid + hairline | `background: var(--surface-alt); border-right: 1px solid var(--hairline);` — NO `backdrop-filter` |
| Floating overlay (popover, modal, drawer, player while overlapping) | Glass | `background: rgba(255,255,255,.72); backdrop-filter: saturate(180%) blur(28px);` light / `rgba(26,29,39,.78)` dark |

### Exact target for `--blur-glass-strong`

The proposed-quiet-studio.html material demo uses `backdrop-filter: saturate(180%) blur(28px)` (was 40px). If P1 already changed the token value, verify; if not, this task owns the change:

```css
/* tokens.css */
--blur-glass-strong: saturate(180%) blur(28px);  /* was 40px */
```

If `--blur-glass-strong` is only consumed by floating layers (ActionMenu, modals, drawers), the change is safe. If it is consumed by nav-rail/top-bar, those are being de-glassed anyway so the token value change is irrelevant there.

### Nav rail after this task

```css
/* components.css .nav-rail — AFTER */
.nav-rail {
  background: var(--surface-alt);        /* was: glass / var(--surface) with blur */
  border-right: 1px solid var(--hairline);
  /* NO backdrop-filter */
}
```

### Top bar after this task

```css
/* components.css .top-bar — AFTER */
.top-bar {
  background: var(--surface-alt);
  border-bottom: 1px solid var(--hairline);
  /* NO backdrop-filter */
}
```

### ActionMenu popover — kept glass, blur tightened

The ActionMenu renders via a portal into `document.body`. Its popover `<div>` (the positioned menu panel) is a floating layer. Keep glass; ensure blur uses `var(--blur-glass-strong)` (28px post-P1) rather than a hardcoded value.

The ConfirmModal backdrop `backdropFilter: 'blur(8px)'` (inline in the backdrop `<motion.div>`) is a light contextual blur on the overlay backdrop — this is intentionally lighter than the strong blur and can stay as `blur(8px)` inline. The modal surface itself is `var(--surface)` solid — no glass on the surface.

## Ordered steps

**Step 1 — Audit current blur token value in `tokens.css`**

Check whether P1 already updated `--blur-glass-strong` to 28px. If yes, skip to Step 2. If no, update it now:

```css
/* tokens.css — change value only, keep name */
--blur-glass-strong: saturate(180%) blur(28px);
```

**Step 2 — De-glass the nav rail**

In `components.css`, find the `.nav-rail` block. Remove any `backdrop-filter` / `-webkit-backdrop-filter` lines. Set `background: var(--surface-alt)`. Confirm `border-right: 1px solid var(--hairline)` (or `var(--border)` if that is the current token — use whichever token maps to the hairline divider; after P1 `--hairline` is the canonical name).

If `NavRail.tsx` carries any inline glass styles (e.g. `backdropFilter`, `WebkitBackdropFilter`), remove those inline styles. The CSS class governs.

**Step 3 — De-glass the top bar**

In `components.css`, find the `.top-bar` block (or the header selector). Remove `backdrop-filter`. Set `background: var(--surface-alt)`. Confirm `border-bottom: 1px solid var(--hairline)`.

If `TopBar.tsx` carries inline glass styles, remove them.

**Step 4 — Verify AppShell root**

In `App.tsx` / `AppShell.tsx`, the layout root uses `backgroundColor: 'var(--bg)'` inline. No glass here — confirm and leave unchanged.

**Step 5 — Audit ActionMenu popover glass**

In `ActionMenu.tsx`, find the positioned menu panel `<div>` (the one rendered via `createPortal`). Confirm it uses `var(--blur-glass-strong)` (or update the inline/class to use the token). The current value is likely a hardcoded `blur(16px)` or similar — update to `var(--blur-glass-strong)`.

Exact surgery: search for `backdropFilter` in `ActionMenu.tsx` and replace any hardcoded blur literal with `var(--blur-glass-strong)`.

**Step 6 — Verify player / drawers**

Check `PlayerBar.tsx` and `MobileNavDrawer.tsx` for glass usage. Drawers are floating — keep glass, ensure blur token is used. The player bar overlaps content — keep glass. No change needed unless hardcoded blur values are found; if found, replace with `var(--blur-glass-strong)`.

Check `VoiceUtils.tsx` `<Drawer>` similarly.

**Step 7 — ConfirmModal: backdrop is fine, surface stays solid**

The ConfirmModal backdrop `backdropFilter: 'blur(8px)'` is intentionally lighter (contextual scrim) — leave it. The modal surface `background: 'var(--surface)'` is solid — leave it. No change to `ConfirmModal.tsx` unless a glass surface is found.

**Step 8 — Update `design-docs/specs/design-system.md`**

Update the Material section (§2 or wherever glass/blur is documented). Add the "pinned = solid + hairline, floating = glass" rule explicitly. Note the `--blur-glass-strong` value change. Bump `spec_version` (minor). Add changelog row.

**Step 9 — Full verification.**

## Spec update (lockstep — INV-3)

**`design-docs/specs/design-system.md`**:
- Material subsection (§2 or §3 — wherever `--blur-glass*` and surface material rules are described): add the explicit pinned/floating split rule in prose.
- Token registry entry for `--blur-glass-strong`: update documented value from 40px to 28px.
- `spec_version` bump (minor).
- Changelog row: `| x.x.x | 2026-06-xx | P4: glass material audit — pinned chrome = solid + hairline (nav rail, top bar); floating = glass; --blur-glass-strong 40px→28px. |`

## Acceptance criteria

1. Nav rail renders `var(--surface-alt)` solid background, `1px solid var(--hairline)` right border, no `backdrop-filter`. Verified by visual inspection in both themes.
2. Top bar renders `var(--surface-alt)` solid, `1px solid var(--hairline)` bottom border, no `backdrop-filter`.
3. ActionMenu popover retains glass (backdrop-filter present), blur uses `var(--blur-glass-strong)` (28px), not a hardcoded value.
4. ConfirmModal surface is solid `var(--surface)`. Backdrop is `blur(8px)` contextual scrim — unchanged.
5. PlayerBar and drawers retain glass.
6. `--blur-glass-strong` token value is `saturate(180%) blur(28px)` (was 40px).
7. No `backdrop-filter` anywhere in the codebase for pinned chrome (grep check: `grep -rn "backdrop-filter" frontend/src/app/layout/NavRail.tsx frontend/src/app/layout/TopBar.tsx frontend/src/theme/components.css` returns zero matches after this task).
8. `design-system.md` spec_version bumped; changelog row added.
9. All five verification commands green.

## Verification

```bash
# 1. Backend — unchanged; confirm green
./venv/bin/python -m pytest -q

# 2. Backend lint
ruff check .

# 3. Frontend lint
npm -C frontend run lint

# 4. Frontend tests — no new tests for this task (CSS/layout change, no behavior change)
npm -C frontend run test -- --run --maxWorkers=1

# 5. Build
npm -C frontend run build

# Sanity grep — confirm no backdrop-filter on pinned chrome:
grep -rn "backdrop-filter" \
  frontend/src/app/layout/NavRail.tsx \
  frontend/src/app/layout/TopBar.tsx \
  frontend/src/theme/components.css
# Expected: zero matches (or only comments)
```

## Dependencies

- **P1 (task 001) must be complete** — this task consumes `--surface-alt`, `--hairline`, `--blur-glass-strong` from `tokens.css`. If P1 already updated `--blur-glass-strong` to 28px, step 1 is a verify-only step.
- P3 (status/progress) and P2 (forms/Switch) are independent — may run in parallel with this task.

## Out of scope

- Do not change the demo `siteMockup/mockup.css` glass usage — that is P6 (demo polish).
- Do not de-glass the `ConfirmModal` surface (it is already solid).
- Do not alter any structural layout dimensions, widths, or padding of the nav rail or top bar.
- Do not change `PlayerBar` layout or behavior.
- Do not extract ActionMenu to CSS classes (that is a P5 / `design-docs/plans/simplification/` concern).
