# Transformation Strategy: Converting to Studio 2.0

## 1. Objective
Define a safe, modular path for migrating the legacy monolithic logic into the 2.0 architecture, ensuring that every component is verified in isolation before being integrated into the production pipeline.

## 2. Verification Strategy (The "Isolated First" Rule)

To ensure "accurate functionality before integration," every 2.0 module must pass a three-stage verification process.

### Stage 1: Functional Unit Testing
New services (e.g., `ProgressService`, `QueueManager`) will be tested using **Mock Drivers**.
- **The Mock Engine**: A simulated voice engine that implements the `BaseVoiceEngine` interface but only produces silent silence after a delay. This allows testing the Queue and Progress components without CUDA or API dependencies.
- **The Simulated Worker**: Feeds high-frequency progress updates to the `ProgressService` to verify the ETA math remains stable under pressure.

### Stage 2: Database & State Shadowing
Before relying on the new `ProjectManager`, we will implement a "State Validator". 
- **Method**: The 2.0 DB schema is built in parallel. During a legacy render, the validator synchronizes data into the 2.0 schema and checks for integrity errors without affecting the live job.

### Stage 3: Visual & Broadcast Verification
Using the "Side-by-Side" approach in the frontend:
- **Test Dashboard**: A developer-only page that renders the 2.0 components (like the new Chapter Editor) using the same project data as the live editor. 
- **Consistency Check**: Verify that the new Zustand store and the legacy websocket bridge are announcing the same status for every segment.

## 3. Phased Roadmap

### Phase 1: The Core Foundation (No User-Visible Change)
- Implement `BaseVoiceEngine` and migrate XTTS/Voxtral logic into wrappers.
- Implement the `ProgressService` math and `PieceMapper`.
- **Validation**: Pass current `test_engines.py` and `test_progress_logic.py` using the new 2.0 classes.

### Phase 2: Orchestration Overhaul
- Deploy the `QueueManager` and `TaskOrchestrator`.
- **Safety Switch**: Introduce a backend flag `USE_V2_QUEUE=True`. If `False`, the system falls back to the legacy `worker.py`.
- **Validation**: Successfully render a multi-chapter book using the 2.0 pipeline with 0% error rate.

### Phase 3: Presentation & React Layer
- Implement the Zustand state stores (`useJobStore`, `useProjectStore`).
- Migrate `ChapterEditor` and `ProjectLibrary` to the 2.0 architecture.
- **Validation**: Manual UI verification by the user to ensure the "wow" factor and snappiness are preserved.

## 4. Test Matrix per Component

| Component | Target Functionality | Verification Method |
| :--- | :--- | :--- |
| **Queue Manager** | Resource locking, prioritization | `pytest` with 10 concurrent heavy/light tasks. |
| **VUI Bridge** | Modular setting injection | Verify `AudiobookEngine` receives correct engine-specific JSON. |
| **Progress Service** | ETA drift, resumption mapping | Compare predicted vs actual time for 5 simulated jobs. |
| **Zustand Store** | Real-time reactivity | Component tests verifying < 50ms re-render on progress. |

## 5. Definition of "Done" for Integration
A component is ready for integration only when:
1. It achieves 100% pass on Stage 1 (Unit Tests) and Stage 2 (State Shadowing).
2. It has documented compliance with the `modular_architecture.md` rules.
3. The "Legacy Fallback" remains fully functional until the final Phase 3 sign-off.
