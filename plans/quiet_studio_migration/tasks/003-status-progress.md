# Task 003 — Status / Progress Icon-Insets
STATUS: done

## Goal

Add lucide icon-insets to `StatusOrb` and a terminus icon to `PredictiveProgressBar` so that state is carried by icon + shape + text, never by color alone. Adopt the solid `--progress-preparing-fill` and full-opacity `--live-indicator` running beam from P1. Wire a shared `calm-pulse` keyframe on both the orb ring and the bar fill via a `--pulse-duration` token + `.is-running` override.

Keep the `StatusOrb` props contract and the `PredictiveProgressBar` props + architecture **verbatim** — only the visual layer changes (icon layer + token-keyed fills). No behavior, no progress math, no new public props.

## Why it matters

WCAG Success Criterion 1.4.1 (Use of Color): status must not be conveyed by hue alone. The current `StatusOrb` communicates the error state only via fill color; the running state uses `RefreshCw` without a calm pulse. The progress bar has no icon at all at 2% fill. After P1 ships `--progress-preparing-fill` as a **solid** slate (`#64748b` light / `#94a3b8` dark) and `--live-indicator` as a full-opacity action blue, this task wires those values + adds the icon layer that satisfies INV-4, INV-5, and R5.

## Map links

- `PART-status` — the named part this task implements
- `INV-4` — color never the sole signal (icon + shape + text required)
- `INV-5` — reduced-motion: `--pulse-duration` token zeroed by the guard; `.is-running` restores structural state communication
- `INV-1` — app builds at every phase boundary
- `INV-3` — spec lockstep (progress-presentation.md cross-ref + design-system.md §6 update)
- `R5` — StatusOrb/progress are tested + load-bearing; keep architecture verbatim

## Files to touch

```
frontend/src/components/ui/StatusOrb.tsx
frontend/src/components/progress/PredictiveProgressBar/PredictiveProgressBar.tsx
frontend/src/theme/utilities.css                      (add @keyframes calm-pulse; --pulse-duration in tokens.css is P1's job)
frontend/src/theme/components.css                     (add .is-running rule; orb state classes if moved to CSS)
frontend/tests/unit/components/ui/StatusOrb.test.tsx  (TDD — create if absent, extend if present)
frontend/tests/unit/components/progress/PredictiveProgressBar.test.tsx  (TDD — extend existing)
docs/specs/design-system.md                           (§6 StatusOrb + PredictiveProgressBar entries; spec_version bump)
```

`--pulse-duration` token must already exist in `frontend/src/theme/tokens.css` from P1. Do not re-add it here; only consume it.

## Target shape / contract

### StatusOrb icon-insets (per state)

| State | Icon (lucide) | Fill token | Ring token | Notes |
|---|---|---|---|---|
| `queued` / `isQueued` | `Clock` size 10 | `rgba(100,116,139,.10)` (via new `.orb-queued` CSS class using `--surface-alt`) | `rgba(100,116,139,.30)` | Replaces the current `RefreshCw` + `animate-spin`; queued is waiting, not spinning |
| `isTrulyProcessing` (running) | `Loader2` size 10, spin + `.is-running` calm-pulse on ring | `rgba(30,79,216,.10)` / `rgba(107,159,255,.12)` dk | `var(--live-indicator)` | `Loader2` keeps `animate-spin`; ring gets calm-pulse via `.is-running` class on the SVG circle |
| `isComplete` / `done` | `Check` size 10 | `rgba(22,163,74,.10)` / `rgba(34,197,94,.12)` dk | `var(--success)` | Pop animation on done (existing `orb-done-pop` in proposal — optional micro-animation, not load-bearing) |
| `isStale` / `isStuckProcessing` (warning) | `AlertTriangle` size 10 (already imported) | `var(--warning)` fill unchanged | `var(--warning-text)` | No change to icon — already AlertTriangle |
| `isError` | `X` size 10, strokeWidth 2.5 | `rgba(239,68,68,.10)` | `var(--error)` | Replace the current inline `!` span; `X` is clearer and icon-system-compliant |
| `isReadyToStitch` / `isPartial` | arc/progress unchanged | `var(--surface)` unchanged | Arc stroke uses `var(--action-primary)` | No icon override needed — arc is the secondary signal |
| `hasM4a` cached ring | `Archive` size 10 (visible only when M4A present + not in another active state) | ring only, no fill change | `var(--status-cached-ring)` | Replaces the plain accent ring that is currently the only signal |
| empty | no icon | `var(--surface)` | `var(--border)` at 0.3 opacity | |

