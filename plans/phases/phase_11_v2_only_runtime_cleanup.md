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

- audit the full codebase for v1-era runtime code, metadata duplication, compatibility shims, feature flags, fallback paths, tests, docs, and scripts
- build a tracked cleanup inventory that classifies each legacy item by ownership, current references, risk, and removal strategy
- identify code that is completely severed from production and test references so it can be removed first as useless bloat
- identify code that is still referenced as fallback/failover and replace those references with committed v2 behavior
- remove production fallback from `VoiceBridge` remote calls to local in-process adapters
- remove production registry fallback from TTS Server discovery to built-in engine discovery
- remove watchdog behavior that silently switches Studio into legacy in-process mode
- make TTS Server startup failure a visible service state with diagnostics and retry controls
- keep plugin manifests and schemas as the canonical XTTS/Voxtral metadata source
- remove or quarantine legacy XTTS/Voxtral adapters after all production references are gone
- update tests so they assert v2-only behavior rather than fallback behavior
- retain migration scripts and storage compatibility readers where they protect existing user data

## Phase 11 Work Model

Phase 11 should not begin by deleting files. It should begin with an audit that makes the legacy surface area visible. The cleanup work should then proceed in small, checkpointable slices ordered by risk.

### Step 1: System Audit

Create a complete inventory of v1-era code and transition scaffolding before changing behavior.

Audit targets:

- production imports and runtime paths
- fallback/failover branches
- feature flags and environment variables
- legacy adapters and shims
- duplicated manifests, settings schemas, metadata, documentation, and UI help text
- compatibility readers and migration helpers
- tests that assert legacy behavior or silently rely on fallback
- scripts, docs, and comments that still describe v1 as active behavior

Suggested search starting points:

- `git grep -n "legacy"`
- `git grep -n "fallback"`
- `git grep -n "USE_TTS_SERVER"`
- `git grep -n "bridge_local"`
- `git grep -n "app.engines.voice"`
- `git grep -n "in-process"`
- `git grep -n "v1"`
- `git grep -n "compat"`

### Step 2: Legacy Inventory Checklist

Convert the audit into a checklist before removing code. Each discovered item should have enough context to make a safe decision.

Use these classification fields:

- **Path**: file or module that contains the legacy code
- **Kind**: dead code, production fallback, migration/data compatibility, duplicate metadata, test-only fixture, docs/comment, or unknown
- **Current references**: what imports/calls/loads it today
- **Runtime impact**: production path, startup path, settings path, synthesis path, tests only, or no references
- **Desired outcome**: delete, replace with v2 behavior, keep as migration-only, move to test fixture, or document and defer
- **Risk**: low, medium, high
- **Verification**: exact test or manual check that proves removal/replacement is safe

### Step 3: Classification Rules

Use the classification pass to avoid cutting useful migration code while still removing actual bloat.

- **Delete first**: files, functions, docs, or metadata with no production references and no test value.
- **Replace next**: code still referenced only to provide automatic v1 fallback/failover.
- **Keep temporarily**: migration scripts and compatibility readers that protect existing user data during load/upgrade.
- **Move or rewrite**: tests that exist only to prove legacy fallback behavior.
- **Escalate before deleting**: anything that still writes user data, changes persisted schemas, or handles recovery from old projects/voices.

### Step 4: Dependency-Ordered Cleanup Plan

After the audit inventory exists, turn it into an ordered task list. Prefer this removal order:

1. Remove dead metadata and unused duplicate docs.
2. Remove severed files with no imports or runtime references.
3. Update tests that currently encode fallback expectations.
4. Remove automatic fallback branches in the registry and bridge.
5. Remove watchdog/boot fallback into legacy mode and replace it with explicit service diagnostics.
6. Remove or quarantine local XTTS/Voxtral adapters once production imports are gone.
7. Remove or narrow feature flags that only exist to toggle v1 behavior.
8. Re-run full boot, settings, verification, preview, synthesis, and failure-mode checks.

### Step 5: Cleanup Tracking Artifact

Create a Phase 11 audit artifact before implementation begins. Suggested path:

- `plans/implementation/phase_11_v1_cleanup_inventory.md`

That inventory should become the working checklist for Phase 11 and should be updated as each item is removed, retained, or deferred.

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

- [ ] Phase 11 audit inventory created with every known v1/legacy/fallback item classified.
- [ ] Dependency-ordered cleanup checklist created from the inventory before behavior changes begin.
- [ ] Completely severed v1 files and duplicated metadata are removed first.
- [ ] All remaining v1 references are classified as production fallback, migration/data compatibility, test fixture, docs, or deferred.
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

- [ ] Audit inventory includes production imports, fallback branches, feature flags, migration helpers, tests, docs, and duplicated metadata.
- [ ] Every deleted item has a matching reference check or targeted test.
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
