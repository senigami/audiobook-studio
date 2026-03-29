# Changelog

All notable changes to this project will be documented in this file.

## [1.7.1] - 2026-03-28

### Highlights

- **Engine-Per-Voice Is Now Production-Ready**: XTTS stays local-first, Voxtral remains an optional cloud engine behind Settings, and mixed-engine chapters now render through displayed performance chunks instead of fragile sentence-by-sentence artifacts.
- **Much Clearer Segment Workflow**: Performance and Production cards now show visible segment numbers, generated blocks render and play by displayed chunk, and queued segment jobs now carry titles like `overview: segment #13` so the global queue points to the exact block being processed.
- **Queue And Progress Recovery Hardening**: Queue refresh can now recover missing in-memory jobs and orphaned rows without an app restart, chapter-side cards track the active queued/running segment group more reliably, and preparing/running visuals behave more consistently across XTTS and Voxtral jobs.
- **Safer Cleanup And Chapter Deletion**: Chapter deletes now move associated text and audio artifacts into a project-level trash folder, chunk audio cleanup covers both legacy `seg_*.wav` and modern `chunk_*.wav` outputs, and ffmpeg helper manifests no longer leak stray `out_*.list.txt` or metadata files into the repo root.

## [1.7.0] - 2026-03-26

### Highlights

- **Best New-User Starting Point Yet**: This release is the first release line intended to feel clean for brand-new users from clone to first project, with launcher scripts, startup docs, chapter generation, voice portability, and download behavior all aligned.
- **One-Command Startup on macOS/Linux and Windows**: Added a real `run.sh` bootstrap flow, a Windows `run.ps1` launcher, and startup logic that can repair stale XTTS environments automatically when older conflicting Coqui packages are present.
- **Starter Voice Support**: Voice profiles with `latent.pth` and preview audio now remain usable without bundling every original sample wav, which makes lightweight starter voices practical to ship with the repo.
- **Narrator and Mixed-Voice Generation Fixes**: Fixed narrator generation in the chapter Performance tab and full mixed-voice chapter rendering when voices rely on latent-only conditioning instead of raw wav samples.
- **Clearer Chapter Queue UX**: Chapters with partial segment progress but no final chapter render now use `Complete` instead of `Rebuild`, so users are not warned about deleting audio when they only want to finish missing work.
- **Cleaner Audiobook Downloads**: Audiobooks can still keep unique internal filenames on disk, but downloads now use a cleaner title-based filename for the user.

## [1.6.0] - 2026-03-25

### Highlights

- **Safer Chapter Editing and Rebuild Flow**: Chapters that already have rendered output now use a clearer rebuild flow, including better destructive warnings, a `Rebuild` label when queueing would replace existing audio, and stale chapter audio that remains visible until you intentionally rebuild or reset.
- **Zero-Issue Security Hardening**: Completed a large CodeQL and filesystem hardening pass that reduced code scanning issues to zero, tightened path and file handling throughout the app, reduced stack-trace exposure in API responses, and improved trusted-root/trusted-enumeration behavior across project, chapter, and voice operations.
- **More Reliable Queue and Segment Recovery**: Stale segment `processing` states are now cleaned up automatically when no active job or queue item exists, queue/rebuild behavior is more predictable after interruptions, and chapter state recovery is more consistent after edits and partial generation.
- **Clearer Voice and Variant Handling**: Voice profile normalization and default variant handling are more robust, frontend variant labeling is more consistent, worker-side profile lookup is more resilient, and empty-sample validation now prevents invalid preview or rebuild attempts earlier.
- **Much Stronger Project Presentation**: The README, wiki, and live showcase were substantially upgraded to better explain Audiobook Studio’s local-first value, including a fair comparison with hosted voice generation, a practical full-length audiobook cost breakdown, and a significantly more polished mobile showcase experience.

## [1.5.1] - 2026-03-19

### Highlights

