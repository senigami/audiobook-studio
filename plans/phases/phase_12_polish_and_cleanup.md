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
| **Voice and plugin UX** | **Partial** | Dependency installation feedback and XTTS resolution complete. Voxtral chapter rendering, voice icons/tags, and implementation of the documented Hugging Face voice bundle shape remain open. |
| **Plugin-provided voice settings** | **Complete** | Per-voice plugin settings rendered in ScriptEditor via JsonSchemaForm. |
| **Plugin boundary cleanup** | **Complete** | Core plugin code is portable; app-specific logic localized to adapters. |
| **Legacy jobs API retirement** | **Complete** | Removed legacy request/response endpoints; WebSocket snapshots remain authoritative. |
| **Manual QA pass** | **Open** | Final verification of fixed-but-pending behaviors. |
| **Multilingual support plan** | **Open** | Planning for voice/text language support. |

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
- [ ] Add voice image/icon upload and standardized 1:1 JPG processing, storing the result as the `voice.json.image` asset defined by `docs/specs/voice.schema.json`.
- [ ] Add searchable voice tags and structured attributes backed by `docs/specs/voice-taxonomy.json`.
- [ ] Align voice export bundles with the Hugging Face-compatible `voice.json` schema, `docs/specs/voice-bundle-template/`, generated README/frontmatter, preview sample widget, and engine asset references.
- [ ] Implement Voxtral segment and bake rendering for chapter jobs.
- [x] Audit default voice fallback so chapters do not silently default to Voxtral.
- [x] Implement TTS plugin zip import/delete flows (Import done; Delete/Uninstall done).

### Backend and Orchestration
- [x] Enriched queue metadata for completed jobs (audio length, chars, segments).
- [x] Chapter Editor backend dead-code audit and production infrastructure pruning.
- [x] localize XTTS/Voxtral core logic for absolute portability.
- [ ] Implement `check_output` interface in plugin adapters. *(Detailed design ready: `plans/plugin_contract_qa_hooks_plan.md` — SDK ABC default + TTS-server invocation; the reconcile.py wording below is obsolete.)*
- [x] ~~Update `app/jobs/reconcile.py` to use `engine.check_output(job)`~~ — resolved 2026-06-11: `app/jobs/reconcile.py` no longer exists (deleted in the clean break); the check_output invocation point moves to the TTS server `/synthesize` path per the plan above.
- [ ] Finalize plugin contract-version and callable-signature validation against the documented five-method StudioTTSEngine contract *(contract-VERSION gate landed 2026-06-11: `SUPPORTED_MANIFEST_VERSION` + tests in plugin_loader; callable-signature audit remains)* in `docs/handbook/content/plugin-sdk/engine-contract.json` and `docs/handbook/content/plugin-sdk/compatibility.json`.
- [x] Retire legacy job request/response API endpoints.

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
