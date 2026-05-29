# Demo & Walkthrough Assets — Direction

Captures the agreed approach for in-doc demos (for the later content pass). Not built yet.

## Goal

Where a workflow benefits from showing it "in motion," prefer **lightweight scripted
HTML/CSS/JS walkthroughs** over animated GIFs or video. Each demo:

- is **styled to match the real app** (reuses the handbook's design tokens — same fonts,
  colors, radii, shadows, frosted surfaces — so mockups read as Studio, not as docs);
- shows a **fake cursor** that moves and "clicks," with the UI reacting (panels open,
  fields fill, a queue row advances) so the reader sees the flow working;
- **does not need to be interactive** — a looping/▶-triggered scripted animation is enough;
  it just needs to look and behave like the product.

## Why not GIF / video / React

- GIFs are heavy, fixed-resolution, can't theme (light/dark), and go stale silently.
- Video is even heavier and awkward to keep in sync with UI changes.
- The app is React, but the docs are intentionally **build-free static HTML** — so demos
  are **plain HTML/CSS/JS**, not React. We reuse the *look* (CSS tokens / markup patterns),
  not the framework.

## Approach (when we build it)

- A small reusable `assets/demo.css` + `assets/demo.js` "walkthrough" component:
  - a `.demo-stage` containing a static mockup of the relevant screen (plain markup
    styled with shared tokens);
  - a `.demo-cursor` element animated along a scripted path via CSS keyframes / Web
    Animations API;
  - step captions and a replay control;
  - **honors `prefers-reduced-motion`** — falls back to a static annotated screenshot
    or step list; nothing essential is conveyed by motion alone.
- Each demo is declared as data (steps + cursor targets) so it's maintainable and can be
  regenerated, mirroring how `nav-data.js` drives the rest of the site.
- Keep them **small and per-page**; a demo illustrates one workflow (e.g. "assign a
  character," "build a voice variant," "queue a chapter").

## Candidate demos (first pass)

- Getting Started → 5-minute tour (project → chapter → voice → generate → assemble)
- User Guide → Chapter Editor: assign + generate + VCR playback
- User Guide → Voice Lab: create voice, add variant, test
- User Guide → Processing Queue: a job advancing with live progress

## Constraints

- No external runtime deps; must work opened via `file://`.
- Accessible: real text (not baked into images), reduced-motion fallback, keyboard-safe.
- Maintainable: regenerate from the app / reuse UI patterns rather than hand-pixel-pushing.
