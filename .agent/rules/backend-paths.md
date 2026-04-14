# Backend Paths

Use this file for request-derived filesystem paths, scanned directories, and containment checks.

## Core Rules

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
