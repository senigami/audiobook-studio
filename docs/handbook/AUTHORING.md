# Handbook — Authoring &amp; Build Guide

How the Audiobook Studio 2.0 handbook is built, how to edit it, and how the demos work.
This handbook lives in `docs/` so GitHub Pages serves it.

## Architecture (content vs. design are separate)

| Piece | File(s) | Role |
| --- | --- | --- |
| **Shell** (the design) | `docs/handbook/index.html` | One page. Loads the CSS + the app and holds the nav/sidebar/article/footer placeholders. |
| **Styles** (the design) | `docs/assets/studio2.css`, `docs/assets/handbook.css` | All visual rules: layout, callouts, demo player, mock UI. |
| **Navigation** (data) | `docs/assets/nav-data.js` | One source of truth for every section/page and order. |
| **App** (behavior) | `docs/assets/handbook-app.js` | jQuery SPA: hash-routes, loads content JSON, renders it, builds sidebar/breadcrumb/prev-next/search, mounts demos. |
| **Content** (data) | `docs/handbook/content/<section>/<slug>.json` | Per-page content — **no styling**. |
| **Search index** (data) | `docs/handbook/content/search-index.json` | Generated; powers the search box. |
| **Compiler** | `docs/handbook/_build/build.py` | Authoring convenience: compiles content → JSON + search index. |

**To restyle the whole handbook, edit the CSS / shell only.** Content is never touched.

> Served over **http(s)** (GitHub Pages). Opening from `file://` blocks the AJAX content
> load and shows "Loading…".

## Editing or adding a page

Content is authored in `build.py` (helper functions, no HTML hand-writing) and compiled to
JSON. You can also hand-edit the JSON directly — it's the data the site loads.

1. Edit `docs/handbook/_build/build.py` — find the `page(...)` call, or add a new one:
   `page("<section>/<slug>", "Title", "meta description", "lede…", h2(…), p(…), …)`.
2. **New page also needs a nav entry:** add `{ slug, title }` to the right section in
   `docs/assets/nav-data.js` (this controls the sidebar + prev/next + search coverage).
3. Run the compiler: `python3 docs/handbook/_build/build.py`
   (writes the page JSON and rebuilds `search-index.json`).

Content-block helpers: `h2 h3 p ul ol glance tip note warning future soon pre table demo`,
and `L("section/slug.html", "text")` for in-handbook links (resolved to `#routes`). Body
JSON is semantic HTML with class hooks — styled entirely by CSS.

## Demos (scripted fake-cursor walkthroughs)

A demo is a small JSON script rendered by a reusable player. To put one on a page, add a
`demo("<id>")` block (compiles to `<div class="hb-demo" data-demo="<id>">`); the app mounts
the player and loads `content/demos/<id>.json`.

### Demo script format — `content/demos/<id>.json`

```json
{
  "title": "The 5-minute workflow",
  "steps": [
    {
      "screen": "Library",          // titlebar label
      "mock": "library",            // which CSS page-view to show (see list below)
      "caption": "Click <b>New Project</b>…",  // inline HTML allowed
      "cursor": [82, 21],           // [x, y] as % of the stage — where the pointer rests
      "hotspot": [66, 14, 22, 12],  // optional [x, y, w, h] % highlight box
      "frame": "../assets/shot.png" // optional: real screenshot, overrides "mock"
    }
  ]
}
```

**Tuning a demo** is pure data — edit the JSON, refresh, done (no rebuild, no code):
caption wording, `cursor`/`hotspot` positions, add/remove/reorder steps.

**Frame priority:** `frame` (real screenshot) → `mock` (CSS page-view) → labeled window.
To swap a mock for a real capture later, drop the image in `docs/assets/` and set
`"frame": "../assets/your-shot.png"` on that step — no design changes; then nudge
`cursor`/`hotspot` to match the image.

### Available CSS mock screens

Defined in `MOCKS` in `handbook-app.js`, styled by `.mk-*` in `handbook.css`:
`library`, `chapters`, `voicelab`, `voicepanel`, `editor`, `queue`, `assemblies`.

To add a new mock: add a builder to `MOCKS` (returns the screen body HTML using `.mk-*`
classes) and reference it via `"mock": "<name>"`.

> The mock screens are **illustrative** renditions of the 2.0 UI, not screenshots. Replace
> any step with a real capture via `frame` when the UI is final.

## Companion docs (in this folder)

- `STYLE.md` — the page writing standard (voice, structure, callouts).
- `OUTLINE.md` — readable table of contents + parked decisions.
- `AUDIT.md` — the wiki → handbook migration reference.