- **Queue, Progress, and Resume Flow**: Queueing now gives immediate optimistic feedback, then re-syncs after a short delay so fast-finishing chapters do not get stuck showing `processing`. Chapter and queue progress bars once again animate from live timing data, short segment bars linger long enough to visibly reach 100%, and Listen playback resumes only the segment you clicked instead of automatically prefetching the next group.
- **Voice Profile Safety and Clarity**: Empty voice profiles can no longer enqueue failing preview/rebuild jobs, failed voice jobs now mark the queue entry as failed, and production voice selection now prefers the intended base/default profile before falling back to variants. Variant labels are also shown more clearly throughout the UI, with base profiles using `Default` and existing drifted speaker metadata being repaired automatically.
- **Consistent Voice UI Behavior**: The voices screen now uses one hover language across play, speed, script, move, samples, and delete controls, with delete keeping the destructive treatment and the other actions sharing the app’s standard subtle hover state.
- **Production Editing and Stability**: Production queueing now keeps you in place with a clear queued/rebuild flow, duplicate generate clicks are ignored while segments are already pending, and chapter text edits invalidate stale audio more conservatively so shifted text does not keep old file links alive. The backend also gained stronger regression coverage, safer SQLite migration handling, faster XTTS cache checks, and a leaner compatibility layer.

## [1.5.0] - 2026-03-18

### Highlights

- **Portable Voice Profiles**: Voice profiles now travel with their latent cache and preview assets, so renaming or moving a voice keeps it intact instead of generating a new `.pth` file.
- **Shareable Voice Bundles**: Voice profiles can be exported and imported as a single bundle, which makes it easier to move voices between app users.
- **Faster App Load**: The home, projects, and jobs views now return quickly on first load instead of waiting on cleanup work or background reconciliation.
- **Consistent Voice Previews**: Voice builds now standardize on `sample.mp3` for smaller, more consistent preview playback.
- **Voice-Friendly Queueing**: Project pages now preselect an available voice profile so chapter queuing works without requiring extra setup.
- **Safer Queue Routing**: Chapters now use the segment-bake path only when there is already segment audio to assemble, avoiding immediate stitch failures on unrendered chapters.
- **Resume-Friendly Requeueing**: Re-queuing a chapter now keeps already-rendered segment progress intact so partial chapters can pick up where they left off.
- **Immediate Stale-Audio Cleanup**: Editing chapter text now clears old chapter audio and removed segment files right away so the project list and performance views stay in sync.
- **Shift-Safe Segment Sync**: When chapter text changes in the middle, all later segments now rebuild instead of inheriting stale audio from an earlier grouping.
- **Listen-and-Resume Playback**: Clicking Listen on a missing segment now shows active generation progress and automatically starts playback as soon as the render finishes.
- **Live Segment Progress**: Chapter and queue progress bars now reflect the active segment progress reported by the worker, so websocket updates are visible while a chapter is rendering.
- **Zero-State Progress Bars**: Progress bars now stay at 0% until a job is actually running, so queued/preparing jobs no longer jump ahead before rendering starts.
- **In-Page Queueing**: Queueing a chapter now keeps you on the chapter page so you can watch the segments render in place.
- **Safe Requeue Confirmation**: Fully rendered chapters now ask for confirmation before requeueing so you don’t accidentally wipe complete audio.
- **Clearer Rebuild Action**: Completed chapters now label the primary action as `Rebuild`, making it obvious when the button will clear and regenerate existing audio.
- **Clear Queue Feedback**: Queue actions now show an immediate inline success hint and synced `Queued` / `Rendering` badges in both the editor and project views.
- **Simplified Performance Controls**: Removed the redundant chapter bake button from the performance view and kept the queue flow as the single path for rendering missing segments.
- **Stronger Regression Coverage**: The backend test suite now exercises real state changes, queue behavior, and request flow, not just response codes.
- **Operational Guardrails**: Cleanup failures now surface as warnings, the SQLite migration path uses a safer transaction flow, and stalled tests fail fast instead of hanging silently.
- **Fast Voice Cache Checks**: XTTS voice profile fingerprints now use file metadata instead of reading full sample contents, which keeps latent validation lightweight for larger voice libraries.
- **Leaner Compatibility Layer**: Removed obsolete route aliases and legacy wrappers while keeping the compatibility shims that the current frontend still uses.

## [1.4.3] - 2026-03-18

### Highlights

- **Scoped File Access**: Audiobook, voice-profile, and analysis-report file handling now stays inside the intended project or voice directories before any disk access occurs.
- **Traversal Regression Coverage**: Added tests that exercise the new containment checks for audiobook deletion, voice sample deletion, and analysis report paths.
- **Reliable Job Reconciliation**: Job reconciliation now normalizes chapter text names to their stem before output lookup, preserving legacy/project-aware sync behavior while still rejecting traversal-style inputs.

