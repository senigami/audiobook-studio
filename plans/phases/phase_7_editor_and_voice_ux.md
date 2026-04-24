# Phase 7: Editor And Voice UX

## Objective

Move the main user workflows onto the 2.0 foundations once the lower-risk layers are proven.

## Deliverables

- block-aware editor behavior
- render-batch-aware generation actions
- inline failure recovery
- source-text resync preview and commit safety
- voice module management UI (plugin cards with per-engine settings)
- preview/test UI aligned to the new voice model
- project-local navigation and chapter-to-chapter movement
- tabbed Settings page with General, TTS Engines, API, and About tabs
- schema-driven per-engine settings forms
- plugin install/remove/refresh UI actions
- cloud engine privacy disclosure in engine cards
- SettingsTray retired in favor of the full tabbed Settings surface
- public-facing plugin docs updated after the voice/plugin hook contract is finalized

## Deliverables Checklist

- [x] Block-aware editor behavior implemented
- [x] Render-batch-aware generation actions implemented
- [x] Inline failure recovery implemented
- [x] Source-text resync preview and commit safety implemented
- [x] Voice module management UI implemented with plugin cards
- [x] Preview/test UI aligned to the new voice model
- [x] Project-local navigation and chapter-to-chapter movement implemented
- [x] Settings page route structure implemented (/settings, /settings/engines, /settings/api, /settings/about)
- [x] General settings tab implemented (migrated from SettingsTray)
- [x] TTS Engines tab with collapsible engine cards implemented
- [x] Schema-driven settings forms rendering from settings_schema.json implemented
- [x] Engine status badges (Verified, Ready, Needs Setup, Unverified, Invalid Config, Not Loaded) implemented
- [x] Engine action buttons (Test, Verify, View Logs, Deactivate, Install Dependencies, Remove) implemented
- [x] API settings tab implemented (enable, bind, key, priority)
- [x] About tab implemented (version, TTS Server status, engine count, system info)
- [x] Install Plugin action implemented
- [x] Refresh Plugins action implemented
- [x] Cloud engine privacy disclosure rendering implemented
- [x] SettingsTray removed as legacy residue in favor of full tabbed settings surface

## Scope

- preserve current product purpose
- improve trust and clarity
- avoid collapsing back into queue-driven UI design
- editor and voice UX must keep recovery, stale-state, and progress messaging understandable even while some backend flows are still legacy-backed
- project and chapter navigation should surface startup-recovered, paused, failed, and stale states clearly instead of assuming a clean active-session-only model
- per-engine settings must be grouped inside each engine's card, never scattered across other pages
- the Settings page must be deep-linkable for each tab
- engine settings forms must be schema-driven — the UI must not hard-code engine-specific fields
- GitHub issue #18 is in scope as the main editor migration thread: production blocks become the editable source of truth, raw chapter text becomes a reconstructed/reference view, and existing segment/job behavior remains the compatibility layer until the block path is verified end to end
- GitHub issue #56 is in scope only as explicit chapter Save WAV / Save MP3 behavior; render jobs should not produce MP3s unless that output is explicitly requested, and voice sample previews may remain MP3 endpoints
- GitHub issues #38 and #39 are deferred from Phase 7 implementation because nested voice storage and portable voice bundles are structural voice-library migrations that depend on a stable voice domain/storage boundary

## Issue Intake Decisions

- **#18: Refactor chapter editing so production segments are the source of truth** — include now, but slice it through compatibility adapters. Initial production blocks should represent human-editable paragraph/speaker groupings; render chunks and batches are derived from those blocks using active engine limits and normalization rules.
- **#56: Don't make MP3s unless asked** — include as a bounded chapter export UX task. Add explicit Save WAV and Save MP3 actions without changing the global `make_mp3` render-time default or implying MP3 backfill is implemented.
- **#38: Nested voice/variant folders** — defer. This changes storage, repair, rename, lookup, and migration behavior and should not be mixed into the Phase 7 editor/settings surface work.
- **#39: Portable voice bundles** — defer until after #38 or an equivalent stable voice asset storage contract exists. Bundle import/export needs its own manifest, path-safety, duplicate handling, and round-trip strategy.

## Settings Page Design Notes

The settings page follows a tabbed layout pattern as described in `plans/v2_settings_architecture.md`. Key rules for implementation:

- left sidebar tab navigation on wide screens, top tabs on narrow screens
- each tab is a deep-linkable route
- engine cards default to collapsed (name + status badge), expand on click to show settings
- settings auto-save with visual feedback
- search across tabs is a future enhancement, not required for Phase 7

## Tests

- targeted rerender tests
- stale-state tests
- autosave and local-draft merge tests
- manual UX verification
- recovery-state navigation and messaging verification
- settings page tab navigation tests
- engine card expand/collapse tests
- schema-driven form rendering tests (all JSON Schema types)
- settings persistence round-trip tests (change → save → reload → verify)
- cloud engine disclosure visibility tests
- plugin refresh action tests
- preview/test engine readiness and availability tests

## Verification Checklist

- [x] Targeted rerender tests pass
- [x] Stale-state tests pass
- [x] Autosave and local-draft merge tests pass
- [x] Manual UX verification completed
- [x] Recovery-state navigation and messaging verification completed
- [x] Settings page navigation tests pass
- [x] Engine card rendering tests pass
- [x] Schema-driven form rendering tests pass
- [x] Settings persistence tests pass
- [x] Cloud engine disclosure tests pass
- [x] Plugin action tests pass
- [x] Public-facing plugin docs updated to match the finalized hook contract
- [x] Preview/test UI aligned to the new voice model

## Implementation References

- `plans/v2_settings_architecture.md` — full Settings page UX specification
- `plans/v2_plugin_sdk.md` — engine card data and settings schema format
- `plans/v2_tts_server.md` — health data for engine badges and About tab
- `plans/v2_voice_system_interface.md` — voice module management concept
- `plans/v2_chapter_editor_workflow.md` — editor workflow requirements

## Exit Gate

- the main user workflow runs on the 2.0 architecture
- all TTS engines are configurable through the Settings page without hard-coded engine-specific UI

## Closeout Status

Phase 7 is ready for handoff and closeout. The remaining work is manual product verification if desired and planning the next phase, not additional Phase 7 feature implementation.
