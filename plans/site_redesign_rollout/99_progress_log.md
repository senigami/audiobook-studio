# Progress Log

*One line per task: `<date> <task-id> <done|reverted|skipped+why> <commit-sha>`. Executing
agents append here after every task (contract rule R-I). Phase-boundary review confirmations
also go here.*

## Task log

2026-06-13 R1 phase-boundary review (orchestrator): tests 1097 pass, lint 0 errors,
build NOW passes (demo-mock TS errors fixed outside rollout scope — see below). R1 APPROVED.
Note: /settings/engines + /settings/api still render as Settings tabs (not yet redirects to
/engines + /integrations); both old and new routes work so no capability lost — redirect
consolidation is R5-T13 scope. Confirm in browser or defer.

2026-06-12 R1-T1 done build-skipped-existing-demo-type-errors HEAD
2026-06-12 R1-T2 done build-skipped-existing-demo-type-errors HEAD
2026-06-12 R1-T3 done HEAD
2026-06-12 R1-T4 done build-skipped-existing-demo-type-errors HEAD
2026-06-12 R1-T5 done HEAD
2026-06-12 R1-T6 done HEAD
2026-06-12 R1-T7 done HEAD
2026-06-12 R1-T8 done build-skipped-existing-demo-type-errors HEAD
2026-06-12 R1-T9 done build-skipped-existing-demo-type-errors HEAD
2026-06-12 R1-T10 done build-skipped-existing-demo-type-errors HEAD
2026-06-12 R1-T11 done build-skipped-existing-demo-type-errors HEAD
2026-06-12 R1-T12 done build-skipped-existing-demo-type-errors HEAD
2026-06-13 R2-T1 done HEAD
2026-06-13 R2-T2 done HEAD
2026-06-13 R2-T3 done HEAD
2026-06-13 R2-T4 done HEAD
2026-06-13 R2-T5 done HEAD
2026-06-13 R2-T6 done HEAD
2026-06-13 R2-T7 done HEAD
2026-06-13 R2-T8 done HEAD
2026-06-13 R2-T9 done HEAD
2026-06-13 R2-T10 done HEAD
2026-06-13 R2-T11 done HEAD
2026-06-13 app-shell-base-layer done HEAD

2026-06-13 R2 phase-boundary review (orchestrator): tests 1137 pass (+40, none deleted),
build pass, lint clean. Book routes + legacy redirects + Book page tree + chapterLifecycle
+ CastingStage(narrator default) + PublishStage all present; old ProjectView tests retained
(ProjectDetail kept as redirect boundary per R-G, retired at R6). R2 APPROVED — R3 cleared to
start (independent file area). Owner to spot-confirm 3 persistence items (see acceptance
checklist unchecked): Casting narrator->project-default binding, Publish book-info/assembly/
backup persistence + downloads, dark-mode pass on new surfaces. If broken: log under Found bugs.
Also: rail footer viewport-pin bug fixed this session (commit 5d4561e9) — shell was not
viewport-locked; lesson for shell work recorded.

## Found bugs (do not fix mid-phase — triaged at R6)

(none logged yet)

## Open questions for the owner

- 2026-06-12: `npm -C frontend run build` failed in untouched `frontend/src/demo/stages/siteMockup/*` files. RESOLVED 2026-06-13 by orchestrator (commit below): these were leftover TS errors from the v3.7 mock module split (unused imports, type-only imports, a Row onClick prop) — fixed in demo-only files, outside rollout scope. Build gate is now usable for R2-R6.
