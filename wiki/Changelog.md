# Changelog

All notable changes to this project will be documented in this file.

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
