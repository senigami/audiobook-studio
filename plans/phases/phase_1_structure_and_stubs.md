# Phase 1: Structure And Stubs

## Objective

Create the 2.0 architecture skeleton without changing behavior.

## Why This Phase Exists

If we start implementing behavior before the 2.0 structure exists, new logic will leak back into legacy modules and the migration will become harder to isolate and debug.

## Deliverables

- new backend directories under `app/`
- new frontend directories under `frontend/src/`
- stub backend files with:
  - module-purpose docstrings
  - placeholder contracts and signatures
  - comments on ownership and non-ownership
  - notes on which legacy modules still provide runtime behavior
- stub frontend files with:
  - ownership comments
  - placeholder exports
  - notes on which current routes/hooks/components remain canonical for now

## Must Not Do

- no behavior cutover
- no queue replacement
- no engine replacement
- no editor migration
- no hidden opportunistic refactors

## Suggested Files

### Backend

- `app/domain/projects/models.py`
- `app/domain/projects/repository.py`
- `app/domain/projects/service.py`
- `app/domain/chapters/models.py`
- `app/domain/chapters/repository.py`
- `app/domain/chapters/service.py`
- `app/domain/chapters/batching.py`
- `app/domain/voices/models.py`
- `app/domain/voices/service.py`
- `app/domain/voices/preview.py`
- `app/domain/settings/service.py`
- `app/domain/artifacts/manifest.py`
- `app/orchestration/tasks/base.py`
- `app/orchestration/scheduler/orchestrator.py`
- `app/orchestration/progress/service.py`
- `app/engines/voice/base.py`
- `app/engines/registry.py`
- `app/engines/bridge.py`

### Frontend

- `frontend/src/app/routes/index.tsx`
- `frontend/src/features/chapter-editor/routes/ChapterEditorRoute.tsx`
- `frontend/src/features/queue/routes/QueueRoute.tsx`
- `frontend/src/features/voices/preview/VoicePreviewPanel.tsx`
- `frontend/src/store/live-jobs.ts`
- `frontend/src/store/editor-session.ts`
- `frontend/src/api/contracts/events.ts`

## Verification

- import smoke checks
- app still boots
- no observable behavior change

## Exit Gate

- the architecture exists physically in the repo and is documented enough to guide later phases
