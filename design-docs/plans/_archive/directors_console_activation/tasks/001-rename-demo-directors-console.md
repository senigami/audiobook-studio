# Task 001 — Rename the demo's colliding `DirectorsConsole` export

Status: complete — 2026-07-09

## Goal

Resolve a naming collision flagged by a prior frontier review (`design-docs/plans/TASKS.md:521`) and never fixed: `frontend/src/demo/stages/siteMockup/panes/directorsConsole.tsx` exports a component named `DirectorsConsole`, which is a completely separate, self-contained demo/mockup component (part of the North Star demo, unrelated to real chapter editing). The real app is about to grow its own, different `DirectorsConsole` at `frontend/src/pages/ChapterEditor/components/DirectorsConsole/index.tsx` (mounted for real in Task 002 of this plan). No code currently imports both in the same file (confirmed by grep), so there is no live bug today — but leaving two same-named exported components in one repo is a standing confusion risk once both are "real."

## Exact files

- `frontend/src/demo/stages/siteMockup/panes/directorsConsole.tsx:721` — `export const DirectorsConsole: React.FC = () => { ... }`. Rename to `export const DirectorsConsolePane`.
- `frontend/src/demo/stages/siteMockupStage.tsx:66` — `import { DirectorsConsole } from './siteMockup/panes/directorsConsole';` → update to `import { DirectorsConsolePane } from './siteMockup/panes/directorsConsole';`
- `frontend/src/demo/stages/siteMockupStage.tsx:1038` — `<DirectorsConsole />` → `<DirectorsConsolePane />`

## Steps

- [x] Rename the export at `directorsConsole.tsx:721` (and its function body reference, if the component references its own name anywhere, e.g. `displayName`).
- [x] Update the import and JSX usage in `siteMockupStage.tsx`.
- [x] Grep the whole `frontend/src/` tree for any other reference to this specific demo export (`grep -rn "DirectorsConsolePane\|from './siteMockup/panes/directorsConsole'" frontend/src/`) — confirm no other file imports it under the old name.
- [x] Do NOT rename the file `directorsConsole.tsx` itself (only the exported symbol) — keep the diff minimal.
- [x] Run `npx tsc -b --force` from `frontend/` — confirm clean.
- [x] Run any existing demo tests that reference this component by name (`grep -rln "DirectorsConsole" frontend/tests/unit/demo/`) and confirm they still pass (update any that assert the old export name). — no matches found; no test regressions.

## Acceptance criteria

- [x] `grep -rn "^export const DirectorsConsole\b" frontend/src/` returns exactly one match (the real one at `frontend/src/pages/ChapterEditor/components/DirectorsConsole/index.tsx`).
- [x] `npx tsc -b --force` clean.
- [x] No test regressions in `frontend/tests/unit/demo/`.
- [x] Append a `docs/code-map/queue/` entry.

## Dependencies

None — independent of everything else in this plan. Safe to run first or in parallel with Task 002.

## Map links

- Part: "Demo `DirectorsConsole` (rename only)" — `01-map.md`, "The parts"
- Risk: `none` (pure rename, zero behavior change)

## Out of scope

- Any change to the demo's actual UI/behavior.
- The real `frontend/src/pages/ChapterEditor/components/DirectorsConsole/` — not touched by this task.
