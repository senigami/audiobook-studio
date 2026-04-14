# Phase 7: Editor And Voice UX

## Objective

Move the main user workflows onto the 2.0 foundations once the lower-risk layers are proven.

## Deliverables

- block-aware editor behavior
- render-batch-aware generation actions
- inline failure recovery
- voice module management UI (plugin cards with per-engine settings)
- preview/test UI aligned to the new voice model
- project-local navigation and chapter-to-chapter movement
- tabbed Settings page with General, TTS Engines, API, and About tabs
- schema-driven per-engine settings forms
- plugin install/remove/refresh UI actions
- cloud engine privacy disclosure in engine cards
- SettingsTray migration to quick-access widget with "All Settings →" link

## Deliverables Checklist

- [ ] Block-aware editor behavior implemented
- [ ] Render-batch-aware generation actions implemented
- [ ] Inline failure recovery implemented
- [ ] Voice module management UI implemented with plugin cards
- [ ] Preview/test UI aligned to the new voice model
- [ ] Project-local navigation and chapter-to-chapter movement implemented
- [ ] Settings page route structure implemented (/settings, /settings/engines, /settings/api, /settings/about)
- [ ] General settings tab implemented (migrated from SettingsTray)
- [ ] TTS Engines tab with collapsible engine cards implemented
- [ ] Schema-driven settings forms rendering from settings_schema.json implemented
- [ ] Engine status badges (Verified, Ready, Needs Setup, Unverified, Invalid Config, Not Loaded) implemented
- [ ] Engine action buttons (Test, Verify, View Logs, Deactivate, Install Dependencies, Remove) implemented
- [ ] API settings tab implemented (enable, bind, key, priority)
- [ ] About tab implemented (version, TTS Server status, engine count, system info)
- [ ] Install Plugin and Refresh Plugins actions implemented
- [ ] Cloud engine privacy disclosure rendering implemented
- [ ] SettingsTray reduced to quick-access widget

## Scope

- preserve current product purpose
- improve trust and clarity
- avoid collapsing back into queue-driven UI design
- editor and voice UX must keep recovery, stale-state, and progress messaging understandable even while some backend flows are still legacy-backed
- project and chapter navigation should surface startup-recovered, paused, failed, and stale states clearly instead of assuming a clean active-session-only model
- per-engine settings must be grouped inside each engine's card, never scattered across other pages
- the Settings page must be deep-linkable for each tab
- engine settings forms must be schema-driven — the UI must not hard-code engine-specific fields

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

## Verification Checklist

- [ ] Targeted rerender tests pass
- [ ] Stale-state tests pass
- [ ] Autosave and local-draft merge tests pass
- [ ] Manual UX verification completed
- [ ] Recovery-state navigation and messaging verification completed
- [ ] Settings page navigation tests pass
- [ ] Engine card rendering tests pass
- [ ] Schema-driven form rendering tests pass
- [ ] Settings persistence tests pass
- [ ] Cloud engine disclosure tests pass
- [ ] Plugin action tests pass

## Implementation References

- `plans/v2_settings_architecture.md` — full Settings page UX specification
- `plans/v2_plugin_sdk.md` — engine card data and settings schema format
- `plans/v2_tts_server.md` — health data for engine badges and About tab
- `plans/v2_voice_system_interface.md` — voice module management concept
- `plans/v2_chapter_editor_workflow.md` — editor workflow requirements
- `frontend/src/components/SettingsTray.tsx` — current settings implementation to migrate

## Exit Gate

- the main user workflow runs on the 2.0 architecture
- all TTS engines are configurable through the Settings page without hard-coded engine-specific UI
