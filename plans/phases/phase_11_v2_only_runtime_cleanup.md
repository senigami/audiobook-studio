# Phase 11: V2-Only Runtime And Engine-Agnostic Cleanup

## Status

Active on branch `studio2/phase-11`.

Phase 11 is the hard cleanup pass for Studio 2.0. The normal production path is the managed TTS Server plus plugin/bridge/orchestrator runtime. V1, beta, and in-process fallback behavior should not remain in main app code unless the user explicitly approves a narrow exception.

The current operational task board is:

- [Phase 11 audit index](../phase_11_audit.md)
- [Phase 11 remaining work](../implementation/phase_11_remaining_work.md)
- [Phase 11 completed work log](../implementation/phase_11_completed_work.md)

## Objective

Finish the Studio 2.0 cutover by making plugin manifests, plugin schemas, plugin-declared behavior, and the orchestrator the source of truth for runtime decisions.

Core app code should ask about capabilities, job kind, storage contract, or plugin behavior. It should not ask whether an engine is `xtts`, `voxtral`, or another specific engine unless the code is plugin identity, plugin implementation, a meaningful test fixture, or explicit migration code.

## Done So Far

- Removed silent TTS Server fallback paths and runtime cutover flags.
- Routed active generation, assembly, voice build, and voice test work through the Studio 2.0 orchestrator.
- Moved engine implementation ownership into `plugins/`.
- Removed V1 storage fallbacks from normal chapter, segment, voice, and project paths.
- Made new project creation V2-only and isolated missing-manifest-as-V1 behavior inside migration helpers.
- Added plugin behavior metadata and started moving app policy toward behavior/capability checks.
- Relocated engine-owned tests into plugin-owned test folders.
- Cleaned up many engine-specific labels, defaults, and settings names in backend and frontend code.

## Exit Criteria

Phase 11 is complete only when:

- There is one normal production synthesis runtime: TTS Server plus plugin/bridge/orchestrator.
- Main app code has no silent V1/local fallback when V2 services fail.
- Runtime behavior decisions use plugin metadata, handler registries, job kind, or storage contracts.
- Engine names in main app code are gone unless explicitly approved as migration code or meaningful tests.
- Legacy settings, metrics, routes, and storage names are converted or removed through explicit migration paths.
- Frontend and backend use generic concepts for default engine, voice asset, audio output, queue state, and job kind.
- The final reference audit has been run and any retained references are classified.

## Guardrails

- Do not preserve V1/beta backwards compatibility in main runtime code.
- Keep migration behavior explicit and isolated in migration modules.
- Keep plugin-internal engine names inside plugin packages.
- Do not remove user project assets or voice assets during cleanup unless the task is an explicit migration or user-approved cleanup.
- Do not keep old engine-named routes as permanent aliases.
- Keep tests that prove plugin identity, plugin behavior, or migration behavior. Remove tests that only protect dead compatibility paths.

## Current Work

The current remaining work and app-problem intake list live in:

- [phase_11_remaining_work.md](../implementation/phase_11_remaining_work.md)
