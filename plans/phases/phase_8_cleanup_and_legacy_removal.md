# Phase 8: Cleanup And Legacy Removal

## Objective

Remove legacy dependencies only after their replacements are proven. Document the plugin system and TTS API for contributors and users.

## Deliverables

- export and repair/backfill finalization under 2.0 architecture
- legacy code removal
- final path consolidation
- docs and changelog completion
- plugin developer guide (`docs/plugin-guide.md`)
- plugin template folder (`docs/plugin-template/`) with example manifest, engine, and settings schema
- TTS API documentation (auto-generated OpenAPI from FastAPI routes)
- CONTRIBUTING.md updated with plugin contribution workflow
- wiki pages updated to reflect 2.0 architecture, plugin system, and TTS API

## Deliverables Checklist

- [ ] Export finalization under 2.0 architecture completed
- [ ] Repair/backfill flow finalized under 2.0 architecture
- [ ] Legacy code removed
- [ ] Final path consolidation completed
- [ ] Docs and changelog completed
- [ ] Plugin developer guide written with step-by-step instructions
- [ ] Plugin template folder created with working example
- [ ] TTS API documentation generated and accessible at /api/v1/tts/docs
- [ ] CONTRIBUTING.md updated with plugin contribution section
- [ ] Wiki pages updated for 2.0 architecture

## Plugin Developer Guide Requirements

The guide (`docs/plugin-guide.md`) must cover:

1. **Quick start**: Create a minimal plugin in 5 minutes
2. **Manifest reference**: Every field explained with examples
3. **Contract walkthrough**: Each `StudioTTSEngine` method with expected behavior
4. **Settings schema**: How to define configurable settings with JSON Schema
5. **Testing instructions**: How to test a plugin outside of Studio
6. **Dependency management**: How to specify and manage pip dependencies
7. **Submission guidelines**: How to submit a plugin for community review
8. **Security notice**: What users should know before installing third-party plugins

The plugin template (`docs/plugin-template/`) must be a working, minimal plugin that contributors can copy and modify:

```text
docs/plugin-template/
├── manifest.json         # Pre-filled with placeholder values
├── engine.py             # Implements StudioTTSEngine with stub methods
├── settings_schema.json  # Example schema with one setting
├── requirements.txt      # Empty, with comments explaining format
└── README.md             # Template README for plugin authors
```

## Scope

- cleanup is only allowed after proof, not as a speculative simplification
- legacy import-time worker startup, startup reconciliation, config-sync middleware, and listener-registration side effects must be removed only after explicit 2.0 replacements are proven
- documentation is part of the work, not cleanup to be done later

## Tests

- regression suite
- recovery validation
- export validation
- legacy removal validation
- startup lifecycle replacement validation
- plugin template validation (template plugin can be loaded by TTS Server)

## Verification Checklist

- [ ] Regression suite passes
- [ ] Recovery validation passes
- [ ] Export validation passes
- [ ] Legacy removal validation passes
- [ ] Startup lifecycle replacement validation passes
- [ ] Plugin template loads successfully in TTS Server
- [ ] Plugin developer guide reviewed for completeness

## Exit Gate

- Studio 2.0 is the active architecture and legacy paths are no longer required
- plugin system and TTS API are documented for contributors and users

