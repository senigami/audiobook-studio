# Phase 12: Polish and Cleanup Plan

## Status
- **Phase**: 12
- **Goal**: Final UI/UX polish, technical debt reduction, and master-agnostic generalisation.
- **Timeline**: Last phase before Phase 13 Release.

## Work Board

| Task | Status | Notes |
| :--- | :--- | :--- |
| **Chapter Editor cleanup** | **Complete** | Production/Performance/Preview tabs removed. Live editor uses ScriptView. |
| **VCR Controls** | **Complete** | VCR-style chapter playback controls added to Chapter Editor. |
| **Queue Metadata** | **Complete** | Completed jobs show generated audio duration and content metrics. |
| **Library list view and sorting** | **Complete** | Added list view and sort options to the Library main page. |
| **Voice and plugin UX** | **Partial** | Dependency installation feedback and XTTS resolution complete. Voice icons/tags pending. |
| **Plugin-provided voice settings** | **Complete** | Per-voice plugin settings rendered in ScriptEditor via JsonSchemaForm. |
| **Plugin boundary cleanup** | **Complete** | Core plugin code is portable; app-specific logic localized to adapters. |
| **Legacy jobs API retirement** | **Open** | Retirement of legacy request/response endpoints in favor of WebSockets. |
| **Manual QA pass** | **Open** | Final verification of fixed-but-pending behaviors. |
| **Multilingual support plan** | **Open** | Planning for voice/text language support. |

## Checklist

### Library and Main UI
- [x] Add a list view to the Library main page.
- [x] Add sort options to the Library main page.
- [x] Fix Chapter Editor header crowding and toolbar ordering.
- [x] Remove duplicate "Preparing" indicator.

### Plugin and Voice Management
- [x] Fix plugin dependency installation UX (Install Deps button + feedback).
- [x] Fix XTTS dependency detection and missing-package feedback.
- [x] Surface plugin-defined per-voice controls in Voice Settings drawer/ScriptEditor.
- [ ] Add voice image/icon upload and standardized 1:1 JPG processing.
- [ ] Add searchable voice tags compatible with future search.
- [ ] Align voice export bundles with Hugging Face-compatible layout.
- [ ] Implement TTS plugin zip import/delete flows (Import done; Delete/Uninstall done).

### Backend and Orchestration
- [x] Enriched queue metadata for completed jobs (audio length, chars, segments).
- [x] Chapter Editor backend dead-code audit and production infrastructure pruning.
- [x] localize XTTS/Voxtral core logic for absolute portability.
- [ ] Implement `check_output` interface in plugin adapters.
- [ ] Update `app/jobs/reconcile.py` to use `engine.check_output(job)`.
- [ ] Retire legacy job request/response API endpoints.

### Documentation and Final Audit
- [ ] Update Wiki/Changelog for Studio 2.0 release.
- [ ] Prepare plugin author documentation and template.
- [ ] Manually verify fixed Phase 11 app behaviors.
- [ ] Triage Vite websocket `ECONNRESET` logs.
- [ ] Re-check large-book project/chapter load timings.

## Deferred to Phase 13 / Post-v2.0
- [ ] GitHub plugin search and direct download.
- [ ] Hugging Face direct voice search/download.
- [ ] Multilingual voice/text language implementation (planning only in Phase 12).
- [ ] Rename `mixed.py` -> `composite.py`.
- [ ] Third-party/LLM controller plugin system (foundation only in Phase 12).
