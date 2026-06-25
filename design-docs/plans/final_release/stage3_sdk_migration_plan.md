# Stage 3 — Plugin SDK migration: slice plan

*From the 2026-06-11 prep audit (full violation inventory with file:line in the audit transcript; re-grep before cutting — lines drift). Binds to doc 02 (contract), doc 03 (template), design-docs/specs/plugin-contract.md (1.2.0). 120+ `app.*` violation lines across 8 studio-handler files; zero of doc 02's 13 `StudioPluginContext` service groups implemented yet. `check_output` ALREADY exists in base.py — doc 02's "does not exist yet" note is stale; update the doc, not the code.*

## Slices (each independently landable, one commit each)

- **S1 — SDK infrastructure**: `app/studio_plugin_sdk/` package — `__init__` re-exports (StudioTTSEngine, StudioPluginContext, JobSpec, JobResult, TTSRequest/TTSResult/TimingEvent/VerificationResult/VoiceProcessingHooks/SynthesisPlan, `__version__="1.0"`); `context.py` implements ALL 13 doc-02 §3.3 service groups as thin wrappers over existing app modules, plus `run_voice_job` and `resolve_voice_preview_inputs` (mentioned in doc 02 text but missing from its tables — add them to the doc); `errors.py` StudioException hierarchy (BridgeError, ValidationError) — DECIDED 2026-06-11: hierarchy yes. plugin_loader registers `studio_plugin_sdk` in sys.modules and `_validate_manifest` gains the four version fields (contract/sdk/settings_schema/event_envelope, all "1.0"). Acceptance: importable in both processes; missing version field → PluginLoadError.
- **S2 — Template + AST gate**: docs/plugin-template manifest gains the four version fields; template handler shows `handle_job(ctx: StudioPluginContext, job: JobSpec) -> JobResult`; AST no-`app.*`-imports validator + tests (passes template, rejects crafted violation).
- **S3 — Dedup**: `_ensure_plugin_package_hierarchy` extracted to one shared location (currently duplicated in plugin_loader + jobs/registry).
- **S4 — tts_xtts studio handlers** — LANDED 2026-06-12 as a documented partial: handler.py + voice_adapter.py fully ctx-migrated via a `_get_ctx()` factory; SDK BridgeError adopted; zero module-level app imports anywhere. RESIDUE: ~13 late function-body `app.db`/textops/bridge imports remain in bake/segments/standard_handler because existing tests monkeypatch `app.db.*` directly and ctx routing would bypass them — resolves in S9 when the dispatcher injects ctx and test patch targets move to the context. The S8 AST gate must tolerate this residue until then (or S9 lands first).
- **S5 — tts_voxtral handler** same pattern.
- **S6 — synthesis_mixed → tts_mixed**: folder rename (loader regex requires it), `"builtin": true` manifest flag + BUILTIN allowlist in loader, handler migrated to ctx. Delicate: grep all path references (tests, docs, registry).
- **S7 — server-side engine audit**: voxtral/mixed clean; tts_xtts's `proc_utils.run_cmd_stream` — DECIDED 2026-06-11: stays as documented in-tree exception (note in plugin README); standalone-plugin guidance says stdlib subprocess.
- **S8 — manifest validation in CI**: scripts/validate_plugin_manifests.py + workflow step; all manifests must carry the version fields.
- **S9 — dispatcher integration**: Studio job dispatch instantiates the context and calls `handler(ctx, job)`, persisting JobResult. The integration-risk slice; end-to-end test required.
- **S10 — verification + spec sync** — LANDED 2026-06-12:
  - **Callable-signature audit**: `_import_engine_class` now calls `_validate_engine_signatures` which uses `inspect.signature` to check all five required methods + any declared optional overrides; wrong param name or insufficient arity → `PluginLoadError` naming the method and expected signature; extra optional params tolerated (voxtral's `check_env(settings=None)` pattern passes).
  - **tts_mixed fixed**: `MixedPlugin` was missing `check_request` and `settings_schema`; both added with stub implementations that satisfy the ABC.
  - **ctx.stitch_segments gap fixed**: method now accepts `on_output`, `cancel_check`, and `pdir` optional kwargs; returns `int` (was `None`); routes voxtral/xtts callers through the same underlying call shape. Voxtral bake still calls the module-level alias and xtts bake calls `h.stitch_segments` — routed through ctx is possible but both remain as wrapper-boundary callers (S9 compromise, not worth fighting).
  - **Verification sweep**: all 13 §3.3 service groups have test coverage; `finalize_sample_artifact`, `run_voice_job`, `resolve_voice_preview_inputs` covered by existing S5 and new S10 tests.
  - **AST gate**: module-level-only mode enforced at load; function-body app.* imports in bake/segments/standard_handler remain (documented S9 residue; strict flip deferred — these are wrapper-boundary/in-tree plugins; standalone repos use template which has zero app refs).
  - **Version gate**: all four manifest version fields hard-required since S8; confirmed still enforced.
  - **Spec sync**: `design-docs/specs/plugin-contract.md` → 1.3.0 (changelog row added; check_output stale "does not exist yet" corrected; stitch_segments full signature; finalize_sample_artifact, run_voice_job, resolve_voice_preview_inputs added to §3.3 tables); `design-docs/plans/final_release/02_plugin_communication_contract.md` §2.3 stale note corrected, §3.3.12 updated, §3.3.14 added.
  - Tests: 11 new tests (8 signature audit in `TestCallableSignatureAudit`, 3 stitch_segments in `TestContextServiceGroups`); full suite 1514 passed; ruff clean.

## Order

S1 → (S2 ∥ S3 ∥ S7) → S4 → S5 → S6 → S8 → S9 → S10. The owner-decided signature audit folds into S10 (validate each engine's five methods against the contract at load).

## Parked questions (review later, defaults taken)

- Exception hierarchy: TAKEN (yes, in SDK).
- run_cmd_stream: TAKEN (in-tree exception, documented).
- Plugin-data write location (`plugin_data/<engine_id>/` only): assume yes per doc 02 §4.5 unless owner objects.
