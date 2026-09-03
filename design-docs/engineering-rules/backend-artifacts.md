# Backend Artifacts

Use this file for completion checks, artifact publication, recovery, and cache safety.

## Core Rules

- Raw file existence alone is never enough to mark render work complete.
- Validated artifact manifests plus canonical persistence state determine whether output is reusable.
- Publish generated outputs atomically: temp file first, validate, write manifest, then promote into the final artifact location.
- Shared cached artifacts must be immutable once published.
- When job state is re-queued, recovered, or invalidated, clear stale runtime metadata and recalculate status from canonical state.
- If a revision changes, mark prior artifacts stale explicitly rather than silently treating them as valid.
