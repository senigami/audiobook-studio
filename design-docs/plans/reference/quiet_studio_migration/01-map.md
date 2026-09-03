# Implementation Map — Quiet Studio Migration

The connective tissue an executor must hold in mind. Tasks link back here by tag (e.g. `INV-1`, `PART-tokens`).

## Big picture

The entire redesign is a **re-skin of one central contract** — `frontend/src/theme/tokens.css` — plus targeted component changes. Because almost everything consumes `var(--token)`, changing token **values** re-skins the real app *and* the demo simultaneously. The danger is not difficulty; it's the **central contract**: break a token name and ~94 files break at once. The strategy is therefore **alias-first** — change values, keep names, add new role-named names alongside — so the app never breaks and the risky mechanical rename is deferred and optional.

```
                         ┌─────────────────────────┐
                         │  tokens.css  (PART-tokens) │  ← the central contract
                         │  values change; names kept │
                         └────────────┬────────────┘
            consumed by var(--token)  │  (mirrored, lockstep)
   ┌──────────────┬──────────────┬────┴───────┬──────────────┬───────────────┐
   ▼              ▼              ▼            ▼              ▼               ▼
 base.css     components.css   ~70 real    demo (siteMockup  StatusOrb /    design-system.md
(PART-base)  (PART-comp)       app files   + StyleguidePage) PredictiveProg  (PART-spec)
 motion/      flat buttons,    (auto-      (PART-demo,       (PART-status)   §2/§2.4/§4/§6/§8/§10
 focus        banners, inputs  reskin via  auto-reskin)      icon insets
              (class-driven)   tokens)
   ▲                                                         ▲
   └── fonts (PART-fonts): @fontsource imports in main.tsx ──┘  new Switch (PART-switch)
```

## The parts

| Tag | Part | Files | Responsibility in this migration |
|-----|------|-------|----------------------------------|
| `PART-fonts` | Typeface delivery | `frontend/src/main.tsx`, `frontend/package.json`, `frontend/src/fontsource.d.ts`, `theme/base.css`, new `--font-*` tokens | Self-host Geist / Space Grotesk / Source Serif 4 / Geist Mono; repoint the stacks. **Open question: confirm `@fontsource(-variable)/geist` + `geist-mono` resolve; else vendor woff2.** |
| `PART-tokens` | Token registry | `frontend/src/theme/tokens.css` | The hub. New color values (alias `--accent`→`#1e4fd8`), role-named tokens, studio-dark, 3-stop dark text ladder, `--surface-reading`, `--status-cached-*`, tightened radii, double-ring `--focus-ring`, solid `--progress-preparing-fill`. |
| `PART-base` | Global base | `frontend/src/theme/base.css` | reduced-motion-guard as the **first** rule; replace `transition: all` with an explicit property list; wire `:focus-visible` to the double-ring token; body/heading font stacks. |
| `PART-comp` | Component CSS | `frontend/src/theme/components.css`, `utilities.css` | Flat `.btn-primary` (drop gradient/glow/lift → flat + inset border), `~3%` banner tints, 44px `min-height` on controls, calm-pulse keyframe, barber-pole/preparing fixes. **Buttons are class-driven (138 uses, no inline gradients) → CSS-only, no ripple.** |
| `PART-status` | Status/progress | `components/ui/StatusOrb.tsx`, `components/progress/PredictiveProgressBar/` | Add lucide icon-insets per state (color-never-alone); calm-pulse on running; terminus icon on the bar; consume the new progress tokens. |
| `PART-switch` | Selection controls | NEW `components/ui/Switch.tsx`; `forms/GlassInput.tsx` + the 4 inline-styled primitives | Build a real `role="switch"`; confirm/size accent-color checkboxes (18px, 44px region); drop pill radii (100/99/999px → `--radius-button`); extract `GlassInput` (and where clean) to a token class. |
| `PART-glass` | Material audit | `app/App.tsx`, `app/layout/*` (top bar/rail), `components/ui/ActionMenu.tsx`, `theme/components.css`/`utilities.css` (~10 files) | Apply "pinned = solid + hairline, floating = glass"; tighten `--blur-glass-strong` 40→28px. |
| `PART-demo` | Demo | `frontend/src/demo/siteMockup/*` (20 files use `--accent`), `demo/styleguide/StyleguidePage.tsx` | **Mostly auto-re-skins via tokens.** Only demo-specific glass/blur + any hardcoded demo tints need touch-up. |
| `PART-spec` | Canonical spec | `design-docs/specs/design-system.md` (+ `voice-tone.md` iff copy) | Mirror every change in lockstep: §2/§2.4 (tokens + recomputed contrast vs new `--bg`), §4 (typeface), §6 (Switch, StatusOrb, progress, GlassInput), §8 (focus, reduced-motion), §10 (brand). |
| `PART-baseline` | Rendered baseline | `docs/style-guide/current.html`, `README.md` | **Frozen until the end.** Regenerate as the new "after" once the re-skin ships. |