## [1.4.1] - 2026-03-17

### Compatibility & Security
- **Legacy Route Restoration**: Reintroduced compatibility wrappers for the legacy API surface, including settings, chapter reset, preview, and delete flows, so older integrations and tests continue to work against the refactored routers.
- **Path Traversal Hardening**: Added filesystem boundary checks to legacy file-handling endpoints so chapter and voice-related operations stay inside their intended directories.
- **Schema Tightening**: Constrained the bulk segment-status update payload to valid chapter audio states to prevent invalid transitions from entering the database.

### Test Infrastructure
- **Test Isolation**: Switched API test modules to delayed client fixture initialization so environment setup completes before application imports resolve configuration.
- **Monkeypatch Hygiene**: Updated path-sensitive tests to use `monkeypatch`-driven overrides, preventing cross-test leakage from global directory changes.
- **Queue Contract Alignment**: Corrected queue tests to target the modern `/api/processing_queue` endpoints and use the proper reorder method.

### Performance & Stability
- **Status-Aware Progress**: Fixed a bug where the progress bar would animate prematurely during the model preparation phase; it now holds at zero until rendering actually begins.
- **Startup Resilience**: Enhanced queue reconciliation on server startup to correctly recover jobs stuck in 'preparing' or 'finalizing' states.
- **Improved Cleanup**: Hardened the audio segment cleanup logic to ensure stale files (including rogue segments) are thoroughly removed when re-queuing or clearing audio.

### Fixed
- **API Reliability**: Corrected the response contract for the queue mass-delete endpoint to return the `cleared` count expected by the test suite.
- **WebSocket Optimization**: Removed obsolete `log` fields from background broadcasts to reduce network overhead and improve UI responsiveness.
- **Cleanup Visibility**: Replaced silent cleanup failures with structured warnings, hardened UUID profile resolution, and made the voice-building UI clear stale state once the server job snapshot goes empty.
- **Surgical Audio Invalidation**: Changed segment-edit and segment-reset flows to clear only the affected chapter outputs and edited segment files instead of wiping every segment in the chapter.
- **Coverage Goal Met**: Raised backend test coverage to clear the project’s 80% threshold again after the API refactor work.

## [1.4.0] - 2026-03-13

### Architecture
- **Code Modularization**: Reorganized the backend into a `routers/` pattern for better maintainability and faster navigation.
- **Standardized Rules**: Added `.agent/rules.md` to enforce code quality and file size limits for future development.

### Performance & Stability
- **Non-blocking I/O**: Optimized file system interactions within the API layer to support higher concurrency.
- **Robust Analysis**: Integrated `sanitize_for_xtts` directly into the analysis pipeline to ensure "What You See Is What You Get" metrics for audiobook generation.
- **Structured Response Models**: Implemented Pydantic models for all major routes to provide a strict and documented API contract.

### New Features & Fixes
- **Global Queue ETA**: Added an "Approx. X minutes remaining" badge to the processing queue header that tracks cumulative work across all active and queued tasks.
- **Reliable Queue Reordering**: Fixed a timestamp inversion bug and implemented in-memory synchronization, ensuring the background worker strictly follows the UI priority.
- **Enhanced Progress Visuals**: Smoothed progress transitions to 2s ease-in-out for a more fluid and premium interface experience.
- **Locked-in Test Suite**: Added 11 regression tests covering ETA calculations, database joins, and in-memory queue synchronization logic.

### Security
- **Path Sanitization**: Implemented robust path traversal protection using `Path.resolve()` and `is_relative_to()` to prevent unauthorized file access.
- **Input Hardening**: Added stricter validation for text inputs and chapter file paths to prevent resource exhaustion.
- **Granular Exception Handling**: Refined the error handling logic to provide more descriptive feedback with specific HTTP status codes (403, 404, 422).
- **Safe Roots for File Lookups**: Scoped chapter, upload, and audio-path helpers to trusted root folders so user-controlled paths are normalized before disk access while preserving legitimate subdirectories inside those roots.

### Quality Assurance
- **Expanded Test Suite**: Added `test_api_analysis_extended.py` and front-end unit tests for the `StatusOrb` and `ScriptEditor` components.
- **Full Regression Testing**: Verified 100% pass rate across the entire test suite (181 tests) after the backend refactor.

## [1.3.0] - 2026-03-06

### Added

