# Studio 2.0 Phase Delivery Plan

This document breaks the conversion into concrete, testable deliverable phases. It is meant to be used during implementation, not just read once.

## Phase 1: Structure And Stubs

### Objective

Create the 2.0 architecture skeleton without changing behavior.

### Why this phase matters

If we skip this and start coding features directly, we will end up rediscovering architecture boundaries under pressure and mixing old/new responsibilities together.

### Scope

- create new backend directories
- create new frontend directories
- add stub files with module docstrings
- add placeholder types, interfaces, and function signatures
- add comments inside each stub describing:
  - what the module owns
  - what the module must not own
  - which legacy code currently still provides behavior

### Suggested backend stub files

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

### Suggested frontend stub files

- `frontend/src/app/routes/index.tsx`
- `frontend/src/features/chapter-editor/routes/ChapterEditorRoute.tsx`
- `frontend/src/features/queue/routes/QueueRoute.tsx`
- `frontend/src/features/voices/preview/VoicePreviewPanel.tsx`
- `frontend/src/store/live-jobs.ts`
- `frontend/src/store/editor-session.ts`
- `frontend/src/api/contracts/events.ts`

### Tests and verification

- import smoke checks
- app still boots
- no behavior changes

### Completion criteria

- the architecture exists physically in the repo
- the stubs are documented enough to guide Phase 2+ work

## Phase 2: Domain Contracts

### Objective

Implement the domain models and persistence edges while leaving runtime execution mostly legacy.

### Scope

- entity models
- repositories
- artifact manifest writing/validation helpers
- settings ownership model
- render-batch derivation rules

### Key tests

- stale artifact tests
- batching derivation tests
- project portability tests
- settings ownership tests

### Completion criteria

- 2.0 entities are real and testable
- runtime code can start calling into them without queue cutover

## Phase 3: Voice Bridge

### Objective

Move engine logic behind the new contract while preserving current output behavior.

### Scope

- engine base contract
- XTTS wrapper
- Voxtral wrapper
- registry and bridge
- preview/test contract

### Key tests

- mock engine tests
- preflight validation tests
- wrapper contract tests

### Completion criteria

- new engine boundary exists and can be used by later phases

## Phase 4: Progress And Reconciliation

### Objective

Make progress and reuse decisions trustworthy before queue replacement.

### Scope

- reconciliation logic
- ETA logic
- event contract
- frontend visual stability rules

### Key tests

- monotonic progress tests
- stale-output reset tests
- grouped render progress aggregation tests

### Completion criteria

- progress math and reuse logic no longer depend on legacy worker internals

## Phase 5: Orchestrator

### Objective

Build the new queue beside the old one and validate it in isolation.

### Scope

- task hierarchy
- scheduler policies
- resource claims
- recovery
- special task classes

### Key tests

- scheduler fairness
- recovery
- cancel/retry
- bake/mixed/sample/export-repair behavior

### Completion criteria

- representative backend flows run under the 2.0 queue behind a flag

## Phase 6: Frontend Foundation Cutover

### Objective

Adopt the 2.0 live-state and hydration model before the full editor migration.

### Scope

- live overlay store
- reconnect hydration
- queue/header progress wiring
- compatibility-aware hydration that can tolerate both legacy-backed and
  2.0-backed queue sources during the migration window
- the first header consumer in this phase is the existing global queue
  badge/count path; a full Studio 2.0 shell migration is not a prerequisite for
  the first cutover slice

### Handoff assumptions from Phase 5

- the backend orchestrator, progress, recovery, TTS Server, and task
  foundations are in place behind feature flags
- the main visible queue route is not yet fully cut over, so reload/reconnect
  behavior may still reflect legacy hydration heuristics until this phase lands
- Phase 6 is therefore the start of the visible queue/header cutover, not a
  polish pass on an already-switched frontend

### Key tests

- reconnect tests
- queue consistency tests
- anti-regression merge tests
- shared queue/header source-of-truth tests

