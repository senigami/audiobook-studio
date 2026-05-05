# Phase 11 Audit Index

This is the entry point for Phase 11 cleanup and app-problem triage.

## Current Docs

- [Phase charter](phases/phase_11_v2_only_runtime_cleanup.md)
- [Remaining work and task board](implementation/phase_11_remaining_work.md)
- [Completed work log](implementation/phase_11_completed_work.md)

## Current Status

Phase 11 is active. The major V1 runtime fallbacks have been removed, but the remaining work is cleanup and verification around behavior policy, queue/job retirement, text/progress utilities, storage/output routes, state/settings/metrics migration, frontend assumptions, and bootstrap/docs.

## Current Task List

- [ ] Final reference audit and retained-reference classification
- [ ] Behavior helper hardening
- [ ] Job and queue decommissioning
- [ ] Plugin-owned text and progress utility cleanup
- [ ] Storage and output route abstraction
- [ ] State, settings, and metrics migration cleanup
- [ ] Frontend engine-agnostic cleanup
- [ ] Bootstrap and documentation cleanup
- [ ] Final backend/frontend verification and phase closeout

## Triage Rule

When a new app problem is reported, first map it to the task board in [phase_11_remaining_work.md](implementation/phase_11_remaining_work.md), then fix the smallest behavior path that resolves the problem.
