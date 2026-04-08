# Conversion Roadmap: Building Audiobook Studio 2.0

This is the implementation sequence I want us to follow. It is structured to reduce migration risk, validate new contracts early, and avoid a frontloaded UI rewrite before the backend foundations are real.

## Phase 0: Architecture Freeze And Safety Prep

### What I want to create

- Final 2.0 plan set and rules
- Target folder structure
- Feature flags for progressive cutover
- Stable test fixtures for projects, chapters, voices, and mock renders

### How I want to do it

1. Finalize the 2.0 plan and rule documents.
2. Introduce feature flags for queue, editor, and engine-bridge cutovers.
3. Capture representative fixtures from current production-like flows.
4. Define the baseline smoke tests we will use across the migration.

### Exit criteria

- The team has one agreed source of truth for architecture decisions.
- We can run the same fixture set through legacy and 2.0 code paths for comparison.

## Phase 1: Domain Data Model And Artifact Contract

### What I want to create

- Explicit data contracts for project, chapter, block, voice, artifact, queue job, and snapshot
- Explicit render-batch model distinct from production blocks
- Explicit settings ownership model for global, project, module, and profile-preview settings
- Revision hash rules
- Artifact manifest format
- Stable project-root and cache-root path rules

### How I want to do it

1. Add the new domain model definitions and persistence adapters.
2. Define render-batch derivation rules in the chapter domain.
3. Define settings ownership and migration rules.
4. Define artifact hashing inputs and manifest schema.
5. Introduce immutable artifact cache semantics.
6. Write tests for revision matching, stale detection, grouped batching, settings ownership, and project portability.

### Exit criteria

- We can answer “is this render still valid?” deterministically.
- We can create or reconcile a chapter without relying on raw file existence.

## Phase 2: Universal Voice Interface

### What I want to create

- `BaseVoiceEngine`
- Engine registry and bridge
- XTTS and Voxtral wrappers behind the new contract
- Voice-module settings and health model

### How I want to do it

1. Wrap existing XTTS and Voxtral behavior without changing external product behavior.
2. Add preflight validation and capability checks.
3. Persist engine/version/voice-asset snapshots at queue time.
4. Test the bridge with mock engines and representative requests.

### Exit criteria

- The backend can queue synthesis through the new bridge without worker-specific engine branching.
- Engine setup and readiness are inspectable in a consistent way.
- Preview/test behavior is preserved as a first-class voice workflow, not left as an afterthought.

## Phase 3: Progress, Reconciliation, And Broadcasting

### What I want to create

- Central progress service
- Reconciliation based on revision-safe artifacts
- ETA service with historical baselines plus live sampling
- Unified event/broadcast contract for jobs and blocks

### How I want to do it

1. Build progress math and broadcaster independent of the new orchestrator.
2. Feed the service with simulated and mocked workloads first.
3. Validate restart, rerender-after-edit, and stale-output scenarios.
4. Preserve or improve the current smooth-progress UX semantics.

### Exit criteria

- Progress never relies on page-local math.
- Resume and rerender flows are stable in tests.

## Phase 4: Resource-Aware Orchestrator

### What I want to create

- `StudioTask` hierarchy
- Resource policy model
- Parent-child job model
- Recovery, cancelation, retry, and review-required states

### How I want to do it

1. Introduce the new queue beside the legacy worker behind a feature flag.
2. Implement scheduler policies around resource claims.
3. Wire the orchestrator to the engine bridge and progress service.
4. Verify recoverability, fairness, and clear waiting-state reporting.

### Exit criteria

- The 2.0 queue can run representative multi-chapter flows safely.
- Recovery and cancelation semantics are predictable and tested.

## Phase 5: Frontend State Cutover And New UX

### What I want to create

- Explicit live-overlay store
- Reload and reconnect hydration flow
- New queue UX with waiting reasons and recovery states
- 2.0 chapter editor workflow and voice-module management screens
- Settings and preview flows aligned to the new ownership model

### How I want to do it

1. Keep canonical entity loading in API hooks and add the live-overlay store separately.
2. Migrate the queue and header progress surfaces first.
3. Migrate the chapter editor to block-aware local draft plus server hydration.
4. Add empty, loading, error, reconnecting, and recovered states intentionally.

### Exit criteria

- Refresh, reconnect, and restart behavior are believable to users.
- The editor supports targeted rerender and stale-state awareness.

## Phase 6: Cleanup, Removal, And Hardening

### What I want to create

- Removal of legacy worker-centric code that has been fully replaced
- Final path consolidation into the new source layout
- Final documentation, wiki updates, and changelog entries

### How I want to do it

1. Remove dead compatibility paths only after the new path is stable.
2. Collapse legacy adapters into direct 2.0 implementations.
3. Run full regression verification across queue, editor, library, and export flows.

### Exit criteria

- The application no longer depends on legacy worker-centric assumptions.
- The repo structure reflects the actual architecture instead of the migration path.

## Cross-Phase Procedures

- Every phase must ship with tests for the behaviors it changes.
- Every phase must preserve a rollback path until the next phase is verified.
- Docs and rules must be updated before or alongside implementation, not as cleanup.
- If a phase uncovers a bad assumption in the plan, update the plan before continuing.
