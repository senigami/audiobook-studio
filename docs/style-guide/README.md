# Audiobook Studio — Rendered Style Guide

Open these `.html` files **directly in a browser** (no build, no server — `file://` is fine) for a visual reference of the design system. They're committed so anyone working on the code can pull up the guide without running the app.

| File | What it is |
|------|------------|
| [`current.html`](current.html) | The **current, as-built** visual catalog — snapshot dated **2026-06-21** (Quiet Studio baseline). Every element rendered with the real shipped CSS (inlined from `frontend/src/theme/`). Includes a light/dark toggle and the computed WCAG AA contrast table. |

`proposed-quiet-studio.html` has moved to `design-docs/proposed-quiet-studio.html` — it is the spec-definition artifact for the Quiet Studio design direction.

## Source of truth (read this)

The **canonical** design system is the written spec: [`design-docs/specs/design-system.md`](../../design-docs/specs/design-system.md) (plus [`design-docs/specs/voice-tone.md`](../../design-docs/specs/voice-tone.md) for UI copy). This HTML file is a **rendered snapshot for visual reference** — if it ever disagrees with the spec or the live app, **the spec and the code win**; the snapshot is stale and should be regenerated.

The **drift-free live view** is the in-app **`/#/styleguide`** page, which renders the real components directly. This committed HTML file exists for the case where you want the guide *without* running the app.

## Provenance & regenerating

- `current.html` reproduces `frontend/src/theme/tokens.css` + `components.css` verbatim as a **snapshot dated 2026-06-21** (Quiet Studio baseline — regenerated as the final P6 step after P0–P5 migration). Because it copies CSS rather than importing it, it can drift as the theme changes — regenerate it (or prefer the in-app page) after material design-system changes, and update the date here.
