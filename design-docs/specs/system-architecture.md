# SP9 — System Architecture Spec

```
spec_version: 1.7.2
status: active
created: 2026-06-10
updated: 2026-07-14
sources: run.py, tts_server.py, app/api/web.py, app/core/boot.py,
         app/engines/watchdog.py, app/engines/bridge.py,
         app/engines/bridge_remote.py, app/engines/tts_client.py,
         app/tts_server/plugin_loader.py, app/orchestration/scheduler/orchestrator.py,
         app/orchestration/scheduler/resources.py, app/orchestration/tasks/synthesis.py,
         app/db/state_settings.py, app/api/routers/engines.py, tts_engines/*/manifest.json,
         tts_engines/tts_xtts/plugin/core/warm_worker.py
```

> **TL;DR:** Studio runs as two processes — a main FastAPI app and a managed TTS Server subprocess — with a strict ownership split between the orchestrator (job lifecycle), watchdog (server process lifecycle), and VoiceBridge (engine routing).

## Changelog

| Version | Date       | Summary                                                    |
| 1.7.2   | 2026-07-14 | Mixed-handler marker set gains `[SEGMENT_ENGINE_SAMPLE] {segment_id} {engine} {chars} {duration_seconds}`, emitted per group after INV-3 artifact validation, so the orchestrator can attribute render-performance samples to the group's real engine instead of the `"mixed"` container label. Full contract in `queue-jobs.md` §Changelog 1.12.2. |
|---------|------------|------------------------------------------------------------|
| 1.7.1   | 2026-07-14 | **XTTS manifest ceiling raised `2 → 8` (owner directive).** `tts_engines/tts_xtts/manifest.json`'s `behavior.max_concurrent_workers` moved from 2 to 8, matching the `MAX_GLOBAL_CONCURRENT_SYNTHESIS` backstop and the Settings → General "Parallel Segment Rendering" slider's max. Rationale: the manifest ceiling was silently clamping the user-facing `tts_parallel_cap` setting (`effective_cap = min(requested, manifest_max)`) with no error/warning surfaced in the UI — the owner's own hardware (VRAM headroom) should be the deciding factor for how many concurrent XTTS warm workers to run, not an author-set ceiling baked into the plugin. The global backstop (env-overridable via `MAX_GLOBAL_CONCURRENT_SYNTHESIS`) remains the only enforced safety limit; each additional concurrent XTTS warm worker loads its own model copy into VRAM (~`resource.vram_mb` per worker, declared 4000 MB), so raising `tts_parallel_cap` above what the GPU can hold risks OOM — this is now the user's own tradeoff to explore, not a hard-blocked one. Dynamic VRAM/CPU-aware auto-throttling (drop concurrency live if VRAM pressure rises) was discussed and explicitly deferred as future scope, not implemented here. Voxtral/Mixed remain pinned to `max_concurrent_workers: 1` in their own manifests — unchanged, since those engines' sequential constraint is not the same class of "arbitrary ceiling" (Voxtral is a remote API, Mixed's worker is not verified concurrency-safe). |
| 1.7.0   | 2026-07-11 | **W-PAR task 014 — live per-engine cap admission (§3.1b) + `GET`/`PUT /api/engines/{engine_id}/concurrency`.** `ResourceClaim.cap` now means the manifest ceiling everywhere (structural, grown only via `ensure_min_cap`); a new `manifest_max` field carries the same value alongside it. `EngineClassSemaphore.try_acquire` gained an optional `limit` parameter — the *live*, settings-driven admission limit, resolved fresh via `cap_settings.resolve_effective_cap` on every `reserve_task_resources` call (not baked into the claim at task-construction time as before). This closes the gap where changing `tts_parallel_cap`/`tts_engine_caps` had no effect on already-queued/in-flight work until a restart: a shrink now blocks new admissions within one retry cycle (~1s orchestrator loop / ~0.5s per-child segment loop) without evicting in-flight tasks (`release()` never consulted cap, unchanged); a raise takes effect on the very next admission attempt. `ensure_min_cap`'s grow-only behavior is untouched — it only ever sees the stable manifest ceiling now, never a live value, so there is nothing for it to regrow. New `GET /api/engines/concurrency` (global cap + per-engine manifest/requested/effective/active snapshot) and `PUT /api/engines/{engine_id}/concurrency` (`{"cap": <int>|null}`, 422 on out-of-range) in `app/api/routers/engines.py`; writes go through a new single-key-merge `state_settings.set_engine_cap` (avoids two engines' overrides clobbering each other via a whole-`tts_engine_caps`-object replace). Per-child segment dispatch (`segment_synthesis.py`'s `SegmentSynthesisTask.run()`) already calls `reserve_task_resources` individually per child — traced and confirmed this session — so the live-limit mechanism reaches already-fanned-out chapter segments, not just the top-level orchestrator submit path. |
| 1.6.2   | 2026-07-06 | Doc-only fix: §3.1's "Ships dark: at `cap=1` (today's default for all manifests)" sentence was stale relative to the 1.6.1 changelog entry it sits below — the global default cap is 2 (`cap_settings.DEFAULT_GLOBAL_CAP`) and XTTS's manifest ceiling is 2, so XTTS already runs 2 concurrent warm workers by default; Voxtral/Mixed remain pinned to 1 via their own manifest `max_concurrent_workers`. No behavior change, drift-correction only. |
| 1.6.1   | 2026-07-05 | **§3.1a — parallel-cap default raised `1 → 2` (owner directive, supersedes the 1.6.0 "ships dark" default).** `cap_settings.DEFAULT_GLOBAL_CAP` and the `tts_parallel_cap` default materialized by `state_settings.py` both moved from 1 to 2; `effective_cap = min(2, manifest_max)` per engine, so only XTTS (`max_concurrent_workers: 2`) is affected — Voxtral/Mixed stay sequential via their own manifest ceiling of 1. Full rationale and changelog in `queue-jobs.md` §7.3b / 1.11.5. |
| 1.6.0   | 2026-07-03 | **W-PAR task 007 — cap toggle as a Studio setting (§3.1a) + per-engine-id admission ceiling.** The orchestrator-side effective cap now comes from `cap_settings.resolve_effective_cap(engine_id, manifest_max)`, clamping the `tts_parallel_cap` / `tts_engine_caps` settings (env-fallback `TTS_PARALLEL_CAP` / `TTS_ENGINE_CAPS`) to the manifest ceiling — default stays 1 (ships dark). `resources.py` gained an independent per-`engine_id` semaphore checked alongside the per-`engine_class` gate whenever a claim declares `engine_id`, closing the latent "grow-only class semaphore shared by two same-class engine_ids" gap (folded-in Fable merge-gate finding; not observable today). No change to the orchestrator ↔ watchdog ↔ VoiceBridge ownership split or the server-side warm-worker pool (§3.1). |
| 1.5.0   | 2026-06-26 | **W-PAR task 004 — TTS-server concurrent inference model.** The `/synthesize` endpoint is `async def` and wraps the engine call in `run_in_threadpool` (Starlette) so the ASGI event loop is never tied up during inference. Note: FastAPI already offloads sync handlers to anyio's threadpool, so this was not fixing a loop-blocking bug — it makes the offload explicit and is the idiomatic form. The **real** per-engine serialization point was the single XTTS warm-worker subprocess. `WarmWorkerManager` now holds a **bounded, lazy-spawned pool** of up to `cap` `WarmWorker` subprocess instances (free-list queue); `cap = behavior.max_concurrent_workers` from the engine manifest (task 001). Each subprocess handles one job at a time (pipe-safety); the pool's free-list is the concurrency bound. The N-th worker is spawned only on demand; on OOM/spawn failure the effective cap degrades to the live pool size (fail-safe, no crash). Cloud engines (Voxtral) have no warm worker and no serialization lock — concurrency is bounded only by the remote API rate limit. **Ships dark:** at cap=1 (default for all manifests today) behavior is byte-identical to the prior single-worker model. Complements the orchestrator-side per-engine semaphore (task 001, `resources.py`) — both enforcement points read the same manifest cap. Pool sizing is driven entirely by `manifest.behavior.max_concurrent_workers`; no engine-ID branching (INV-5). Residual: `WarmWorkerManager._acquire_worker` blocking `free_q.get()` can hang if all pooled workers die while a waiter holds — dormant at cap=1, deferred to task 005. |
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

