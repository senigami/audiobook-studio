# Audiobook Studio — Rendered Style Guide

Open these `.html` files **directly in a browser** (no build, no server — `file://` is fine) for a visual reference of the design system. They're committed so anyone working on the code can pull up the guide without running the app.

| File | What it is |
|------|------------|
| [`current.html`](current.html) | The **current, as-built** visual catalog — every element (color, type, surfaces, buttons, forms, navigation, alerts, progress, status, lists, tables, badges, player…) rendered with the **real shipped CSS** (inlined verbatim from `frontend/src/theme/`). Includes a light/dark toggle and the computed WCAG AA contrast table. |
| [`proposed-quiet-studio.html`](proposed-quiet-studio.html) | A **proposed redesign** direction — *"Quiet Studio — Precision Pressroom"* — for evaluation/comparison against `current.html`. **Not built.** A design proposal only, with before→after notes. |

## Source of truth (read this)

The **canonical** design system is the written spec: [`../specs/design-system.md`](../specs/design-system.md) (plus [`../specs/voice-tone.md`](../specs/voice-tone.md) for UI copy). These HTML files are **rendered snapshots for visual reference** — if one ever disagrees with the spec or the live app, **the spec and the code win**; the snapshot is stale and should be regenerated.

The **drift-free live view** is the in-app **`/#/styleguide`** page, which renders the real components directly. These committed HTML files exist for the case where you want the guide *without* running the app.

## Provenance & regenerating

- `current.html` reproduces `frontend/src/theme/tokens.css` + `components.css` verbatim as a **snapshot dated 2026-06-20**. Because it copies CSS rather than importing it, it can drift as the theme changes — regenerate it (or prefer the in-app page) after material design-system changes, and update the date here.
- `proposed-quiet-studio.html` is a forward-looking proposal produced from a multi-lens design review (Apple HIG + design-critique + WCAG a11y + modern-web + personas). Its color values are WCAG-AA-verified, but its typefaces (Geist / Space Grotesk / Source Serif 4) render in fallback inside the static file because the sandbox blocks external font CDNs — see the note on that page.
