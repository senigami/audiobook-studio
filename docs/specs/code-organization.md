# SP10 — Code Organization Spec

```
spec_version: 1.1.0
status: active
created: 2026-06-10
updated: 2026-06-16
sources: app/api/web.py, app/api/tts_api.py, app/api/ws.py,
         app/core/boot.py, app/core/config.py, app/core/security.py,
         app/db/state.py, app/engines/bridge.py, app/engines/registry.py,
         app/orchestration/tasks/base.py, app/utils/pathing.py,
         frontend/src/app/, frontend/src/pages/, frontend/src/components/,
         frontend/tests/
```

> **TL;DR:** Every file has exactly one home; new code goes in the narrowest matching bucket, and modules that cross bucket boundaries are bugs.

## Changelog

| Version | Date       | Summary                                                     |
|---------|------------|-------------------------------------------------------------|
| 1.1.0   | 2026-06-16 | Fix page entry convention to `<Page>Route.tsx`; describe actual `api/` shape; add missing `frontend/src/` dirs; carve out `app.jobs.registry` from import ban |
| 1.0.0   | 2026-06-10 | Initial spec documenting Studio 2.0 layout and conventions  |

---

## 1. Purpose

This spec is the authoritative map of where code lives and where new code MUST
go.  It defines the directory layout for both the Python backend and the React
frontend, documents module boundary rules, and provides placement guidance for
common extension points (new engines, routes, task types, path helpers, pages,
components, hooks).

Cross-references: import-time side effect rules are in
[system-architecture.md §10](system-architecture.md); path-safety rules are in
`.agent/rules/backend-paths.md`; boot-sequence ordering is in
[system-architecture.md §4](system-architecture.md).

---

## 2. Top-Level Repository Layout

```
audiobook-factory/
  app/                   # Studio main-process Python package
  plugins/               # Self-contained engine plugins
  frontend/              # React + TypeScript UI
  tests/                 # Backend pytest suite (mirrors app/ layout)
  docs/
    specs/               # Canonical specs (this directory)
    decisions/           # Architecture Decision Records
  plans/final_release/   # Release execution plan (doc 08 = execution order)
  wiki/                  # End-user documentation + Changelog
  run.py                 # App entry point (exposes `app` from app/api/web.py)
  tts_server.py          # TTS Server subprocess entry point
  pytest.ini             # Collects from BOTH tests/ and plugins/; runs --cov=app
  pyproject.toml         # Ruff config (line-length 120)
```

(The former top-level `audiobook.py` / `audit_routes.py` legacy utilities and the
empty `app.db` / `database.sqlite` placeholders were removed in the foundation
cleanup — see `wiki/Changelog.md` 2026-06-20.)

---

## 3. Backend Layout (`app/`)

### 3.1 `app/api/`

| Path | Responsibility |
|---|---|
| `web.py` | FastAPI app object; `startup_event`/`shutdown_event`; mounts routers + static roots + SPA catch-all |
| `ws.py` | WebSocket manager (`/ws`); `broadcast_*` helpers |
| `tts_api.py` | External TTS gateway sub-app (mounted at `/api/v1/tts`); guarded by `verify_api_key` + `rate_limit` |
| `routers/` | One module per domain, registered in `web.py`: `projects`, `chapters`, `voices`, `queue`, `settings`, `generation`, `system`, `analysis`, `migration`, `engines`. (Several domains span multiple files, e.g. `projects*.py`, `chapters*.py`, `voices*.py`.) |

New API endpoints MUST go in `app/api/routers/<domain>.py`.  Adding a new
domain MUST include registering the router in `web.py` via `app.include_router`.

### 3.2 `app/core/`

| Path | Responsibility |
|---|---|
| `boot.py` | Explicit boot sequence — the ONLY place for startup side effects |
| `config.py` | Env var resolution; all storage roots derived here |
| `security.py` | `verify_api_key`, `rate_limit`, HMAC compare helpers |

### 3.3 `app/db/`

