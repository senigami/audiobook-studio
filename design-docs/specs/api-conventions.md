# API Conventions

```
spec_version: 1.1.0
status: active
updated: 2026-06-23
sources:
  - app/api/web.py
  - app/api/tts_api.py
  - app/api/ws.py
  - app/core/security.py
  - app/utils/pathing.py
  - app/api/routers/
  - frontend/src/api/index.ts
```

> **TL;DR:** All Studio endpoints live under `/api`, follow a consistent JSON contract with typed error shapes, and treat every path derived from user input as untrusted.

## Changelog

| Version | Date       | Change             |
|---------|------------|--------------------|
| 1.1.0   | 2026-06-23 | Add § Live reads & caching (mutable read endpoints MUST bypass the browser HTTP cache via `cache: 'no-store'`); document that `GET /api/projects/{id}` schedules the per-book segment-orphan GC via `BackgroundTasks` |
| 1.0.1   | 2026-06-16 | WebSocket endpoint source corrected to `app/api/web.py:209` (`ws.py` holds connection manager/broadcast helpers only) |
| 1.0.0   | 2026-06-10 | Initial canonical spec |

---

## REST Conventions

| Rule | Value |
|------|-------|
| URL prefix | `/api` for all Studio endpoints |
| ID format | UUIDs (project IDs, chapter IDs, job IDs) |
| Timestamps | `float` — unix epoch seconds (REAL in SQLite) |
| Request body | `Content-Type: application/json` |
| File uploads | `multipart/form-data` |
| Success shape | Domain-specific; always a JSON object |

---

## Error Response Shape

All error responses follow a single envelope:

```json
{
  "status": "error",
  "message": "Human-readable description"
}
```

| Error class | Behavior |
|-------------|----------|
| `AnalysisError` | `status_code` from exception; body = `{"status": "error", "message": exc.message}` |
| `HTTPException` | FastAPI default shape |

Error messages MUST NOT include exception class names, stack traces, or internal path fragments. See the security note in `app/api/web.py`.

---

## Live reads & caching

GET endpoints that return **live, mutable render state** MUST NOT be served from the browser HTTP cache. They carry no cache validators (`ETag`/`Last-Modified`) and no `Cache-Control`, so on soft (in-app) navigation a browser will replay a stale earlier response — e.g. a `script-view` payload captured while segments were rendered will paint a stale "rendered" prefix even though the server now reports `draft`. The client MUST request these with `{ cache: 'no-store' }` (see `frontend/src/api/index.ts`):

| Endpoint | Reason |
|----------|--------|
| `/api/chapters/{id}/script-view` | per-segment render status; changes on every render/reset |
| `/api/chapters/{id}/segments` | per-segment audio state |
| `/api/projects/{pid}/chapters/{cid}/render_groups` | render-group composition/count |

Rule: a hard reload (which bypasses the HTTP cache) and a soft navigation MUST yield the same data. If they differ, a mutable read is being cached — add `no-store`.