The icon node is placed in the existing center-content `<div>` (the absolute-positioned overlay div). No structural SVG changes.

### PredictiveProgressBar terminus icon

Add a small lucide icon **at the leading edge of the fill** (right end of the current progress, inside the bar) that changes by state. This is a 14px icon positioned `absolute; right: 2px; top: 50%; transform: translateY(-50%)` inside `.prog-fill`, visible only when fill width > ~8% (to avoid crowding at 2%).

| Presentation state | Icon | Color |
|---|---|---|
| `isPreparingStatus` | `Clock` 12px | `var(--text-muted)` |
| `isActiveStatus` / `isLiveAnimatedStatus` | `Loader2` 12px spin | `var(--on-action)` (white/dark-bg) |
| `isDoneStatus` | `Check` 12px | `var(--on-success)` |
| `isFailedStatus` | `X` 12px | `#ffffff` |
| `isCancelledStatus` | `X` 12px | `var(--text-muted)` |

`.prog-fill-running` must apply `.is-running` (calm-pulse on the fill). This is the shared keyframe from `utilities.css` — no duplication.

### calm-pulse keyframe location

Define `@keyframes calm-pulse` in `frontend/src/theme/utilities.css` (it currently has `@keyframes spin`, `fade-in`, `scale-in`, `barber-pole`, `progress-stripes` — add alongside them).

```css
@keyframes calm-pulse {
  0%, 100% { opacity: 0.7; }
  50%       { opacity: 1.0; }
}
```

The `.is-running` class:

```css
/* components.css or utilities.css — shared */
.is-running {
  --pulse-duration: 3s; /* restores even when reduced-motion zeroed it at :root */
  animation: calm-pulse var(--pulse-duration) ease-in-out infinite;
}
```

`--pulse-duration` is declared in `tokens.css` (P1 work): `:root { --pulse-duration: 3s; }` with the reduced-motion guard zeroing it. `.is-running` is the structural override (INV-5).

## Ordered steps

**Step 0 — TDD: write failing tests first (required by testing-standards.md R1)**

1. Open (or create) `frontend/tests/unit/components/ui/StatusOrb.test.tsx`.
2. Add tests that assert the icon is rendered for each state: `Clock` for queued, `Loader2` for running, `Check` for done, `X` for error. Use `@testing-library/react`; query by `aria-label` or `data-testid` on the icon wrapper, not by color.
3. Run `npm -C frontend run test -- --run --maxWorkers=1 frontend/tests/unit/components/ui/StatusOrb.test.tsx` — confirm RED.
4. Add a test in `PredictiveProgressBar.test.tsx` that the terminus icon renders for the `running` state and that it is absent when progress < 8%. Confirm RED.

**Step 1 — Add `@keyframes calm-pulse` to `utilities.css`**

Insert the keyframe alongside the existing `@keyframes spin`. Do not add `.is-running` here — that goes in `components.css`.

**Step 2 — Add `.is-running` rule to `components.css`**

```css
/* Calm-pulse — shared by running orb ring + progress bar fill.
   Restores --pulse-duration even when the reduced-motion guard zeroed it at :root.
   INV-5: structural motion (state communication) survives reduced-motion. */
.is-running {
  --pulse-duration: 3s;
  animation: calm-pulse var(--pulse-duration) ease-in-out infinite;
}
```

