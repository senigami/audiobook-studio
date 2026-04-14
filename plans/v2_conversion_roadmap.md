# Conversion Roadmap: Building Audiobook Studio 2.0

This roadmap is the index for the Studio 2.0 delivery phases. The detailed scope for each phase lives in its own document so we can evolve one stage without destabilizing the whole roadmap.

## Delivery Principles

- isolated modules over cross-cutting rewrites
- stub-first scaffolding before behavioral replacement
- feature-flagged cutovers over big-bang switches
- narrow, testable deliverables over oversized milestones

## Core Delivery Rule

Every phase must produce a deliverable that is:

- understandable on its own
- testable on its own
- reversible on its own
- useful for the next phase without forcing that phase to begin immediately

## Phase Index

### Phase 0

- [phase_0_planning_and_safety.md](/Users/stevendunn/GitHub-Steven/audiobook-factory/plans/phases/phase_0_planning_and_safety.md)
  Planning, rules, behavior audit, and migration safety baseline.

### Phase 1

- [phase_1_structure_and_stubs.md](/Users/stevendunn/GitHub-Steven/audiobook-factory/plans/phases/phase_1_structure_and_stubs.md)
  New directory structure, stub files, ownership comments, and zero-behavior-change scaffolding.

### Phase 2

- [phase_2_domain_contracts.md](/Users/stevendunn/GitHub-Steven/audiobook-factory/plans/phases/phase_2_domain_contracts.md)
  Domain model, persistence contracts, render-batch derivation, settings ownership, and artifact rules.

### Phase 3

- [phase_3_voice_interface.md](/Users/stevendunn/GitHub-Steven/audiobook-factory/plans/phases/phase_3_voice_interface.md)
  Engine registry, voice bridge, wrappers, module health, and preview/test flows.

### Phase 4

- [phase_4_progress_and_reconciliation.md](/Users/stevendunn/GitHub-Steven/audiobook-factory/plans/phases/phase_4_progress_and_reconciliation.md)
  Progress service, reconciliation, ETA, event contracts, and live-progress stability rules.

### Phase 5

- [phase_5_orchestrator.md](/Users/stevendunn/GitHub-Steven/audiobook-factory/plans/phases/phase_5_orchestrator.md)
  Resource-aware queue, task hierarchy, special job classes, and recovery.

### Phase 6

- [phase_6_frontend_foundations.md](/Users/stevendunn/GitHub-Steven/audiobook-factory/plans/phases/phase_6_frontend_foundations.md)
  Live overlay store, reconnect hydration, anti-regression merge rules, and queue/header cutover.

### Phase 7

- [phase_7_editor_and_voice_ux.md](/Users/stevendunn/GitHub-Steven/audiobook-factory/plans/phases/phase_7_editor_and_voice_ux.md)
  Block-aware editor behavior, render-batch actions, inline recovery, and voice UX.

### Phase 8

- [phase_8_cleanup_and_legacy_removal.md](/Users/stevendunn/GitHub-Steven/audiobook-factory/plans/phases/phase_8_cleanup_and_legacy_removal.md)
  Export finalization, cleanup, legacy deletion, and hardening.

### Phase 9

- [phase_9_plugins_and_api.md](/Users/stevendunn/GitHub-Steven/audiobook-factory/plans/phases/phase_9_plugins_and_api.md)
  Plugin ecosystem hardening, pip entry-point discovery, external TTS API authentication, rate limiting, and contributor tooling.

## Cross-Phase Rules

- each phase must leave the repo in a working state
- each phase must document what is still intentionally legacy
- each phase must define what is safe to debug in isolation
- if a phase starts to depend on unfinished later phases, stop and re-scope it
- each phase should maintain deliverables and verification checklists in its dedicated phase document
- new Studio 2.0 modules must not rely on legacy import-time side effects for correctness
- any needed interaction with legacy startup or worker lifecycle must go through an explicit compatibility seam and be called out in the phase notes
