# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Audiobook Studio is a local-first FastAPI + React app that turns manuscripts into audiobooks using AI voice cloning. The local-default engine is XTTS; Voxtral (Mistral cloud) is optional and opt-in.

## Repository Rules (read first)

The canonical rules live in [`.agent/rules.md`](.agent/rules.md) and `.agent/rules/`. `.cursorrules` points there too. The most load-bearing ones:

- **Two Python environments.** Use the project's `./venv` for all backend tooling. XTTS inference runs in a *separate* env at `~/xtts-env` (see Architecture).
- **Tests evolve with logic.** Update/add tests when behavior changes; never weaken a test to match broken code — fix the logic. Run the relevant suite before considering a task done.
- **Disk is the source of truth.** When UI status and actual files disagree, the files win. Reconciliation logic enforces this at startup.
- **Treat filesystem paths as a security surface.** Any path derived from request data, DB values, uploaded filenames, or user-editable names is untrusted. For existing files prefer enumerating a trusted root and matching by `entry.name`; for new paths use the strict-regex → `os.path.join` → `normpath` → `abspath` → verify-under-root pattern (CodeQL recognizes this shape). Reject traversal input rather than silently fixing it.
- **Docs are part of the change.** Update `wiki/` pages and add a dated `wiki/Changelog.md` entry when shipped behavior changes.
- **Prefer the user's manual verification for UI/UX.** Don't drive a browser unless explicitly asked.

## Commands

All backend commands assume the local venv. CI uses Python 3.11 / Node 20.

```bash
# Backend tests (pytest config in pytest.ini; runs with --cov=app)
./venv/bin/python -m pytest -q
./venv/bin/python -m pytest tests/test_api_queue.py            # one file
./venv/bin/python -m pytest tests/test_api.py::test_home_page  # one test

# Backend lint (config in pyproject.toml, line-length 120, many rules relaxed)
ruff check .

# Frontend (run from repo root via -C, or cd frontend)
npm -C frontend run lint
npm -C frontend run test -- --run     # vitest, single pass
npm -C frontend run build             # tsc -b && vite build -> frontend/dist

# Run the app (recommended: handles both venvs + frontend build + XTTS env)
./run.sh                              # macOS/Linux; .\run.ps1 on Windows
./run.sh --setup-only                 # provision envs without launching
uvicorn run:app --port 8123           # manual, after ./venv is active and frontend built
```

The app serves at `http://127.0.0.1:8123`. The FastAPI server serves the built React bundle from `frontend/dist`, so the frontend must be built for the full UI to load.

### Test isolation

`tests/conftest.py` redirects every storage path to a session temp dir and sets `APP_TEST_MODE=1`, which **disables auto-starting the worker threads**. Tests that need workers must call `app.jobs.ensure_workers()` explicitly after the temp DB/schema are ready. Default per-test timeout is 15s (override with the `@pytest.mark.timeout(seconds=...)` marker or `PYTEST_TEST_TIMEOUT_SECONDS`).

## Architecture

### Two-process synthesis model

XTTS (Coqui TTS) has heavy, conflicting dependencies, so it is **never imported into the web server process**. Instead:

- The main app (`./venv`) runs FastAPI, the job queue, and the React build.
- `app/xtts_inference.py` is a standalone script executed as a subprocess using the interpreter at `XTTS_ENV_PYTHON` (`~/xtts-env/bin/python`), with `requirements-xtts.txt` installed.
- `app/engines.py` spawns that subprocess, streams its stdout line-by-line into progress callbacks, and owns process lifecycle (`terminate_all_subprocesses` runs on shutdown). `app/engines_voxtral.py` is the parallel path for the optional Voxtral cloud engine.

`requirements.txt` deliberately excludes XTTS deps; `pyproject.toml` omits `app/xtts_inference.py` from coverage for the same reason.

### Dual state: `state.json` + SQLite

There are two stores, and the split matters:

- **`app/state.py`** owns `state.json` — the *live, in-memory* job state and app settings. It is RLock-guarded with atomic writes, corruption-resistant (backs up to `state.json.corrupt` and resets on parse failure), and holds job-listener callbacks. Terminal jobs (`done`/`failed`/`cancelled`) are pruned from `state.json` once their final broadcast lands; only the most recent ~50 are kept.
- **`app/db/`** owns the SQLite DB (path from `DB_PATH` env, default `audiobook_studio.db`) — the *persistent* record: projects, chapters, segments, characters, speakers, and the `processing_queue` history. `app/db/__init__.py` runs `migrate_state_json_to_db()` on import.