**Step 3 — Update `StatusOrb.tsx`: replace icon logic**

- Add imports: `Clock, Loader2, Check, Archive` from `lucide-react` (alongside existing `AlertTriangle`).
- Replace the `!` span (error state) with `<X size={10} strokeWidth={2.5} style={{ display: 'block' }} />`.
- Replace the `isQueued` `RefreshCw` with `<Clock size={10} style={{ display: 'block' }} color="var(--text-muted)" />`.
- Replace the `isTrulyProcessing` `RefreshCw` with `<Loader2 size={10} color="var(--live-indicator)" className="animate-spin" style={{ display: 'block' }} />`.
- For `isComplete`: set `content = <Check size={10} color="var(--success)" style={{ display: 'block' }} />`.
- For `hasM4a` cached ring: the outer ring stroke is already conditionally set; add `color: 'var(--status-cached-ring)'` (uses the new token from P1). No center icon change needed unless it is the dominant state.
- Apply `.is-running` class to the outer ring `<circle>` in the SVG via a `className` prop when `isTrulyProcessing` is true. (SVG `<circle>` accepts `className`.)

Keep the orb `fill`, `orbRadius`, `orbStroke`, `orbStrokeWidth` variables unchanged. The ring/icon changes are purely additive.

**Step 4 — Update `PredictiveProgressBar.tsx`: add terminus icon**

- Import `Clock, Loader2, Check, X` from `lucide-react`.
- Inside the bar's fill `<div>` (find the element rendering the colored fill), add an absolutely-positioned icon child that is rendered when `displayedProgress > 0.08` (8% threshold). Use the `presentationState` / helpers (`isActiveStatus`, `isDoneStatus`, etc.) already imported from `predictiveProgressBarHelpers`.
- Apply `className="is-running"` to the fill `<div>` when `isLiveAnimatedStatus(presentationState)` is true (this wires calm-pulse onto the fill).
- The fill's background color must come from the token: `var(--live-indicator)` for running (P1 sets this to full-opacity `#1e4fd8` / `#6b9fff`), `var(--progress-preparing-fill)` for preparing (P1 sets this to solid `#64748b` / `#94a3b8`). If the bar already uses these tokens (P1 work), no change needed here. Verify; if not yet token-driven, wire them now.
- Do NOT change `PredictiveProgressBarProps`, `resetPredictiveProgressMemory`, lane/migration logic, `progressMemory`, or any ETA math. This is view-only.

**Step 5 — Run tests to green**

`npm -C frontend run test -- --run --maxWorkers=1 frontend/tests/unit/components/ui/StatusOrb.test.tsx frontend/tests/unit/components/progress/PredictiveProgressBar.test.tsx`

All new assertions must pass. Existing tests must remain green.

**Step 6 — Update `docs/specs/design-system.md`**

