# ADR-0007: CodeQL-Recognized Path Containment Pattern

**Date:** 2026-06-10  
**Status:** Accepted  
**Deciders:** Studio owner

## Context

The app serves user-controlled file paths: chapter audio, voice samples, project
exports. Path traversal (e.g. `../../etc/passwd`) is a real attack surface on any
file-serving endpoint.

Python's `pathlib` provides `Path.resolve().is_relative_to(base)` as an idiomatic
containment check. However, CodeQL's `py/path-injection` query does not recognize
`is_relative_to()` as a sanitizer in its taint-tracking model. Using it left
45 CodeQL alerts open in CI despite the code being logically correct.

The alternatives considered were:
1. Mark every alert as a false positive — rejected; suppression debt accumulates.
2. Use a recognized barrier pattern — accepted.
3. Use a third-party security library — adds a dependency for a one-function problem.

## Decision

All path containment checks use `os.path.normpath(candidate).startswith(base + os.sep)`
via the `contained_path()` helper in `app/utils/pathing.py`. This is the pattern
CodeQL's taint-tracking model recognizes as a path-injection barrier.

Additional helpers in `pathing.py` (`safe_join`, `secure_join_flat`, `find_secure_file`)
wrap this pattern for common use cases. All route handlers and file-serving code use
these helpers; no route should call `open()` on a user-supplied path directly.

## Consequences

### Positive
- All 45 CodeQL `py/path-injection` alerts cleared.
- CodeQL security scanning in CI (`codeql.yml`) provides ongoing enforcement.
- Path validation logic is centralized — one place to audit, one place to fix.

### Negative / Trade-offs
- The `startswith(base + os.sep)` pattern is slightly more verbose than
  `is_relative_to()` and less idiomatic to Python developers unfamiliar with the
  CodeQL constraint.
- Symlinks are not followed by `normpath`; callers that need symlink resolution must
  call `os.path.realpath()` before `contained_path()`.

### Neutral
- Any new path validation added to the codebase MUST use `contained_path()` or the
  `pathing.py` helpers. This is documented in `design-docs/engineering-rules/backend-paths.md`.
