# Phase 5: Orchestrator Beside Legacy Queue

## Objective

Introduce the 2.0 orchestrator under feature flags while the legacy queue still exists. This phase also introduces the TTS Server subprocess and watchdog as the execution boundary for synthesis work.

## Deliverables

- task hierarchy
- scheduler policies
- resource claims
- recovery logic
- explicit special job classes for mixed, bake, sample build/test, and export repair
- TTS Server subprocess management
- watchdog health monitor with kill/restart
- VoiceBridge refactored as HTTP client to TTS Server
- ApiSynthesisTask task class
- scheduler priority policy for API vs. UI tasks (configurable)
- plugin folder scanning and verification synthesis on TTS Server startup
- TTS Server startup integrated into Studio boot sequence

## Deliverables Checklist

- [ ] Task hierarchy implemented
- [ ] Scheduler policies implemented
- [ ] Resource claim model implemented
- [ ] Recovery logic implemented
- [ ] Mixed job class implemented
- [ ] Bake job class implemented
- [ ] Sample build/test job classes implemented
- [ ] Export repair job class implemented
- [ ] TTS Server subprocess (`tts_server.py`) implemented
- [ ] Watchdog health monitor with heartbeat, kill, and restart implemented
- [ ] VoiceBridge refactored from in-process dispatcher to HTTP client
- [ ] ApiSynthesisTask task class implemented
- [ ] Scheduler priority policy (Studio First / Equal / API First) implemented
- [ ] Plugin folder scanning in TTS Server implemented
- [ ] Verification synthesis on plugin load implemented
- [ ] TTS Server startup integrated into Studio boot sequence
- [ ] Port assignment with sensible default (7862) and auto-increment fallback implemented

## Scope

- parallel introduction, not immediate replacement
- isolated validation of queue behavior
- preserve current job-purpose concepts even if implementation changes
- worker startup must become explicit and controllable rather than import-triggered
- orchestration rollout must replace legacy startup reconciliation and pause restoration intentionally, not by assuming those side effects will still happen in the background
- built-in engines (XTTS, Voxtral) move to `plugins/tts_xtts/` and `plugins/tts_voxtral/` and are loaded by the TTS Server like any other plugin
- the TTS Server is a managed subprocess spawned by Studio, not an independent service
- synthesis requests flow from the orchestrator through the VoiceBridge HTTP client to the TTS Server
- the TTS Server owns GPU memory and model weights; Studio stays lightweight

## TTS Server Integration

### Startup

1. Studio process starts
2. Studio spawns TTS Server: `python -u tts_server.py --port 7862`
3. TTS Server scans `plugins/tts_*/` folders, loads manifests, validates environments
4. TTS Server runs verification synthesis for each engine
5. TTS Server starts HTTP server on `127.0.0.1:PORT`
6. TTS Server writes `READY` to stdout
7. Studio watchdog begins heartbeat polling
8. Studio queries `/engines` to populate registry cache

### Watchdog Rules

- heartbeat interval: 5 seconds
- heartbeat endpoint: `GET /health` with 3-second timeout
- failure threshold: 3 consecutive failures before kill/restart
- restart cooldown: 10 seconds
- restart limit: 5 restarts within 5 minutes (circuit breaker)
- on crash: in-flight tasks marked as failed with retriable reason; orchestrator requeues

### VoiceBridge As HTTP Client

The existing VoiceBridge class (`app/engines/bridge.py`) is refactored to call the TTS Server over HTTP instead of dispatching to in-process engine instances. The contract remains the same from the perspective of callers (domain services, orchestrator tasks).

### ApiSynthesisTask

API synthesis requests from the local TTS API enter the queue as `ApiSynthesisTask`:

- inherits from `StudioTask`
- resource claim derived from the target engine's manifest
- default priority: lower than UI synthesis tasks
- priority configurable via settings (Studio First / Equal / API First)
- appears in queue UI with an `API` badge
- cancellable by users from the queue UI

## Tests

- scheduler fairness tests
- recovery tests
- cancel/retry tests
- mixed/bake/sample/export-repair tests
- shadow validation where practical
- worker lifecycle and startup-control tests
- TTS Server subprocess lifecycle tests (start, stop, crash, restart)
- watchdog heartbeat and failure detection tests
- VoiceBridge HTTP client integration tests (with mock TTS Server)
- ApiSynthesisTask scheduling and priority tests
- plugin folder scanning tests (valid, invalid, malformed manifests)
- verification synthesis pass/fail tests

## Verification Checklist

- [ ] Scheduler fairness tests pass
- [ ] Recovery tests pass
- [ ] Cancel/retry tests pass
- [ ] Mixed/bake/sample/export-repair tests pass
- [ ] Shadow validation completed where practical
- [ ] Worker lifecycle and startup-control tests pass
- [ ] TTS Server lifecycle tests pass
- [ ] Watchdog tests pass
- [ ] VoiceBridge HTTP client tests pass
- [ ] ApiSynthesisTask tests pass
- [ ] Plugin discovery tests pass
- [ ] Verification synthesis tests pass

## Implementation References

- `plans/v2_tts_server.md` — full TTS Server architecture specification
- `plans/v2_plugin_sdk.md` — plugin contract and discovery
- `plans/v2_queuing_system.md` — queue design and task hierarchy
- `plans/v2_local_tts_api.md` — API task class and priority policy
- `plans/implementation/voice_engine_impl.md` — file-level implementation details

## Exit Gate

- representative backend flows can run through the 2.0 queue safely behind a flag
- TTS Server starts, loads plugins, and responds to synthesis requests
- watchdog detects failures and restarts the TTS Server
- API synthesis tasks are scheduled with correct priority
