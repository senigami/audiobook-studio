# SP9 — System Architecture Spec

```
spec_version: 1.4.0
status: active
created: 2026-06-10
updated: 2026-06-26
sources: run.py, tts_server.py, app/api/web.py, app/core/boot.py,
         app/engines/watchdog.py, app/engines/bridge.py,
         app/engines/bridge_remote.py, app/engines/tts_client.py,
         app/tts_server/plugin_loader.py, app/orchestration/scheduler/orchestrator.py,
         app/orchestration/scheduler/resources.py, plugins/*/manifest.json
```

> **TL;DR:** Studio runs as two processes — a main FastAPI app and a managed TTS Server subprocess — with a strict ownership split between the orchestrator (job lifecycle), watchdog (server process lifecycle), and VoiceBridge (engine routing).

## Changelog

| Version | Date       | Summary                                                    |
|---------|------------|------------------------------------------------------------|
| 1.4.0   | 2026-06-26 | **W-PAR task 001 — per-engine-class counting semaphores.** Each engine manifest now declares `behavior.max_concurrent_workers` (xtts=1, voxtral=1, mixed=1 (all caps=1 in task-001; real caps + enable toggle land in task-007)). The orchestrator-side resource gate (`app/orchestration/scheduler/resources.py`) is replaced with `EngineClassSemaphore` counting semaphores, keyed by engine class derived from the manifest `resource` block (`"gpu"` / `"cpu_heavy"` / `"cloud"`), plus a global cap backstop (`MAX_GLOBAL_CONCURRENT_SYNTHESIS=8`). With all caps at default 1 behavior is byte-identical to today (INV-1 "ships dark"). No engine-ID string comparisons in `resources.py` (INV-5). `SynthesisTask` derives `ResourceClaim` from the manifest rather than an `engine_id == "mixed"` branch (W5 closed). See `queue-jobs.md §7` for the full contract. |
| 1.3.0   | 2026-06-26 | §9 note: for mixed/multi-group renders the orchestrator resolves timing/progress markers per the **active render-group's declared engine** (via that engine's manifest), and the mixed handler emits a bracketed `[ENGINE_ACTIVITY_STARTED]` marker before each group's bridge call. This is manifest-driven resolution, NOT hardcoded engine-ID branching — the no-branch rule and the watchdog/VoiceBridge boundaries are preserved (watchdog/VoiceBridge stay ignorant of model-load semantics). Documents W-MIX W1. |
| 1.2.0   | 2026-06-23 | Add invariant I13: boot MUST NOT host destructive/expensive reconciliation (re-runs on `--reload`); on-demand instead. See [ADR-0013](../decisions/ADR-0013-segment-orphan-reconciliation.md) |
| 1.1.0   | 2026-06-16 | §4 rewritten: `startup_event` orchestrates steps 1–9, `boot_studio()` handles migration + handler init + watchdog; clarify two `init_db`/`migrate_state_json_to_db` call sites; I7 corrected from `/health` to `/engines` |
| 1.0.0   | 2026-06-10 | Initial spec documenting the Studio 2.0 two-process model |

---

## 1. Two-Process Model

Studio 2.0 splits work across two independent OS processes:

| Process | Entry point | Default port | Responsibility |
|---|---|---|---|
| **Studio main process** | `run.py` → `app/api/web.py` | 8123 | REST API, WebSocket, job state, routing, UI serving |
| **TTS Server subprocess** | `tts_server.py` | auto (~7862+) | Synthesis execution, plugin loading, engine health |

The processes communicate over **HTTP only**.  There is no shared memory, shared
DB connection, or IPC channel other than:

1. stdout from the TTS Server process — used only for the `READY:{port}` handshake line.
2. HTTP requests from Studio → TTS Server (`GET /health`, `POST /synthesize`, etc.).

The TTS Server is an implementation detail of the Studio runtime.  External
callers MUST NOT assume a stable port or address for the TTS Server; they MUST
use the Studio main-process API.

---

## 2. Studio Main Process (`app/api/web.py`)

`run.py` imports and exposes the FastAPI app object as `app` via
`from app.api.web import app`.  An access-log filter is applied at this layer.