### 3.1 Concurrent Inference Model (W-PAR 004)

The `/synthesize` endpoint is `async def` and wraps the blocking engine call
via `await run_in_threadpool(plugin.engine.synthesize, req)` (Starlette's
`starlette.concurrency.run_in_threadpool`).  This is the idiomatic explicit
form — FastAPI already offloads synchronous route handlers to anyio's
threadpool, so this is not fixing a loop-blocking bug, but it makes the
offload visible and improves threadpool utilization under concurrent load.

The **real** per-engine serialization point is the warm-worker subprocess
pool.  `WarmWorkerManager` (XTTS plugin,
`tts_engines/tts_xtts/plugin/core/warm_worker.py`) maintains a **bounded,
lazy-spawned pool** of `WarmWorker` subprocess instances:

- **Pool size:** up to `cap` instances, where `cap =
  manifest.behavior.max_concurrent_workers` (declared by the engine manifest,
  set by task 001).
- **Free-list queue:** workers are checked out from an internal `queue.Queue`
  (`free_q`).  Each subprocess handles exactly one job at a time (pipe-safety);
  the free-list is the effective concurrency bound.
- **Lazy spawn:** the first worker is started at `WarmWorkerManager` init; the
  N-th is spawned only when a concurrent request arrives and all existing
  workers are busy.  Workers are never pre-spawned up to `cap` at startup.
