# Modular Architecture Rules (Studio 2.0)

## 1. Engine Isolation
- No engine-specific logic (e.g., hardcoded XTTS or Voxtral parameters) should exist in core services or UI components.
- All voice synthesis must be delegated to a common engine interface.
- New engines must register themselves via a manifest and implement the standard `BaseVoiceEngine` methods.

## 2. Task Genericity
- All background jobs must inherit from the `StudioTask` base class.
- Branching logic based on "Engine Type" in the main worker loop is prohibited; the worker should simply call `task.run()`.

## 3. Progress & State Consistency
- Use the centralized `ProgressService` for all ETA predictions and progress broadcasting.
- Manual filesystem checks for job resumption logic are deprecated; use the `PieceMapper` utility instead.
- Follow the 1% broadcast rule (defined in `backend.md`) but ensure all updates flow through the unified reporting interface.

## 4. Path & Asset Management
- All production assets (chunks, samples, temp files) must be managed by the `ProjectManager` service. 
- Avoid hardcoding absolute paths to globally shared directories like `outputs/` or `audiobooks/` within specific engine modules.

## 5. Schema Integrity
- Voice profiles must adhere to the `VoiceManifest` JSON schema to ensure they can be used interchangeably by compatible engines.
- Project state must be stored in a portable format within the project's own data root.
