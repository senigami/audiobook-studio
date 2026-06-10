# 18 — Canonical Spec Documents

**Owner directive (2026-06-10):** once the app is nailed down (Stages 1–5 complete), write a round of spec documents that detail exactly how everything works, so all future work has a contract it must adhere to. These specs are the binding reference — code that disagrees with a spec is a bug in one or the other, and the discrepancy must be resolved explicitly, never ignored.

Home: `docs/specs/`. Some specs already exist there (`voice.schema.json`, `voice-bundle-template/`, plus doc 03's planned `plugin_template/`); this doc completes the set and normalizes conventions.

## Conventions (apply to every spec)

- Every spec carries a `spec_version` (semver) and a changelog section. Versioned-contract rule from the owner directives applies: consumers validate the version at load time.
- Each spec states: purpose, the exact contract (shapes/signatures/sequences), invariants ("MUST/MUST NOT"), and a conformance checklist a test suite can implement.
- Specs are written from the *implemented* behavior after Stages 1–5 — they document what IS, not what was planned. Where a plan doc (this folder) and reality diverged during execution, the spec records reality.
- Machine-validatable parts (JSON shapes) live as JSON Schema files next to the prose spec; prose references the schema file rather than duplicating it.

## The spec set

- [x] **SP1. Live Event Stream Contract** — `docs/specs/live-events.md` + envelope JSON Schema. The 6 websocket topics, envelope shape + version field, the 7-step lifecycle ordering, topic ownership (which backend module emits what — derived from the B13 docstring in `state_jobs.py`), the "queue never infers state from tts.logs" rule, reconnect/bootstrap semantics (snapshot + replay contract that F3/F4 implement). Source material: wiki lifecycle page, doc 02 §event mapping, `frontend/src/api/contracts/liveEvents.ts`.
- [ ] **SP2. Plugin Communication Contract** — `docs/specs/plugin-contract.md`. Final form of doc 02 after Stage 3 lands: `StudioTTSEngine` ABC (required/optional methods + exact signatures), `StudioPluginContext` SDK surface, manifest schema (`studio_tts_manifest` version, folder regex, entry_class format), TTSRequest/TTSResult/TimingEvent shapes, version-bump ownership table.
- [ ] **SP3. Voice Bundle & Metadata Spec** — extend the existing `docs/specs/voice.schema.json` + `voice-bundle-template/` with a prose spec `voice-bundles.md`: bundle tree, MP3/WAV format rules (owner ruling: samples/previews MP3, render audio WAV, bundles MP3), attribute taxonomy v1.0, the untagged-voice rules (D7: omit, warning icon, required-on-edit), `default_variant` in sibling `state.json` (D8), casting card + recommendation contract (doc 04 §2).
- [x] **SP4. Queue & Job Lifecycle Spec** — `docs/specs/queue-jobs.md`. Job statuses + legal transitions, JobKind values, the two tracking stores (state.json jobs + SQLite processing_queue) and their reconciliation rules (incl. the B3 done-row guard), terminal-reset semantics (B5: cleared fields, caller-value precedence), broadcast-flag routing (from the B13 docstring), ETA fields and who writes them.
- [ ] **SP5. Progress Presentation Spec** — `docs/specs/progress-presentation.md`. The PredictiveProgressBar contract: lanes/migrations, `allowBackwardProgress`/`authoritativeFloor` semantics (callers MUST pass explicitly), persistence memory + eviction, and the doc 15 ETA trust-handoff model (EMA, trust weight, slope limiting) once landed.
- [x] **SP6. Text Processing Spec** — `docs/specs/text-processing.md`. Segmentation pipeline: cleaning → sentence splitting (paragraph preservation per B8) → packing (hard ≤ limit guarantee per B9) → grouping (separator budget = `" ".join`, per B12). States the invariants the B8/B9/B12 tests enforce.
- [ ] **SP7. Install & Distribution Spec** — `docs/specs/install-distribution.md`. run.sh/run.ps1 contract (flags, env vars, venv layout, stamps), demo bundle restore whitelist + `AUDIOBOOK_STUDIO_INSTALL_DEMO`, Pinokio wrapper interface (doc 16), first-run defaults (XTTS engine, Studio Voice), plugin install-from-GitHub flow (doc 05).
- [x] **SP8. Testing Standards** — promote doc 17 §3 rules (R1 revert-check, R2 mock boundaries, R3 typed event frames, R4 no sleep-timing) into `docs/specs/testing-standards.md` and reference it from CLAUDE.md.
- [ ] **SP9. Conformance cross-check** — final pass: for each spec, run its conformance checklist against the shipped code; file any mismatch as a bug before tagging v2.0.0. Add a CI grep/test where cheap (e.g. envelope version validation, schema validation of fixtures).

## Sequencing

Write specs AFTER the behavior they document is final: SP1/SP4/SP6 after Stage 1 closes; SP2 after Stage 3; SP3 after Stage 4; SP5 after doc 15 lands; SP7 after doc 16's blockers; SP8 immediately (rules already decided). SP9 gates the v2.0.0 tag alongside doc 08 Stage 6. Wiki pages may summarize and link to specs but the spec file is authoritative.
