# Phase 10 Cleanup Checklist

## Purpose

This checklist captures the remaining cleanup work that belongs to the current Phase 10 wrap-up before Phase 11 begins. It is a short, bounded handoff list, not a new implementation phase.

## Current Cleanup Items

- [x] Verify the version bump to `2.0.0` is consistent across backend, frontend, and About/settings UI surfaces.
- [x] Confirm the runtime status/about panel text still matches the current TTS Server and plugin-backed architecture.
- [x] Re-run the remaining Settings/About and engine-related regression tests after the version bump.
- [x] Confirm there are no lingering UI strings or docs that still present `1.8.4` as current behavior.
- [x] Validate the remaining engine settings and diagnostics surfaces once more before handing off to Phase 11.
- [x] Resolve the remaining backend pipeline issues before freezing the Phase 10 cutover checkpoint.

## Handoff Notes

- Phase 10 is wrapped and the active branch has moved to `studio2/phase-11`.
- Backend CI stabilization was completed with the Studio 2.0 defaults still enabled: `USE_TTS_SERVER=True` and `USE_STUDIO_ORCHESTRATOR=True`.
- CodeQL is intentionally deferred to the normal security verification track. GitHub is configured for advanced setup, and CodeQL findings should be triaged after the main Phase 11 task slice is stable unless they directly block the work.
- Phase 11 should begin with the audit inventory, not deletion.

## Exit Criteria

- [x] Phase 10 cleanup is complete.
- [x] The remaining backend pipeline issue is resolved or explicitly tracked.
- [x] The current task stack is reduced to a clean, stable v2 runtime baseline.
- [x] Phase 11 can begin with the audit-first v1 cleanup workflow documented in the phase plan.
- [ ] Phase 11 confirms every remaining v1 fallback dependency before removing or replacing it.
