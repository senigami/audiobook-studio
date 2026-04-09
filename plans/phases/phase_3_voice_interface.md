# Phase 3: Voice Interface And Preview/Test Flows

## Objective

Move engine behavior behind the new voice contract while preserving current capabilities and purpose.

## Deliverables

- engine base contract
- engine registry
- voice bridge
- XTTS wrapper
- Voxtral wrapper
- preview/test flow contract
- module readiness and health model

## Deliverables Checklist

- [ ] Engine base contract implemented
- [ ] Engine registry implemented
- [ ] Voice bridge implemented
- [ ] XTTS wrapped behind the new contract
- [ ] Voxtral wrapped behind the new contract
- [ ] Preview/test flow contract implemented
- [ ] Module readiness and health model implemented

## Scope

- preserve current synthesis capability
- preserve preview/test concept
- no full queue cutover yet
- long-running engine and ffmpeg work must execute through non-blocking queue or async-safe infra boundaries rather than request-thread blocking calls
- engine wrappers must not rely on importing `app.web` or legacy queue modules for initialization side effects
- any legacy engine lifecycle behavior that still depends on global startup or subprocess cleanup must remain behind explicit bridge or compatibility seams until Phase 5 and Phase 8 replace it cleanly

## Current Implementation Notes

- The initial Phase 3 seam is now in place for the engine base contract, registry, bridge, and readiness model, but the concrete XTTS and Voxtral bridge-backed execution paths remain scaffolded until the preview/test flow is wired.
- Built-in engine registrations should currently report conservative health through the Studio 2.0 bridge path. If the bridge execution path is not implemented yet, the engine should report not available and not ready rather than advertising partial readiness.
- The voice bridge must fail fast on preflight and readiness checks before any preview, synthesis, or voice-asset execution attempts reach scaffold or compatibility adapters.
- The preview path should prefer typed bridge exceptions over string sniffing so UI-facing failure reasons stay stable as implementation details change.
- Engine registry discovery should be cached after the first load. Preview and test requests should not pay repeated manifest-discovery cost during normal request cycles.
- Voxtral is the first engine to receive a concrete bridge-backed preview path. It should stage ephemeral preview audio without publishing into the durable artifact repository.

## Planned Implementation Order

1. Keep the registry metadata-only and side-effect-free at import time. Engine discovery should load manifests and adapter metadata without loading model weights, starting workers, or depending on legacy startup hooks.
2. Wire preview/test requests through the new voice bridge before full synthesis cutover. This keeps the first user-facing Phase 3 cutover narrow, easier to verify, and reversible behind `USE_V2_ENGINE_BRIDGE`.
3. Treat preview/test output as ephemeral by default. Preview artifacts should not be published into the normal immutable artifact repository unless we intentionally define a persistent preview artifact contract later.
4. Keep resource declarations explicit for preview/test work. Even before full queue cutover, preview flows should preserve the notion of engine/resource needs so future orchestration can avoid VRAM or subprocess collisions.
5. Preserve the legacy runtime path for full synthesis until the XTTS bridge-backed wrapper can execute through explicit async-safe or queue-safe boundaries without relying on import-time side effects.
6. Let Voxtral prove the bridge path first. Once Voxtral preview is stable, reuse the same readiness, request-validation, and ephemeral-output pattern for XTTS.

## Preview/Test Rules

- Preview/test flows should enter through the voice-domain and voice-bridge boundary rather than calling engine wrappers directly from route handlers.
- Preview/test failures should surface readiness or preflight reasons clearly so the UI can distinguish "engine unavailable", "engine not ready", and normal execution failures.
- Preview/test requests must not silently reuse or publish standard production artifacts in ways that blur the distinction between ephemeral checks and durable render outputs.

## Tests

- mock engine tests
- wrapper contract tests
- preflight validation tests
- preview/test isolated tests
- import-safety checks for engine wrappers where practical

## Verification Checklist

- [ ] Mock engine tests pass
- [ ] Wrapper contract tests pass
- [ ] Preflight validation tests pass
- [ ] Preview/test isolated tests pass

## Exit Gate

- synthesis and preview/test logic can be reasoned about through the new voice boundary
