# Backend Rules

## 1. Source Of Truth And Artifact Safety

- Raw file existence alone is never enough to mark render work complete in Studio 2.0.
- Validated artifact manifests plus canonical persistence state determine whether output is reusable.
- Publish generated outputs atomically: temp file first, validate, write manifest, then promote into the final artifact location.
- Shared cached artifacts must be immutable once published.
- When job state is re-queued, recovered, or invalidated, clear stale runtime metadata and recalculate status from canonical state.

## 2. Progress And State Consistency

- WebSocket progress values must be rounded to exactly 2 decimal places.
- Only broadcast progress updates when the value advances meaningfully, the status changes, or the event carries important new context.
- Queue and progress services own progress math. Do not duplicate ETA or completion logic inside engine wrappers or route handlers.
- If a revision changes, mark prior artifacts stale explicitly rather than silently treating them as valid.

## 3. Queue And Domain Boundaries

- Route handlers should call domain services and orchestrator services, not engine-specific or worker-specific code directly.
- Engine wrappers must not decide scheduling policy.
- Queue tasks must declare resource needs; they must not acquire ad-hoc locks scattered through task code.
- Parent-child job behavior should be modeled explicitly rather than inferred from filenames or loose naming conventions.

## 4. Path Safety And Code Scanning

- Treat any filesystem path derived from request data, DB values, uploaded filenames, or user-editable names as untrusted.
- For existing files or directories, prefer enumerating a trusted root and matching by `entry.name`.
- For new paths, use the explicit containment pattern that CodeQL recognizes well:
  1. validate with a strict regex
  2. build with `os.path.join(...)`
  3. normalize with `os.path.normpath(...)`
  4. absolutize with `os.path.abspath(...)`
  5. verify the result stays under the trusted root before reading or writing
- Reject traversal-style input instead of silently “fixing” it.
- Do not hide security-critical path creation in vague helpers.

## 5. Structural Guidance

- Keep domain logic, orchestration logic, engine integration, and infrastructure concerns in separate modules.
- If a file exceeds roughly 500 lines, consider splitting it along real boundaries rather than by arbitrary helper extraction.
- Prefer explicit repositories and services over ad-hoc data access from route handlers and workers.

## 6. Legacy Compatibility Guidance

- During migration, compatibility adapters are acceptable, but they should live in explicit legacy or adapter layers.
- Do not let temporary migration code redefine the long-term architecture.
