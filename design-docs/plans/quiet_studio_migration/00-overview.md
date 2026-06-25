# Quiet Studio Migration — Overview

> Adopt the approved **"Quiet Studio — Precision Pressroom"** visual language into the real app **and** the demo, as a token-layer re-skin of the existing CSS-variable system (no framework, no Tailwind), with `design-docs/specs/design-system.md` updated in lockstep.

## The task

The redesign direction is already decided, fused (Apple HIG + design-critique + WCAG a11y + modern-web + persona panel), and WCAG-AA-verified. The rendered proposal lives at `docs/style-guide/proposed-quiet-studio.html`. This plan is the **implementation** of that direction — it does not re-open the design.

What changes, in one screen:
- **Type:** self-host **Geist** (UI/body, tabular figures) + **Space Grotesk** (display/eyebrow/nav — promote from wordmark-only) + **Source Serif 4** (reading column only) + **Geist Mono** (logs), via `@fontsource`.
- **Color:** rationed accent `#1e4fd8` (light) / `#6b9fff` (dark), studio near-black dark (`--bg #0d0f14`), 3-stop dark text ladder, ink-blue light text, AA-clean state colors, `--status-cached-*` amber, `~3%` banner tint.
- **Material:** glass only on *floating* layers; pinned chrome becomes solid + hairline; blur 40→28px.
- **Components:** flat buttons + inset border (no gradient/glow/lift), a real `Switch`, accent-color checkboxes, status icon-insets on `StatusOrb` + `PredictiveProgressBar`, double-ring focus, reduced-motion-guard-first, 44px controls, tightened radii (card 10 / button 8 / compact 6).
- **Theme default:** system-follows (already the model in `utils/theme.ts`).

## Success criteria (definition of done)

1. The real app **and** the demo render in the Quiet Studio language in **both** light and studio-dark.
2. `design-docs/specs/design-system.md` updated in lockstep (spec_version bumped, changelog rows, §2.4 contrast table recomputed against the new `--bg`); `voice-tone.md` updated only if copy changes (it shouldn't).
3. All verification green: `./venv/bin/python -m pytest -q`, `ruff check .`, `npm -C frontend run lint`, `npm -C frontend run test -- --run`, `npm -C frontend run build`.
4. New/changed components (Switch, status icon-insets) follow TDD (`.agent/rules/verification.md`, `design-docs/specs/testing-standards.md`): failing test first, confirmed red, then implement.
5. `docs/style-guide/current.html` is regenerated as the **new** baseline only **after** the re-skin ships (it stays frozen as the "before" until then).
6. Every WCAG-AA pairing verified in both themes (the proposal's values are pre-verified; re-verify any tint composited against the new `--bg`).

## Scope boundaries

**In scope:** `frontend/src/theme/*` (tokens/base/components/utilities), font self-hosting (`main.tsx`, `package.json`), `StatusOrb`, `PredictiveProgressBar`, a new `Switch`, form-control accent/sizing, the glass-rule audit (~10 files), the spec, the demo, the regenerated baseline.

**Out of scope (note, don't fold in):** the full mechanical `--accent`→`--action-primary` rename across 94 files (deferred to a late optional cleanup phase — alias keeps the app working without it); the broader `design-docs/plans/simplification/` refactor (this plan only touches the inline-styled primitives where the re-skin already requires it); any backend change; any new feature.

## Hard constraints (binding)

- **Spec lockstep:** behavior/visual changes update `design-system.md` in the **same commit/phase**. Specs are canonical (CLAUDE.md).
- **No app breakage:** `tokens.css` is consumed by ~94 real-app files + the demo. Change **values**, keep **names** (alias `--accent`); add new role-named tokens alongside. The app must build and render at every phase boundary.
- **No Tailwind** (owner decision — finish the token system).
- **Commit isolation:** a concurrent agent is consolidating `design-docs/plans/`. Keep commits scoped to this work; this plan folder is its own isolated path.
- **Frozen reference:** do not touch `docs/style-guide/current.html` until the final phase regenerates it.

See `01-map.md` for the parts/connections/invariants, `02-roadmap.md` for the phased order, and `tasks/` for the executable units.
