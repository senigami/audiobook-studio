# Task 001 — Core token re-skin: colors, radii, focus, motion, flat buttons
STATUS: DONE — commits c6b974cd (P1 re-skin) + 157dac8e (audit fixes) + b3943300 (adv-review R1 fixes) + 9bdcc17f (adv-review R2 fixes) (2026-06-20); spec_version 1.6.3; 3 review rounds (fusion + adv R1 + adv R2), all green

## Goal

Re-skin the entire app in the Quiet Studio color language by changing token **values** in `tokens.css` (alias-first: `--accent` is aliased to the new value, never deleted), adding role-named tokens (`--action-primary`, `--live-indicator`, `--on-action`, `--surface-reading`, `--status-cached-*`, `--text-subtle`), tightening radii, wiring the double-ring focus, and applying a reduced-motion-first `base.css` rewrite. In `components.css`: flatten `.btn-primary` (drop gradient/glow/`translateY` lift → flat fill + 1px inset border), apply `~3%` banner tints, enforce 44px `min-height` on buttons and form controls, add `calm-pulse` keyframe. Recompute the §2.4 contrast table against the new backgrounds. The app re-skins automatically because `~94` files consume `var(--token)`.

## Why it matters

This is the headline deliverable (M2). After this phase ships, both the real app and the demo render in the Quiet Studio visual language in both light and studio-dark. Every subsequent phase (P2–P6) builds on these token values. The alias-first strategy means zero consumer ripple: all 94+ files get the new look without touching them.

## Map links

- `PART-tokens` — primary owner; the central contract
- `PART-base` — reduced-motion-first guard, focus ring, explicit transitions
- `PART-comp` — flat `.btn-primary`, banner tints, 44px controls, `calm-pulse`
- `PART-demo` — auto-re-skins via tokens; no demo files need direct edits in this phase
- `PART-spec` — §2/§2.4/§4 updated lockstep; **R2** recomputed contrast table
- `INV-1` — alias-first; no token **names** deleted; app builds at phase end
- `INV-2` — AA in both themes; re-verify every pairing in §2.4 against the new `--bg`
- `INV-3` — spec lockstep in the same commit
- `INV-5` — reduced-motion guard is the FIRST rule in `base.css`
- `INV-6` — 44px `min-height` on all interactive controls
- `R2` — contrast table recomputed against `--bg #f5f7fb` (light) / `#0d0f14` (dark)
- `R3` — alias-first; do NOT do the 94-file `--accent` rename in this phase

## Files to touch

| File | Change |
|------|--------|
| `frontend/src/theme/tokens.css` | Color value changes + new role-named tokens (alias `--accent`, add `--action-primary` etc.) |
| `frontend/src/theme/base.css` | Reduced-motion guard first; explicit transitions; `:focus-visible` double-ring |
| `frontend/src/theme/components.css` | Flat `.btn-primary`; banner tints; 44px min-height; `calm-pulse` keyframe |
| `design-docs/specs/design-system.md` | §2 token registry + §2.4 contrast table (R2) + §4 (if `--font-*` affects §4); bump `spec_version` to `1.6.0`; changelog row |

## Target shape / contract

### `tokens.css` — light `:root` changes and additions

All values pulled verbatim from `design-docs/style-guide/proposed-quiet-studio.html`.

**Page surfaces (changed values):**
```css
--bg: #f5f7fb;            /* was #f8fafc */
--surface-alt: #f0f3f9;   /* was #f1f5f9 */
```

**New: `--surface-reading`:**
```css
--surface-reading: #fffef9;
```

**Accent alias and new role-named tokens (light):**
```css
--accent: #1e4fd8;                        /* aliased from #2b6eff — value changes, name kept */
--accent-hover: #1a45c0;                  /* was --accent-hover: #1d54da */
--accent-active: #163aa3;                 /* was #1642b5 */
--action-primary: #1e4fd8;               /* NEW role-named alias */
--action-primary-hover: #1a45c0;         /* NEW */
--action-primary-active: #163aa3;        /* NEW */
--on-action: #ffffff;                    /* NEW (≡ --text-on-accent, kept for semantic clarity) */
--primary-border-inset: rgba(255,255,255,.18);  /* NEW — 1px inset border on flat buttons */
--live-indicator: #1e4fd8;               /* NEW */
```

