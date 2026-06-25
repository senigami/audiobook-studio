# Phase 11 Completed Work Log

This file preserves the Phase 11 work history for future summaries, changelogs, and release notes. It is not the active task board. Current open work lives in [phase_11_remaining_work.md](phase_11_remaining_work.md).

## Runtime Cutover

- Removed silent TTS Server fallback behavior that made failed service startup look like successful local execution.
- Removed runtime cutover flags and old feature-flag routing for Studio 2.0 behavior.
- Routed chapter generation, project assembly, voice build, and voice test actions through `TaskOrchestrator`.
- Added or verified integration coverage for orchestrated generation, assembly, and voice actions.
- Preserved explicit migration paths while removing normal runtime support for V1 behavior.

## Plugin And Engine Boundaries

- Moved XTTS, Voxtral, and mixed synthesis implementation ownership into `plugins/`.
- Kept engine-specific implementation details inside plugin packages or plugin-owned tests.
- Added plugin behavior metadata so app code can move toward capability and behavior checks.
- Removed direct generator calls from active app handlers and orchestration tasks.
- Relocated engine-owned tests into plugin-owned test folders.

## Storage And Manifest Cleanup

- Removed V1 storage fallback behavior from normal chapter, segment, voice, and project paths.
- Enforced V2 nested project and voice storage as the runtime standard.
- Removed project-root `audio/` and `text/` creation from new projects.
- Made new project creation write a V2 `project.json` manifest.
- Changed runtime project and voice manifest loading so missing manifests no longer imply V1.
- Moved missing-manifest-as-V1 assumptions into migration-only helpers.
- Removed import-time DB migration and moved migration execution to explicit startup.

## Queue, Progress, And ETA Work

- Restored real-time synthesis progress forwarding from engine log markers.
- Correlated progress updates by task id to avoid cross-task updates.
- Anchored render `started_at` timing to actual synthesis start instead of queue admission.
- Kept numeric progress as position only, with no sentinel values such as `0.01`.
- Added cancellation signaling so stopped queue tasks can terminate remote synthesis work.
- Hardened progress and ETA tests around marker-driven starts, progress scaling, and timing.

## Segment And Mixed Rendering Cleanup

- Removed legacy `chunk_` and `seg_` runtime naming support from normal segment paths.
- Kept segment audio under canonical V2 `chapters/{chapter_id}/segments/` storage.
- Added group-aware segment audio validation for mixed rendering.
- Fixed cleanup behavior so metadata updates do not delete still-valid done audio.
- Added regression tests for grouped segment validation and cleanup stability.

## Voice And Speaker Cleanup

- Moved active voice profile and engine resolution away from legacy speaker worker code.
- Enforced nested voice storage for voice actions and profile resolution.
- Updated voice security tests to use current manifest and path helpers.
- Removed or isolated flat voice fallback behavior from normal runtime resolution.
- Fixed Voxtral and XTTS plugin imports after V2 path helper removal.

## Documentation And Planning Cleanup

- Added `design-docs/plans/phase_11_audit.md` as the Phase 11 entry point.
- Replaced stale Phase 11 handoff, audit, and inventory documents with a concise charter and active task board.
- Added `design-docs/plans/implementation/phase_11_remaining_work.md` for app-problem triage and remaining cleanup.
- Updated local memory references so future sessions start from the current Phase 11 docs.

## Verification Notes

Completed slices were verified with focused backend tests, plugin tests, storage/security tests, progress tests, `ruff check` where relevant, and `git diff --check`. Run fresh verification for any future summary or release note because the working tree may have changed since individual slice verification.
