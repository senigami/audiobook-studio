# Audiobook Studio Handbook

A static, navigable documentation site for **Audiobook Studio 2.0** — covering the
end-user app, the engine **Plugin SDK**, the external **TTS Gateway API**, the
internal **architecture**, and **operations/configuration**, plus a **What's New in 2.0**
section for release/PR messaging.

> **Status: outline scaffold.** This is the approved information architecture stood up
> as a browsable site with **stub pages** (headings + a one-line purpose + the subtopics
> each page will cover). Deep prose, screenshots, and examples are written in a later pass.

## View it

No build step, no server required.

- **Open `index.html`** directly in a browser (double-click / `file://`), **or**
- serve the folder from any static host (e.g. `python3 -m http.server` inside `handbook/`).

The left sidebar (collapsible sections), client-side search (press `/`), active-page
highlighting, and light/dark theme all work offline because the nav/search data load as
plain JS globals rather than `fetch()`ed JSON.

## What's here

| Path | Purpose |
| --- | --- |
| `OUTLINE.md` | Human-readable master table of contents (the primary deliverable). |
| `AUDIT.md` | Documentation audit: classifies every existing doc/wiki page and maps it into the handbook (#111). |
| `DEMOS.md` | Direction for in-doc demo/walkthrough assets (scripted fake-cursor walkthroughs over GIFs). |
| `STYLE.md` | Page authoring standard: the consistent per-page skeleton, page types, and writing rules. |
| `index.html` | Landing page with the section grid + shared shell. |
| `<section>/<topic>.html` | One stub page per topic, wired into the sidebar + search. |
| `assets/style.css` | Apple/HIG-inspired theme (system fonts, frosted glass, light/dark, responsive). |
| `assets/nav-data.js` | **Single source of truth** for the nav tree + search keywords. |
| `assets/nav.js` | Renders the collapsible sidebar, mobile drawer, and theme toggle. |
| `assets/search.js` | Client-side fuzzy-ish search over the nav tree. |
| `_tools/generate.py` | Authoring helper (see below). **Not required to view the site.** |

## Design language

The site follows the same Apple-inspired patterns as the main app: a system/SF font
stack with an Inter fallback, generous whitespace and type hierarchy, a frosted-glass
top bar/sidebar (`backdrop-filter`), hairline borders, soft shadows, rounded corners, a
restrained palette with the brand accent (`#2b6eff`) used sparingly, subtle motion that
honors `prefers-reduced-motion`, and automatic light/dark mode (toggleable).

## In-progress flags

Some areas are changing in **PR #118 (Phase 12: Polish & Cleanup)**. Their pages carry a
**“soon”** badge in the nav and an *In progress* banner so we don't document
surfaces that are about to change (e.g. the Chapter Editor tab consolidation, voice
icons/tags, plugin import/delete, queue output metadata, jobs→WebSocket). Items marked
**future** (e.g. in-app GitHub/Hugging Face download, `tts_engines/` rename) are described
for orientation only and are not part of the current release.

## Editing

- **Quick tweaks:** edit the relevant `.html` page directly; edit `assets/nav-data.js` to
  rename/reorder/flag nav entries.
- **Structural changes:** edit the IA in `_tools/generate.py` and re-run
  `python3 handbook/_tools/generate.py` to regenerate `nav-data.js`, `index.html`,
  `OUTLINE.md`, and all stub pages from one definition.

## Scope

This handbook documents Studio **2.0**. The legacy `wiki/` (Studio 1.x) is out of scope
here and will be reconciled separately.