`app/api/web.py` is responsible for:

- Mounting static file roots (built React bundle from `frontend/dist`).
- Registering `startup_event` and `shutdown_event` lifecycle handlers.
- Including all domain routers from `app/api/routers/` (`projects`, `chapters`,
  `voices`, `queue`, `settings`, `generation`, `system`, `analysis`,
  `migration`, `engines`).
- Mounting the external TTS gateway sub-app at `/api/v1/tts`
  (see `app/api/tts_api.py`).
- Providing containment-checked file serving (`_contained_root_file`,
  `_contained_file`) and a catch-all SPA route.

`startup_event` runs the boot sequence (§4) in a background thread so the web
server is not blocked from accepting connections.

---

## 3. TTS Server Subprocess (`tts_server.py`)

`tts_server.py` is the entry point for the TTS Server process.  It:

1. Loads engine plugins via `app/tts_server/plugin_loader.py`.
2. Binds a uvicorn-hosted FastAPI app (`app/tts_server/server.py`) on an
   auto-selected port.
3. Prints `READY:{port}` to stdout when it is accepting connections.

The TTS Server exposes:

- `GET /health` — full per-engine status payload.
- `GET /ready` — cheap readiness probe; polled by the watchdog heartbeat.
- `POST /synthesize` (and engine-specific routes) — synthesis dispatch.
- Plugin settings endpoints used by `app/tts_server/settings_store.py`.

The TTS Server MUST NOT be started manually in production; it is always
launched by the watchdog (§5).  Direct invocation is permitted only for
isolated development or plugin testing.

---

## 4. Boot Sequence

**`app/api/web.py:startup_event`** orchestrates the full startup sequence (steps 1–9 below) and then delegates service startup to **`app/core/boot.py:boot_studio()`** in a background thread (step 10).  `app/core/boot.py` is the *intent* boundary for startup side effects — no module import may start threads, register listeners, or reconcile state — but the sequence itself is driven by `startup_event`.

The steps are deterministic and MUST execute in this order:

| Step | Action | Call site / Module |
|---|---|---|
| 1a | `init_db()` — create SQLite tables if not present | `app/api/web.py:startup_event` → `app/db/__init__.py` |
| 1b | Migrate voice profiles to V2 storage format | `app/api/web.py:startup_event` → `app/db/migration.py` |
| 1c | Migrate legacy project covers to project-local storage | `app/api/web.py:startup_event` → `app/db/migration.py` |
| 2 | **Snapshot** recoverable task contexts (BEFORE clearing stuck jobs) | `app/api/web.py:startup_event` → `app/orchestration/scheduler/recovery.py` |
| 3 | Clear stuck in-memory jobs (`queued`/`running`/`preparing`/`finalizing`) from `state.json` | `app/api/web.py:startup_event` → `app/db/state_jobs.py` |
| 4 | Reconcile chapter statuses and SQLite `processing_queue` rows vs live `state.json` | `app/api/web.py:startup_event` → `app/db/reconcile.py`, `app/db/queue.py` |
| 5 | Register job listeners for WebSocket broadcast | `app/api/web.py:startup_event` → `app/api/ws.py` |
| 6 | `run_startup_recovery(contexts)` — re-submit interrupted tasks | `app/api/web.py:startup_event` → `app/core/boot.py:run_startup_recovery` |
| 7 | Restore pause state from settings | `app/api/web.py:startup_event` → `app/orchestration/scheduler/resources.py` |
| 8 | `boot_studio()` in background thread — runs DB migration (`migrate_state_json_to_db()`), initializes job handlers (`initialize_default_handlers()`), then calls `boot_tts_server()` | `app/core/boot.py` |
| 9 | `boot_tts_server()` → orphan cleanup + start watchdog | `app/core/boot.py` → `app/engines/watchdog.py` |

Step 2 MUST precede step 3.  Snapshotting after clearing would lose the
contexts needed for recovery and is a critical ordering invariant (see
[queue-jobs.md §5.3](queue-jobs.md)).

