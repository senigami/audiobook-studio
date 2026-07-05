# Engines and Plugin Lifecycle

```
spec_version: 1.1.2
updated: 2026-07-04
status: active
sources:
  - app/tts_server/server.py
  - app/tts_server/plugin_loader.py
  - app/engines/watchdog.py
  - app/engines/bridge.py
  - app/engines/registry.py
  - app/core/boot.py
```

> **TL;DR:** The TTS Server is a long-lived subprocess that owns plugin loading, engine status, and synthesis routing; Studio talks to it exclusively over HTTP via `VoiceBridge` and never loads engine code in-process.

## Changelog

| Version | Date       | Change                 |
|---------|------------|------------------------|
| 1.1.2   | 2026-07-04 | Added note distinguishing the runtime engine registry cache from the marketplace/catalog registry (doc 05 / `official_registry.py`), with a pointer to the marketplace-UI prior-art research doc; corrected the note's initial "in-process registry" wording (it is a Studio-side cache over the TTS Server's `GET /engines`; engine code never runs in Studio's process) |
| 1.1.1   | 2026-06-16 | Corrected "Engine registry cache" section: `_load_local_registry()` returns `{}` unconditionally (`@lru_cache`); there is no local manifest parsing; the fallback is an empty registry, not a locally parsed manifest list; dropped the MUST-NOT-empty claim |
| 1.1.0   | 2026-06-15 | Added official plugin registry and GitHub repository preview/staging flow |
| 1.0.0   | 2026-06-10 | Initial canonical spec |

---

## Overview