**Text ladder (light — two changes + one new):**
```css
--text-primary: #1c2b4a;    /* was #0f172a */
--text-muted: #5c6a80;      /* was #64748b */
--text-subtle: #64748b;     /* NEW — large/chrome only in light */
/* --text-secondary: #475569 — unchanged */
```

**Semantic state corrections (light):**
```css
--on-success: #04240f;              /* NEW (was absent; needed for text on success fills) */
--status-cached-text: #9a4d0a;      /* NEW */
--status-cached-ring: #a8530a;      /* NEW — NOT #d97706 (fails 3:1 as text); ring/icon use only */
```

**Radii (tightened):**
```css
--radius-button: 8px;    /* was 10px */
--radius-card: 10px;     /* was 14px */
--radius-compact: 6px;   /* NEW — compact controls, badges */
/* --radius-panel: 18px — unchanged (P4 glass audit will revisit) */
/* --radius-round: 9999px — unchanged */
```

**Progress (solid preparing fill):**
```css
--progress-preparing-fill: #64748b;   /* was rgba(248,250,252,.96) — now solid/opaque */
```

**Motion (new `--pulse-duration`):**
```css
--pulse-duration: 3s;   /* NEW — zeroed by reduced-motion guard; .is-running restores */
```

### `tokens.css` — dark `[data-theme="dark"]` changes and additions

```css
--bg: #0d0f14;               /* was #0f1117 — the studio near-black */
--surface-reading: #1c1f2a;  /* NEW */
--surface-alt: #161922;      /* was #22263a */

--action-primary: #6b9fff;   /* NEW */
--action-primary-hover: #5b90f5;  /* NEW */
--action-primary-active: #4f86ff; /* NEW */
--on-action: #0d0f14;        /* NEW — dark bg, not white, for dark primary buttons */
--primary-border-inset: rgba(0,0,0,.12);  /* NEW */
--live-indicator: #6b9fff;   /* NEW */

/* 3-stop dark text ladder */
--text-secondary: #a8b2c4;   /* was #9ca3af */
--text-muted: #8b95a8;       /* was #6b7280 — IMPORTANT: fixes the AA failure in current §2.4 */
--text-subtle: #6b7a92;      /* NEW */

--on-success: #052e16;       /* NEW */
--status-cached-text: #fbbf24;  /* NEW */
--status-cached-ring: #fbbf24;  /* NEW */

--progress-preparing-fill: #94a3b8;  /* was rgba(51,65,85,.96) — now solid */
```

Note: `--accent` in dark stays pointing at `#6b9fff` (matches `--action-primary` dark value). Keep both names; do not remove `--accent`.

### `base.css` — full rewrite of global rules

**Rule 1 MUST be the reduced-motion guard (INV-5):**
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**Replace `transition: all 0.2s` in `button {}` with an explicit property list:**
```css
button {
  /* ... existing rules ... */
  transition:
    background-color var(--dur-fast) var(--ease-standard),
    color            var(--dur-fast) var(--ease-standard),
    border-color     var(--dur-fast) var(--ease-standard),
    box-shadow       var(--dur-fast) var(--ease-standard),
    opacity          var(--dur-fast) var(--ease-standard);
  min-height: 44px;   /* INV-6 */
}
```

**Wire `:focus-visible` double-ring (replaces the current single `outline: 2px solid var(--accent)`):**
```css
button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
a:focus-visible,
[tabindex]:focus-visible {
  outline: 3px solid var(--action-primary);
  outline-offset: 2px;
  box-shadow: 0 0 0 5px rgba(255,255,255,.55);
}

[data-theme="dark"] button:focus-visible,
[data-theme="dark"] input:focus-visible,
[data-theme="dark"] select:focus-visible,
[data-theme="dark"] textarea:focus-visible,
[data-theme="dark"] a:focus-visible,
[data-theme="dark"] [tabindex]:focus-visible {
  box-shadow: 0 0 0 5px rgba(0,0,0,.5);
}
```