## The connections (what breaks what)

1. **`PART-tokens` → everything.** Token *names* are the contract. Renaming a name breaks all consumers; changing a *value* silently re-skins all consumers. → **alias `--accent`; never delete a name a consumer still uses.**
2. **`PART-tokens` ↔ `PART-spec`.** The spec's §2 registry, §2.4 contrast table, §4 type scale **must** match `tokens.css` after each phase. Drift here is a spec violation. Lockstep.
3. **`PART-fonts` → `PART-tokens`/`PART-base`.** The `--font-*` tokens and base stacks must not point at Geist until the import **resolves** — keep Inter as the committed fallback in the stack until confirmed, so the app never silently falls to system-ui.
4. **`PART-comp` flat buttons** depend only on `PART-tokens` values + the `button{}` base — **no consumer ripple** (classes, not inline styles). Safe, high-leverage.
5. **`PART-status` icon-insets** depend on `lucide-react` (already the icon system) and the new progress/status token values from `PART-tokens` (Phase 1) — so status work comes **after** the token re-skin.
6. **`PART-switch`** introduces a NEW contract (`Switch` props) — downstream callers that currently use a toggle-button may adopt it later; building the primitive doesn't force callers to migrate.
7. **`PART-demo` inherits `PART-tokens`.** It re-skins for free; do not duplicate token values into demo CSS.

## Invariants (must hold across the whole task)

- **INV-1 — App always builds & renders at every phase boundary.** Alias-first; no token-name deletions; each phase ends green on all five verification commands.
- **INV-2 — AA in both themes.** Every text/UI pairing ≥ 4.5:1 (text) / 3:1 (large/UI), verified — `rgba` tints composited against the **new** `--bg #f5f7fb`/`#0d0f14` before measuring. (Proposal values pre-verified; re-verify composited tints.)
- **INV-3 — Spec lockstep.** `design-system.md` updated in the same phase/commit as the code it describes; spec_version + changelog row each phase.
- **INV-4 — Color never the sole signal.** Status/state carried by icon + shape + text, not hue alone (StatusOrb + progress bar icon insets).
- **INV-5 — Reduced-motion respected.** The guard is the first `base.css` rule; state-communicating motion (calm-pulse) survives via a `--pulse-duration` token + `.is-running` override, not developer memory.
- **INV-6 — 44px interactive targets** (visible content may be smaller, but the tap region is ≥44px).
- **INV-7 — Frozen baseline.** `docs/style-guide/current.html` is untouched until the final regenerate phase.
- **INV-8 — Commit isolation.** Commits scoped to this work; coordinate with the concurrent `design-docs/plans/` consolidation agent (different paths → no overlap, but rebase-aware).

## Risks & open questions

- **R1 (open) — `@fontsource` for Geist.** Confirm `@fontsource-variable/geist` and `@fontsource/geist-mono` exist/resolve at the pinned registry; if not, vendor woff2 under `theme/fonts/`. Blocks `PART-fonts` only. Resolve in Phase 0, task 000.
- **R2 — Contrast recompute.** The §2.4 table was computed against the *old* `--bg`; tints must be recomposited against the new warmed/near-black bg. Mitigation: re-run the contrast script (`scratchpad/contrast.py` pattern) in Phase 1.
- **R3 — Eager rename temptation.** Doing the 94-file `--accent` rename mid-migration would balloon ripple and conflict with the concurrent agent. Mitigation: alias-first; the rename is its own late, optional phase.
- **R4 — Demo drift.** Demo files that hardcode tints (not tokens) won't re-skin. Mitigation: the Phase 1 verify step greps the demo for hardcoded accent hex and the demo polish phase mops up.
- **R5 — StatusOrb/progress are tested + load-bearing.** Icon-inset changes must not alter the progress contract (`progress-presentation.md`). Mitigation: TDD, keep architecture verbatim (only add icon layer + tune fills), cross-ref the progress spec.
- **R6 — Switch reduced-motion.** The knob must SNAP to final position under reduced-motion (not freeze mid-translate). Mitigation: explicit test asserting end-state, not duration.
