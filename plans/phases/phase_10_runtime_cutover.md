# Phase 10: Runtime Cutover And Release Gate

## Objective

Promote the Studio 2.0 execution architecture from an opt-in path to the standard runtime. Studio should boot the managed TTS Server subprocess by default, route synthesis through the VoiceBridge HTTP path, schedule work through the Studio 2.0 orchestrator, and expose clear runtime diagnostics in the Settings/About surface.

This phase closes the gap between "the modular architecture exists" and "users are actually running it by default."

## Why This Phase Exists

Phase 5 introduced the TTS Server, watchdog, VoiceBridge HTTP path, and orchestrator behind rollout flags. Later phases stabilized the product shell, queue UX, plugin ecosystem, and external API. The remaining release risk is flag drift: Studio can look like 2.0 while still running normal synthesis in the legacy in-process path.

Phase 10 is the deliberate default-runtime cutover.

## Prerequisites

- Phase 8 cleanup and portability work complete
- Phase 9 plugin ecosystem and external API surfaces complete
- TTS Server watchdog, HTTP client, and registry path implemented
- Studio 2.0 orchestrator and task types implemented
- About/status surface can display runtime service state
- Emergency fallback path still available for diagnosis during cutover

## Deliverables

- TTS Server subprocess starts by default during Studio boot
- watchdog monitors TTS Server health and restarts it on crash or heartbeat failure
- About/status surface shows TTS Server URL, port, pid when available, health, restart capability, and circuit state
- Studio synthesis, preview, engine discovery, settings updates, verification, and plugin refresh route through the TTS Server path by default
- Studio 2.0 orchestrator becomes the default scheduler for supported render/API tasks
- legacy direct in-process mode becomes an explicit emergency fallback, not the normal runtime
- public `/api/v1/tts` gateway continues to route through Studio, with Studio handling auth, rate limiting, and queue policy
- TTS Server remains internal and loopback-bound by default
- startup logs clearly identify backend mode, orchestrator mode, TTS Server URL, and fallback reason if startup fails
- Phase 5 stale checklists are reconciled with actual implementation state
- release gate checklist captures manual QA needed before Studio 2.0 final

## Deliverables Checklist

- [ ] TTS Server subprocess boots by default
- [ ] watchdog restart behavior verified in the default runtime path
- [ ] About/status reports live TTS Server state instead of direct in-process mode
- [ ] VoiceBridge uses the TTS Server HTTP path by default
- [ ] engine registry uses TTS Server `/engines` by default
- [ ] engine settings, verify, refresh, and dependency install calls route through the TTS Server path
- [ ] Studio 2.0 orchestrator is the default scheduler for supported work
- [ ] direct in-process mode is preserved only as an explicit fallback
- [ ] startup diagnostics explain fallback causes clearly
- [ ] public `/api/v1/tts` still uses Studio as the external API boundary
- [ ] TTS Server remains loopback-bound by default
- [ ] Phase 5 checklist and handoff notes updated to match current reality

## Scope

- promote existing modular runtime paths to the default
- keep the TTS Server as a managed subprocess owned by Studio
- keep external clients on Studio's public API, not on the internal TTS Server API
- preserve feature flags or environment overrides only as intentional fallback controls
- verify both happy-path startup and failure-path recovery

## Non-Goals

- no plugin marketplace or automatic plugin update system
- no public exposure of the internal TTS Server port as the supported third-party API
- no engine-specific runtime special casing
- no redesign of the Settings UI beyond status accuracy and diagnostics
- no removal of legacy fallback paths until default runtime has been verified across supported flows

## Tests

- boot sequence starts the watchdog by default
- fallback flag or emergency mode keeps direct in-process behavior available
- About/status reports healthy TTS Server URL, port, and restart capability
- watchdog handles process exit and heartbeat failure in the default path
- VoiceBridge synthesis and preview call the TTS Server HTTP client by default
- registry hydration uses TTS Server `/engines` by default
- engine settings, verify, refresh, and dependency install routes proxy to the TTS Server
- API synthesis tasks enter the orchestrator and route through the TTS Server
- TTS Server startup failure produces clear diagnostics and does not leave Studio in a misleading "healthy" state

## Verification Checklist

- [ ] boot/default-mode tests pass
- [ ] watchdog lifecycle tests pass
- [ ] system/About runtime service tests pass
- [ ] VoiceBridge remote-path tests pass
- [ ] registry remote-path tests pass
- [ ] API gateway tests pass
- [ ] orchestrator/API task tests pass
- [ ] plugin loader, verification, and isolation tests pass
- [ ] manual About-page check confirms live TTS Server port and status
- [ ] manual render smoke test confirms output through managed subprocess
- [ ] `git diff --check` passes

## Manual QA

- Start Studio normally with no `USE_TTS_SERVER` environment variable set.
- Open Settings/About and confirm TTS Server is shown as launched, healthy, and bound to a loopback URL such as `127.0.0.1:7862`.
- Trigger a plugin refresh from Settings and confirm it reaches the TTS Server path.
- Run a short preview and one normal render, then confirm audio output succeeds.
- Restart the TTS Server from the About/status control and confirm it recovers.
- Confirm the public `/api/v1/tts/docs` page is still reachable through Studio.

## Exit Gate

- A normal user launch runs Studio in the managed TTS Server subprocess architecture without requiring environment flags.
- About/status gives truthful, actionable runtime diagnostics.
- Studio can recover from a TTS Server crash without taking down the web backend.
- External apps use Studio's `/api/v1/tts` gateway while the internal TTS Server remains private by default.
- Legacy direct in-process mode is documented as a fallback rather than the active product path.