**Add `min-height: 44px` to form controls (INV-6):**
```css
input, select, textarea {
  min-height: 44px;
}
```

### `components.css` — flat `.btn-primary`

Current `.btn-primary` uses `background: var(--accent)` with `transform: translateY(-1px)` on hover. Replace:

```css
.btn-primary {
  background: var(--action-primary);
  color: var(--on-action);
  border: 1px solid transparent;
  box-shadow: inset 0 0 0 1px var(--primary-border-inset);
}

.btn-primary:hover:not(:disabled) {
  background: var(--action-primary-hover);
  /* NO transform: translateY — flat */
  box-shadow: inset 0 0 0 1px var(--primary-border-inset);
}

.btn-primary:active:not(:disabled) {
  background: var(--action-primary-active);
  box-shadow: inset 0 0 0 1px var(--primary-border-inset);
}

.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  filter: grayscale(0.5);
}
```

### `components.css` — `calm-pulse` keyframe

Add at the top of `components.css` (or in a `/* Keyframes */` block):
```css
@keyframes calm-pulse {
  0%, 100% { opacity: 0.7; }
  50%       { opacity: 1.0; }
}

/* Running state restores pulse even under reduced-motion (structural exemption per INV-5) */
.is-running {
  --pulse-duration: 3s;
  animation: calm-pulse var(--pulse-duration) ease-in-out infinite;
}
```

### `components.css` — banner tints at ~3%

Any `.banner-info`, `.banner-warning`, `.banner-error`, `.banner-success` rules that currently use a higher-opacity tint background should be updated to `~3%` opacity. The target is: banner background `rgba(<hue>, .03)` composited against `--surface`. Specific values:
- Info banner: `background: rgba(30, 79, 216, 0.03); border: 1px solid rgba(30, 79, 216, 0.12);`
- Warning banner: `background: rgba(245, 158, 11, 0.03); border: 1px solid rgba(245, 158, 11, 0.15);`
- Error banner: `background: rgba(239, 68, 68, 0.03); border: 1px solid rgba(239, 68, 68, 0.12);`
- Success banner: `background: rgba(22, 163, 74, 0.03); border: 1px solid rgba(22, 163, 74, 0.12);`

If no `.banner-*` classes exist in the current `components.css`, skip this sub-step and note it in the commit message.

### Contrast recompute (R2)

After updating token values, recompute the §2.4 table against the new backgrounds using the scratchpad contrast pattern:
- Light: `--bg #f5f7fb`, `--surface #ffffff`
- Dark: `--bg #0d0f14`, `--surface #1a1d27`

Key pairs to re-verify (all others inherited from existing table):

| Pair | New foreground | New background | Check |
|------|---------------|----------------|-------|
| text-primary / bg (light) | #1c2b4a | #f5f7fb | ≥4.5 |
| text-muted / surface (light) | #5c6a80 | #ffffff | ≥4.5 |
| text-muted / surface-alt (light) | #5c6a80 | #f0f3f9 | ≥4.5 (was borderline) |
| on-action / action-primary (light) | #ffffff | #1e4fd8 | ≥4.5 (critical fix) |
| text-secondary / bg (dark) | #a8b2c4 | #0d0f14 | ≥4.5 |
| text-muted / surface (dark) | #8b95a8 | #1a1d27 | ≥4.5 (fixes current §2.4 failure) |
| status-cached-text / surface (light) | #9a4d0a | #ffffff | ≥4.5 |
| status-cached-ring / surface (light) | #a8530a | #ffffff | ≥3.0 (UI/ring only) |

## Ordered steps

1. **Inventory the `tokens.css` changes**: diff the current `:root` and `[data-theme="dark"]` blocks against the target values listed above. Prepare all edits as a grouped changeset (surfaces, then action/accent, then text, then semantic, then radii, then progress, then motion).

