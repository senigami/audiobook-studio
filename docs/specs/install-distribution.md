# Install & Distribution

```
spec_version: 1.0.0
status: active
sources:
  - run.sh
  - run.ps1
  - requirements.txt
  - requirements-xtts.txt
  - app/core/config.py
  - frontend/vite.config.ts
  - plans/final_release/16_pinokio_distribution.md
```

> **TL;DR:** `./run.sh` provisions both Python envs, builds the frontend, and launches uvicorn on port 8123; the Pinokio wrapper handles end-user distribution and optional demo restore.

## Changelog

| Version | Date       | Change                 |
|---------|------------|------------------------|
| 1.0.0   | 2026-06-10 | Initial canonical spec |

---

## Quick Start

```bash
./run.sh               # macOS / Linux — provision + launch
.\run.ps1              # Windows
./run.sh --setup-only  # provision without launching
```

The app is available at `http://127.0.0.1:8123` after launch.

---

## run.sh / run.ps1

### What it does

| Step | Detail |
|------|--------|
| 1. Provision `./venv` | Python 3.11; installs `requirements.txt` |
| 2. Provision `~/xtts-env` | Python 3.11; installs `requirements-xtts.txt` |
| 3. Build frontend | `npm -C frontend run build` → `frontend/dist` |
| 4. Launch uvicorn | `uvicorn run:app --port 8123` (default) |

### Flags

| Flag | Behavior |
|------|----------|
| `--setup-only` | Run steps 1–3 only; do not launch uvicorn |
| `--no-reload` | Disable uvicorn auto-reload (recommended for production) |
| `--port <n>` | Override the default port (8123) |

### Invariants

- MUST provision both `./venv` and `~/xtts-env`; skipping either leaves the XTTS engine non-functional.
- Frontend MUST be built before launch; the SPA catch-all in `app/api/web.py` serves from `frontend/dist` and will 404 on missing assets.
- MUST NOT require the user to run any manual steps beyond `./run.sh` for a functional first install.

---

## Python / Node Requirements

| Runtime | Required version |
|---------|-----------------|
| Python  | 3.11 (CI-tested) |
| Node    | 20 (CI-tested)   |
| Backend invocation | `./venv/bin/python` |

---

## XTTS Separate Environment

XTTS has dependency conflicts with the core Studio requirements. It lives in a dedicated virtualenv.

| Attribute | Value |
|-----------|-------|
| Location | `~/xtts-env` (`$HOME/xtts-env`) |
| Requirements file | `requirements-xtts.txt` |
| Core requirements file | `requirements.txt` (deliberately excludes XTTS deps) |
| Provisioned by | `./run.sh` (both envs in one command) |

### Invariants

- MUST NOT add XTTS deps to `requirements.txt`; they conflict with Studio's core deps.
- The XTTS plugin MUST detect and use `~/xtts-env` at runtime, not `./venv`.
- Removing `~/xtts-env` must not break Studio startup — the XTTS engine will be unavailable but Studio MUST still boot.

---

## Environment Variables

All storage roots are resolved from env vars relative to `AUDIOBOOK_BASE_DIR` in `app/core/config.py`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `AUDIOBOOK_BASE_DIR` | Parent of `app/` | Root for all storage paths |
| `UPLOAD_DIR` | `BASE_DIR/uploads` | User file uploads |
| `VOICES_DIR` | `BASE_DIR/voices` | Voice profiles and samples |
| `PROJECTS_DIR` | `BASE_DIR/projects` | User projects |
| `TRANSIENT_DIR` | `BASE_DIR/transient` | Temporary working files |
| `PLUGINS_DIR` | `BASE_DIR/plugins` | TTS plugin bundles |
| `PLUGIN_DATA_DIR` | `BASE_DIR/plugin_data` | Plugin persistent data |
| `STUDIO_RECOVER_ON_STARTUP` | `"1"` | Re-submit interrupted tasks on restart; set `"0"` to disable |
| `APP_TEST_MODE` | unset | Set to `"1"` in tests; redirects all storage to a session temp dir |
| `VITE_BACKEND_URL` | `http://127.0.0.1:8123` | Vite dev server proxy target |
| `VITE_FRONTEND_PORT` | `5173` | Vite dev server port |

