# Phase 11 Plugin Behavior Cutover

## Goal

Move app-level behavior decisions away from hardcoded engine names such as `voxtral` and `xtts`, and toward plugin-declared behavior metadata. Studio 2.0 should ask what an engine supports or requires, not which specific built-in engine it is.

## Current Problem

The major v1 fallback paths, cutover flags, and direct handler generator calls have been removed, but app code still contains a second layer of legacy coupling:

- Enablement checks special-case Voxtral API-key requirements.
- Bridge setting extraction maps Voxtral-specific fields directly.
- Voice/profile, queue, generation, and worker code still use engine names as behavior gates.
- Low-level engine implementation modules still live in app-wide locations rather than plugin-owned areas.

This makes future plugins harder to add because each new plugin would require app-wide branching.

## Implementation Direction

Introduce a small plugin behavior helper as a transition seam. App code should use helpers such as `has_behavior(engine_id, behavior)` or `extract_engine_settings(engine_id, source)` instead of checking `engine_id == "voxtral"` or `engine_id == "xtts"` for behavior decisions.

The first implementation slice should prioritize high-value gates:

- Add plugin behavior metadata to plugin manifests or schemas where existing `capabilities` are too broad.
- Add a small helper module under `app/engines/` for behavior lookup, required settings, aliases, and setting extraction.
- Convert engine enablement to use plugin-declared required settings instead of a Voxtral name check.
- Convert bridge setting extraction to use plugin-declared aliases/settings instead of `voxtral_model` hardcoding.
- Add tests proving behavior lookup works for plugin metadata, not just built-in engine names.

## Hard-Cutover Rules

- Do not add new compatibility abstractions around engine-name checks.
- Existing legacy stored fields may be read as migration inputs only where needed to avoid data loss.
- New behavior decisions must be driven by plugin behavior metadata.
- Keep the helper simple and explicit; avoid building a large plugin framework before the use cases require it.
- Plugin implementation files may still mention their own engine names internally.

## Later Cleanup Direction

After the helper lands and first gates are converted:

- Move engine-specific implementation code out of app-wide modules and into plugin-private areas.
- Consolidate duplicated profile and settings extraction through the helper.
- Separate app job kinds from plugin engine ids so future plugins do not require worker/router edits for standard behavior.
- Delete app-level legacy modules such as `app/engines_voxtral.py` only after their functionality has been moved behind plugin boundaries and verified.

## Verification

Use focused backend tests first:

```bash
./venv/bin/python -m pytest tests/test_api_engines.py tests/bridge/test_bridge_registry.py tests/test_bridge_tts_server.py tests/test_api_voices_actions.py tests/test_domain_contracts.py -vv
```

Then audit hardcoded behavior checks:

```bash
rg -n 'engine_id == "voxtral"|engine == "voxtral"|voxtral_model|voxtral_voice_id|USE_V2_|USE_TTS_SERVER|USE_STUDIO_ORCHESTRATOR|is_feature_enabled' app tests plugins
```

Remaining matches should be classified as plugin-internal, migration-only, public API surface awaiting migration, or next-slice cleanup.
