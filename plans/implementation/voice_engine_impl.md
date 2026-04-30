# Implementation Blueprint: Universal Voice Interface (Studio 2.0)

This document turns the voice system plan into concrete implementation work. It includes the TTS Server process boundary, plugin loader, and the refactored VoiceBridge HTTP client.

## 1. Files I Want To Create

### Engine Contracts And Registry (Studio Side)

- `app/engines/voice/base.py` — `StudioTTSEngine` ABC contract (published SDK interface)
- `app/engines/models.py` — shared engine models (manifest, health, registration)
- `app/engines/registry.py` — registry client that caches TTS Server `/engines` responses
- `app/engines/bridge.py` — `VoiceBridge` refactored as HTTP client to TTS Server
- `app/engines/tts_client.py` — low-level HTTP client for TTS Server communication
- `app/engines/errors.py` — typed engine error hierarchy

### TTS Server (Separate Process)

- `app/tts_server/__init__.py` — package marker
- `app/tts_server/server.py` — FastAPI app for the TTS Server HTTP API
- `app/tts_server/plugin_loader.py` — plugin discovery, manifest validation, engine class loading
- `app/tts_server/verification.py` — verification synthesis runner
- `app/tts_server/settings_store.py` — per-engine settings persistence (reads/writes `settings.json`)
- `app/tts_server/health.py` — health endpoint and per-engine status aggregation
- `tts_server.py` — entry point script (top-level, spawned by Studio as subprocess)

### Watchdog (Studio Side)

- `app/engines/watchdog.py` — TTS Server health monitor with heartbeat, kill, restart logic

### Plugin Folders (Moved From `app/engines/voice/`)

- `plugins/tts_xtts/manifest.json`
- `plugins/tts_xtts/engine.py` — XTTS adapter implementing `StudioTTSEngine`
- `plugins/tts_xtts/settings_schema.json`
- `plugins/tts_voxtral/manifest.json`
- `plugins/tts_voxtral/engine.py` — Voxtral adapter implementing `StudioTTSEngine`
- `plugins/tts_voxtral/settings_schema.json`

## 2. Procedure

### Step 1: Define Shared Contracts

- `StudioTTSEngine` (ABC) — the published plugin contract
- `TTSRequest` — immutable synthesis request dataclass
- `TTSResult` — synthesis result dataclass
- `EngineManifestModel` — parsed manifest data
- `EngineHealthModel` — readiness and health summary
- `EngineRegistrationModel` — resolved engine with manifest and health

### Step 2: Build The TTS Server

- create `tts_server.py` entry point that accepts `--port` flag
- implement plugin discovery: scan `plugins/tts_*/` folders, load manifests
- implement engine class loading: import `entry_class` from each plugin
- implement environment validation: call `check_env()` on each engine
- implement verification synthesis: run test text through each engine
- implement HTTP API endpoints: `/health`, `/engines`, `/synthesize`, `/preview`, `/plugins/refresh`
- implement per-engine settings store: read/write `plugins/tts_<name>/settings.json`
- implement graceful shutdown: catch SIGTERM, call `shutdown()` on engines

### Step 3: Build The Watchdog

- implement heartbeat polling in a background thread
- implement failure detection: process exit, unresponsive (3 consecutive failures), degraded health
- implement kill/restart: SIGTERM → wait 5s → SIGKILL → restart after cooldown
- implement circuit breaker: max 5 restarts in 5 minutes
- integrate watchdog startup into Studio boot sequence

### Step 4: Refactor The VoiceBridge

- refactor `VoiceBridge` from in-process engine dispatcher to HTTP client
- create `tts_client.py` with low-level HTTP methods (httpx or similar)
- `VoiceBridge.synthesize()` → `POST {tts_url}/synthesize`
- `VoiceBridge.preview()` → `POST {tts_url}/preview`
- `VoiceBridge.describe_registry()` → `GET {tts_url}/engines`
- preserve the same caller-facing contract (domain services and orchestrator tasks see no change)

### Step 5: Refactor The Registry

- refactor `app/engines/registry.py` from in-process engine loading to caching TTS Server responses
- `load_engine_registry()` → calls `GET {tts_url}/engines` and caches the result
- health refresh → re-fetches from TTS Server `/health`
- remove direct Python imports of engine classes from the registry

### Step 6: Move Built-In Engines To Plugins

- move `app/engines/voice/xtts/` → `plugins/tts_xtts/`
- move `app/engines/voice/voxtral/` → `plugins/tts_voxtral/`
- update engine classes to implement `StudioTTSEngine` instead of internal `BaseVoiceEngine`
- update manifests to the full schema (from placeholder to production)
- update settings schemas with all configurable parameters
- remove `app/engines/voice/xtts/` and `app/engines/voice/voxtral/` after migration

### Step 7: Build The Plugin Loader

- implement `plugin_loader.py` with strict manifest validation
- implement plugin folder name validation against `^tts_[a-z][a-z0-9]{1,14}$`
- implement dependency checking: parse `requirements.txt`, verify packages are installed
- implement engine class import with exception isolation
- implement plugin refresh without TTS Server restart

## 3. Required Engine Behaviors

- validate environment (`check_env`)
- validate request (`check_request`)
- synthesize to a caller-specified output path
- report result with status, duration, warnings, and errors
- provide settings schema for UI rendering
- optional: preview mode for lightweight synthesis
- optional: cleanup on shutdown

## 4. Artifact Safety Procedure

1. Studio generates a unique temp path and includes it in the synthesis request.
2. The TTS Server passes the path to the engine, which writes audio to it.
3. The TTS Server returns the result with the output path.
4. Studio validates the file (exists, non-zero, valid audio header).
5. Studio writes the artifact manifest.
6. Studio atomically publishes the artifact into the immutable cache.
7. Studio updates the related block revisions to point at the new valid artifact.
8. Studio cleans up the temp file after publication.

## 5. Testing Plan

- unit tests for manifest loading and validation (valid, invalid, malformed, duplicate engine_id)
- unit tests for plugin folder name validation
- unit tests for bridge preflight validation
- XTTS and Voxtral adapter tests with mocked synthesis
- mock engine tests for the full request/result cycle
- TTS Server lifecycle tests (startup, shutdown, crash, restart)
- watchdog heartbeat and failure detection tests
- VoiceBridge HTTP client tests with mock TTS Server
- integration test: drop-in plugin discovery end-to-end
- verification synthesis pass/fail tests

## 6. Guardrails

- no route handler or queue task should call engine-specific code directly
- no engine wrapper should decide queue policy
- no engine result should bypass artifact manifest publication
- the TTS Server must not import Studio domain modules (`app/domain/`, `app/orchestration/`)
- Studio must not import plugin engine classes directly (all access through HTTP)
- plugin folder names must be validated before any filesystem access
- all file paths crossing the process boundary must be validated for containment

## 7. Port Assignment

- default port: `7862`
- if taken, auto-increment through `7863`–`7872`
- configurable via `--port` flag or `TTS_SERVER_PORT` environment variable
- Studio stores the assigned port for subsequent API calls

## 8. Implementation References

- `plans/v2_tts_server.md` — full TTS Server architecture specification
- `plans/v2_plugin_sdk.md` — plugin contract, manifest schema, naming rules
- `plans/v2_voice_system_interface.md` — engine contract and bridge design
- `plans/v2_local_tts_api.md` — external API that proxies through TTS Server
- `plans/phases/phase_5_orchestrator.md` — Phase 5 deliverables
