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
  - navigation shell, breadcrumb, and project-subnav scaffolding

## Deliverables Checklist

- [x] New backend directories created under `app/`
- [x] New frontend directories created under `frontend/src/`
- [x] Backend stub files created with module-purpose docstrings
- [x] Backend stub files include ownership and non-ownership comments
- [x] Backend stub files note which legacy modules still provide behavior
- [x] Frontend stub files created with ownership comments and placeholder exports
- [x] Frontend stub files note which current routes/hooks/components remain canonical
- [x] Navigation shell, breadcrumb, and project-subnav scaffolding created
- [x] No runtime behavior changes introduced

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
- `frontend/src/app/layout/StudioShell.tsx`
- `frontend/src/app/navigation/model.ts`
- `frontend/src/app/navigation/breadcrumbs.ts`
- `frontend/src/app/navigation/project-subnav.ts`
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

## Verification Checklist

- [x] Import smoke checks pass
- [x] App still boots
- [x] Existing behavior remains unchanged
- [x] New structure is navigable and documented

## Rule Alignment Notes

- Phase 1 now matches the modular architecture rule set by giving the next phases explicit homes for domain, orchestration, engine, artifact, settings, and job concerns.
- Repository and service seams are present for persisted domains so later phases do not have to invent boundaries inside route handlers or worker code.
- Scheduler policy, recovery, and resource-claim modules exist as stubs so queue logic does not drift into tasks or engine wrappers.
- A compatibility facade in `app/engines/__init__.py` preserves legacy imports while the new `app/engines/` package exists, which keeps migration code explicit instead of leaking temporary shortcuts into the new architecture.
- The scaffold remains behavior-free: the new modules are descriptive boundaries only, and legacy runtime paths still own execution.

## Verification Notes

- Passed backend import smoke for the new domain, orchestration, and engine packages.
- Passed stricter dependency-tracing review for the new backend scaffold, including import-cycle checks across `core`, `infra`, `legacy`, `domain`, `orchestration`, and `engines`.
- Passed backend syntax compilation for the new Phase 1 Python scaffold.
- Passed lightweight app import smoke via `import app.web`.
- Preserved legacy `app.engines` import behavior after adding the new `app/engines/` package by routing unresolved package attributes to the legacy module during the migration window.
- Added missing structural landing zones for `core`, `infra`, `legacy`, `domain/text`, `domain/jobs`, scheduler helper modules, named task stubs, and the planned frontend app/API/shared shells so later phases do not need to invent boundaries mid-implementation.
- Removed eager package re-export imports from the new domain and orchestration packages so later phases are guided toward direct module imports and lower import-cycle risk. The `app.engines` package remains the one intentional exception because it currently carries the legacy compatibility facade.
- Added string-based dependency contracts to key backend services and frontend route/store stubs so intended callers, downstream seams, and forbidden shortcut imports are visible without introducing new import edges. This gives us a future linting target for cycle prevention while keeping the scaffold behavior-free.
- Added the remaining planned infrastructure and engine-wrapper scaffold files, including `core/config`, `core/logging`, `infra/db`, `infra/subprocess`, and the per-engine XTTS/Voxtral wrapper directories with placeholder manifests and settings schemas.
- Verified that the current scaffold now covers the planned file set for the Studio 2.0 target structure with no missing planned files.
- Added early navigation UX scaffolding so the shell, route hierarchy, breadcrumbs, and project-local navigation are defined before deeper frontend implementation begins.
- Completed an import-time side-effect audit of the legacy runtime boundaries. The main remaining legacy operational seams are `app.jobs` worker startup, `app.web` startup/shutdown lifecycle work, `app.state` listener/global state management, and middleware-based config syncing for legacy test compatibility.
- Confirmed that the new Studio 2.0 scaffold does not depend on those legacy side effects for import success. Future phases must keep those seams explicit until they are intentionally replaced.

## Exit Gate

- the architecture exists physically in the repo and is documented enough to guide later phases
