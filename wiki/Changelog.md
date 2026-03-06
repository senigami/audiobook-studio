# Changelog

All notable changes to this project will be documented in this file.

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

- **Status Orb Context Actions**: The chapter status orb now provides intelligent single-click actions based on its current state (e.g., "Queue rebuild", "Queue remaining").
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