2. **Edit `tokens.css` — light `:root`**:
   - Update `--bg`, `--surface-alt` to the new values.
   - Add `--surface-reading: #fffef9`.
   - Update `--accent`, `--accent-hover`, `--accent-active` to the new values.
   - Add `--action-primary`, `--action-primary-hover`, `--action-primary-active`, `--on-action`, `--primary-border-inset`, `--live-indicator` alongside the existing `--accent` family (keep `--accent`).
   - Update `--text-primary`, `--text-muted`. Add `--text-subtle`.
   - Add `--on-success: #04240f`, `--status-cached-text: #9a4d0a`, `--status-cached-ring: #a8530a`.
   - Update `--radius-button: 8px`, `--radius-card: 10px`. Add `--radius-compact: 6px`.
   - Update `--progress-preparing-fill: #64748b`.
   - Add `--pulse-duration: 3s`.

3. **Edit `tokens.css` — dark `[data-theme="dark"]`**:
   - Update `--bg: #0d0f14`, `--surface-alt: #161922`.
   - Add `--surface-reading: #1c1f2a`.
   - Update `--accent` in dark to `#6b9fff` (aligns with `--action-primary` dark value). Add `--action-primary: #6b9fff`, `--action-primary-hover: #5b90f5`, `--action-primary-active: #4f86ff`, `--on-action: #0d0f14`, `--primary-border-inset: rgba(0,0,0,.12)`, `--live-indicator: #6b9fff`.
   - Update `--text-secondary: #a8b2c4`, `--text-muted: #8b95a8`. Add `--text-subtle: #6b7a92`.
   - Add `--on-success: #052e16`, `--status-cached-text: #fbbf24`, `--status-cached-ring: #fbbf24`.
   - Update `--progress-preparing-fill: #94a3b8`.

4. **Edit `base.css` — prepend the reduced-motion guard**: cut the current `*` reset block and re-paste it **after** the new guard. The guard must be line 1. Keep all existing rules below it.

5. **Edit `base.css` — replace `transition: all 0.2s` in `button {}`** with the explicit property list and add `min-height: 44px` to the `button {}` block.

6. **Edit `base.css` — replace `:focus-visible` block**: find `button:focus-visible, ...` rule and replace with the double-ring from Target shape above (including the `[data-theme="dark"]` override).

7. **Edit `base.css` — add `min-height: 44px` to `input, select, textarea`** (INV-6). Add after the `button {}` block.

8. **Edit `components.css` — add `calm-pulse` keyframe block** at the top.

9. **Edit `components.css` — rewrite `.btn-primary` and its `:hover`/`:active`/`:disabled` rules** to the flat shape from Target shape (no gradient, no `translateY`, inset border via `box-shadow`).

10. **Edit `components.css` — banner tints**: if `.banner-*` rules exist, update opacity to `~3%` as specified. If absent, skip and note in commit.

11. **Contrast recompute (R2)**: using the scratchpad contrast script pattern or a WCAG calculator, verify all pairs in the R2 table above. Record results in `design-docs/specs/design-system.md` §2.4. Confirm `--text-muted #8b95a8` on `--surface #1a1d27` (dark) passes AA (it should: ≈5.0:1).