Note: `init_db()` is called directly in `startup_event` (step 1a); the separate
`migrate_state_json_to_db()` call happens inside `boot_studio()` (step 8) via
`app/db/migration.py`.  `app/db/__init__.py` MUST NOT auto-migrate on import;
callers invoke migration explicitly through the boot sequence.

---

## 5. Watchdog (`app/engines/watchdog.py`)

The watchdog owns the **TTS Server process lifecycle** and nothing else.

Responsibilities:

- **Spawn** the TTS Server subprocess.
- **Wait for READY** — read stdout until `READY:{port}` is received or a
  timeout is exceeded.
- **Heartbeat poll** — periodically call `GET /ready` (the cheap readiness
  probe, via `TtsClient.ping()`) on the TTS Server; if the call fails or returns
  a non-200 status, trigger a restart.
- **Restart** the subprocess on failure, subject to a **circuit breaker** that
  stops restarting after N consecutive failures within a time window.

The watchdog is started exclusively from `boot_tts_server()` in
`app/core/boot.py`.  No other code path MUST start the watchdog.

The watchdog MUST NOT make decisions about job lifecycle (cancelling,
re-queuing, etc.).  On a TTS Server restart, the orchestrator is responsible
for detecting the outage and handling in-flight tasks.

---

## 6. HTTP Routing: Studio → TTS Server

All synthesis requests from Studio to the TTS Server flow through this chain:

```
app/engines/bridge.py  (VoiceBridge)
    └─► app/engines/bridge_remote.py  (HTTP dispatch)
        └─► app/engines/tts_client.py  (low-level HTTP client)
            └─► TTS Server HTTP API
```

**VoiceBridge** (`bridge.py`) is the single public routing point for voice
requests within the Studio main process.  In the Studio 2.0 runtime, all
requests are remote (no in-process engine execution).

**`bridge_remote.py`** translates a `TTSRequest` into an HTTP call, using the
port discovered from the watchdog's READY handshake.

**`tts_client.py`** is the low-level HTTP client; it handles retries,
timeouts, and connection errors.

Engine metadata (capabilities, `text_chunk_limit`, `progress_pattern`,
resource needs) is cached with a 5-second TTL in
`app/engines/registry.py` and sourced from `GET /engines` on the TTS Server.

---

## 7. Plugin Architecture

Engine plugins live in `plugins/` and are loaded inside the TTS Server process
by `app/tts_server/plugin_loader.py`.

Each plugin is a self-contained directory:

```
plugins/tts_<id>/
  manifest.json     # engine_id, capabilities, behavior, resource needs
  interface.py      # Engine entry class (implements StudioTTSEngine ABC)
  plugin/           # Implementation
  tests/            # Plugin-local tests, collected by pytest
```

Plugin IDs MUST match the regex `^tts_[a-z][a-z0-9]{1,14}$`.

`manifest.json` declares an explicit `studio_tts_manifest` version (currently `"1.0"`) validated at load time.
Key `behavior` fields: `text_chunk_limit` (max characters per synthesis call),
`progress_pattern` (regex for parsing progress from engine output).

Core code MUST NOT branch on engine IDs.  Engine-specific behavior is
expressed entirely through manifest fields and the `StudioTTSEngine` interface.

---

## 8. External TTS Gateway (`app/api/tts_api.py`)

A separate FastAPI sub-app is mounted at `/api/v1/tts`.  It exposes Studio
as an external TTS service ("Studio as a TTS gateway").

- OpenAPI docs available at `/api/v1/tts/docs`.
- All requests are guarded by `verify_api_key` + `rate_limit`
  (`app/core/security.py`).
- Requests are submitted as `ApiSynthesisTask`s through the orchestrator, not
  dispatched directly to the TTS Server.
- Priority relative to Studio-originated jobs is controlled by
  `TTS_API_PRIORITY` (see [queue-jobs.md §6](queue-jobs.md)).

---

## 9. Ownership Split

These three ownership boundaries MUST NOT bleed into each other:

| Owner | Owns |
|---|---|
| **Orchestrator** (`app/orchestration/scheduler/orchestrator.py`) | Job lifecycle: submit, cancel, recover, dispatch, progress publication |
| **Watchdog** (`app/engines/watchdog.py`) | TTS Server process lifecycle: spawn, heartbeat, restart |
| **VoiceBridge** (`app/engines/bridge.py`) | Engine routing: which engine handles which synthesis request |

