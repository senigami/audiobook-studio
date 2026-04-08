# Proposed Update for GitHub Epic #79

## New Title

**Epic: Studio 2.0 - Core Architectural Redesign & Modular Plugin System**

## New Description

### User Story

As an Audiobook Studio user, I want a modular, domain-driven architecture and a resource-aware task system so the application is exceptionally responsive, easily extensible with new engines, and resilient to state "drifting" or UI desynchronization.

### Problem

The 1.0 architecture relied on a monolithic `worker.py` and implicit workflow boundaries. This led to:

- **Resource Contention**: Multiple heavy threads competing for CPU/GPU, causing OS sluggishness.
- **Engine Locality**: Hard-coded branching logic for XTTS/Voxtral making it difficult to add new models.
- **State Drift**: UI components inferring status from shared global objects, causing "jumping" progress bars and desynchronized buttons upon page reloads.

### The 2.0 Architectural Vision

Studio 2.0 transitions to a **Local-First Modular Architecture** focused on:

- **Resource-Aware Orchestration**: A centralized scheduler that protects the machine from overload while still allowing safe concurrent light work.
- **Universal Voice Interface (VUI)**: A plugin bridge that standardizes how all synthesis engines (local or cloud) communicate with the system.
- **Layered State Management**: A single live-state layer for reactive updates paired with REST-backed hydration for reload-safe context resolution.
- **Artifact Integrity**: Render outputs are tracked by revision and content hash so resume logic never mistakes stale audio for valid audio.

### Phased Roadmap

#### Stage 1: The Engine Foundation (VUI Bridge)

- [ ] Define the `BaseVoiceEngine` interface.
- [ ] Implement XTTS and Voxtral as modular plugins.
- [ ] Establish the `VoiceBridge` for standardized synthesis routing.
- [ ] Start with an internal registry and stable manifest contract before opening the door to third-party plugin loading.

#### Stage 2: Independent Services (Progress & Data)

- [ ] Extract piece-mapping and ETA math into a standalone `ProgressService`.
- [ ] Implement the weighted-average ETA algorithm with persisted per-engine historical baselines and optional user override multipliers.
- [ ] Introduce segment revision hashes so progress reconciliation can distinguish "already rendered" from "rendered for an older draft."

#### Stage 3: Orchestration (The Task Queue)

- [ ] Build the new `TaskOrchestrator` with `StudioTask` abstractions.
- [ ] Implement resource profiles and quotas so local GPU synthesis, cloud synthesis, assembly, and exports can be scheduled safely without a one-size-fits-all lock.
- [ ] Add first-class support for cancel, retry, blocked, and review-required states.

#### Stage 4: The 2.0 Presentation Layer

- [ ] Implement the Zustand stores for Layer 1 reactivity.
- [ ] Integrate the new "Installed Voice Modules" UI and the production-centric Chapter Editor workflow.
- [ ] Ship queue visibility and failure recovery as part of the UX, not as a debug-only surface.

### Key Risks To Solve In The Epic

- **Overly coarse locking**: A single global heavy lock is safe, but it can underutilize cloud engines and make the app feel artificially slow. Solve this with resource profiles and per-engine concurrency rules.
- **False-positive resume state**: Filesystem existence alone is not enough to treat a segment as complete. Solve this with content hashes tied to text, voice, parameters, and engine version.
- **Plugin surface area too early**: Dynamic third-party plugin loading adds security and support complexity. Solve this by treating 2.0 plugins as internal modules first, with a strict manifest and compatibility layer.
- **Dual source of truth in the frontend**: Moving to Zustand without explicit state ownership can create another form of drift. Solve this by defining which data is authoritative in REST, which is ephemeral in live state, and how the two merge.
- **Over-automation in the editor**: Character detection and automatic voice mapping can help, but incorrect guesses will break trust fast. Solve this with suggestion-first UX, confidence states, and clear user approval points.

### Acceptance Criteria

- [ ] All synthesis engines operate behind a modular engine contract with their own manifests and configuration schemas.
- [ ] The orchestrator enforces resource-aware concurrency limits that protect the machine without unnecessarily blocking safe parallel work.
- [ ] Resume logic validates output artifacts against the current segment revision before marking them complete.
- [ ] ETA predictions factor in actual recent engine performance, persisted historical baselines, and optional user tuning.
- [ ] Real-time progress is consistent across the UI, survives reloads, and never regresses visually without an explicit status reason.
- [ ] The Chapter Editor supports fast preview, clear queue visibility, and safe recovery from failures without forcing full re-renders.
- [ ] The migration path replaces legacy internals incrementally without requiring a risky big-bang rewrite of routes or UI screens.
