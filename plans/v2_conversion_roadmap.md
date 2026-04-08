# Conversion Roadmap: Building Audiobook Studio 2.0

This plan breaks down the overarching 2.0 transition into four practical, highly cohesive stages. The strategy prioritizes foundational changes first, minimizing disruption to the live application while building the structure for the final switchover.

## Stage 1: The Engine Foundation (VUI Bridge)
Build the new Universal Voice Interface completely isolated from the current worker.
1. **Scaffolding**: Create the target 2.0 engine module area in the new architecture, aligning naming with the folder-structure plan instead of introducing another temporary namespace.
2. **Base Interface**: Define `BaseVoiceEngine` interface.
3. **Module Implementations**: Create `xtts_module.py` and `voxtral_module.py` that implement the interface by wrapping the existing generation functions.
4. **The Bridge**: Create `voice_bridge.py` to route requests.
5. **Testing**: Write unit tests (e.g., `test_v2_engines.py`) that call the `VoiceBridge` directly with mock inputs.
*Constraint: `app/jobs/worker.py` is entirely untouched at this stage.*

## Stage 2: Independent Services (Progress & Data)
Extract the complex logic from `worker.py` into standalone utility classes.
1. **Piece Mapping**: Build reconciliation around revision-aware artifact metadata so "completed" means "matches the current draft," not merely "file exists."
2. **ETA Engine**: Create `app/services/progress.py` with the new weighted average formula and the 1% tracking rules.
3. **Mock Runner**: Create `test_v2_progress.py` that simulates a job's progress loop to verify math accuracy.
*Constraint: Live jobs still use the old inline logic. New services are built alongside them.*

## Stage 3: Orchestration (The Shadow Queues)
Build the new `TaskOrchestrator` and connect it to the Foundation layers, establishing the single-machine semaphore locking.
1. **Task Abstraction**: Create the generic `StudioTask` with resource profiles and parent/child job semantics.
2. **Orchestrator**: Create the orchestrator with explicit resource quotas, starting with a default single-slot GPU policy.
3. **Integration**: Wire the `StudioTask` to call the `VoiceBridge` (from Stage 1) and report to the `ProgressService` (from Stage 2).
4. **Testing**: Create an integration suite (`test_v2_pipeline.py`) that submits dummy tasks into the new orchestrator and asserts resource locks are respected.

## Stage 4: The Cutover & Presentation UI
Disconnect the old wiring and attach the UI to the 2.0 backend.
1. **Backend Cutover**: Modify `web.py` to route API requests (enqueue, assemble) to the new `jobs_v2` orchestrator instead of `app/jobs/core.py`.
2. **Data Layer Hydration**: Keep REST data canonical, and use Zustand only for live overlays and session UI state to avoid dual truth.
3. **Zustand Socket Hookup**: Connect the Layer 1 WebSocket receiver to update the live store directly.
4. **Live Verification**: Run a full, end-to-end multi-chapter production in the browser. 

## Cross-Stage Refinements

- Keep naming consistent across roadmap, folder structure, and implementation docs so the migration does not invent temporary architectures.
- Add a product verification checklist alongside technical tests: resume after restart, rerender after text edit, failure recovery, and first-run module setup.
- Ship the queue and editor UX in the same phase as backend cutover; otherwise the new system will be technically correct but feel harder to use.

## Ongoing Verification Policy
- Before moving from Stage N to Stage N+1, the associated unit/integration tests must pass 100%.
- The transition is non-destructive until Stage 4; prior code remains in place to support the legacy system if rolled back.
