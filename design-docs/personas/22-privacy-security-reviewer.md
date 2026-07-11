# 22 · "Fatima Al-Rashid" — Privacy & Security Reviewer  ☆ INFERRED

**Identity:** "A security engineer who treats every user-supplied input — plugin archives, manuscript text, character names, repo URLs — as adversarial by default, and will not approve a release until the trust boundary between untrusted input and the local filesystem is explicit, tested, and enforced by the CI pipeline."

## Goals
- Confirm that no untrusted input (plugin archive, manuscript content, character name, project title) can reach the filesystem outside a validated, contained root
- Audit the plugin install path end-to-end: from archive ingestion through extraction to PLUGINS_DIR — symlinks, path traversal, and oversized archives must be rejected before they land
- Verify that the external TTS API (`/api/v1/tts`) enforces authentication and rate limiting on every route, not just the primary synthesis endpoint
- Ensure that sensitive data — manuscript text, voice samples, cloned model weights — stays local and does not appear in logs, error responses, or preview URLs accessible without authentication
- Maintain CodeQL's ability to trace untrusted input from request parameters to filesystem operations; no patterns that defeat static analysis without a documented reason

## Context & environment *(INFERRED)*
- Reviews security-sensitive changes before each release; not a day-to-day contributor to feature code
- Found Audiobook Studio through a privacy-focused user community concerned about voice data leaving the device
- Works by reading the code paths that handle untrusted input, constructing adversarial inputs manually, and verifying that the helpers (`safe_join`, `secure_join_flat`, `find_secure_file`) actually reject them
- Runs `ruff check .` and reviews the CodeQL workflow output from CI; flags any suppression comment that lacks a justification
- Cross-references `design-docs/specs/` for the path security contract before reviewing any change to `app/utils/pathing.py` or file-serving routes

## Key workflow moments
- **Plugin archive audit:** Constructs a ZIP archive containing a symlink that points outside the extraction root and attempts to install it; expects the installer to reject the archive before any file is written to PLUGINS_DIR
- **Path traversal probe:** Submits a project title containing `../../../etc/passwd` via the API and traces the value through project creation, chapter path construction, and any file-serving route that references the project directory
- **Log sanitization check:** Triggers a synthesis error for a chapter containing unusual Unicode, long lines, and what could be PII; reads the application log output and error response to confirm neither contains raw manuscript text
- **API authentication audit:** Iterates every route under `/api/v1/tts` and confirms that `verify_api_key` is applied uniformly — no route is accidentally public because it was added without the dependency
- **CodeQL shape maintenance:** Reviews any new route or file-serving helper to confirm it follows the `strict regex → join → normalize → verify-under-root` shape that CodeQL's taint-tracking can follow

## Top friction points *(INFERRED)*
- **F1 — Plugin install trust gap:** A plugin archive can be loaded from PLUGINS_DIR without any signature or checksum verification. The manifest is parsed after extraction, meaning a malicious archive can place files on the filesystem before Studio decides whether to trust the plugin.
- **F2 — Error responses leak internal paths:** Some FastAPI exception handlers return the full filesystem path in the `detail` field (e.g., `FileNotFoundError: /Users/user/projects/42/chapters/chapter_3/audio/segment_7.wav`). This leaks the installation layout and project structure to API callers.
- **F3 — Character name reaches shell via TTS:** Character names are stored in SQLite and passed to the TTS engine subprocess. If the subprocess invocation uses `shell=True` anywhere in the plugin stack, a character name containing shell metacharacters is a command injection surface.
- **F4 — Preview URLs are unauthenticated:** Audio preview endpoints (voice sample previews, chapter preview playback) are accessible without authentication. A user on the same local network can enumerate and retrieve voice samples without credentials.
- **F5 — Symlink extraction not uniformly checked:** The plugin loader checks for path traversal in filenames but does not verify that extracted symlinks resolve within the extraction root. A symlink with a valid-looking relative name can point outside the PLUGINS_DIR tree after resolution.

## What they need from the studio
- Pre-extraction archive validation: reject any archive containing absolute paths, path traversal sequences (`../`), or symlinks before the first file is written to disk
- A CodeQL custom query (or documented taint-tracking shape) that traces user-supplied input from request parameters through `safe_join` to file operations — so regressions in the shape are caught automatically
- Error handler sanitization: strip filesystem paths from all exception `detail` fields in production mode; log the full path internally but return only a stable error code to the caller
- Subprocess invocation audit: confirm every plugin subprocess call uses `shell=False` with an explicit argument list; document this as a required plugin contract in the manifest spec
- A pre-release security checklist item that verifies every `/api/v1/tts` route for `verify_api_key` coverage, run as part of the deploy checklist

## Review lens — questions they ask of any screen
- "What is the first filesystem write that happens when a plugin archive is submitted — does validation happen before or after it?"
- "If a user-supplied value reaches `safe_join`, what happens when it contains `../` — is it rejected, normalized, or silently truncated?"
- "Does this error response reveal the local filesystem path, the project ID structure, or any other layout detail?"
- "Is this subprocess call using `shell=False` with an explicit argument list, or is it constructing a shell string from user data?"
- "Can a caller on the local network access this audio preview endpoint without an API key or session credential?"
- "Does CodeQL's taint tracking still reach this file-serving route, or has the indirection broken the trace?"
- "What can a plugin do — to the filesystem, to the network, to other plugins' data — before Studio has validated and trusted it?"

## Red flags that make them quit or distrust the app
- A plugin archive that extracts files outside PLUGINS_DIR without any error or rejection — the most direct path traversal
- A `subprocess.run(shell=True, args=f"... {character_name} ...")` pattern anywhere in the plugin or bridge stack
- An exception handler that returns `str(e)` verbatim in a 500 response — full Python tracebacks or filesystem paths in API responses
- A new `/api/v1/tts` route added without `verify_api_key` in its dependency list — accidentally public synthesis endpoint
- A CodeQL suppression comment (`# nosec`, `# noqa`) without an inline explanation of why the suppression is safe

**Evidence basis:** INFERRED. Interview security engineers or privacy-focused contributors who have reviewed local-first AI tools; key open question is whether the pre-extraction archive validation gap is a known risk that has been accepted with compensating controls, or an untracked vulnerability that has not yet been formally assessed.