`update_job()` in `state.py` is the bridge: it applies status/progress-regression guards, mirrors terminal-state changes into the SQLite `processing_queue` (probing real audio duration via ffprobe), and fans out to WebSocket listeners. **When a worker thread mutates a job (`j`) object directly, it must follow up with `update_job(...)` or the WebSocket bridge and DB never see the change.**

### Background jobs (`app/jobs/`)

- Two daemon worker threads drain two `queue.Queue`s: `job_queue` (synthesis) and `assembly_queue` (audiobook stitching). Started lazily by `ensure_workers()`.
- `worker_loop` (`app/jobs/worker.py`) is the core: estimates ETA, computes resume progress for partially-rendered chapters, parses the subprocess's stdout sentinels (`[START_SYNTHESIS]`, `[START_SEGMENT]`, `[PROGRESS] N%`), and dispatches by `job.engine` to a handler in `app/jobs/handlers/` (`xtts`, `voxtral`, `mixed`, `audiobook`).
- Progress contract (from backend rules): broadcast values are **rounded to 2 decimals** and only emitted when progress advances **≥ 1%**.
- `app/jobs/reconcile.py` and `app/db/reconcile.py` clear stale/ghost job and chapter statuses against actual files at startup (see `app/web.py` `startup_event`). XTTS auto-tunes its chars-per-second estimate (`xtts_cps`) into `performance_metrics` after each run.

### Web layer (`app/web.py` + `app/api/`)

- `run.py` exposes `app` (just `from app.web import app` plus an access-log filter). `app/web.py` mounts static roots, wires lifecycle (DB init, reconciliation, job-listener registration, pause-state restore), and includes routers.
- `app/api/routers/` holds the REST endpoints split by domain: `projects`, `chapters`, `voices`, `queue`, `settings`, `generation`, `system`, `analysis`, `jobs`, `migration`.
- `app/api/ws.py` manages the `/ws` WebSocket connection manager and `broadcast_*` helpers.
- `app/web.py` keeps a block of **legacy route aliases** (`/upload`, `/queue/*`, `/api/chapter/*`, etc.) plus a `sync_config_middleware` that re-pushes config paths into modules — both exist so older tests/clients that monkeypatch module-level path globals keep working. Don't remove these casually.
- Files are served only through containment-checked helpers (`_contained_root_file`, `_contained_file`); a catch-all route serves the React SPA for non-API paths.

### Paths & projects (`app/config.py`)

All storage roots are overridable via env vars and resolved relative to `AUDIOBOOK_BASE_DIR`. Per-project assets live under `projects/<id>/{audio,text,m4b,cover,trash}`, accessed through the `get_project_*_dir` / `find_existing_project_*` helpers, which canonicalize the project id (UUID or `SAFE_PROJECT_ID_RE`) and enforce containment. New installs default loose chapter text to `chapters/`; older `chapters_out/` workspaces are still honored.

### Frontend (`frontend/`)

React 19 + TypeScript + Vite, React Router, Framer Motion, Tailwind-style theming via CSS variables. Structure: `components/` (each with a colocated `*.test.tsx`), `hooks/` (data/queue/websocket logic, e.g. `useJobs`, `useWebSocket`, `useInitialData`), `api/` (typed fetch wrappers), `types/`, `utils/`. The `useWebSocket`/`useJobs` hooks consume the `/ws` job/progress broadcasts. Frontend interaction conventions (active = `var(--accent)`, hover = `var(--accent-glow)`, theme variables over hardcoded colors) are in `.agent/rules/frontend.md`.

## Notes

- Top-level scripts `audiobook.py`, `merge.py`, `scrape.py`, `urls.py`, and `_app.py` are **legacy/standalone reference utilities**, not part of the running app (the app uses `app/engines.py` instead of `audiobook.py`). `app.db`/`database.sqlite` at the repo root are empty placeholder DB files.
- Contributions to the upstream repo go through the fork + PR workflow in `CONTRIBUTING.md` (squash-merged). In this environment, develop on the assigned branch.
- CI (`.github/workflows/ci.yml`) runs ruff + pytest (backend) and eslint + vitest + build (frontend); PRs require the full suites. `codeql.yml` runs security scanning — keep the path-safety pattern above intact to avoid regressions.
