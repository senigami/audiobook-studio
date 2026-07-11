# Book Tab — Front Door

**Status: COMPLETE — 2026-07-09.** All 8 tasks accepted, green gate passed (build/typecheck/lint/pytest/ruff), one adversarial review round found zero blockers, and live dev-preview verification confirmed the North Star hero layout, the Continue Listening play flow (network-proven), the Publish identity strip, and clean mobile reflow. See `status.json` for the full run log. One minor item stayed open (a live-browser click check on the description editor hit a preview-tool quirk, not an app bug — the save mechanism is proven by its passing unit + backend tests) — flagged in `tasks/007-description-card-wiring.md`, not silently closed. Archived to `design-docs/plans/_archive/book_tab_front_door/`.

Implements the Big Bets from the [Book tab design critique](../../../../docs/design-critique/02-improvement-plan.md) (`docs/design-critique/00-summary.md`, `01-findings.md`, `02-improvement-plan.md`). Phase 1 of that critique (default-tab fix, contrast fix, stepper target-size fix, copy cleanup) is **already implemented, tested, and verified live** — not part of this plan.

This plan turns the remaining findings into the actual "front door" the owner asked for:

- **DC-003** — a real "Continue Listening" affordance on the Book tab, wired into the existing global player bus (not a new player).
- **DC-005** — a real `description` field on `Project`, backend schema through frontend wiring.
- **DC-006** — Publish's sidebar drops the full editable `BookInfoCard` for a slim, non-editable identity strip; Book tab becomes the only place identity fields are edited.
- The **North Star hero layout** (promote the CTA, fill the dead whitespace with the description, demote the metadata pills) is folded into the tasks that build the CTA and the description field, not treated as separate work.

## How to read this folder

| File | Purpose |
|------|---------|
| `00-overview.md` | The task, scope boundary, and success criteria. |
| `01-map.md` | The implementation map: parts, connections, contracts, invariants, risks. Read this before opening any task file. |
| `02-roadmap.md` | Ordered workloads, dependency graph, and the recommendation record for DC-003's mechanism. |
| `tasks/NNN-*.md` | One self-contained, map-linked task per unit of work. Each stands alone — file paths, exact contracts, verification commands, expected diff shape. |

## Status protocol

Each task file starts with a `Status: pending | in-progress | complete — <date>` line and its steps/acceptance criteria are `- [ ]` checkboxes. **Whoever executes a task updates its status line and ticks its checkboxes in the same change as the work** — a checklist that doesn't match reality poisons every later session that reads it.

## Archive convention

When every task in this folder is `complete`, move the whole folder to `design-docs/plans/_archive/book_tab_front_door/` and update the entry in `design-docs/plans/TASKS.md` accordingly. Active means live work; the archive means done.

## Definition of done for the queue-entry rule

This repo maintains a persistent code map (`docs/code-map/map.json`) with a changelog queue (`docs/code-map/queue/`). Every task below that changes mapped code (anything under `app/`, `frontend/src/`) must append a queue entry describing the change **before the task is marked complete** — this is part of each task's acceptance criteria, not a separate step.
