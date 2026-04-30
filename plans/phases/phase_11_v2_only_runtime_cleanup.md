# Phase 11: V2-Only Runtime Cleanup

## Status

Deferred future cleanup. Do not start this phase until the current wrap-up task list is complete and Phase 10 runtime behavior has been verified in normal user workflows.

## Objective

Complete the final Studio 2.0 runtime cutover by removing silent v1/in-process TTS fallbacks from production paths. XTTS and Voxtral should run through the managed TTS Server and plugin runtime as the product architecture, not through legacy adapters when the server is unavailable.

Phase 11 is the "commit to the new architecture" pass. It should reduce bloat, remove misleading fallback behavior, and make service failures visible and actionable instead of quietly routing around them.

## Why This Phase Exists

Phase 10 promoted the TTS Server and plugin runtime to the default path, but kept emergency fallback behavior while the new path stabilized. That was useful during transition, but it creates long-term risk:

- users can unknowingly run different code paths depending on startup timing or environment flags
- plugin metadata can drift from built-in engine metadata
- bugs can be fixed in one runtime while still existing in the other
- tests may pass by exercising fallback behavior instead of the product behavior
- startup failures can look like success if legacy code silently takes over

Now that the v2 runtime is intended to be the product path, fallback should be replaced with clear readiness, diagnostics, and recovery UX.

## Scope

- remove production fallback from `VoiceBridge` remote calls to local in-process adapters
- remove production registry fallback from TTS Server discovery to built-in engine discovery
- remove watchdog behavior that silently switches Studio into legacy in-process mode
- make TTS Server startup failure a visible service state with diagnostics and retry controls
- keep plugin manifests and schemas as the canonical XTTS/Voxtral metadata source
- remove or quarantine legacy XTTS/Voxtral adapters after all production references are gone
- update tests so they assert v2-only behavior rather than fallback behavior
- retain migration scripts and storage compatibility readers where they protect existing user data

## Non-Goals

- do not remove data migrations needed to read or upgrade existing projects, voices, settings, or assignments
- do not remove diagnostics, repair tools, or explicit user-triggered recovery actions
- do not redesign the Settings UI beyond making runtime state truthful
- do not expose the internal TTS Server as the public external API
- do not start this cleanup while active feature work still depends on transition scaffolding

## Cutover Principles

- The TTS Server/plugin runtime is the source of truth for engine discovery, verification, settings, preview, and synthesis.
- If the TTS Server is unavailable, Studio should say so clearly instead of using v1 behavior.
- Emergency behavior should be explicit, user-visible, and documented, not automatic fallback.
- Plugin metadata belongs in `plugins/*/manifest.json` and `plugins/*/settings_schema.json`.
- Legacy code should either be removed, moved behind test-only fixtures, or documented as migration-only.

## Likely Hotspots

- `app/engines/bridge.py`
- `app/engines/bridge_remote.py`
- `app/engines/bridge_local.py`
- `app/engines/registry.py`
- `app/engines/watchdog.py`
- `app/boot.py`
- `app/core/feature_flags.py`
- `app/engines/voice/xtts/engine.py`
- `app/engines/voice/voxtral/engine.py`
- `app/tts_server/plugin_loader.py`
- `app/tts_server/server.py`
- `app/tts_server/health.py`
- bridge and engine API tests under `tests/`

## Deliverables

- [ ] Production `VoiceBridge` no longer catches TTS Server unavailability and reroutes to local adapters.
- [ ] Production engine registry no longer synthesizes XTTS/Voxtral entries from built-in classes when the TTS Server is unavailable.
- [ ] Watchdog startup failure reports a service error instead of flipping to legacy mode.
- [ ] Startup/loading UI shows actionable TTS Server failure diagnostics and retry guidance.
- [ ] `USE_TTS_SERVER=0`, if retained, is documented as development/test-only and is not used as an automatic runtime fallback.
- [ ] Built-in XTTS/Voxtral manifests and settings schemas remain removed; plugin files are canonical.
- [ ] Built-in XTTS/Voxtral engine adapters are deleted or isolated from production imports.
- [ ] Tests that previously asserted fallback behavior are rewritten to assert explicit unavailable/error behavior.
- [ ] Migration and compatibility readers remain only where they protect persisted user data.

## Verification Checklist

- [ ] Normal boot starts the managed TTS Server and discovers XTTS/Voxtral through plugins.
- [ ] TTS Server startup failure keeps Studio honest: no engine list from v1 fallback, no silent synthesis path.
- [ ] Settings > TTS Engines shows service diagnostics when plugins cannot be loaded.
- [ ] Engine verify, settings save, run test, preview, and synthesis all route through the TTS Server.
- [ ] Killing the TTS Server produces a visible unhealthy/reconnecting state, not local synthesis.
- [ ] `git grep` confirms no production code imports `app.engines.voice.xtts.engine` or `app.engines.voice.voxtral.engine`.
- [ ] Backend and frontend regression tests pass after fallback expectations are updated.
- [ ] `git diff --check` passes.

## Exit Gate

Studio no longer has two production XTTS/Voxtral runtimes. The managed TTS Server and plugin system are the only normal runtime path, and failures are surfaced as failures with useful diagnostics rather than masked by v1 fallback behavior.
