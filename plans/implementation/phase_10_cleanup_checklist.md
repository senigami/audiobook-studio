# Phase 10 Cleanup Checklist

## Purpose

This checklist captures the remaining cleanup work that belongs to the current Phase 10 wrap-up before Phase 11 begins. It is a short, bounded handoff list, not a new implementation phase.

## Current Cleanup Items

- [x] Verify the version bump to `2.0.0` is consistent across backend, frontend, and About/settings UI surfaces.
- [x] Confirm the runtime status/about panel text still matches the current TTS Server and plugin-backed architecture.
- [x] Re-run the remaining Settings/About and engine-related regression tests after the version bump.
- [x] Confirm there are no lingering UI strings or docs that still present `1.8.4` as current behavior.
- [x] Validate the remaining engine settings and diagnostics surfaces once more before handing off to Phase 11.

## Exit Criteria

- Phase 10 cleanup is complete.
- The current task stack is reduced to a clean, stable v2 runtime baseline.
- No remaining work items depend on v1 fallback behavior.
- Phase 11 can begin with the audit-first v1 cleanup workflow documented in the phase plan.