| Path | Responsibility |
|---|---|
| `state.py` | Facade re-exporting from decomposed modules below |
| `state_jobs.py` | In-memory job store (`state.json`); job listeners; authoritative for live status |
| `state_settings.py` | Settings read/write within `state.json` |
| `state_performance.py` | Performance sample read/write |
| `state_helpers.py` | Shared atomicity primitives (`_atomic_write_text`, locks) |
| `queue.py` | SQLite `processing_queue` table operations |
| `speakers.py` | Voice profile filesystem + DB operations |
| `__init__.py` | Re-exports for external callers; MUST NOT auto-migrate on import |

The job-tracking contract (dual-store semantics, terminal reset, reconciliation)
is documented in [queue-jobs.md](queue-jobs.md).

### 3.4 `app/engines/`

| Path | Responsibility |
|---|---|
| `bridge.py` | `VoiceBridge` — single routing point for synthesis requests |
| `bridge_remote.py` | HTTP dispatch to TTS Server |
| `registry.py` | Engine metadata cache (5-second TTL; sourced from TTS Server `GET /engines`) |
| `tts_client.py` | Low-level HTTP client to the TTS Server (`ping()` hits `/ready`) |
| `voice/sdk.py` | SDK dataclasses: `TTSRequest`, `TTSResult`, `TimingEvent`, etc. |
| `voice/base.py` | `StudioTTSEngine` ABC + base engine helpers shared by all engine implementations |

### 3.5 `app/orchestration/`

| Path | Responsibility |
|---|---|
| `tasks/base.py` | `StudioTask`, `TaskContext`, `TaskResult` base classes |
| `tasks/<type>.py` | One module per task type (`synthesis`, `api_synthesis`, `assembly`, `bake`, `export`, `sample_build`, `sample_test`) |
| `scheduler/orchestrator.py` | Job execution lifecycle: `submit`, `cancel`, `recover`, `dispatch` |
| `scheduler/policies.py` | Queue ordering and fairness (priority modes) |
| `scheduler/resources.py` | Resource gates (GPU, exclusive) and pause state |
| `scheduler/recovery.py` | Startup recovery: snapshot + re-submit interrupted tasks |
| `progress/service.py` | Progress math and reconciliation |
| `progress/broadcaster.py` | Progress broadcast to WebSocket |

New task types MUST go in `app/orchestration/tasks/<type>.py`, deriving from
`tasks/base.py`.

### 3.6 `app/tts_server/`

Code in this directory is loaded inside the **TTS Server subprocess**, not the
Studio main process.

| Path | Responsibility |
|---|---|
| `server.py` | FastAPI app for the TTS Server |
| `plugin_loader.py` | Discovers and validates engine plugins from `plugins/` |
| `health.py` | Engine status computation for `GET /health` |
| `settings_store.py` | Per-plugin settings persistence |
| `verification.py` | Plugin contract verification helpers |

### 3.7 `app/utils/`

| Path | Responsibility |
|---|---|
| `pathing.py` | Path-safety helpers: `contained_path`, `safe_join`, `secure_join_flat`, `find_secure_file`, `safe_basename` |
| `text/` | Text processing utilities: cleaning, splitting, grouping |

New path helpers MUST go in `app/utils/pathing.py`.  Any path derived from
request data, DB values, uploads, or user-editable names MUST be treated as
untrusted and routed through a helper from this module.

### 3.8 `app/jobs/` (legacy bridge)

`app/jobs/` contains legacy worker-loop bridges (`worker_voice`, etc.).
Studio 2.0 routes all background work through `app/orchestration/`.

New modules MUST NOT import `app/jobs/` for task dispatch.

---

## 4. Plugin Layout (`plugins/`)

```
plugins/
  tts_<id>/
    manifest.json     # engine_id, capabilities, behavior, resource needs; studio_tts_manifest version required
    interface.py      # Engine entry class (implements StudioTTSEngine ABC from app/engines/voice/base.py)
    plugin/           # Implementation code
    tests/            # Plugin-local tests; collected by pytest via pytest.ini
    fixtures/         # Optional test fixtures
```

Plugin directory names MUST match `^tts_[a-z][a-z0-9]{1,14}$`.