- **OOM / spawn failure (fail-safe):** if spawning the N-th worker raises
  `MemoryError` or the subprocess exits immediately, a warning is logged and
  the effective cap degrades to the current live pool size.  The pending request
  waits for a free worker; no render crash; no unhandled exception propagates.

**Cloud engines (Voxtral)** have no warm worker and no serialization lock.
Concurrency is bounded only by the remote API rate limit — the server endpoint
imposes no additional serialization.

**No longer ships dark for XTTS as of 1.6.1:** the global default cap is now 2
(`cap_settings.DEFAULT_GLOBAL_CAP`), and as of 1.7.1 the XTTS manifest declares
`max_concurrent_workers: 8` (raised from 2 — see the 1.7.1 changelog entry),
so `effective_cap = min(requested, 8)` where `requested` is the user's own
`tts_parallel_cap`/`tts_engine_caps["xtts"]` setting (default still 2, user-
raisable up to the `MAX_GLOBAL_CONCURRENT_SYNTHESIS` backstop of 8). The
manifest is no longer the binding ceiling for XTTS in practice — the user's
own hardware headroom is. Voxtral and Mixed still declare
`max_concurrent_workers: 1` in their own manifests, so they stay pinned to
the prior single-worker/`threading.Lock`-equivalent behavior regardless of
the global cap. See the 1.6.1 and 1.7.1 changelog entries above and
`queue-jobs.md` §7.3b.

**Two enforcement points:** this server-side pool complements the
orchestrator-side per-engine semaphore (task 001,
`app/orchestration/scheduler/resources.py`).  Both read
`manifest.behavior.max_concurrent_workers`.  The orchestrator throttles
**dispatch** (how many segments are sent to the server concurrently); the
server throttles **inference** (how many the server actually runs at once).

**Residual (task 005):** `WarmWorkerManager._acquire_worker`'s blocking
`free_q.get()` can hang if all pooled workers die while an acquirer waits.
This is dormant at cap=1 (single-flight) and is owned by task 005's
stuck-segment / cancel invariants.

Pool/semaphore sizing is driven entirely by `manifest.behavior.max_concurrent_workers`
— no engine-ID branching anywhere in the server or manager code (INV-5).

### 3.1a Parallel-cap toggle + per-engine-id ceiling (W-PAR task 007)

