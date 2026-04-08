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

Studio 2.0 transitions to a **Local-First Modular Architecture** focused on:å

- **The Global Resource Lock**: A centralized orchestrator that enforces single-heavy-task execution for system stability.
- **Universal Voice Interface (VUI)**: A plugin bridge that standardizes how all synthesis engines (Local or Cloud) communicate with the system.
- **Layered State Management**: Utilizing Zustand to separate real-time feedback (Layer 1) from REST-based context resolution (Layer 2).

### Phased Roadmap

#### Stage 1: The Engine Foundation (VUI Bridge)

- [ ] Define the `BaseVoiceEngine` interface.
- [ ] Implement XTTS and Voxtral as modular plugins.
- [ ] Establish the `VoiceBridge` for standardized synthesis routing.

#### Stage 2: Independent Services (Progress & Data)

- [ ] Extract piece-mapping and ETA math into a standalone `ProgressService`.
- [ ] Implement the weighted-average ETA algorithm with `engine_speed_multiplier` support.

#### Stage 3: Orchestration (The Task Queue)

- [ ] Build the new `TaskOrchestrator` with `StudioTask` abstractions.
- [ ] Implement the `BoundedSemaphore` for single-heavy-worker enforcement.

#### Stage 4: The 2.0 Presentation Layer

- [ ] Implement the Zustand stores for Layer 1 reactivity.
- [ ] Integrate the new "Installed Voice Modules" UI and the production-centric Chapter Editor workflow.

### Acceptance Criteria

- [ ] All synthesis engines operate as modular plugins with their own configuration schemas.
- [ ] The orchestrator strictly limits concurrent heavy tasks to prevent system lockups.
- [ ] ETA predictions factor in engine-specific multipliers and actual hardware performance.
- [ ] Real-time progress is consistent across the entire UI and survives page reloads/interruptions.
- [ ] Legacy code is fully deprecated and replaced by the new domain-driven folder structure.
