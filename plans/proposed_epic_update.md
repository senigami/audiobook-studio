# Proposed Update for GitHub Epic #79

## Title

**Epic: Studio 2.0 - Production-Grade Architecture, Queueing, and Editor Redesign**

## Summary

Studio 2.0 is not a cosmetic refactor. It is the foundation we will use to build the rest of the product, so the plan must optimize for correctness, resilience, and editor speed before extensibility.

The current system works, but too much behavior is hidden inside the legacy worker loop, ad-hoc engine integration, and page-level state coordination. That makes the application harder to evolve and easier to desynchronize. Studio 2.0 replaces that with a clear domain model, revision-safe render artifacts, resource-aware orchestration, and a production-first authoring experience.

## Desired User Outcomes

- Users can edit a chapter, rerender only what changed, and always understand what is queued, rendered, stale, or failed.
- Users can trust that refreshes, crashes, and restarts will recover to the correct state without mystery regressions.
- Users can manage voices, projects, and exports without engine-specific clutter leaking into every screen.
- Users can grow from a single short project to a multi-volume production without the app collapsing under state drift or path sprawl.

## What Studio 2.0 Will Create

### 1. A Real Domain Model

- Project, chapter, production block, voice profile, render artifact, queue job, and snapshot all become explicit first-class concepts.
- Resume and reuse will be based on revision-safe artifact metadata, not just “does a file exist.”
- Project data will live under stable project roots, with a shared immutable artifact cache where reuse is safe.

### 2. A Universal Voice Interface

- Every engine will be wrapped behind a common contract.
- Engine availability, settings, and capability checks will happen before queueing.
- Engine-specific settings will live in a dedicated voice-module management surface instead of being scattered across project screens.

### 3. A Resource-Aware Orchestrator

- The queue will schedule by resource profile, not just “heavy vs light.”
- Jobs will support parent-child structure, clear waiting reasons, retries, cancelation, recovery, and review-required states.
- The queue will remain single-machine-first, but it will stop treating cloud calls, CPU normalization, and GPU synthesis as identical work.

### 4. A Revision-Safe Progress System

- Progress will reconcile against expected artifacts tied to the current revision.
- ETA will use historical baselines plus live sampling, not raw guesswork.
- The UI will show why progress is paused, recalculating, or waiting, instead of just moving bars around.

### 5. A Production-Centric Chapter Editor

- Chapters will be edited as stable production blocks, not only as a giant text blob.
- The editor will support local draft state, debounced autosave, targeted rerender, character-to-voice mapping, and inline failure recovery.
- Fast preview and “render changed” workflows will be core paths, not add-ons.

## Non-Goals For The Initial 2.0 Cut

- Arbitrary third-party plugin execution.
- Distributed workers, Redis, Celery, or multi-machine orchestration.
- Simultaneous storage migration and full product rewrite in one step.
- Unlimited revision history for every block and asset.
- Silent engine fallback that changes voice output without user awareness.

## Major Design Decisions

### Artifact Truth Over Raw File Truth

- A render is complete only when a validated artifact manifest matches the current block revision, engine version, voice asset, and synthesis settings.
- Raw file existence alone is never enough to mark work complete.

### REST Owns Canonical Entities, Live Store Owns Overlays

- Canonical project/chapter/library data comes from the API.
- Real-time progress, queue overlays, reconnect state, and local draft session state live in the frontend store.
- The store must not become a second database.

### Internal Module System First

- “Plugins” in 2.0 are internal engine modules behind a manifest and registry.
- External plugin loading is deferred until compatibility, trust, and support boundaries are solved.

### Strangler Migration Instead Of Big-Bang Rewrite

- New services are introduced behind adapters and feature flags.
- Legacy routes and UI can keep working while new internals are validated.
- Cleanup happens only after new flows prove themselves in production-like testing.

## Biggest Risks And How We Will Solve Them

- **Coarse queue locking wastes safe concurrency**
  Solution: model resources explicitly and give each task a resource claim.
- **Resume logic marks stale audio as complete**
  Solution: require revision hashes and artifact manifests for reconciliation.
- **Frontend state splits into competing truths**
  Solution: define hard ownership boundaries between REST entities and live overlays.
- **Character detection and voice assignment overreach**
  Solution: keep AI assistance suggestion-first with confidence labels and explicit approval.
- **Storage and path contracts remain too implicit**
  Solution: define a concrete domain data model and on-disk layout before queue cutover.

## Delivery Plan

1. Define the domain data model and artifact contract.
2. Build the engine bridge and internal engine registry.
3. Build progress reconciliation and ETA services against the new artifact model.
4. Build the resource-aware orchestrator and recovery flow.
5. Cut the frontend over to the new state boundaries and editor workflow.
6. Remove legacy glue only after the new path is verified end to end.

## Success Criteria

- All synthesis runs through a modular engine contract with capability checks and manifests.
- All render completion and resume decisions are revision-safe.
- Queue status is explainable at all times, including waiting and recovery states.
- The Chapter Editor supports targeted rerender, stale-state awareness, and inline failure handling.
- The frontend reloads and reconnects without progress drift or state duplication.
- Projects remain portable, and shared artifact reuse never creates hidden cross-project mutation.
- The migration path is incremental, reversible, and verified at each phase.

## Reference Plans

- `plans/implementation/domain_data_model.md`
- `plans/v2_folder_structure.md`
- `plans/v2_voice_system_interface.md`
- `plans/v2_queuing_system.md`
- `plans/v2_progress_tracking.md`
- `plans/v2_chapter_editor_workflow.md`
- `plans/v2_project_library_management.md`
- `plans/v2_conversion_roadmap.md`