12. **Update `design-docs/specs/design-system.md`**:
    - §2.1 token registry: add `--action-primary`, `--on-action`, `--live-indicator`, `--primary-border-inset`, `--surface-reading`, `--text-subtle`, `--status-cached-text`, `--status-cached-ring`, `--radius-compact`, `--pulse-duration` to the appropriate rows.
    - §2.4: replace the contrast table with the recomputed values. Resolve the previously-noted `--text-muted` dark AA failure (new value #8b95a8 passes).
    - §8 (accessibility): update the `:focus-visible` description to reflect the double-ring.
    - `spec_version`: `1.5.0` → `1.6.0` (if following P0; else `1.4.0` → `1.5.0`).
    - Changelog row: `| 1.6.0 | 2026-06-XX | **P1 token re-skin.** Alias --accent to #1e4fd8 (light)/#6b9fff (dark); add role-named --action-primary/--on-action/--live-indicator; studio-dark --bg #0d0f14; 3-stop dark text ladder (--text-secondary #a8b2c4, --text-muted #8b95a8, NEW --text-subtle #6b7a92); --surface-reading; --status-cached-*; tightened radii (card 10, button 8, NEW compact 6); double-ring :focus-visible; solid --progress-preparing-fill; calm-pulse keyframe; flat .btn-primary (no gradient/glow/lift); ~3% banner tints; 44px min-height; reduced-motion guard first in base.css. §2.4 recomputed against new --bg. |`

13. **Run all 5 verification commands** (see Verification). Fix any lint errors before advancing.

## Spec update (lockstep — INV-3)

- `design-docs/specs/design-system.md` §2.1, §2.4, §8 updated as described in step 12.
- `spec_version` bumped (1.5.0 → 1.6.0 if P0 preceded; else 1.4.0 → 1.5.0).
- Changelog row added.
- `voice-tone.md`: **no change**.

## Acceptance criteria

- [ ] `tokens.css` `:root`: `--bg: #f5f7fb`, `--action-primary: #1e4fd8`, `--on-action: #ffffff`, `--text-primary: #1c2b4a`, `--text-muted: #5c6a80`, `--text-subtle: #64748b`, `--surface-reading: #fffef9`, `--status-cached-text: #9a4d0a`, `--status-cached-ring: #a8530a`, `--radius-card: 10px`, `--radius-button: 8px`, `--radius-compact: 6px`, `--progress-preparing-fill: #64748b`, `--pulse-duration: 3s`.
- [ ] `tokens.css` dark: `--bg: #0d0f14`, `--action-primary: #6b9fff`, `--on-action: #0d0f14`, `--text-secondary: #a8b2c4`, `--text-muted: #8b95a8`, `--text-subtle: #6b7a92`, `--surface-reading: #1c1f2a`, `--progress-preparing-fill: #94a3b8`.
- [ ] `--accent` token name exists in BOTH light and dark (alias preserved; no deletion).
- [ ] `base.css` first non-comment rule is the `@media (prefers-reduced-motion: reduce)` block.
- [ ] `base.css` `button {}` has `min-height: 44px` and no `transition: all`.
- [ ] `base.css` `:focus-visible` ring is `outline: 3px solid var(--action-primary)` with `box-shadow` second ring.
- [ ] `components.css` `.btn-primary` has no `transform: translateY`, no gradient background, no glow shadow; uses `background: var(--action-primary)` and `box-shadow: inset 0 0 0 1px var(--primary-border-inset)`.
- [ ] `components.css` contains `@keyframes calm-pulse` and `.is-running { animation: calm-pulse ... }`.
- [ ] `design-system.md` §2.4 contrast table recomputed; `--text-muted` dark AA failure row resolved.
- [ ] All five verification commands exit 0.

## Verification

```bash
# 1. Backend — no Python changes
./venv/bin/python -m pytest -q

# 2. Backend lint
ruff check .

# 3. Frontend lint
npm -C frontend run lint

# 4. Frontend tests (targeted; --maxWorkers=1)
npm -C frontend run test -- --run --maxWorkers=1

# 5. Frontend build
npm -C frontend run build
```

TDD note: no new React components in this phase. CSS-only changes and token additions. The `.btn-primary` change is class-driven (confirmed: 138 uses across the codebase, all via CSS class, no inline gradients) so no consumer ripple. Existing tests must stay green.

## Dependencies

- **P0 (task 000-fonts.md) must be complete** before committing this phase, so that `--font-ui` tokens exist in `tokens.css` before any `base.css` edits that reference `var(--font-ui)`. If running P1 without P0, use the literal `"Geist Variable", "Inter", system-ui, ...` stack in `base.css` temporarily and update after P0.

## Out of scope

- The full 94-file `--accent` → `--action-primary` rename is deferred (R3 — its own optional late phase P5).
- `StatusOrb` icon-insets (P3).
- `Switch` component (P2).
- Glass/material audit (P4).
- Demo-specific polish (P6).
- `--blur-glass-strong` 40→28px change (P4 glass audit).
- No changes to `--accent-gradient`, `--accent-glow-strong`, `--hero-glow` tokens (those may be consumed by demo layers; leave unchanged to avoid breaking the demo before P6).
