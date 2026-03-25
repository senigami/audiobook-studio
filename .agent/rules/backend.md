# Backend Rules

## Progress And State Consistency

- WebSocket progress values must be rounded to exactly 2 decimal places.
- Only broadcast progress updates when the value advances by at least 1%.
- When a job is re-queued, reset, or recovered, clear stale metadata such as logs, timestamps, progress, and warnings.
- Disk state is the source of truth when UI status and actual files disagree.

## Technical Environment

- Always use the local `./venv` for backend tooling.
- When worker threads update `j` objects, follow up with `update_job` so the WebSocket bridge receives the change.

## Path Safety And Code Scanning

- Treat any filesystem path derived from request data, DB values, uploaded filenames, or user-editable names as untrusted.
- For existing files or directories, prefer enumerating a trusted root and matching by `entry.name`.
- For new paths, use the explicit containment pattern that CodeQL recognizes well:
  1. validate with a strict regex
  2. build with `os.path.join(...)`
  3. normalize with `os.path.normpath(...)`
  4. absolutize with `os.path.abspath(...)`
  5. verify the result stays under the trusted root before reading or writing
- For filenames and profile names, require flat single-segment names unless nested paths are truly intentional.
- Reject traversal-style input instead of silently “fixing” it.
- Avoid hiding security-critical path creation in generic helpers unless the helper exactly mirrors the accepted containment shape and has already been proven scanner-safe.
- When code scanning regresses, export the latest `code-scanning-alerts.json`, group by rule and file, and fix the current highest-concentration sink lines directly before broad refactors.

## Structural Guidance

- If a file exceeds 500 lines, consider splitting it along real logical boundaries.
- Refactor carefully to avoid circular dependencies or scattering tightly coupled logic across too many files.