- §6 (Components): update the `StatusOrb` entry to document the icon-per-state table. Update the `PredictiveProgressBar` entry to note the terminus icon and calm-pulse class.
- Bump `spec_version` from current to next minor (e.g. `1.4.0 → 1.5.0`).
- Add changelog row: `| x.x.x | 2026-06-xx | P3: StatusOrb icon-insets (INV-4); PredictiveProgressBar terminus icon + calm-pulse (.is-running); progress-presentation.md cross-ref. |`
- Cross-reference `docs/specs/progress-presentation.md` in the §6 note — confirm this task does not alter any behavior described there (it doesn't: only visual layer added, no props/contracts changed).

**Step 7 — Full verification** (see Verification section below).

## Spec update (lockstep — INV-3)

**`docs/specs/design-system.md`**:
- Section §6 (Shared Primitives): `StatusOrb` subsection — add the icon-per-state table; note that color + icon are now always paired.
- Section §6: `PredictiveProgressBar` subsection — note terminus icon (present when fill > 8%), calm-pulse via `.is-running`, token fill references.
- `spec_version` bump (minor).
- Changelog row in the same commit.

**`docs/specs/progress-presentation.md`**:
- No spec_version bump here — this task makes no change to the progress math, props, contract, or invariants. Add a single cross-reference note in the "Visual rendering" section (or §6 if one exists): "StatusOrb and PredictiveProgressBar add icon-insets in the Quiet Studio migration (task 003) — see design-system.md §6; the progress contract (props, math, invariants) is unchanged."

## Acceptance criteria

1. Every `StatusOrb` state renders a lucide icon alongside its color signal — verified via unit tests (R1: confirm tests were red before the fix).
2. `StatusOrb` queued state shows `Clock` (not `RefreshCw`); running shows `Loader2` (spinning, calm-pulse on ring); done shows `Check`; error shows `X`.
3. The running orb ring pulses via the shared `calm-pulse` keyframe with `--pulse-duration: 3s`. Under `prefers-reduced-motion: reduce` the animation is suppressed at `:root` level; `.is-running` on the ring restores `--pulse-duration: 3s` so the structural state communication survives (INV-5).
4. `PredictiveProgressBar` shows a terminus icon at the leading edge of the fill when fill > 8%; icon changes per state (`Clock` preparing, `Loader2` running, `Check` done, `X` failed).
5. The running fill has `className="is-running"` — calm-pulse applies (INV-5).
6. `var(--progress-preparing-fill)` (solid slate) is the preparing fill; `var(--live-indicator)` (full-opacity action blue) is the running fill. Both come from tokens — no hardcoded colors.
7. `PredictiveProgressBarProps` interface is unchanged. All existing tests pass.
8. `design-system.md` spec_version bumped; changelog row added; progress-presentation.md cross-ref note added.
9. All five verification commands green.

## Verification

```bash
# 1. Backend — must stay green (no backend changes in this task; confirm no import breakage)
./venv/bin/python -m pytest -q

# 2. Backend lint
ruff check .

# 3. Frontend lint
npm -C frontend run lint

# 4. Frontend tests — run targeted first, then full suite
npm -C frontend run test -- --run --maxWorkers=1 \
  frontend/tests/unit/components/ui/StatusOrb.test.tsx \
  frontend/tests/unit/components/progress/PredictiveProgressBar.test.tsx
# Then full:
npm -C frontend run test -- --run --maxWorkers=1

# 5. Build
npm -C frontend run build
```

**TDD note:** step 0 requires the new StatusOrb + terminus-icon tests to be written and confirmed RED before any implementation. After implementation, confirm GREEN. Per `docs/specs/testing-standards.md` R1.

## Dependencies

- **P1 (task 001) must be complete** before this task runs. This task consumes:
  - `--progress-preparing-fill` (solid `#64748b` / `#94a3b8`) in `tokens.css`
  - `--live-indicator` (full-opacity `#1e4fd8` / `#6b9fff`) in `tokens.css`
  - `--pulse-duration: 3s` in `tokens.css`, zeroed by the reduced-motion guard in `base.css`
  - `--status-cached-ring` and `--status-cached-text` amber tokens in `tokens.css`
- P2 (forms/Switch) is independent — may run in parallel.

## Out of scope

- Do not change `PredictiveProgressBarProps`, lane/migration logic, ETA math, `progressMemory`, or any invariant in `progress-presentation.md`.
- Do not change `StatusOrb` props or the arc/partial-progress SVG geometry.
- Do not add the `orb-done-pop` micro-animation (in the proposal HTML) unless the owner explicitly approves it — it is optional.
- Do not move `StatusOrb` rendering to CSS classes (that is a P5 / `plans/simplification/` concern).
- Do not touch any page that *uses* `StatusOrb` or `PredictiveProgressBar` — the token changes from P1 re-skin callers automatically.