- **Integrated Status Orbs**: Replaced satellite dots with a cohesive, integrated outer ring for M4A and MP3 status.
- **Assembly History Redesign**: Overhauled the export list into a neutral "receipt" style timeline with per-item duration and storage totals.
- **M4B Duration Extraction**: Now extracts duration and title metadata using `ffprobe` for precise assembly information.
- **Safe Deletions**: Implemented descriptive confirmation modals for audiobook exports that include filename and creation date.

### Fixed

- **Pixel-Perfect Orbs**: Stabilized interior orb icons (Refresh, Alert, Error) with absolute centering to prevent "jumping" on hover.

## [1.2.0] - 2026-03-05

### Added

- **Status Orb Context Actions**: The chapter status orb now provides intelligent single-click actions based on its current state (e.g., "Rebuild Audio", "Queue Remaining").
- **Chapter Row Highlighting**: Implemented a subtle "row association" highlight (tint + outline) for chapter rows that persists while context menus are open.
- **Floating Drag Handle**: Replaced the permanent vertical grip with a compact, floating handle that appears on the left edge of the row only during hover, reclaiming horizontal space for titles.

### Fixed

- **Respect "Produce MP3s" Setting**: Fixed a bug where MP3 files were always generated regardless of the user preference.
- **Action Menu State Persistence**: Improved state tracking in `ActionMenu` to ensure row highlights remain active during menu traversal.

## [1.1.0] - 2026-03-05

### Added

- **Incremental M4B Assembly**: Implemented a caching system for chapter audio. Each chapter is now pre-encoded to `.m4a` format and cached; subsequent audiobook compilations skip encoding for unchanged chapters and perform a lossless concatenation, significantly reducing assembly time for long books.
- **M4B Browser Enhancements**: Restored and improved the M4B history view with cover thumbnails and a new kebab menu.
- **Chapter Selection "Select All"**: Added a "Select All" / "Deselect All" button to the project assembly view for easier chapter management.

### Changed

- **Optimized Deletion**: The audiobook delete feature now also cleans up associated thumbnail files and cached `.m4a` chapter encodes.

### Fixed

- **Assembly History UI**: Fixed a rendering error in `ProjectView` where assembly history would crash if the API returned a null result.
- **Linting & Tests**: Resolved remaining backend linting errors (E731) and verified 100% pass rate for both frontend and backend test suites.

## [Unreleased] - 2026-03-02

### Added

- **Accordion Voice List**: Upgraded the Voices list to an accordion behavior where opening one Voice card automatically collapses others.
- **Unified Voice/Variant Model**: Standardized all narrator cards to follow a clear "Voice" (identity) and "Variant" (style) hierarchy.
- **Mini-Expansion Indicators**: Added a rotating chevron overlay and a "need update" indicator directly on the Voice avatar for a cleaner, more intuitive header.
- **Deep Deletion**: Implemented a "Delete Voice" action that cascades from the database to clean up all variant folders and original samples on disk.
- **Intelligent Auto-Expansion**: The Samples section now auto-expands when a variant has no audio and auto-collapses once built for a frictionless setup experience.
- **Variant Count Badge**: Displayed a variant count in the card header for voices with multiple stylistic variations.
- **Smart Variant Selection**: Selecting a variant tab in a collapsed card now automatically expands the card to show its details.
- **Streaming Build Status**: Added a "BUILDING..." status label that persists from rebuild click through sample generation for better real-time feedback.

### Changed

- **Terminology Normalization**: Migrated all internal and user-facing terms to "Voice" and "Variant" for consistency across the application.
- **Header Refresh**: Cleaned up the Voice card header by moving secondary controls (Speed, Script, Rebuild) into the expanded variant view.
- **Reversed Kebab Styling**: Updated the `ActionMenu` trigger to use a white background with a grey hover effect for better contrast.
- **Contextual Management**: Optimized the audio sample list by hiding delete buttons until row-hover, reducing visual noise.
- **Seamless Rebuild UX**: Eliminated status "flickering" during voice regeneration by maintaining building state until the preview is ready.

### Fixed

- **API Robustness**: Corrected backend endpoint returns and ensured cross-platform path handling for speaker profiles.
- **Unit Test Sync**: Updated all frontend unit tests to reflect the new DOM structure and interaction patterns.
- **Duplicate Voice Prevention**: Automated the creation and linking of profile directories when new speakers are added, ensuring immediate synchronization between the DB and disk.

---

[[Home]]
