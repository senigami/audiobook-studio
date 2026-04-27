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

## CodeQL Lessons Learned

- If CodeQL traces a route parameter into a filesystem sink, repeat the validation and containment proof in the same function as the sink. A shared helper may be safe at runtime but opaque to the scanner.
- For each filesystem sink argument (`open`, `shutil.move`, `shutil.copy*`, `Path.exists`, `rmtree`, etc.), make the value passed to the sink a locally checked string:
  1. derive it from a trusted root with `os.path.join(...)`
  2. normalize with `os.path.normpath(...)`
  3. absolutize with `os.path.abspath(...)`
  4. compare against a trusted-root prefix before the sink
- For moves/copies, prove both sides independently. The source and destination can produce separate CodeQL findings even when they appear on the same line.
- When migrating legacy files named from DB values, prefer enumerating the trusted directory and matching `entry.name`; then normalize and contain-check the matched `entry` before using it.
- If a destination filename does not need to preserve a user/DB identifier, generate a deterministic safe filename such as `seg_{index}.wav` and persist that mapping instead of embedding the untrusted ID in the path.
- For speaker-profile resolution and metadata files, prove the profile root locally in the same function, then use trusted `os.scandir(...)` results or direct string-based `open(...)` on the proved path instead of `Path.exists()`, `Path.read_text()`, or `Path.write_text()`.
