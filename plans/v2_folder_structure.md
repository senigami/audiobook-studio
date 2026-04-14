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
│   │   └── tts_api.py          # Local TTS API routes (/api/v1/tts/*)
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
│   ├── subprocess/             # Safe wrappers for ffmpeg, etc.
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
│   │   ├── api_synthesis.py    # API synthesis task class
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
│   │   └── policies.py         # Includes API vs. UI priority policy
│   └── progress/
│       ├── service.py
│       ├── reconciliation.py
│       ├── eta.py
│       └── broadcaster.py
│
├── engines/                    # Studio-side engine boundary (HTTP clients)
│   ├── models.py               # Shared engine models (manifest, health, registration)
│   ├── errors.py               # Typed engine error hierarchy
│   ├── registry.py             # Registry client — caches TTS Server /engines responses
│   ├── bridge.py               # VoiceBridge — HTTP client to TTS Server
│   ├── tts_client.py           # Low-level HTTP client for TTS Server communication
│   ├── watchdog.py             # TTS Server health monitor with heartbeat/kill/restart
│   └── voice/
│       └── base.py             # StudioTTSEngine ABC (published SDK contract)
│
├── tts_server/                 # TTS Server source (runs as separate process)
│   ├── __init__.py
│   ├── server.py               # FastAPI app for TTS Server HTTP API
│   ├── plugin_loader.py        # Plugin discovery, manifest validation, engine loading
│   ├── verification.py         # Verification synthesis runner
│   ├── settings_store.py       # Per-engine settings persistence
│   └── health.py               # Health endpoint and per-engine status aggregation
│
├── legacy/                     # Temporary adapters and compatibility shims
│   ├── jobs/
│   └── engines/
│
└── testsupport/                # Mock engines, fixtures, and helper utilities
```

**Top-level TTS Server entry point:**

```text
tts_server.py                   # Entry point script spawned by Studio as subprocess
```

**Plugin directory (top-level, inside install root):**

```text
plugins/
├── tts_xtts/                   # Built-in XTTS engine (same discovery as community plugins)
│   ├── manifest.json
│   ├── engine.py
│   ├── settings_schema.json
│   ├── settings.json           # Auto-managed user settings
│   ├── requirements.txt
│   └── assets/
├── tts_voxtral/                # Built-in Voxtral engine
│   ├── manifest.json
│   ├── engine.py
│   ├── settings_schema.json
│   ├── settings.json
│   └── requirements.txt
└── tts_<community>/            # Community-contributed plugins follow same structure
    ├── manifest.json
    ├── engine.py
    ├── settings_schema.json
    └── ...
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
│   ├── settings/
│   │   ├── routes/
│   │   │   └── SettingsRoute.tsx    # Tabbed settings page (/settings/*)
│   │   ├── general/                 # General settings tab
│   │   ├── engines/                 # TTS Engines tab (per-engine cards)
│   │   ├── api/                     # API settings tab
│   │   ├── about/                   # About tab
│   │   └── voice-modules/           # Legacy voice module route (migrates into engines/)
│   └── tts-api/                     # Developer-facing API docs page (future)
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
- Engines live in self-contained plugin folders that contributors can create without touching Studio source.
- The TTS Server process isolates GPU memory and model weights from the web server.
- The VoiceBridge becomes an HTTP client, making the engine boundary a real process boundary rather than just a class hierarchy.

## 7. Migration Rules

- Do not rename everything at once. Add the new structure, move responsibilities gradually, then delete legacy modules once the cutover is verified.
- Keep compatibility adapters in `app/legacy/` instead of polluting new modules with legacy branching.
- Do not let `frontend/src/store/` become a canonical entity cache. Canonical entity loading belongs in `api/queries` plus feature data hooks.
- Shared artifact cache entries must be immutable. Project-local references can point to them, but must not mutate them.
- Built-in engines (XTTS, Voxtral) move from `app/engines/voice/` to `plugins/tts_xtts/` and `plugins/tts_voxtral/` and go through the same discovery path as community plugins.
- Plugin folder names must follow the `tts_<name>` convention (max 20 characters, lowercase alphanumeric).
- The `app/engines/` directory retains only Studio-side clients (registry cache, bridge HTTP client, watchdog) — no engine implementation code.
