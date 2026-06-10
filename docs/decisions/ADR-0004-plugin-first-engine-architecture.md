# ADR-0004: Plugin-First Engine Architecture

**Date:** 2026-06-10  
**Status:** Accepted  
**Deciders:** Studio owner

## Context

The app targets multiple TTS engines: XTTS (local GPU), Voxtral, mixed-synthesis, and
future engines not yet known at design time. Each engine has different:

- Python dependencies (some conflicting — see ADR-0001)
- Synthesis capabilities (streaming, chunked, single-shot)
- Resource requirements (GPU exclusive, CPU-only)
- Behavioral parameters (`text_chunk_limit`, `progress_pattern`)

V1 handled this with conditional branches in core synthesis code: `if engine == "xtts":`
blocks scattered across routes, worker loop, and voice resolvers. Adding a new engine
meant touching multiple core files with high risk of regression.

## Decision

All engines are self-contained plugins. Core code routes through VoiceBridge + engine
registry with no engine-ID branches for core behavior.

Each plugin in `plugins/` provides:
- `manifest.json` declaring `engine_id`, capabilities, `behavior` block
  (`text_chunk_limit`, `progress_pattern`), and resource requirements.
- `interface.py` implementing the `StudioTTSEngine` ABC.
- Plugin-local `tests/` and fixtures collected by pytest.

Engine folder names are validated against `^tts_[a-z][a-z0-9]{1,14}$` at discovery.
`app/tts_server/plugin_loader.py` discovers and validates manifests; engines register
themselves at TTS Server startup.

## Consequences

### Positive
- New engines don't require changes to Studio core code.
- Each engine's deps are isolated inside the TTS Server's environment (or a further
  separate env like `~/xtts-env` for XTTS).
- Engine-specific behavior (chunk limits, progress patterns) is declared in the manifest
  and consumed generically — no special cases in the orchestrator.
- Plugin test suites run in CI without changes to the test configuration.

### Negative / Trade-offs
- Plugin contract (`StudioTTSEngine` ABC + manifest schema) must be versioned and
  stable; breaking it breaks all plugins.
- Plugin discovery adds startup latency (manifest validation on every TTS Server boot).

### Neutral
- `plugins/tts_xtts`, `plugins/tts_voxtral`, and `plugins/synthesis_mixed` are the
  reference implementations.
- Engine-ID branches are permitted only in migration code and plugin-local tests.
