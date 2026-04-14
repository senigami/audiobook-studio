# Frontend UX

Use this file for waiting/error/recovery states, user trust, and editor workflow expectations.

## Core Rules

- Every meaningful screen change must account for loading, empty, error, reconnecting, interrupted, and recovered states.
- Prefer interfaces that explain why something is waiting or stale instead of hiding behind generic spinners.
- Fast local editing is required, but canonical persistence must remain trustworthy.
- Mark edited, stale, queued, rendering, rendered, and failed states explicitly.
- Inline recovery actions are preferred over forcing users to leave the editor for common fixes.
