# Phase 11 Remaining Work

This is the active task board for Phase 11. Use it when triaging app problems, writing Antigravity prompts, or deciding the next cleanup slice.

## Intake Rules

- Map each reported app problem to one task area below before implementing.
- If a problem is user-facing, fix behavior first and use cleanup work only where it directly supports the fix.
- Keep changes narrow. Do not turn a bug report into a broad rewrite.
- Update this task board when a task is completed, deferred, or split.

## Current Task Areas

| Area | Status | Goal | Likely files | Verification |
| --- | --- | --- | --- | --- |
| Final reference audit | Open | Re-run focused searches for remaining main-app engine names, V1 terms, fallback paths, and old routes. | `app/`, `frontend/`, `plugins/`, `tests/`, `plans/` | `rg` audit plus targeted tests |
| Behavior helper hardening | Open | Replace remaining hardcoded behavior decisions with plugin manifest or registry data. | `app/engines/behavior.py`, engine registry, API engine routes | `tests/test_engine_behavior.py`, `tests/test_api_engines.py`, bridge tests |
| Job and queue decommissioning | Open | Remove remaining legacy worker-facing shims after orchestrator ownership is stable. | `app/jobs/`, `app/db/queue.py`, `app/state_jobs.py`, queue routes | queue, generation, orchestration tests |
| Text and progress utilities | Open | Move engine-specific parsing/sanitization assumptions behind plugin-owned or generic contracts. | textops modules, progress parsing, plugin adapters | textops, progress, plugin tests |
| Storage and output routes | Open | Remove remaining engine-shaped output naming and routes while preserving project assets. | `app/config.py`, `app/api/utils.py`, asset routes, frontend API callers | API asset tests, frontend API tests |
| State/settings/metrics migration | Open | Convert or remove legacy settings and metrics keys through explicit migration paths. | state modules, migration modules, performance metrics | state, settings, performance tests |
| Frontend engine-agnostic cleanup | Open | Remove frontend assumptions tied to built-in engine names where they encode behavior. | `frontend/src/api`, queue/chapter/voice components | focused Vitest suites and build |
| Bootstrap and docs cleanup | Open | Move engine-specific setup into plugin docs and keep core startup docs generic. | `README`, `docs`, `wiki`, launch scripts | startup check, docs review |

## Reported App Problems

Add user-reported problems here before or during triage.

| Problem | Area | Status | Notes |
| --- | --- | --- | --- |
| Settings engine test fails without user-created/default voice | Behavior helper hardening / State/settings/metrics migration | Fixed, manual app verification pending | `POST /api/engines/xtts/test` returned 400 until a default voice was set. Added manifest-declared engine test samples, bundled XTTS sample fixture, and permanent API/TTS Server tests proving engine tests can run without default voice state. Manual check: click XTTS Test in Settings with no default voice selected. |
| Library home `/api/projects` load is slow | Storage and output routes / Final reference audit | Fixed, manual app verification pending | User observed `GET /api/projects` taking about 24 seconds. Removed per-project V2 migration from the bulk list route and added a regression test proving list does not migrate each project while project detail still does. Manual check: open Library home and confirm load time is back to normal. |
| Chapter render enqueue fails with blank engine enablement message | Job and queue decommissioning / Behavior helper hardening | Open | UI shows `Enable  in Settings to use these voices.` and `/api/processing_queue` returns 400. Expected: render should enqueue for configured voices, and any disabled-engine error must name the engine or capability. TDD first: add API test covering queue enqueue with project voices and disabled/missing engine diagnostics. |
| Chapter view reports duplicate React key `voxtral-mini-latest` | Frontend engine-agnostic cleanup | Open | Console warning indicates duplicate keys in chapter render/voice UI. TDD first: add or update focused frontend test to assert engine/model options are de-duplicated or keyed by stable composite identity. |

## Immediate Next Step

When the user reports the next app problem:

1. Identify the task area it belongs to.
2. Inspect the smallest relevant code path.
3. Fix behavior if the bug is reproducible from code or logs.
4. Update this file if the fix completes or changes a Phase 11 task.
5. Verify with focused tests first, then broaden only if the touched boundary requires it.

## Final Phase Verification

Before Phase 11 is marked complete:

- Run the final reference audit and classify remaining references.
- Run the affected backend suites for completed cleanup areas.
- Run frontend tests/build if frontend files changed.
- Update `plans/phase_11_audit.md` with final status.
- Update memory and checkpoint the result.
