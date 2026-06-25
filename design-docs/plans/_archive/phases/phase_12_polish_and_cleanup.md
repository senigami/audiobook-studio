# Phase 12: Polish and Cleanup Plan

## Status
- **Phase**: 12
- **Goal**: Final UI/UX polish, technical debt reduction, and master-agnostic generalisation.
- **Timeline**: Last phase before Phase 13 Release.

## Work Board

| Task | Status | Notes |
| :--- | :--- | :--- |
| **Chapter Editor cleanup** | **Complete** | Production/Performance/Preview tabs removed. Live editor uses ScriptView and now prefers the active live job over stale completed chapter jobs. |
| **VCR Controls** | **Complete** | VCR-style chapter playback controls added to Chapter Editor. |
| **Queue Metadata** | **Complete** | Completed jobs show generated audio duration and content metrics. |
| **Library list view and sorting** | **Complete** | Added list view and sort options to the Library main page. |
| **Voice and plugin UX** | **Partial** | Dependency installation feedback and XTTS resolution complete. Voice metadata Phases A-F are complete per `design-docs/plans/final_release/road_to_v2.md`; Taxonomy v2 Phase G remains open and blocks the refreshed demo bundle. |
| **Plugin-provided voice settings** | **Complete** | Per-voice plugin settings rendered in ScriptEditor via JsonSchemaForm. |
| **Plugin boundary cleanup** | **Complete** | Core plugin code is portable; app-specific logic localized to adapters. |
| **Legacy jobs API retirement** | **Complete** | Removed legacy request/response endpoints; WebSocket snapshots remain authoritative. |
| **Manual QA pass** | **Open** | Final verification of fixed-but-pending behaviors. |
| **Multilingual interface support plan** | **Ready for review** | Proposed in `design-docs/plans/phases/phase_12_multilingual_interface_plan.md` with binding spec `design-docs/specs/interface-localization.md` and example mappings in `design-docs/plans/phases/phase_12_multilingual_interface_examples/`; implementation not started. |

## Checklist

### Library and Main UI
- [x] Add a list view to the Library main page.
- [x] Add sort options to the Library main page.
- [x] Fix Chapter Editor header crowding and toolbar ordering.
- [x] Remove duplicate "Preparing" indicator.
- [x] Keep Chapter Editor live queue state anchored to the active job instead of stale completed jobs.

### Plugin and Voice Management
- [x] Fix plugin dependency installation UX (Install Deps button + feedback).
- [x] Fix XTTS dependency detection and missing-package feedback.
- [x] Surface plugin-defined per-voice controls in Voice Settings drawer/ScriptEditor.
- [x] Voice metadata A-F complete: icon upload, searchable tags/attributes, HF-aligned bundle export/import, and docs. Current tracking lives in `design-docs/plans/final_release/road_to_v2.md` Stage 4.
- [ ] Complete Taxonomy v2 Phase G: language, accent, style, tinted pills/+N overflow, and HF `as-*` tags.
- [x] Implement Voxtral segment and bake rendering for chapter jobs.
- [x] Audit default voice fallback so chapters do not silently default to Voxtral.
- [x] Implement TTS plugin zip import/delete flows (Import done; Delete/Uninstall done).

### Backend and Orchestration
- [x] Enriched queue metadata for completed jobs (audio length, chars, segments).
- [x] Chapter Editor backend dead-code audit and production infrastructure pruning.
- [x] localize XTTS/Voxtral core logic for absolute portability.
- [x] Implement `check_output` interface in plugin adapters at the TTS server/bridge edge. `design-docs/plans/plugin_contract_qa_hooks_plan.md` is now historical design context.
- [x] Finalize plugin contract-version and callable-signature validation against the StudioTTSEngine contract.
- [x] Retire legacy job request/response API endpoints.

### Documentation and Final Audit
- [ ] Update Wiki/Changelog for Studio 2.0 release.
- [ ] Prepare plugin author documentation and template.
- [ ] Manually verify fixed Phase 11 app behaviors.
- [ ] Triage Vite websocket `ECONNRESET` logs.
- [ ] Re-check large-book project/chapter load timings.

## Deferred to Phase 13 / Post-v2.0
- [ ] Open GitHub plugin search/browse and richer update/pull UX. Paste-a-GitHub-repo-URL install and the owner-controlled official plugin registry remain v2.0 release scope under `design-docs/plans/final_release/05_standalone_plugin_repos.md` and `design-docs/plans/site_redesign_rollout/10_mock_reconciliation.md`.
- [ ] Hugging Face direct voice search/download.
- [x] Plan multilingual interface localization (see `design-docs/plans/phases/phase_12_multilingual_interface_plan.md`, `design-docs/specs/interface-localization.md`, and `design-docs/plans/phases/phase_12_multilingual_interface_examples/`).
- [x] Rename `mixed.py` -> `composite.py`. *(closed N/A 2026-06-11 — no `mixed.py` module exists; `synthesis_mixed` is a plugin package, not a file to rename)*
- [ ] Third-party/LLM controller plugin system (foundation only in Phase 12).