**Side effect on book open:** `GET /api/projects/{project_id}` schedules the per-book segment-orphan GC (`reconcile_orphan_segment_files_for_project`) via FastAPI `BackgroundTasks` — after the response is sent, so it adds no latency. This is the on-demand reconciliation hook (see [data-model.md § Segment audio artifacts](data-model.md#segment-audio-artifacts--orphan-reconciliation), [ADR-0013](../decisions/ADR-0013-segment-orphan-reconciliation.md)); it is deliberately NOT a boot-time library-wide sweep.

---

## Router Domains

| Prefix | Domain |
|--------|--------|
| `/api/projects` | Project CRUD, chapter reordering, assembly, backup |
| `/api/chapters` | Chapter CRUD, segments, exports, script-view |
| `/api/speaker-profiles` | Voice profile management |
| `/api/speakers` | Speaker management |
| `/api/voices` | Voice management |
| `/api/processing_queue` | Queue management |
| `/api/generation` | Synthesis submission, pause/resume/cancel |
| `/api/engines` | Engine management, plugin import, verification |
| `/api/system` | Settings, stats reset, TTS server restart |
| `/api/migration` | Legacy data import |

---

## Authentication

Authentication applies **only** to the external TTS API sub-app mounted at `/api/v1/tts`. The main Studio API has no authentication — it is local-only.

### External TTS API (`/api/v1/tts`)

| Condition | Behavior |
|-----------|----------|
| `tts_api_enabled` = `false` | 403 Forbidden — always, regardless of key |
| `tts_api_key` empty string | Open access (local-only default) |
| `tts_api_key` set | Bearer token required; validated via `hmac.compare_digest()` (timing-safe) |

Dependency: `verify_api_key()` in `app/core/security.py`.

The external TTS API has its own OpenAPI docs at `/api/v1/tts/docs` (separate FastAPI sub-app instance). It MUST NOT share route state with the main Studio API.

### Rate Limiting

`rate_limit()` dependency in `app/core/security.py`:

- Sliding-window: 30 requests per minute per client IP
- Exceeded → 429 Too Many Requests

---

## WebSocket (`/ws`)

Single connection per client. All frames are JSON. The `/ws` endpoint and `jobs_snapshot_request` → `jobs_snapshot` handling live in `app/api/web.py:209`; `app/api/ws.py` holds the connection manager and `broadcast_*` helpers only.

### Incoming frames (client → server)

| `type` | Purpose | Response |
|--------|---------|----------|
| `jobs_snapshot_request` | Request current job state | `jobs_snapshot` frame |

### Outgoing frames (server → client)

| `type` | Class | Notes |
|--------|-------|-------|
| `jobs_snapshot` | Control frame | `{"type": "jobs_snapshot", "jobs": [...]}` — responds to explicit request |
| Studio live events | Domain events | See [live-events.md](live-events.md) for envelope shape |

`jobs_snapshot` is a **control frame** (`eventKind: "control"`), not a domain live event. It MUST NOT be processed by domain event handlers. Frontend MUST NOT poll for snapshots on a timer — hydration is event-driven only.

---

## External TTS API Endpoints

Mounted at `/api/v1/tts`. All routes require `verify_api_key` + `rate_limit`.

### Synthesis

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/synthesize` | Inline for < 500 chars; queued for longer |
| `POST` | `/preview` | Inline only, max 500 chars |

### Engine Discovery

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/engines` | List all registered engines |
| `GET` | `/engines/{id}` | Engine details by ID |

### Job Management

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/jobs/{job_id}` | Job status |
| `GET` | `/jobs/{job_id}/audio` | Download rendered audio |

### Output Formats

Supported: `wav`, `mp3`, `ogg`, `flac`.

The format value MUST be validated against a constant tuple before use. User-supplied format strings MUST NOT flow to the filesystem or subprocess arguments without validation. Invalid format → 400.

---

## Static File Serving

| Mount | Path pattern | Notes |
|-------|-------------|-------|
| React build | `/assets/` | Served from `frontend/dist/assets` |
| Voice samples | `/out/voices/{path}` | Only `sample.mp3` and `sample.wav` — no traversal |
| Project covers | `/projects/{project_id}/cover/{filename}` | Containment-checked |
| M4B audiobooks | `/projects/{project_id}/m4b/{filename}` | `.m4b`, images, metadata sidecars |
| SPA catch-all | `/{full_path}` | → `index.html` |

---

## Path Safety

### Invariant

Any path value derived from request data, DB values, file uploads, or user-editable names is **UNTRUSTED**. It MUST be validated before any filesystem operation.

### Required Helpers (`app/utils/pathing.py`)

| Helper | Use case |
|--------|---------|
| `contained_path()` | General containment check |
| `safe_join()` | Join and verify under a root |
| `secure_join_flat()` | Flat (no subdirectory) join |
| `find_secure_file()` | Locate a file with strict name validation |

These helpers implement: strict name regex → join → `os.path.normpath` → `startswith(base + os.sep)` check.

**MUST NOT** use `Path.resolve()` + `Path.is_relative_to()` as the barrier — this is explicitly disallowed. The `os.path.normpath` + `startswith` pattern is the required implementation.

### Traversal violations

Any path that fails the containment check MUST be **rejected with an error response** (typically 400 or 404). Callers MUST NOT silently normalize traversal attempts.

### CodeQL

The path safety shape is designed to be detectable by CodeQL security scanning. Do not introduce alternative path-joining patterns that bypass the helpers, even if they appear equivalent — CodeQL guards must remain intact.

---

## Plugin Import Security

Engine plugin manifests loaded from user-provided archives MUST be validated for:

- `engine_id` follows the allowed identifier pattern (regex-validated)
- Plugin directory is placed under `PLUGINS_DIR` (barrier enforced by `get_plugin_dir()`)
- No symlinks that escape the plugins root

See `.agent/rules/backend-paths.md` for the full plugin path security contract.

---

## Cross-references

- Job status values and transitions: [queue-jobs.md](queue-jobs.md)
- Live event envelope shape: [live-events.md](live-events.md)
- Data model (DB tables, state.json): [data-model.md](data-model.md)
