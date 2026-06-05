# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Audiobook Studio is a local-first FastAPI + React app that turns manuscripts into audiobooks using AI voice cloning. This branch is the **Studio 2.0** line: synthesis runs through a managed, plugin-based TTS Server subprocess, and background work flows through a task orchestrator rather than the legacy worker loop.

## Read first: agent rules & memory

- **`AGENTS.md`** + **`.agent/rules.md`** are the canonical workflow source. `.agent/rules.md` is a *router*: load the smallest matching rule set from `.agent/rules/` (e.g. `backend-progress.md`, `backend-paths.md`, `frontend-state.md`), and always read `.agent/rules/verification.md` before calling code work complete. (The links inside `.agent/rules.md` use a stale absolute path — read the files from the local `.agent/rules/` dir.)
- **`.agent/rules/modular_architecture.md`** governs Studio 2.0 boundaries and is the most load-bearing rule file. Key constraints:
  - New Studio 2.0 modules must **not** import `app.api.web` (legacy `app.web`) or the `app.jobs` worker loop directly.
  - **Importing a module must not start threads, register listeners, mutate global settings, or reconcile state.** All such side effects belong behind the explicit boot sequence (`app/core/boot.py`).
  - Engine-specific logic lives behind the engine registry + voice bridge. Queue code, routes, and UI must not branch on engine IDs for core behavior.
  - Completion/reuse/recovery decisions use validated artifact metadata, not raw file existence. Shared artifact cache entries are immutable.
- **`Memory/`** is referenced by `AGENTS.md` for durable project context/handoffs but is gitignored (absent in fresh clones). Don't assume it exists; `plans/` holds the committed roadmap and phase docs.
- TDD is expected (`verification.md`): write the failing test first, confirm it fails for the right reason, then implement.

## Commands

Backend commands assume the local `./venv`. CI uses Python 3.11 / Node 20.

```bash
# Backend tests (pytest.ini collects from BOTH tests/ and plugins/; runs --cov=app)
./venv/bin/python -m pytest -q
./venv/bin/python -m pytest tests/api/test_api_queue.py            # one file
./venv/bin/python -m pytest tests/test_api.py::test_home_page      # one test
./venv/bin/python -m pytest plugins/tts_xtts/tests                 # one plugin's suite

# Backend lint (pyproject.toml, line-length 120, E/F/W with many relaxations)
ruff check .

# Frontend (from repo root via -C, or cd frontend)
npm -C frontend run lint          # eslint
npm -C frontend run test -- --run # vitest, single pass (tests live in frontend/tests/)
npm -C frontend run build         # tsc -b && vite build -> frontend/dist

# Run the app (provisions ./venv + ~/xtts-env, builds frontend, launches uvicorn)
./run.sh                          # macOS/Linux; .\run.ps1 on Windows. Serves on :8123
./run.sh --setup-only             # provision without launching
./run.sh --no-reload --port 9000
uvicorn run:app --port 8123       # manual, after ./venv active + frontend built
```

The app serves at `http://127.0.0.1:8123` and serves the built React bundle from `frontend/dist`, so the frontend must be built for the full UI.

### Test isolation

`conftest.py` (repo root) redirects all storage paths to a session temp dir, points `PLUGINS_DIR` at the real `plugins/`, and sets `APP_TEST_MODE=1`. Tests reset state via `app.db.state.clear_all_jobs` and the scheduler gates in `app.orchestration.scheduler.resources`. The conftest aggressively reaps leaked subprocess trees (TTS server, watchers) between runs. Default per-test timeout is 15s (`@pytest.mark.timeout(...)` or `PYTEST_TEST_TIMEOUT_SECONDS`).

## Architecture

### Managed TTS Server + plugins (the defining Studio 2.0 change)

Synthesis no longer spawns a one-shot subprocess per render. Instead a **long-lived TTS Server** runs as a subprocess and Studio talks to it over HTTP:

- **`tts_server.py`** (repo root) is the server entry point. It loads engine plugins, binds a uvicorn app, and prints `READY:{port}` to stdout when accepting connections.
- **`app/engines/watchdog.py`** owns the server *process lifecycle*: spawn, wait for READY, poll `GET /health` on a heartbeat, restart on failure with a circuit breaker. It is started **only** from `boot_tts_server()`.
- **`app/engines/bridge.py`** (`VoiceBridge`) is the single routing point for a voice request; in the Studio 2.0 runtime it always routes over HTTP via `bridge_remote.py` + `tts_client.py`.
- **`app/tts_server/`** is the server-side runtime: `server.py`, `plugin_loader.py` (discovers/validates plugin manifests), `health.py`, `verification.py`, settings stores.
- **`plugins/`** holds self-contained engine plugins (`tts_xtts`, `tts_voxtral`, `synthesis_mixed`). Each is a mini-repo: `manifest.json` (declares `engine_id`, capabilities, `behavior` like `text_chunk_limit` and `progress_pattern`, resource needs), `interface.py` entry class, `plugin/` implementation, and **plugin-local `tests/` + fixtures** (collected by pytest). New engines register via manifest + the standard engine contract — never by adding engine-ID branches in core code.

XTTS still needs its heavy, conflicting deps in a **separate env** at `~/xtts-env` (`requirements-xtts.txt`); `requirements.txt` deliberately excludes them.

### Boot sequence (explicit side effects)

