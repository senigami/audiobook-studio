# Demo North Star — Book Pane

**Status: COMPLETE — 2026-07-10.** All 3 tasks accepted, green (build/typecheck/lint), live browser-verified: Book is the first, default-landing tab; the hero renders correctly; Contents still works; the Continue Listening button correctly drives the demo's global player bar with zero console errors. One real name collision was caught and properly fixed (not just worked around) along the way — see `status.json`'s review round. Archived here.

Adds a real "Book" tab to the North Star demo mockup (`frontend/src/demo/stages/siteMockup/`), bringing the front-door redesign that just shipped in the real app (`design-docs/plans/_archive/book_tab_front_door/`, `docs/design-critique/`) into the North Star's vision of where the product is headed. The demo currently has no distinct Book tab at all — its `ContentsPane` still shows the pre-redesign IA (a slim inline header card merged directly above the chapter board).

**This is additive, not a sync-to-parity pass.** The North Star demo is the aspirational direction, not a mirror of current production state — it is allowed to be ahead of, or different from, the shipped real app. Nothing existing in the demo is being removed or downgraded to match reality; this plan only adds the new Book tab alongside everything already there. `ContentsPane`, `ManuscriptPane`, `CastingPane`, and `BackupsPane` are untouched.

## Scope

Demo-only. Touches `frontend/src/demo/stages/siteMockup/shared.tsx`, `siteMockupStage.tsx`, and `panes/book.tsx`. **Does not touch `frontend/src/pages/Book/`** (the real app) at all.

## How to read this folder

| File | Purpose |
|------|---------|
| `00-overview.md` | Task, scope, success criteria. |
| `01-map.md` | Parts, connections, the ground-truth pattern being ported, invariants. |
| `02-roadmap.md` | 3 tasks, dependency order. |
| `tasks/NNN-*.md` | Self-contained task files. |

## Status protocol

Each task file starts with a `Status:` line and `- [ ]` checkboxes. Whoever executes a task ticks its own checkboxes and updates its status line in the same change.

## Archive convention

When all 3 tasks are complete, move this folder to `design-docs/plans/_archive/demo_north_star_book_pane/` and update `design-docs/plans/TASKS.md`.