### Completion criteria

- 2.0 events can drive visible app behavior safely

## Phase 7: Editor And Voice UX

### Objective

Move the core production workflows onto the 2.0 foundation.

### Scope

- block-aware editor behavior
- render-batch execution requests
- inline failure recovery
- voice module and preview UI

### Key tests

- targeted rerender
- stale-state handling
- autosave merge behavior

### Completion criteria

- the main user workflow runs on 2.0 architecture

## Phase 8: Shell Cutover And Product Hardening

### Objective

Finish the visible Studio 2.0 shell and the highest-value product seams before opening the system outward.

### Scope

- queue companion drawer cutover
- queue route and shell semantics that preserve current page context
- project snapshot and export-manifest foundation
- first project backup/export bundle mode
- plugin setup and recovery diagnostics hardening
- explicit retirement of fake or stale legacy paths after replacements are proven

### Key tests

- shell/navigation queue drawer tests
- compatibility tests for `/queue` deep links
- queue component tests under constrained drawer layout
- project snapshot/export tests
- regression and export validation

### Completion criteria

- the queue is a stable companion surface and Studio has the portability and product-hardening foundations needed before external ecosystem work

## Phase 9: Plugin Ecosystem And External TTS API

### Objective

Open the stabilized Studio 2.0 architecture outward to contributors and external clients.

### Scope

- pip entry-point discovery
- guided plugin dependency/install flow
- plugin security boundary docs
- external API authentication and rate limiting
- local-only vs LAN access control
- OpenAPI/docs and contributor submission flow

### Key tests

- entry-point discovery tests
- dependency/install-guidance tests
- API auth tests
- rate limiting tests
- OpenAPI validation

### Completion criteria

- community plugins and external clients can use the same hardened Studio surface without special-case architecture

## Phase 10: Runtime Cutover And Release Gate

### Objective

Promote the Studio 2.0 execution architecture from an opt-in path to the standard runtime.

### Scope

- managed TTS Server subprocess starts by default
- VoiceBridge, engine registry, verification, settings, preview, and synthesis use the TTS Server path by default
- Studio 2.0 orchestrator becomes the default scheduler for supported work
- runtime diagnostics make service state visible
- legacy direct in-process mode remains available only as an explicit transition fallback

### Completion criteria

- normal user launch runs through the managed TTS Server architecture and reports truthful runtime diagnostics

## Phase 11: V2-Only Runtime Cleanup

### Objective

Remove silent v1/in-process TTS fallback behavior after the current wrap-up work is complete and the v2 runtime has been verified.

### Scope

- make the TTS Server/plugin runtime the only production XTTS/Voxtral path
- remove automatic VoiceBridge, registry, and watchdog fallback to local adapters
- keep migrations and data compatibility readers where they protect existing user data
- surface TTS Server failures as actionable service errors rather than masking them with v1 behavior

### Completion criteria

- Studio no longer has two production XTTS/Voxtral runtimes; plugin-backed v2 is the committed runtime path

## Phase 12: Release Documentation And Distribution Polish

### Objective

Document, package, validate, and present the completed Studio 2.0 overhaul as a production-ready release.

### Scope

- audit and update READMEs, wiki pages, docs site, API docs, plugin docs, and install instructions
- create an in-depth multi-page Studio 2.0 overview
- refresh live demo pages, screenshots, assets, and optional animations
- prepare "What's New In Version 2" release and promotional materials
- verify Pinokio install/launch flows
- validate macOS, Windows, and Linux first-run behavior

### Completion criteria

- Studio 2.0 is documented, installable, demo-ready, and release-ready for users, contributors, plugin authors, and API clients

## Debugging Discipline Across All Phases

- Debug the smallest possible module first.
- Avoid debugging through the full app when an isolated test or stub contract can prove the issue.
- If a bug spans multiple new modules, add a contract test at the boundary where it leaks across.
