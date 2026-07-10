# Frontend Testability Sweep — stable selectors for agents and Playwright

Establishes a documented selector convention and applies it across the pages with the worst coverage, so both Claude-driven browser tooling and Playwright e2e tests can reliably find and disambiguate interactive elements without grepping source or guessing.

**Status: saved for later — not yet dispatched.** Written 2026-07-10 per the owner's request ("do a flow plan and save it for later"), triggered by a live session where the orchestrator had to read source code to find a button, then accidentally triggered a real backend job (`POST /api/speaker-profiles/{name}/build`) because the clicked button's accessible name ("Build voice") didn't disambiguate its actual effect from a card whose CTA was ambiguous between "build" and "navigate" intents.

## Why this plan exists

Research (2026-07-10) found:
- Only 19 of 183 `.tsx` files have any `data-testid`. `pages/Voices/`, `pages/VoiceLab/`, and `pages/ProjectLibrary/` have **zero**.
- `aria-label` is broad (102 files) but frequently **generic and non-unique across repeated items** — the shared `ActionMenu.tsx` overflow-menu trigger is hardcoded to `aria-label="More actions"` with no entity name/id interpolated, so every card/row's "⋯" button on a page with N items has the identical accessible name. Same pattern in `VoiceCatalogCard.tsx` ("Play preview"), `QueueItem.tsx`/`ReorderableQueueItem.tsx` (static per-item labels).
- `frontend/src/pages/Book/components/ChapterTable.tsx` already does this right — `data-testid={`chapter-table-row-${chapter.id}`}`, `data-testid={`chapter-table-play-btn-${chapter.id}`}` — this is the pattern to extend, not invent from scratch.
- The 3 existing Playwright specs (`frontend/tests/e2e/`) use inconsistent selector strategies (one `data-testid`-driven, one `getByRole`/`getByText`-driven, one a whole-page axe scan) — no shared convention.
- No existing rule anywhere (`CLAUDE.md`, `.agent/rules/`, `design-docs/specs/testing-standards.md`) states a selector-naming policy. This plan establishes one, not just applies an existing one.

## The convention this plan establishes (see `01-map.md` for full detail)

1. **Prefer accessible names first** (`aria-label`/visible text) — this is Playwright's own recommended primary selector strategy and doubles as an a11y improvement. Don't reach for `data-testid` as the default.
2. **`data-testid` is for what accessible names can't solve**: (a) repeated container elements (cards, rows, list items) where multiple instances would otherwise be visually/textually identical — testid the *container*, keyed by the entity's real id (`data-testid={`voice-card-${speaker.id}`}`); (b) icon-only controls with no other reasonable label.
3. **Shared components that render per-entity actions must accept an optional entity-identifying prop** to interpolate into their own `aria-label`/`data-testid` — `ActionMenu.tsx` is the highest-leverage fix since it's reused across at least three pages.

## Scope

**In scope:** `ActionMenu.tsx` (shared, fixes N call sites at once), `pages/Voices/` (the page that caused the live incident), `pages/VoiceLab/`, `pages/ProjectLibrary/`, the Queue components (`QueueItem.tsx`, `ReorderableQueueItem.tsx`, `GlobalQueue.tsx`), and documenting the convention in `.agent/rules/frontend-interactions.md`.

**Out of scope:** `pages/Book/` and `pages/ChapterEditor/` (already reasonably covered — `ChapterTable.tsx` is the exemplar, `DirectorsConsole/` tools already have `data-testid`); rewriting the 3 existing Playwright specs to a unified convention (flagged as a natural follow-on in Task 006, not required for this plan's success criteria); a full line-by-line audit of all 183 `.tsx` files (this plan targets the measured gaps, not every file).

## How to read this folder

| File | Purpose |
|---|---|
| `00-overview.md` | Task, scope, success criteria |
| `01-map.md` | The convention itself, parts, connections, invariants |
| `02-roadmap.md` | Ordered tasks, dependency graph |
| `tasks/NNN-*.md` | Self-contained task files |

## Status protocol

Whoever executes a task updates its `Status:` line and ticks its checkboxes in the same change as the work. When all tasks are complete, move this folder to `design-docs/plans/_archive/frontend_testability_sweep/` and update `design-docs/plans/TASKS.md`.

## To pick this up later

Run `/plan-run` pointed at this folder (or hand it to a fresh session with this README + `01-map.md` open). Task 001 (the `ActionMenu.tsx` fix) has no dependencies and is the natural starting point — it's the single highest-leverage change since it's shared across every page in scope.
