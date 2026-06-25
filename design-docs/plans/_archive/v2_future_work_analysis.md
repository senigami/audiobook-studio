# Future Work Integration Analysis: Studio 2.0

This document checks whether the Studio 2.0 plan leaves room for known backlog themes. The answer is mostly yes, but not in a hand-wavy “100% compatible” sense. Some future work depends on 2.0 creating the right contracts first.

## Overall Verdict

The 2.0 architecture should make backlog work easier, but only if we actually land the domain model, artifact contract, and state boundaries described elsewhere in the plan. If we skip those and only reorganize files, we will still block ourselves later.

## Compatibility Matrix

### Issue #80: Unify progress display logic

- **Compatibility**: Native fit
- **Why**: The 2.0 progress model centralizes broadcast and reconciliation instead of letting screens improvise.
- **Prerequisite**: Canonical progress events and frontend live-overlay ownership

### Issue #78: Add Playwright end-to-end coverage

- **Compatibility**: Strongly recommended
- **Why**: 2.0 increases confidence only if reload, reconnect, recovery, and targeted rerender flows are tested end to end.
- **Prerequisite**: Stable route flows and deterministic test fixtures

### Issue #56: Don’t make MP3s unless asked

- **Compatibility**: Easy fit
- **Why**: Export becomes an explicit task with project-level output presets.
- **Prerequisite**: Export settings must move into project defaults and task metadata

### Issues #38 and #39: Voice storage refactor and portable voice bundles

- **Compatibility**: Good fit after the domain model lands
- **Why**: 2.0 separates canonical voice identity from engine-specific assets.
- **Prerequisite**: Clear distinction between library-owned voice assets and project-owned references

### Issue #20: Workflow for larger trained local models

- **Compatibility**: Good fit
- **Why**: The TTS Server process boundary and plugin SDK are exactly the right boundary for heavier local models. A contributor wraps the model in a `StudioTTSEngine` plugin, declares its resource profile in the manifest, and the orchestrator schedules it correctly.
- **Prerequisite**: TTS Server must be running; resource policy model must be richer than a single heavy/light flag

### Issue #19: Project backup and restore via dated bundles

- **Compatibility**: Excellent fit
- **Why**: Project roots, snapshots, and immutable artifacts make this much safer.
- **Prerequisite**: Finalize the project-root contract and restore semantics

### Issue #18: Production segments as the source of truth

- **Compatibility**: Core to 2.0
- **Why**: The 2.0 editor plan is built around production blocks and revision-safe render state.
- **Prerequisite**: Stable block identity and local-draft merge behavior

## Cross-Cutting Future Work That 2.0 Must Leave Room For

- Pronunciation dictionaries and per-project text normalization
- Multi-output presets such as WAV-only, MP3-on-demand, and M4B export bundles
- Additional local and cloud engines via the plugin SDK and `plugins/` directory
- Local TTS API for external applications to generate speech through Studio's installed engines
- Voice migration or compatibility warnings when engine capabilities change
- Recovery tooling for interrupted or partially migrated projects
- Plugin ecosystem tooling: submission, review, and community distribution

## What Would Still Block Future Work If We Get 2.0 Wrong

- Treating raw file existence as completion state
- Letting the frontend store become a second canonical data layer
- Coupling voice identity too tightly to one engine implementation
- Hiding queue policy inside task code instead of a scheduler policy layer
- Rewriting the editor UI without fixing the underlying block and artifact contracts
- Loading engine code in the Studio process instead of isolating it in the TTS Server
- Making built-in engines use a different discovery path than community plugins
- Hardcoding engine-specific settings in the UI instead of using schema-driven forms

## Recommendation

Use the future work list as a pressure test during implementation. Whenever a new 2.0 module is introduced, ask whether it makes future engine support, output options, portability, and recovery easier or harder. If it makes them harder, the boundary is probably wrong.
