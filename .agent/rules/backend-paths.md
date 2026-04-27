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
- For storage-version probes, scan the trusted root first and match `entry.name` rather than scanning a derived child directory built from the user-supplied name, even if the child path is validated.
- For voice bundle export/import helpers, resolve the voice root by scanning the trusted voices directory and matching `entry.name`, then prove the manifest path relative to that discovered root before calling `os.path.isdir()`, `os.path.exists()`, or `open()`.
- **Extreme Hardening for Sinks**: Standard `Path` object methods like `.exists()`, `.is_dir()`, and `.mkdir()` are treated as sinks. CodeQL often ignores containment proofs on the parent `Path` object if the child path is derived and then checked via these methods.
  - **Solution**: Convert all `Path` sinks to string-based `os.path` sinks (`os.path.exists`, `os.path.isdir`, `os.makedirs`).
  - **Pattern**: Resolve the final string using `os.path.abspath(os.path.realpath(os.fspath(path)))` and perform the `startswith(trusted_prefix)` check immediately before the sink in the same local block.
- **Source Sanitization is King**: While sink-level proofs are required for completeness, sanitizing user-provided strings (e.g., validating UUIDs or using strict regex) at the **API entry point** is the most effective way to break the taint chain early.
  - **Pattern**: Use a public helper like `config.canonical_chapter_id(id)` that raises `ValueError` on anything except a valid UUID before passing the ID to any domain logic.
- **Unrolled Proofs for Linear Path Analysis**: CodeQL's path-sensitive analysis frequently fails to follow containment proofs through loops (e.g., `for root in trusted_roots:`). 
  - **Solution**: Explicitly "unroll" these checks into `if/elif` blocks for each trusted root. This provides a clear, linear path for the scanner to follow from the proof to the sink.
- **Taint Persistence in Objects**: CodeQL often tracks taint through `pathlib.Path` objects even after a containment check. 
  - **Pattern**: For high-risk sinks, convert the `Path` to a string (`os.fspath`), resolve it fully (`abspath/realpath`), and perform a fresh `startswith()` check immediately before the sink in the same local block.
- **Test-Mode Database Safety**: When running tests, a safety guard should prevent connecting to non-test databases. 
  - **Pattern**: Resolve the `DB_PATH` and the system temp roots (including symlinks like `/tmp` -> `/private/tmp` on macOS) fully before comparison. Use `Path(path).resolve()` on both sides to ensure consistent behavior across platforms.
- **Temp Dir Containment Traps**: Be careful when allowing `tempfile.gettempdir()` in containment proofs to support tests.
  - **Risk**: Allowing the entire temp root can permit "traversal" between unrelated test directories (e.g., from `tmp/project_a` to `tmp/project_b`), which security tests correctly identify as a vulnerability.
  - **Solution**: Instead of allowing the broad temp root, ensure that tests correctly patch the `PROJECTS_DIR` and `XTTS_OUT_DIR` to their specific temp workspaces. The standard `startswith(p_root)` check will then naturally allow the test paths without compromising security.