The orchestrator-side cap fed to `resources.py`'s per-engine-class semaphore
(§3.1's "two enforcement points") is no longer the raw manifest value — it is
`app.orchestration.scheduler.cap_settings.resolve_effective_cap(engine_id,
manifest_max)`, which clamps a real Studio setting (`tts_parallel_cap` /
`tts_engine_caps`, env-fallback `TTS_PARALLEL_CAP` / `TTS_ENGINE_CAPS`) to the
manifest ceiling. **Default raised `1 → 2` (2026-07-05, see `queue-jobs.md`
§7.3b changelog 1.11.5):** parallel rendering ships as the default now;
`effective_cap` is `min(2, manifest_max)` per engine. Adjusting it is an
operator action — the Settings page's "Parallel Segment Rendering" toggle
(General → Core Synthesis Defaults) or the Settings API — never a manifest
edit or an env var on a running install. The
**server-side** warm-worker pool (this section) is unaffected — the two
enforcement points still read the same effective number, they just get it via
one more layer of settings resolution on the orchestrator side.

`resources.py` also gained an **independent per-`engine_id` admission
ceiling** (`get_engine_id_semaphore`), checked alongside the existing
per-`engine_class` semaphore whenever a claim declares `engine_id`. This
closes a latent gap in the class semaphore's grow-only sizing: two different
`engine_id`s sharing one `engine_class` (not possible today — only XTTS is
`"gpu"`-class) could otherwise silently share whichever cap was requested
largest. See `queue-jobs.md §7.4a` for the full contract; this does not change
the orchestrator ↔ watchdog ↔ VoiceBridge ownership split — admission is
still entirely `resources.py`'s responsibility.

### 3.1b Live cap admission — settings changes reach already-queued work (W-PAR task 014)

Before this task, §3.1a's `resolve_effective_cap` result was baked into
`ResourceClaim.cap` once, at task-construction time (`_manifest_resource_claim`).
`EngineClassSemaphore` is grow-only by design (§3.1a), so a cap *raise* mid-run
never took effect for already-constructed claims, and a cap *lower* never
throttled anything already queued — either change required a process restart.

**Structural ceiling vs. live limit, split apart:**

- `ResourceClaim.cap` (and the new `ResourceClaim.manifest_max` field, same
  value) is now purely the **structural ceiling** — the manifest's declared
  `behavior.max_concurrent_workers`. `EngineClassSemaphore`s and the
  per-`engine_id` semaphores are only ever grown to this value via
  `ensure_min_cap`, exactly as before — `ensure_min_cap` never sees a live
  setting value, so there is nothing for a settings change to accidentally
  regrow.
- `EngineClassSemaphore.try_acquire(task_id, limit=None)` gained the optional
  `limit` parameter — the **live limit**. When passed, the admission
  threshold for that one call is `min(self._cap, limit)`; the semaphore's own
  `_cap` is never mutated. `reserve_task_resources` resolves this value fresh,
  on every single call, via `cap_settings.resolve_effective_cap(engine_id,
  manifest_max)` — i.e. the exact same current-settings read §3.1a already
  used, just no longer cached in the claim.
- `release_task_resources` is unchanged — releases were already unconditional
  (never consulted `cap`), so shrinking the live limit never evicts an
  in-flight task; it only blocks the *next* admission attempt until the
  active count drops below the new limit.

**Why this reaches already-queued work without a restart:** both the
top-level orchestrator (`orchestrator.py`'s `submit()`, ~1s retry loop on
denial) and per-child segment dispatch (`segment_synthesis.py`'s
`SegmentSynthesisTask.run()`, ~0.5s retry loop on denial — confirmed this
session to call `reserve_task_resources` **individually per child**, not
sharing one parent-level reservation) re-enter `reserve_task_resources` with
the same claim on every retry. Because the live limit is resolved fresh each
time rather than read once from a frozen claim, a settings write becomes
visible to every currently-waiting task within one retry cycle.

**New API surface:** `GET /api/engines/concurrency` returns the global cap
plus a per-engine snapshot (`engine_id`, `engine_class`, `manifest_max`,
`requested_cap`, `effective_cap`, `active_count`); `PUT
/api/engines/{engine_id}/concurrency` (body `{"cap": <int>|null}`) sets or
clears a per-engine override, validated server-side against the manifest
ceiling (HTTP 422 on out-of-range rather than silent clamping — the
`resolve_effective_cap` clamp remains the backstop for env-var edits or
direct settings writes). Writes go through
`app.db.state_settings.set_engine_cap`, a single-key read-merge-write under
the settings lock — a raw whole-object `update_settings({"tts_engine_caps":
{...}})` write would silently clobber a concurrent write to a *different*
engine's override; `set_engine_cap` merges just the one key.

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

Engine plugins live in `tts_engines/` and are loaded inside the TTS Server process
by `app/tts_server/plugin_loader.py`.

Each plugin is a self-contained directory:

```
tts_engines/tts_<id>/
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

Same principle applies to render-performance attribution: `render_one_group`
also emits `[SEGMENT_ENGINE_SAMPLE] {segment_id} {engine} {chars}
{duration_seconds}` (four whitespace-separated tokens, after the group's
INV-3 artifact validation passes) so the orchestrator can attribute each
group's render time to its own real, manifest-declared engine instead of the
job-level `"mixed"` container label. See `queue-jobs.md` §Changelog 1.12.2
for the full contract — "mixed" itself never records a calibration sample.

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