Examples of violations (MUST NOT occur):

- Watchdog cancelling or re-queuing jobs.
- Orchestrator spawning or restarting the TTS Server process.
- VoiceBridge making retry decisions that belong to the watchdog.
- Queue/route code branching on engine IDs for core behavior.

**Not a violation — manifest-driven marker resolution (W-MIX W1):** for a mixed /
multi-group render the orchestrator resolves timing/progress markers from the
**active render-group's declared engine** (`group["engine"]` → that engine's
manifest markers, via `app/engines/behavior.match_timing_marker` /
`parse_engine_progress`), and the mixed handler emits a bracketed
`[ENGINE_ACTIVITY_STARTED]` marker before each group's bridge call. This reads
the engine from data + manifest, not a hardcoded `if engine_id == ...` branch, so
the no-branch rule holds. The watchdog and VoiceBridge remain ignorant of
model-load semantics — no new ownership boundary is introduced.

---

## 10. Import-Time Side Effect Ban

Importing any Studio module MUST NOT:

- Start threads or background tasks.
- Register event listeners or callbacks.
- Mutate global settings or configuration.
- Reconcile or snapshot state.

All such side effects belong behind the explicit boot sequence in
`app/core/boot.py`.  This rule enables safe test isolation (modules can be
imported in tests without triggering real I/O or threads) and prevents
accidental ordering dependencies between imports.

---

## 11. Invariants

**MUST:**

- I1. The TTS Server MUST be started only from `boot_tts_server()` via the watchdog.
- I2. Synthesis requests from Studio MUST route through `VoiceBridge` → `bridge_remote.py` → `tts_client.py`; no code path MUST bypass this chain.
- I3. The boot sequence MUST snapshot recoverable task contexts (step 4) before clearing stuck jobs (step 5).
- I4. `app/db/__init__.py` MUST only run migrations when called explicitly; auto-migration on import is forbidden.
- I5. Plugin manifests MUST declare an explicit `studio_tts_manifest` version (currently `"1.0"`) that is validated at load time.
- I6. Plugin IDs MUST match `^tts_[a-z][a-z0-9]{1,14}$`.
- I7. Engine metadata MUST be sourced from the TTS Server's `GET /engines` endpoint and cached in `app/engines/registry.py`.

**MUST NOT:**

- I8. Importing any Studio module MUST NOT start threads, register listeners, mutate settings, or reconcile state.
- I9. Core code (queue, routes, orchestrator) MUST NOT branch on engine IDs for core behavior.
- I10. The watchdog MUST NOT make decisions about job lifecycle (cancel, re-queue).
- I11. The orchestrator MUST NOT spawn, monitor, or restart the TTS Server process.
- I12. New Studio 2.0 modules MUST NOT import `app.api.web` or the `app.jobs` worker loop directly.
- I13. `boot_studio()` MUST NOT host destructive or expensive-at-scale reconciliation. Boot side effects re-run on every `uvicorn --reload` restart (the dev default), so a destructive sweep placed there fires on routine source edits. Such work belongs on an explicit on-demand trigger (e.g. segment-orphan GC runs per-book on `GET /api/projects/{id}`). See [ADR-0013](../decisions/ADR-0013-segment-orphan-reconciliation.md); refines [ADR-0006](../decisions/ADR-0006-explicit-boot-sequence.md).

---

## 12. Known Gaps

**G1 — Circuit breaker parameters not yet configurable.** The watchdog circuit
breaker threshold (N failures) is currently hardcoded. A future revision should
expose `TTS_WATCHDOG_MAX_FAILURES` and `TTS_WATCHDOG_FAILURE_WINDOW_SECONDS`
as env vars. **post-v1**

**G2 — No formal TTS Server API contract spec.** The routes exposed by
`app/tts_server/server.py` (`/health`, `/synthesize`, etc.) are implemented but
not documented in a versioned spec. A companion spec for the TTS Server HTTP
API should be written when the plugin SDK is stabilized. **post-v1**
