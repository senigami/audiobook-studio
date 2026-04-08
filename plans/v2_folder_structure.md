# Proposed Folder Structure: Audiobook Studio 2.0

This is the target organization I want us to build toward. It is designed for an incremental migration, but it is opinionated enough to act as the architectural destination rather than a loose sketch.

## 1. Organization Principles

- Organize around domains and operational boundaries, not around temporary “v2” labels.
- Keep public route and adapter surfaces stable while moving internals behind them.
- Separate domain logic, orchestration, engine integration, and infrastructure concerns.
- Make the on-disk project data structure as intentional as the source tree.

## 2. Backend Source Layout (`app/`)

```text
app/
├── api/
│   ├── routers/                # FastAPI route handlers
│   ├── schemas/                # Pydantic request/response models
│   ├── deps/                   # Dependency wiring for routes
│   └── ws/                     # WebSocket connection manager and event wiring
│
├── core/
│   ├── config.py               # Environment and app settings
│   ├── logging.py              # Logger setup
│   ├── paths.py                # Trusted root definitions and path helpers
│   ├── security.py             # Request and filesystem validation
│   └── feature_flags.py        # Cutover and migration flags
│
├── infra/
│   ├── db/                     # DB connection/session helpers
│   ├── subprocess/             # Safe wrappers for ffmpeg, XTTS subprocesses, etc.
│   ├── events/                 # Internal event bus / publisher abstraction
│   └── cache/                  # Shared cache primitives if needed
│
├── domain/
│   ├── projects/
│   │   ├── models.py
│   │   ├── repository.py
│   │   ├── service.py
│   │   ├── snapshots.py
│   │   └── exports.py
│   ├── chapters/
│   │   ├── models.py
│   │   ├── repository.py
│   │   ├── service.py
│   │   ├── segmentation.py
│   │   ├── batching.py
│   │   └── drafting.py
│   ├── voices/
│   │   ├── models.py
│   │   ├── repository.py
│   │   ├── service.py
│   │   ├── compatibility.py
│   │   ├── samples.py
│   │   └── preview.py
│   ├── settings/
│   │   ├── models.py
│   │   ├── repository.py
│   │   ├── service.py
│   │   └── ownership.py
│   ├── artifacts/
│   │   ├── models.py
│   │   ├── repository.py
│   │   ├── service.py
│   │   ├── manifest.py
│   │   └── cache.py
│   ├── jobs/
│   │   ├── models.py
│   │   ├── repository.py
│   │   └── service.py
│   └── text/
│       ├── sanitization.py
│       ├── analysis.py
│       └── pronunciation.py
│
├── orchestration/
│   ├── tasks/
│   │   ├── base.py
│   │   ├── synthesis.py
│   │   ├── mixed_synthesis.py
│   │   ├── bake.py
│   │   ├── assembly.py
│   │   ├── export.py
│   │   ├── export_repair.py
│   │   ├── sample_build.py
│   │   └── sample_test.py
│   ├── scheduler/
│   │   ├── orchestrator.py
│   │   ├── resources.py
│   │   ├── recovery.py
│   │   └── policies.py
│   └── progress/
│       ├── service.py
│       ├── reconciliation.py
│       ├── eta.py
│       └── broadcaster.py
│
├── engines/
│   ├── registry.py
│   ├── bridge.py
│   └── voice/
│       ├── base.py
│       ├── xtts/
│       │   ├── engine.py
│       │   ├── manifest.json
│       │   └── settings_schema.json
│       └── voxtral/
│           ├── engine.py
│           ├── manifest.json
│           └── settings_schema.json
│
├── legacy/                     # Temporary adapters and compatibility shims
│   ├── jobs/
│   └── engines/
│
└── testsupport/                # Mock engines, fixtures, and helper utilities
```

## 3. Frontend Source Layout (`frontend/src/`)

```text
frontend/src/
├── app/
│   ├── routes/                 # Route entry points
│   ├── layout/                 # App shell and navigation
│   └── providers/              # App-level providers and bootstrapping
│
├── api/
│   ├── client.ts               # Shared HTTP client
│   ├── contracts/              # Shared request/response and event shapes
│   ├── queries/                # Fetch and mutation helpers
│   └── hydration/              # Reload/reconnect hydration helpers
│
├── features/
│   ├── project-library/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── api/
│   │   └── routes/
│   ├── project-view/
│   ├── chapter-editor/
│   ├── queue/
│   ├── voices/
│   │   └── preview/
│   └── settings/
│       └── voice-modules/
│
├── store/
│   ├── live-jobs.ts            # WebSocket-driven overlay state
│   ├── editor-session.ts       # Selection, draft, viewport, local action state
│   └── notifications.ts
│
├── shared/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── styles/
│   └── types/
│
└── test/
    ├── fixtures/
    └── utils/
```

## 4. Test Layout

```text
tests/
├── unit/
│   ├── domain/
│   ├── engines/
│   ├── orchestration/
│   └── progress/
├── integration/
│   ├── api/
│   ├── queue/
│   └── recovery/
└── e2e/
    └── studio/
```

## 5. Runtime Data Layout

This matters as much as the code layout because project portability and artifact safety depend on it.

```text
data/
├── projects/
│   └── <project_id>/
│       ├── project.json
│       ├── chapters/
│       │   └── <chapter_id>/
│       │       ├── chapter.json
│       │       ├── source.md
│       │       ├── blocks/
│       │       │   └── <block_id>.json
│       │       ├── renders/
│       │       └── previews/
│       ├── exports/
│       ├── snapshots/
│       └── imports/
├── library/
│   └── voices/
│       └── <voice_id>/
│           ├── profile.json
│           ├── samples/
│           └── engine_assets/
└── cache/
    └── artifacts/
        └── <artifact_hash>/
            ├── audio.wav
            └── manifest.json
```

## 6. Why This Organization Is Better

- Domain services become easier to reason about because they stop sharing responsibility with orchestration code.
- Queue and progress logic can evolve independently without dragging engine wrappers and route handlers around.
- The frontend becomes feature-first instead of page-and-hook accretion.
- Runtime data ownership becomes explicit enough to support portability, reuse, and recovery safely.
- Settings ownership becomes explicit enough that global app settings, project defaults, module settings, and profile preview behavior do not blur together during migration.
- Render batching has a real home in the chapter domain instead of being rediscovered ad hoc inside queue or UI code.

## 7. Migration Rules

- Do not rename everything at once. Add the new structure, move responsibilities gradually, then delete legacy modules once the cutover is verified.
- Keep compatibility adapters in `app/legacy/` instead of polluting new modules with legacy branching.
- Do not let `frontend/src/store/` become a canonical entity cache. Canonical entity loading belongs in `api/queries` plus feature data hooks.
- Shared artifact cache entries must be immutable. Project-local references can point to them, but must not mutate them.
