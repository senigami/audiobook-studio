# Future Work Integration Analysis: Studio 2.0

This document analyzes the open GitHub issues from the backlog against the proposed Studio 2.0 architecture to ensure the new direction remains flexible and does not block upcoming features.

## General Verdict: 100% Compatible
The 2.0 architecture—specifically the transition to a Domain-Driven folder structure, a modular Task Queue, and the Universal Voice Interface (VUI)—not only supports these future features but actively makes them easier to implement than the 1.0 monolithic codebase.

---

## Issue Integration Breakdown

### [Issue #80] Unify progress display logic
* **2.0 Impact**: Solved natively.
* **Analysis**: This issue correctly diagnoses the exact problem 2.0's **Progress & ETA Service** (Stage 2) is built to fix. By decoupling progress polling from component state and moving it to a central Zustand `useJobStore` (Layer 1), queue items, headers, and segment cards will all read from the exact same state slice. No further architectural tweaks are needed.

### [Issue #78] Add Playwright end-to-end coverage
* **2.0 Impact**: Highly Recommended for Stage 4.
* **Analysis**: 2.0 proposes isolated unit/integration tests for the backend (Mock Engines, Shadow Queues). Playwright coverage is the perfect missing link for **Stage 4 (The Cutover)** to verify that the new Layer 1/Layer 2 frontend hydration logic correctly restores state after a page refresh. We should mandate Playwright tests for the new Zustand stores.

### [Issue #56] don't make mp3's unless asked
* **2.0 Impact**: Fits naturally into the lightweight Task Queue.
* **Analysis**: In 2.0, assembly and conversion are treated as `Light` profile tasks in the `ThreadPoolExecutor`. Adding an MP3 toggle simply means passing a metadata flag to the `ExportTask`. This requires zero changes to the 2.0 queuing blueprint.

### [Issue #38] Refactor voice storage to nested folders & [Issue #39] Portable voice bundles
* **2.0 Impact**: Synergizes with the new `plugins/` structure.
* **Analysis**: The legacy flat-folder storage (`Dracula - Angry`) is fragile. The 2.0 plan proposes moving engine logic to `app/plugins/voice/`. Issues #38 and #39 (nested storage and importing zip bundles) should be implemented as part of the `domain/library/` feature set. 
* **Recommendation**: Implement Studio 2.0 *first* using the old paths, then tackle Issue #38. Modifying storage layouts while rewiring the entire queue simultaneously introduces too much migration risk.

### [Issue #20] Workflow for larger trained voice models (local checkpoints)
* **2.0 Impact**: Validates the Universal Voice Interface (VUI).
* **Analysis**: The VUI Bridge relies on `settings_schema.json` to inject arbitrary parameters into engines. Supporting a "Deep Trained Model" just means adding a `custom_checkpoint_path` field to the schema. The global queue doesn't need to know the model is computationally heavier; it just knows it's a `HEAVY` synthesis task.

### [Issue #19] Book backup and restore via dated zip bundles
* **2.0 Impact**: Fits cleanly into the new `domain/projects/` structure.
* **Analysis**: This is a pure IO task. The 2.0 `TaskOrchestrator` is perfectly equipped to handle zip-archiving in its background lightweight thread pool without blocking the UI or the main GPU. 

### [Issue #18] Refactor chapter editing so production segments are the source of truth
* **2.0 Impact**: Solved natively.
* **Analysis**: This issue is the functional basis for the `v2_chapter_editor_workflow.md` blueprint. 2.0 embraces the "Segment-First" architecture conceptually and visually.

## Conclusion & Roadmap Flexibility
The 2.0 blueprints do not require any alterations to support the backlog. 

**Recommendation for Future Work**:
1. Complete the core 2.0 cutoff (Stages 1-4) first.
2. Use Issue #80 and #18 as the Acceptance Criteria for concluding Stage 4 (The UI Cutover).
3. Tackle the Voice File Storage/Bundle features (#38, #39, #20) post-2.0, utilizing the new `domain/library/` service structures.
