# Current Architecture Mapping: Audiobook Studio

This document is the honest baseline for Studio 2.0 planning. It describes how the application works today, where the coupling lives, and which constraints the migration must respect.

## 1. System Topology Today

Audiobook Studio is a FastAPI backend with a React frontend. The product already supports project management, chapter editing, voice management, queue visibility, and XTTS/Voxtral generation, but many responsibilities are shared implicitly across modules instead of being represented as explicit domain contracts.

## 2. Backend Reality

### 2.1 Queueing And Worker Flow

- `app/jobs/worker.py` is the operational center of the current pipeline.
- `app/jobs/core.py` provides the in-memory queue structures.
- `app/jobs/handlers/` contains engine-specific and job-specific logic.
- Progress math, resume logic, queue state mutation, and engine branching are split across worker code, queue code, and handler code.

### 2.2 Engine Integration

- XTTS and Voxtral are integrated differently and require different path lookup and invocation patterns.
- Engine-specific assumptions leak into queue and job handling.
- There is no stable artifact contract describing what was rendered, by which engine, with which settings.

### 2.3 State And Persistence

- SQLite stores persistent business data.
- `app/state.py` and in-memory job objects still carry important operational truth.
- Restart recovery depends on synchronization between DB state, in-memory queues, and filesystem presence.

### 2.4 Filesystem And Asset Ownership

- Filesystem layout is meaningful, but the ownership model is not yet strict enough.
- Legacy logic often checks for outputs directly instead of validating whether the output matches the current request.
- Shared assets and project-local assets are not yet separated as cleanly as 2.0 requires.

## 3. Frontend Reality

### 3.1 Route-Level Composition

- `App.tsx` still coordinates a lot of global fetching and queue wiring.
- Route screens depend heavily on top-level hooks and prop threading.
- The current route structure is functional, but not yet feature-isolated.

### 3.2 State Coordination

- `useJobs`, `useWebSocket`, and per-screen hooks do most of the real-time work today.
- Progress and job data are already being handled carefully, but ownership boundaries are not explicit enough for a larger 2.0 editor and queue system.
- The app risks live-state duplication if we add a new store layer without defining exactly what it owns.

### 3.3 Editor Complexity

- The chapter editor is already complex and is doing real production work.
- It manages segmented generation behavior, playback, voice choices, queue-related state, and refresh logic.
- That means the 2.0 editor plan must be an extraction and improvement, not a naïve rewrite that ignores the current behavioral surface.

## 4. Existing Bottlenecks

### 4.1 Hidden Domain Model

The application clearly has domain concepts such as project, chapter, segment, voice profile, and render job, but those contracts are not represented strongly enough in code or storage.

### 4.2 Resume Logic Is Too Implicit

File existence and status flags can disagree. Without revision-aware artifact metadata, recovery logic cannot be fully trustworthy.

### 4.3 Queue Semantics Are Too Narrow

The current system is safer than many naïve async systems, but it still treats too much work as if it belonged to the same bucket.

### 4.4 UI State Recovery Still Requires Too Much Coordination

The current UI has already developed techniques to avoid regressions, but the responsibility is spread across hooks, components, and refresh patterns instead of explicit state architecture.

## 5. Constraints The 2.0 Migration Must Respect

- The existing product is already useful, so the migration must be incremental.
- XTTS subprocess isolation is valuable and should be preserved conceptually even if its wrapper changes.
- Fast feedback in the editor is a product requirement, not a nice-to-have.
- Path safety remains a security boundary and must get stronger, not looser.
- The new system must be understandable enough that future features do not reintroduce worker-centric coupling.

## 6. What 2.0 Must Fix Without Breaking

- Preserve current core capabilities: project management, segmented generation, queue recovery, preview, and export.
- Replace worker-centric logic with domain services and orchestration boundaries.
- Make artifact reuse safe and auditable.
- Prevent the frontend from accumulating multiple competing sources of truth.
- Keep the migration reversible until the new path is fully verified.