Studio 2.0 runs a dedicated **TTS Server** subprocess (`tts_server.py`) that hosts all
engine plugins. Studio's main process communicates with it over HTTP; engine code never
executes inside Studio's process. This isolation is load-bearing: it protects Studio
from engine-specific dependency conflicts (notably XTTS's separate venv) and from
engine crashes bringing down the UI server.

Ownership split — these boundaries MUST NOT bleed into each other:

| Boundary | Owner |
|----------|-------|
| Server process lifecycle (spawn, restart, circuit-breaker) | `app/engines/watchdog.py` |
| Voice/synthesis request routing | `app/engines/bridge.py` (`VoiceBridge`) |
| Plugin discovery, loading, status | `app/tts_server/plugin_loader.py` |
| Engine registry cache (Studio side) | `app/engines/registry.py` |

---

## TTS Server endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Per-engine health; returns 207 when any engine is `needs_setup` or `invalid_config` (an `unverified` engine alone still returns 200) |
| GET | `/ready` | Cheap readiness probe (no engine detail) |
| GET | `/engines` | All loaded plugins with metadata |
| GET | `/engines/{id}` | Single engine detail |
| GET | `/engines/{id}/settings` | Persisted settings dict for engine |
| PUT | `/engines/{id}/settings` | Update settings; validated against `settings_schema()` |
| DELETE | `/engines/{id}/settings/{key}` | Clear a read-only setting |
| POST | `/synthesize` | Generate audio; requires `status="ready"` |
| POST | `/preview` | Lightweight test synthesis |
| POST | `/engines/{id}/plan` | Query preferred chunking plan for a text body |
| POST | `/engines/{id}/verify` | Run verification test |
| POST | `/engines/{id}/install` | Install missing pip dependencies |
| POST | `/plugins/refresh` | Hot-reload all plugins from disk |
| POST | `/plugins/import` | Upload and stage a plugin `.zip` |
| POST | `/plugins/preview` | Inspect a staged plugin before confirming |
| POST | `/plugins/preview_github` | Clone and inspect a GitHub plugin repository before confirming |
| POST | `/plugins/confirm/{token}` | Promote staged plugin to active |
| DELETE | `/plugins/staging/{token}` | Discard a staged import |
| GET | `/engines/{id}/requirements` | List missing pip deps for an engine |
| POST | `/tasks/{task_id}/cancel` | Cancel an in-flight synthesis task |

---

## Engine status states

Every loaded plugin is always in exactly one status:

| Status | Meaning |
|--------|---------|
| `needs_setup` | `check_env()` returned `False`, or required pip deps are missing |
| `invalid_config` | Manifest failed validation, or `entry_class` import raised an exception |
| `unverified` | `check_env()` passed and deps satisfied, but `run_test()` has not yet succeeded |
| `ready` | `check_env()` passed, deps satisfied, and `run_test()` succeeded |

**MUST:** Synthesis (`POST /synthesize`) MUST be rejected unless the engine's status
is `ready`. Any other status returns an error before engine code is called.

Status transitions are forward-only within a session except when settings change
(which resets `ready` → `unverified`) or when `check_env()` fails a periodic recheck
(which resets to `needs_setup`).

---

## Verification flow

Verification establishes that an engine can produce audio end-to-end before Studio
trusts it for production work.

1. `check_env()` MUST return `(True, _)` — if it does not, verification is blocked and
   an actionable message is surfaced to the user.
2. `run_test()` executes a full synthesis round-trip using the engine's bundled
   `test_sample` and `test_text` assets (declared in `manifest.json`).
3. On success: result metadata and a hash of the plugin state are persisted to
   `plugin_dir/state.json`. Status advances to `ready`.
4. **Settings invalidation:** any `PUT /engines/{id}/settings` call resets the engine
   from `ready` to `unverified` and MUST prompt re-verification before synthesis is
   allowed.
5. `verify` vs `run_test`: `verify(req)` is a lightweight, request-scoped readiness
   check (MUST NOT render audio); `run_test()` is the full self-contained test and is
   the gate for `ready` status.

---

## Hot-reload / plugin import flow

Plugins can be installed at runtime without restarting the server.

Studio exposes an owner-controlled official plugin registry at
`GET /api/engines/registry`. Registry entries are metadata only: they identify trusted
known plugin repositories, compatibility, summary text, tags, docs/homepage URLs, and
requirements. The registry does not execute plugin code. Installing a registry entry uses
the same GitHub repository preview/staging flow as a pasted GitHub URL.

### Upload and staging

1. Client uploads a `.zip` to `POST /plugins/import`.
2. Server validates the zip before extraction:
   - No member name may contain a backslash or begin with a forward-slash (path
     traversal prevention).
3. Zip is extracted to a staging directory `.preview_<token>` inside `plugins_dir`.
4. A post-extract containment walk verifies every extracted file path resolves under
   the staging dir; any file outside is an error and the staging dir is deleted.

### GitHub repository staging

1. Client submits a GitHub repository URL to `POST /plugins/preview_github`.
2. Server accepts only canonical `https://github.com/<owner>/<repo>` or `.git` URLs.
   Credentials, query strings, fragments, alternate hosts, and open GitHub search are not
   part of the v2.0 release flow.
3. Server runs a shallow `git clone --depth 1` into a `.preview_<token>` staging
   directory with a bounded timeout.
4. The cloned repository MUST NOT contain symlinks. Any symlink causes the preview to be
   rejected and the staging directory deleted.
5. The staged repository manifest is validated with the same manifest validator used by
   plugin discovery. A preview token is issued only when the manifest matches the loader
   contract and the target `plugins/tts_<engine_id>` folder is not already present.

### Validation and preview

5. Server validates the manifest and returns a token and preview data (display_name,
   engine_id, version, dependency list with `REMOTE` badges for non-local packages) to Studio.
6. Plugin code MUST NOT be imported or executed before user confirmation.

### User confirmation

7. Studio presents the `PluginTrustModal` with the dependency list.
8. On confirm: Studio calls `POST /plugins/confirm/{token}`. Server moves the staging
   directory to the final plugin folder and calls `refresh()`.
9. On cancel: Studio calls `DELETE /plugins/staging/{token}`. Server deletes the
   staging directory immediately.

### Orphan cleanup

Startup orphan sweep: any `.preview_*` directories left in `plugins_dir` from a
previous crash are deleted during boot before plugin discovery runs.

**MUST NOT:** The staging directory path MUST NOT be exposed to the plugin's own code
during the validation phase.

Open GitHub topic search/browse and richer installed-plugin update/pull UX are post-v2
unless explicitly promoted. They MUST NOT be treated as prerequisites for the release
registry or pasted-URL install path.

---

## Watchdog and server lifecycle

`app/engines/watchdog.py` owns the TTS Server process lifecycle exclusively.

| Phase | Behaviour |
|-------|-----------|
| Spawn | Starts `tts_server.py` as a subprocess; waits for `READY:{port}` line on stdout |
| Heartbeat | Polls `GET /ready` on a fixed interval; failure increments circuit-breaker counter |
| Restart | On failure, watchdog restarts the process after a back-off delay; circuit-breaker halts restart after a threshold |
| Shutdown | Studio `shutdown_event` sends `SIGTERM`; watchdog waits for clean exit before returning |

**MUST:** The watchdog MUST be started only from `boot_tts_server()` in `app/core/boot.py`.
Importing `watchdog` MUST NOT start the process.

**MUST NOT:** Orchestration code, queue code, and route handlers MUST NOT directly
manage the TTS Server process. All lifecycle control flows through the watchdog.

---

## Engine registry cache (Studio side)

> Note: this is the Studio-side runtime cache of *installed, running* engines (fetched
> from the TTS Server's `GET /engines` — engine code never runs in Studio's process),
> distinct from the owner-controlled marketplace/catalog registry
> (`app/engines/official_registry.py`; browse/install of not-yet-installed
> engine plugins) specified in
> `design-docs/plans/active/final_release/05_standalone_plugin_repos.md`. Prior-art research
> for the marketplace UI is at
> `design-docs/plans/proposals/research_voice_engine_marketplace_ui_prior_art.md`.

`app/engines/registry.py` maintains a Studio-side cache of the engine list fetched
from `GET /engines`.

- Cache TTL: **5 seconds**.
- On empty result from the server (e.g. server restarting): falls back to an empty
  registry (`_load_local_registry()` returns `{}` unconditionally — no local manifest
  parsing is performed). Callers must tolerate an empty engine list while the server
  is unreachable.
- Queue code, route handlers, and VoiceBridge consume only the registry API; they
  MUST NOT call `GET /engines` directly.

---

## Currently shipped plugins

| Plugin folder | Type | Notes |
|---------------|------|-------|
| `tts_xtts` | Local, GPU | 13 languages; voice cloning; script synthesis; runs in `~/xtts-env` separate venv due to conflicting deps |
| `tts_voxtral` | Cloud (Mistral AI) | 6 languages; requires `mistral_api_key` setting to be populated before synthesis |
| `tts_mixed` | Adapter / orchestration | Composite plugin that delegates to other engines based on plan |

XTTS requires its heavy dependencies (`TTS`, PyTorch with CUDA) in the separate
`~/xtts-env` virtualenv. `requirements.txt` deliberately excludes them. This is a
permanent architectural constraint, not a temporary gap.

---

## Invariants

**MUST:**
- Every synthesis request MUST be routed through `VoiceBridge`; no caller MAY call a
  plugin's `synthesize()` method directly.
- `GET /health` MUST return 207 (not 200) when any loaded engine is `needs_setup` or `invalid_config`. (An engine in `unverified` status alone does not flip the overall status to degraded — `/health` still returns 200.)
- The plugin loader MUST complete discovery before the server prints `READY:{port}`.

**MUST NOT:**
- Route handlers and queue code MUST NOT branch on `engine_id` values for core
  behaviour; engine-specific behaviour is expressed through manifests and the SDK.
- The TTS Server MUST NOT import Studio internal modules (`app.api.web`, `app.jobs`,
  `app.db`, etc.). The dependency arrow points one way: Studio → TTS Server.
- Studio's main process MUST NOT load engine plugin code directly, even for
  inspection. All engine metadata is fetched via the registry.
- Settings updates MUST NOT leave an engine in `ready` status; verification MUST be
  invalidated on every settings write.
