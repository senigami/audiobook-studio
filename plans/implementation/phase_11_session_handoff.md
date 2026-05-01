# Phase 11 Session Handoff

## Current State

- Branch: `studio2/phase-11`
- Product baseline: `2.0.0`
- Phase 10 cleanup is wrapped.
- Phase 11 is active as an audit-first cleanup phase.
- Phase 12 remains deferred until Phase 11 is complete.
- Production defaults are intentional: `USE_TTS_SERVER=True` and `USE_STUDIO_ORCHESTRATOR=True`.

## Phase 11 Goal

Remove silent v1/in-process runtime fallback from production paths so the managed TTS Server and plugin runtime are the normal Studio 2.0 behavior. TTS Server failures should be visible, actionable service states rather than hidden success through older adapters.

## First Checkpoint

The first Phase 11 checkpoint is an inventory, not a deletion pass:

- Create and maintain `plans/implementation/phase_11_v1_cleanup_inventory.md`.
- Classify each legacy/fallback item by path, kind, current references, runtime impact, desired outcome, risk, and verification.
- Separate production fallback from migration/data compatibility.
- Keep migration readers and compatibility shims that protect existing user data.
- Do not remove local XTTS/Voxtral adapters until production references and tests are explicit.

## Current Inventory Artifact

- `plans/implementation/phase_11_v1_cleanup_inventory.md`

The initial inventory identifies these high-risk cleanup fronts:

- `app/boot.py` mutates `USE_TTS_SERVER=0` after watchdog startup failure.
- `app/engines/watchdog.py` mutates `USE_TTS_SERVER=0` after circuit-open and restart-failure paths.
- `app/engines/bridge.py` and `app/engines/bridge_local.py` still provide local in-process runtime routing.
- `app/engines/registry.py` still imports built-in XTTS/Voxtral adapters and duplicate built-in manifests.
- `tests/test_boot.py`, `tests/test_api_system.py`, `tests/conftest.py`, and `tests/bridge/*` still encode local fallback expectations.
- Plugin engines still call legacy helper implementations internally; that is real debt, but not the same as silent production failover and should be deferred until the automatic fallback paths are removed.

## Suggested Next Slice

Start with the smallest behavior-changing slice:

1. Rewrite boot/watchdog/system tests so failed TTS Server startup is reported as an unavailable/degraded service state.
2. Remove `USE_TTS_SERVER=0` mutation from `app/boot.py`.
3. Remove `USE_TTS_SERVER=0` mutation from `app/engines/watchdog.py`.
4. Update system/runtime-service presentation to avoid `Single-Process (Fallback from Crashed Subprocess)` as a ready state.
5. Verify with:

```bash
./venv/bin/python -m pytest tests/test_boot.py tests/test_api_system.py tests/test_tts_server_health.py
```

## Guardrails

- Do not flip Studio 2.0 defaults back to old behavior to satisfy tests.
- Do not remove storage migration or compatibility readers in the runtime fallback slice.
- Do not delete duplicate built-in engine files until bridge, registry, and tests no longer import them.
- Do not treat plugin-internal use of legacy generator helpers as equivalent to automatic production fallback.
- Codex owns final review, verification, memory updates, and checkpoint commits.
- Antigravity/Gemini can be used for bounded sweeps or narrow patches, but Codex must review diffs and rerun verification.
