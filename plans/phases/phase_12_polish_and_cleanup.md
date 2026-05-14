# Phase 12: Polish And Cleanup

## Status

Planned next phase after Phase 11 closeout.

## Objective

Close the remaining product polish, manual verification, and structural cleanup items that are useful before release documentation, but are not blockers for Phase 11's v2-only runtime and engine-agnostic cleanup exit criteria.

Phase 12 exists to avoid mixing user-facing polish and remaining master-plan extras into the Phase 11 hard-cutover cleanup. It should produce a stable, easier-to-document Studio 2.0 baseline before Phase 13 release documentation and distribution work begins.

## Scope

- Add chapter VCR-style playback controls: play, pause, stop, next, and previous.
- Manually verify Phase 11 fixed-but-pending app behaviors: engine settings tests, project load time, chapter render enqueue, duplicate voice option warnings, manifest test text, failed queue timestamps, server shutdown, and mixed render retry.
- Triage Vite websocket `ECONNRESET` logs and determine whether they are harmless reconnect noise or a lost-update path.
- Re-check project and chapter load performance on large books and trim obvious duplicate fetch or file-resolution hot paths.
- Implement or explicitly defer the generic plugin setup loop in `run.sh` and `run.ps1`.
- Finish the master agnostic task-board items that are polish-safe: plugin documentation, plugin template docs, resource metadata in manifests, generic route/doc cleanup, and final reference audits.
- Decide whether storage abstraction, generic job handler registry, `JobKind`/`TaskType`, and mixed-to-composite naming are needed before Phase 13 or should remain deferred architecture work.

## Non-Goals

- Do not reopen v1 compatibility or silent fallback behavior.
- Do not rename the `plugins/` namespace to `tts_engines/`; that remains a deferred structural phase.
- Do not treat release notes, screenshots, install validation, or promotional materials as Phase 12 work; those now belong to Phase 13.
- Do not add broad rewrites when a focused polish fix or explicit deferral is enough.

## Work Board

| Area | Status | Notes |
| --- | --- | --- |
| VCR-style chapter playback controls | Open | User-requested polish item carried forward from Phase 11 intake. |
| Manual QA of Phase 11 fixed items | Open | Verify the app flows that tests covered but manual app checks have not confirmed. |
| Vite websocket `ECONNRESET` triage | Open | Classify as harmless reconnect noise or fix the lost-update path if reproducible. |
| Large-book project/chapter load timing | Open | Use focused timing probes before changing fetch or storage paths. |
| Generic plugin setup loop | Open | Launchers are sanitized, but the automatic loop across plugin requirements remains pending. |
| Plugin and template docs | Open | Update developer-facing docs enough that Phase 13 can build on correct architecture. |
| Remaining master agnostic architecture extras | Needs decision | Storage abstraction, generic job registry, `JobKind`/`TaskType`, route cleanup, and mixed/composite naming should be completed or explicitly deferred. |
| Final reference audit | Open | Re-run app/core grep and classify retained engine names before Phase 13. |

## Exit Criteria

- VCR controls are implemented or intentionally deferred with a reason.
- Phase 11 fixed-but-pending manual QA items are verified, re-opened with concrete failures, or explicitly deferred.
- Remaining `master_agnostic_tasks.md` open items are sorted into complete, Phase 12, Phase 13, or deferred architecture buckets.
- Focused backend/frontend tests and `git diff --check` pass for touched areas.
- `Memory/state.json`, `Memory/active_context.md`, and relevant plan files identify Phase 13 as the release documentation/distribution phase.
