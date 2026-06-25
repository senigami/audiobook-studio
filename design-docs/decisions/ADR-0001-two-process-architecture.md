# ADR-0001: Two-Process Architecture (Studio + TTS Server)

**Date:** 2026-06-10  
**Status:** Accepted  
**Deciders:** Studio owner

## Context

Heavy TTS dependencies (PyTorch, CUDA, model weights) conflict with FastAPI's web
dependencies at the package level. XTTS specifically requires its own Python environment
(`~/xtts-env`) because its packages cannot coexist with the web stack's requirements.

Beyond dependency conflict, TTS synthesis blocks for minutes per chapter. Running it
in-process would stall the web server and make the UI unresponsive for the duration of
every render job.

Early designs used one-shot subprocess spawning per synthesis call. This avoided the
dep conflict but had high per-call overhead (env startup, model load) and gave no
process supervision or clean restart path.

## Decision

Run TTS Server (`tts_server.py`) as a long-lived subprocess separate from the Studio
web process. Studio communicates with it over HTTP.

- `app/engines/watchdog.py` owns the server process lifecycle: spawn, wait for the
  `READY:{port}` stdout signal, heartbeat-poll `GET /health`, restart on failure with
  a circuit breaker.
- `app/engines/bridge.py` (`VoiceBridge`) is the single routing point for voice
  requests; in the Studio 2.0 runtime it always routes over HTTP via `bridge_remote.py`
  + `tts_client.py`.
- Ownership is explicit: orchestrator owns job lifecycle, watchdog owns server process
  lifecycle, VoiceBridge owns engine routing. These boundaries must not bleed into each
  other.

## Consequences

### Positive
- TTS Server can crash and restart without taking down the Studio web process.
- Plugin isolation: each engine runs inside the TTS Server's environment, not Studio's.
- Dependency conflict resolved — XTTS's environment is fully separate.
- Watchdog circuit breaker limits restart storms on persistent failure.

### Negative / Trade-offs
- HTTP round-trip overhead on every synthesis request (acceptable for minute-scale jobs).
- Startup requires the READY handshake to complete before synthesis can be dispatched;
  jobs submitted before TTS Server is ready are queued.
- Two processes to supervise, log, and debug instead of one.

### Neutral
- `tts_server.py` at the repo root is the server entry point; it is not part of the
  `app/` package and is not imported by the Studio web process.