New TTS engines MUST be added as `plugins/tts_<id>/` directories.  No engine
registration is needed in core code; discovery is automatic via
`app/tts_server/plugin_loader.py`.

Shipped plugins: `tts_xtts`, `tts_voxtral`, `tts_mixed`.

---

## 5. Frontend Layout (`frontend/`)

```
frontend/
  src/
    app/              # App shell, routing, global layout
    pages/            # Route screens
      <Page>/
        <Page>Route.tsx   # Route/entry component (always present)
        <Page>Page.tsx    # Inner page component (present when logic is split from routing)
        components/       # Page-owned subcomponents (not shared outside this page)
    components/       # Cross-page shared UI components
    hooks/            # Custom React hooks
    api/
      client.ts       # Base fetch client
      index.ts        # Consolidated fetch functions for all domains
      types.ts        # Shared API TypeScript types
      contracts/      # TypeScript types for API payloads and live-event frames
      queries/        # React Query / data-fetching hooks
      hydration/      # Response hydration utilities
    store/            # Global stores (socket bus, live jobs, audit)
    theme/            # CSS variables, design tokens, base styles
    config/           # App-level configuration constants
    constants/        # Shared constant values
    shared/           # Cross-cutting utilities shared across layers (use only for code that is truly cross-feature; feature-specific code must NOT migrate here)
    demo/             # Demo-mode assets (build-separate; not included in production bundle)
    types/            # TypeScript domain types
    utils/            # Pure helpers (jobEventAdapters, jobSelection, etc.)
  tests/
    unit/             # Vitest unit tests; mirrors src/ layout
    e2e/              # Playwright end-to-end tests
    helpers/          # Test utilities and shared fixtures
    setup/            # Vitest/Playwright setup files
```

Placement rules:

| What | Where |
|---|---|
| New route screen | `frontend/src/pages/<Page>/<Page>Route.tsx` (add `<Page>Page.tsx` when routing and page logic are split) |
| Subcomponent used only by one page | `frontend/src/pages/<Page>/components/` |
| Component used by two or more pages | `frontend/src/components/` |
| New custom hook | `frontend/src/hooks/` |
| New fetch function | `frontend/src/api/index.ts` (consolidated; not per-domain files) |
| New TypeScript payload type | `frontend/src/api/contracts/` or `frontend/src/types/` |
| New global store | `frontend/src/store/` |
| New pure utility | `frontend/src/utils/` |

Tests MUST mirror the source layout.  A test for
`frontend/src/hooks/useJobs.ts` lives at
`frontend/tests/unit/hooks/useJobs.test.ts`.

Live-event test frames MUST use types from
`frontend/src/api/contracts/liveEvents.ts` and be published via
`publishStudioSocketMessage`.  Untyped hand-rolled frame literals are forbidden
(see [testing-standards.md](testing-standards.md)).

---

## 6. Test Layout (`tests/`)

```
tests/
  api/                  # Route and endpoint tests
  db/                   # State, queue, and DB layer tests
  orchestration/        # Scheduler, task, recovery tests
  engines/              # Bridge and watchdog tests
  conftest.py           # Session fixtures: temp storage, PLUGINS_DIR, APP_TEST_MODE
```

`conftest.py` at the repo root redirects storage paths to a session temp dir,
points `PLUGINS_DIR` at the real `plugins/` directory, and sets
`APP_TEST_MODE=1`.

Plugin-local tests live at `plugins/<id>/tests/` and are collected by pytest
via `pytest.ini`.

Default per-test timeout: 15 seconds.  Override with
`@pytest.mark.timeout(N)` or `PYTEST_TEST_TIMEOUT_SECONDS`.

---

## 7. File Size Norms

- Files over **500 lines** are candidates for splitting.
- Files over **600 lines** SHOULD be refactored when touched for meaningful
  changes, along existing domain boundaries (not mechanically by line count).
- Splitting MUST follow existing semantic boundaries (e.g. separate the
  scheduler's policies from its orchestrator, not split `orchestrator.py` in
  half arbitrarily).

---

## 8. Module Boundary Rules

### 8.1 Import prohibitions

New Studio 2.0 modules MUST NOT import:

- `app.api.web` directly (except from `run.py` and test monkeypatching).
- `app.jobs` worker-loop modules for task dispatch.

**Carve-out:** `app.jobs.registry` (the handler registry, not the worker loop) MAY be imported
for re-export as patch targets (as in `app/orchestration/scheduler/orchestrator_helpers.py`).
The worker-loop modules (`app.jobs.worker_voice`, etc.) remain banned.

### 8.2 Engine-ID branching prohibition

Core code (routes, orchestrator, queue, VoiceBridge) MUST NOT branch on engine
IDs for core behavior.  Engine-specific behavior belongs in the plugin manifest
(`behavior` fields) and the `StudioTTSEngine` interface.

### 8.3 Side-effect prohibition on import

See [system-architecture.md §10](system-architecture.md).  Importing any module
MUST NOT start threads, register listeners, mutate global settings, or
reconcile state.

### 8.4 Path safety

Any path derived from request data, DB values, file uploads, or user-editable
names MUST be validated with helpers from `app/utils/pathing.py`.  Traversal
attempts MUST be rejected, not silently corrected.

---

## 9. Canonical Extension Points

| Adding... | Where it goes | Notes |
|---|---|---|
| New TTS engine | `plugins/tts_<id>/` | Manifest + interface; no core changes needed |
| New API endpoint | `app/api/routers/<domain>.py` | Register router in `web.py` |
| New task type | `app/orchestration/tasks/<type>.py` | Derive from `tasks/base.py` |
| New path helper | `app/utils/pathing.py` | Must pass containment check |
| New DB operation | `app/db/<domain>.py` | Match existing facade pattern |
| New frontend page | `frontend/src/pages/<Page>/<Page>Route.tsx` | Add route in `app/` shell; split `<Page>Page.tsx` if routing and logic are large |
| New shared component | `frontend/src/components/` | Only if used by 2+ pages |
| New hook | `frontend/src/hooks/` | Mirror test in `tests/unit/hooks/` |
| New API contract type | `frontend/src/api/contracts/` | Required for live-event test frames |

---

## 10. Documentation Conventions

- `docs/specs/` — machine-readable canonical specs (this directory); follow the
  spec format in this file.
- `docs/decisions/` — Architecture Decision Records (ADRs); one file per
  decision with date and status.
- `wiki/` — end-user documentation.  `wiki/Changelog.md` MUST receive a dated
  entry for every shipped behavior change.
- `plans/final_release/` — release execution plan.  Doc 08 is the execution
  order.  Where `plans/final_release/` conflicts with older `plans/` docs,
  `final_release/` wins.

---

## 11. Invariants

**MUST:**

- I1. New TTS engines MUST be placed in `plugins/tts_<id>/` with a `manifest.json` declaring `studio_tts_manifest` (currently `"1.0"`).
- I2. New API endpoints MUST live in `app/api/routers/<domain>.py` and be registered in `app/api/web.py`.
- I3. New task types MUST live in `app/orchestration/tasks/<type>.py` and derive from `tasks/base.py`.
- I4. Path helpers MUST be added to `app/utils/pathing.py`; all untrusted paths MUST pass through a helper from this module.
- I5. Frontend tests MUST mirror the `src/` layout under `frontend/tests/unit/`.
- I6. Live-event test frames MUST use types from `frontend/src/api/contracts/liveEvents.ts`.
- I7. `wiki/Changelog.md` MUST receive a dated entry for every shipped behavior change.
- I8. Plugin directory names MUST match `^tts_[a-z][a-z0-9]{1,14}$`.

**MUST NOT:**

- I9. New Studio 2.0 modules MUST NOT import `app.api.web` or `app.jobs` worker-loop modules for task dispatch. `app.jobs.registry` (handler registry) is permitted for re-export as patch targets.
- I10. Core code MUST NOT branch on engine IDs for core behavior.
- I11. Page-owned subcomponents MUST NOT be imported by other pages; use `components/` for shared UI.
- I12. `app/db/__init__.py` MUST NOT auto-migrate on import.
- I13. Files over 600 lines MUST NOT grow further when touched for meaningful changes without a refactor along existing boundaries.
