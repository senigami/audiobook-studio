# Modular Architecture Rules (Studio 2.0)

## 1. Domain First

- Project, chapter, production block, voice profile, voice asset, render artifact, queue job, and snapshot are first-class concepts.
- Do not hide core domain state inside worker-local or component-local assumptions.

## 2. Engine Isolation

- Engine-specific logic must live behind the engine registry and voice bridge.
- New engines must register through manifests and implement the standard engine contract.
- Queue code, route handlers, and UI components must not branch on engine IDs for core behavior.

## 3. Artifact And Revision Safety

- Completion and reuse decisions must be based on validated artifact metadata tied to the requested revision.
- Raw file existence is insufficient for completion, reuse, or recovery.
- Shared artifact cache entries must be immutable.

## 4. Queue And Progress Boundaries

- All background work should flow through `StudioTask`-style task abstractions.
- Scheduling policy belongs in the orchestrator and scheduler layers, not inside task implementations.
- Progress math and reconciliation belong to the centralized progress services.

## 5. Frontend State Boundaries

- Canonical entity data comes from API hydration.
- Live queue and progress overlays belong to the frontend store.
- Local editor draft state must not overwrite canonical server state blindly.

## 6. Migration Rules

- The target architecture should not be diluted by temporary migration shortcuts.
- Keep compatibility adapters explicit and removable.
- Remove legacy paths only after the new path is verified end to end.
- New Studio 2.0 modules must not import `app.web` or `app.jobs` directly.
- Legacy startup, worker boot, and listener registration side effects must stay behind explicit app-entry or compatibility boundaries until they are intentionally replaced.

## 7. Path And Asset Ownership

- Projects own project-local drafts, exports, and references.
- The library owns reusable voice identity and voice assets.
- The shared artifact cache owns immutable generated outputs.

## 8. Import-Time Safety

- Importing a new domain, orchestration, engine, or frontend-support module must not start threads, mutate global settings, register listeners, or reconcile persistent state.
- If a legacy module has import-time side effects, treat it as an integration boundary and document the dependency explicitly instead of importing it casually from new code.