Because import-time side effects are banned, **`app/core/boot.py`** is the one place that wires startup: `boot_studio()` runs DB migrations then `boot_tts_server()` (orphan cleanup + watchdog start). It is idempotent and called from `app/api/web.py`'s `startup_event` (in a background thread so the web server isn't blocked). `app/db/__init__.py` no longer auto-migrates on import — callers invoke migration explicitly.

### Task orchestration (`app/orchestration/`)

Background work flows through `StudioTask`-style abstractions, **not** the legacy `app.jobs` worker loop:

- **`tasks/`** — one module per task type (`synthesis`, `api_synthesis`, `assembly`, `bake`, `export`, `sample_build`, `sample_test`), all deriving from `tasks/base.py` (`StudioTask`, `TaskContext`, `TaskResult`).
- **`scheduler/`** — `orchestrator.py` owns the job execution lifecycle (`submit`/`cancel`/`recover`, dispatch, progress publication) using reconciliation as source of truth; `policies.py` owns queue ordering/fairness (priority modes via `TTS_API_PRIORITY`: `studio_first` default, `equal`, `api_first`); `resources.py` owns resource gates (GPU/exclusive) and pause state; `recovery.py` restores recoverable tasks after restart.
- **`progress/`** — centralized progress math, ETA, reconciliation, and broadcasting. Progress contract (`backend-progress.md`): values rounded to 2 decimals, broadcast only when advancing ≥ 1%.
- Ownership split to preserve: **orchestrator** owns job lifecycle, **watchdog** owns server process lifecycle, **VoiceBridge** owns engine routing — these must not bleed into each other.

### State: `state.json` + SQLite

- **`app/db/state.py`** is a facade over decomposed modules (`state_helpers`, `state_settings`, `state_performance`, `state_jobs`) that own `state.json` — live in-memory job state, settings, and job-listener callbacks (RLock-guarded, atomic writes, corruption-resistant).
- **`app/db/`** owns the SQLite DB (`DB_PATH`, default `audiobook_studio.db`): projects, chapters, segments, characters, speakers, `processing_queue` history, and render `performance` samples.
- Disk/validated-artifact state is the source of truth; reconciliation enforces this on restart.

### Web & API layer (`app/api/`)

- `run.py` exposes `app` via `from app.api.web import app` plus an access-log filter.
- **`app/api/web.py`** mounts static roots, wires `startup_event`/`shutdown_event`, includes domain routers from `app/api/routers/` (`projects`, `chapters`, `voices`, `queue`, `settings`, `generation`, `system`, `analysis`, `jobs`, `migration`, `engines`), and keeps containment-checked file serving (`_contained_root_file`/`_contained_file`) + a catch-all SPA route. Legacy module-global path aliases are kept for tests that monkeypatch them.
- **`app/api/tts_api.py`** mounts a separate FastAPI sub-app at `/api/v1/tts` (own OpenAPI docs at `/api/v1/tts/docs`) — the external "Studio as a TTS gateway" API. It is guarded by `verify_api_key` + `rate_limit` (`app/core/security.py`) and submits `ApiSynthesisTask`s through the orchestrator.
- `app/api/ws.py` manages the `/ws` WebSocket and `broadcast_*` helpers.

### Paths & security (`app/core/`, `app/utils/pathing.py`)

`app/core/config.py` resolves all storage roots from env vars relative to `AUDIOBOOK_BASE_DIR`. Per-project assets live under `projects/<id>/{...}`. Treat any path from request data, DB values, uploads, or user-editable names as **untrusted**: use the `safe_join` / `secure_join_flat` / `find_secure_file` helpers (strict regex → join → normalize → verify-under-root), and reject traversal rather than silently fixing it. See `.agent/rules/backend-paths.md`. CodeQL security scanning runs in CI — keep this shape intact.

### Frontend (`frontend/`)

React 19 + TypeScript + Vite, React Router, Framer Motion. Standard shape under `frontend/src`: app shell/routing in `app/`, route screens in `pages/` (page-owned subcomponents under `pages/<Page>/components/`), cross-page UI in `components/`, plus `hooks/`, `api/`, `store/`, `theme/`, `shared/`, `types/`, `utils/`. Tests live **outside** runtime source under `frontend/tests/` (`unit/`, `e2e/` Playwright, `helpers/`, `setup/`), mirroring the source layout. Canonical entity data comes from API hydration; live queue/progress overlays belong to the frontend store; local editor drafts must not blindly overwrite canonical server state (`.agent/rules/frontend-state.md`).

## Notes

- Files over 500 lines are candidates for splitting; over 600 should be refactored when touched for meaningful changes — along existing boundaries, not mechanically by line count (`modular_architecture.md`).
- `docs/` holds the plugin SDK docs (`plugin-guide.md`, `plugin-submission-guidelines.md`, `plugin-template/`, `studio-as-tts-gateway.md`). `plans/` holds the v2 conversion roadmap and phase delivery plans.
- Top-level `audiobook.py` and `audit_routes.py` are legacy/standalone utilities, not part of the running app. `app.db`/`database.sqlite` at the repo root are empty placeholder files.
- Update `wiki/` pages and add a dated `wiki/Changelog.md` entry when shipped behavior changes. CI (`.github/workflows/ci.yml`) runs ruff + pytest and eslint + vitest + build; `codeql.yml` runs security scanning.
