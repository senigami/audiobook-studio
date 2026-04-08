# Conversion Roadmap: Building Audiobook Studio 2.0

This plan breaks down the overarching 2.0 transition into four practical, highly cohesive stages. The strategy prioritizes foundational changes first, minimizing disruption to the live application while building the structure for the final switchover.

## Stage 1: The Engine Foundation (VUI Bridge)
Build the new Universal Voice Interface completely isolated from the current worker.
1. **Scaffolding**: Create `app/engines_v2/` directory.
2. **Base Interface**: Define `BaseVoiceEngine` interface.
3. **Module Implementations**: Create `xtts_module.py` and `voxtral_module.py` that implement the interface by wrapping the existing generation functions.
4. **The Bridge**: Create `voice_bridge.py` to route requests.
5. **Testing**: Write unit tests (e.g., `test_v2_engines.py`) that call the `VoiceBridge` directly with mock inputs.
*Constraint: `app/jobs/worker.py` is entirely untouched at this stage.*

## Stage 2: Independent Services (Progress & Data)
Extract the complex logic from `worker.py` into standalone utility classes.
1. **Piece Mapping**: Create `app/utils/piece_mapper.py` capable of analyzing a chapter and determining exactly which segments are pending versus completed.
2. **ETA Engine**: Create `app/services/progress.py` with the new weighted average formula and the 1% tracking rules.
3. **Mock Runner**: Create `test_v2_progress.py` that simulates a job's progress loop to verify math accuracy.
*Constraint: Live jobs still use the old inline logic. New services are built alongside them.*

## Stage 3: Orchestration (The Shadow Queues)
Build the new `TaskOrchestrator` and connect it to the Foundation layers, establishing the single-machine semaphore locking.
1. **Task Abstraction**: Create `app/jobs_v2/tasks.py` defining the generic `StudioTask` (Heavy vs Light profiles).
2. **Orchestrator**: Create `app/jobs_v2/orchestrator.py` with the Semaphore implementation.
3. **Integration**: Wire the `StudioTask` to call the `VoiceBridge` (from Stage 1) and report to the `ProgressService` (from Stage 2).
4. **Testing**: Create an integration suite (`test_v2_pipeline.py`) that submits dummy tasks into the new orchestrator and asserts resource locks are respected.

## Stage 4: The Cutover & Presentation UI
Disconnect the old wiring and attach the UI to the 2.0 backend.
1. **Backend Cutover**: Modify `web.py` to route API requests (enqueue, assemble) to the new `jobs_v2` orchestrator instead of `app/jobs/core.py`.
2. **Data Layer Hydration**: Update the Zustand stores in `frontend/src/api/` to handle Layer 2 hard-lookups.
3. **Zustand Socket Hookup**: Connect the Layer 1 Websocket receiver to update the Zustand store directly.
4. **Live Verification**: Run a full, end-to-end multi-chapter production in the browser. 

## Ongoing Verification Policy
- Before moving from Stage N to Stage N+1, the associated unit/integration tests must pass 100%.
- The transition is non-destructive until Stage 4; prior code remains in place to support the legacy system if rolled back.