### Invariants

- MUST NOT assume any storage path is absolute at config load time — all roots MUST derive from `AUDIOBOOK_BASE_DIR`.
- Tests MUST set `APP_TEST_MODE=1` (handled by `conftest.py`); production MUST leave it unset.
- `STUDIO_RECOVER_ON_STARTUP` defaults to `"1"`; disabling it is a deployment override, not a code change.

---

## First-Run Defaults (Owner Directives)

These are binding defaults that MUST ship with every release.

| Item | Value | Notes |
|------|-------|-------|
| Default engine | XTTS | Ships installed via `~/xtts-env` |
| Default voice | "Studio Voice" | Owner's personal voice; ships free with the install |
| Demo project | `demo/demo.zip` | REQUIRED; ships with Pinokio install when `AUDIOBOOK_STUDIO_INSTALL_DEMO=1` |

### Invariants

- MUST NOT remove or rename `demo/demo.zip`.
- `demo/demo.zip` MUST be refreshed for Studio 2.0 project format before the v2.0.0 release — the v1 format is incompatible.
- The "Studio Voice" voice bundle MUST be present in `VOICES_DIR` after a default install without any user action.

---

## Pinokio Distribution

Pinokio is the primary end-user distribution channel for Studio. The wrapper lives at `~/pinokio/api/audiobook-studio.pinokio.git/`.

### Goals

- Minimize visible terminal windows during install and launch.
- Work on macOS, Windows, and Linux without manual env setup.
- Support one-click demo restore.

### Demo restore trigger

| Variable | Effect |
|----------|--------|
| `AUDIOBOOK_STUDIO_INSTALL_DEMO=1` | Demo project from `demo/demo.zip` is restored into `PROJECTS_DIR` on first boot |
| Unset / `0` | No demo project created |

### Post-v1 blockers

Blockers PK1–PK10 are documented in `plans/final_release/16_pinokio_distribution.md`. None of these are required for the v2.0.0 release but MUST be resolved before Pinokio is the primary download link.

### Invariants

- MUST NOT delete `demo/demo.zip` from the repo.
- The Pinokio wrapper MUST invoke `./run.sh` (or `.\run.ps1`) rather than reimplementing provisioning logic.
- `AUDIOBOOK_STUDIO_INSTALL_DEMO=1` MUST be the only gate for demo restore; no hardcoded hostname or platform checks.

---

## Plugin Distribution (Post-v1)

Plugin install and update from GitHub is a post-v1 feature. The planned flow is documented in `plans/final_release/05_plugin_ecosystem.md`.

| Mechanism | Status |
|-----------|--------|
| Discovery via GitHub topic tag | Post-v1 |
| In-app install / update UI | Post-v1 |
| Manual drop into `PLUGINS_DIR` | Supported now (v2.0.0) |

### Invariants

- MUST NOT block the v2.0.0 release on GitHub plugin discovery.
- Manual plugin installation (drop a plugin directory into `PLUGINS_DIR`) MUST work without any UI changes.

---

## CI Environment

| Check | Command |
|-------|---------|
| Backend lint | `ruff check .` |
| Backend tests | `./venv/bin/python -m pytest -q` |
| Frontend lint | `npm -C frontend run lint` |
| Frontend tests | `npm -C frontend run test -- --run` |
| Frontend build | `npm -C frontend run build` |
| Security scan | CodeQL (`codeql.yml`) |

CI uses Python 3.11 and Node 20. All checks MUST pass before merging to `main`.

---

## Manual Launch (Advanced)

After provisioning with `./run.sh --setup-only` and building the frontend, uvicorn can be started directly:

```bash
source ./venv/bin/activate
uvicorn run:app --port 8123
```

`run.py` exports `app` via `from app.api.web import app`. The `run:app` import target MUST remain stable — Pinokio and deployment scripts depend on it.
