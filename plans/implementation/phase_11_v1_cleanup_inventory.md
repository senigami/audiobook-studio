# Phase 11 V1 Cleanup Inventory

## Status

Initial audit checkpoint created on 2026-04-30. This file is the working inventory for Phase 11: V2-Only Runtime Cleanup.

Phase 11 is audit-first. Do not delete or replace runtime behavior until each item is classified by current references, runtime impact, risk, and verification.

## Source Context

- Phase plan: `plans/phases/phase_11_v2_only_runtime_cleanup.md`
- Current branch: `studio2/phase-11`
- Product baseline: `2.0.0`
- Intended production defaults: `USE_TTS_SERVER=True`, `USE_STUDIO_ORCHESTRATOR=True`
- Core cleanup target: silent v1/in-process fallback that hides TTS Server or plugin-runtime failures.
- Compatibility rule: keep migration scripts and compatibility readers where they protect existing user data.
- Note: memory references `plans/implementation/phase_11_session_handoff.md`, but that file was not present during this audit checkpoint. The available handoff source was `Memory/new_session_handoff.md`.

## Audit Commands Used

```bash
rg --files app tests frontend plans docs wiki plugins | rg 'bridge|registry|watchdog|feature_flags|tts_server|xtts|voxtral|manifest|settings_schema|compat|legacy|fallback'
git grep -n "USE_TTS_SERVER\|USE_STUDIO_ORCHESTRATOR\|bridge_local\|app.engines.voice\|in-process\|fallback\|legacy" -- app tests frontend plans docs wiki plugins
git grep -n "app.engines.voice.xtts.engine\|app.engines.voice.voxtral.engine\|XttsVoiceEngine\|VoxtralVoiceEngine" -- app tests frontend plans docs wiki plugins
git grep -n "USE_TTS_SERVER.*0\|setenv(\"USE_TTS_SERVER\", \"0\"\|USE_TTS_SERVER\] = \"0\"\|USE_TTS_SERVER=0" -- app tests frontend plans docs wiki plugins
git grep -n "manifest.json\|settings_schema.json" -- app/engines/voice plugins/tts_xtts plugins/tts_voxtral tests plans wiki docs
```

## Classification Rules

- **Delete first**: severed files, duplicate metadata, or docs with no production references and no test value.
- **Replace next**: automatic fallback branches that silently route production behavior to v1/in-process paths.
- **Keep temporarily**: data migration and compatibility readers needed to load or upgrade existing projects, voices, settings, assignments, and artifacts.
- **Move/rewrite**: tests that only prove fallback behavior after the product path is v2-only.
- **Escalate**: anything that writes user data, changes persisted schemas, or handles recovery from old installs.

## Initial Inventory

| Path | Kind | Current references | Runtime impact | Desired outcome | Risk | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| `app/boot.py:41` | production fallback | Boot docs define `USE_TTS_SERVER=0` as emergency fallback. | startup | Reword as development/test override if retained. | Low | `git grep -n "emergency fallback" app tests plans wiki docs` |
| `app/boot.py:82` | production fallback | `boot_tts_server()` catches all startup exceptions and mutates `USE_TTS_SERVER` to `0`. | startup, synthesis | Replace with explicit service-unavailable state; do not mutate runtime mode silently. | High | `./venv/bin/python -m pytest tests/test_boot.py tests/test_api_system.py tests/test_tts_server_health.py` |
| `app/engines/watchdog.py:440` | production fallback | Circuit breaker opens and sets `USE_TTS_SERVER=0`. | startup, synthesis, settings | Keep circuit breaker, but report failed service state instead of switching to local runtime. | High | `./venv/bin/python -m pytest tests/test_api_system.py tests/test_tts_server_health.py` plus manual kill/restart check |
| `app/engines/watchdog.py:469` | production fallback | Failed restart sets `USE_TTS_SERVER=0`. | startup, synthesis | Replace with explicit unhealthy/circuit-open diagnostics and retry control. | High | Add/adjust watchdog tests for no env mutation; run affected backend tests. |
| `app/engines/bridge.py:47` | production fallback switch | `VoiceBridge.synthesize()` routes remote when flag on, local when flag off. | synthesis | Retain only as explicit development/test path or remove production call path after boot fallback is gone. | High | `./venv/bin/python -m pytest tests/test_bridge_tts_server.py tests/bridge` |
| `app/engines/bridge.py:53` | production fallback switch | `build_voice_asset()` only works locally when TTS Server flag is off. | voice asset build | Decide whether voice asset build must move to TTS Server or remain explicit non-production/tooling path. | Medium | Audit callers with `git grep -n "build_voice_asset"`; add route/service coverage before removal. |
| `app/engines/bridge.py:80` | production fallback switch | `check_readiness()` assumes ready on TTS Server but delegates to local path when flag off. | readiness, settings | Replace assumption with remote readiness when available; classify local path as test/dev only. | Medium | Target settings/engine readiness tests. |
| `app/engines/bridge.py:86` | production fallback switch | `describe_registry()` uses remote or local registry based on flag. | settings, engine discovery | Production should expose TTS Server diagnostics when remote unavailable, not local built-ins. | High | `./venv/bin/python -m pytest tests/test_api_engines.py tests/test_api_system.py tests/test_bridge_tts_server.py` |
| `app/engines/bridge.py:110` | production fallback switch | Engine settings update routes remote or local by flag. | settings | Keep remote as product path; local setting updates should be dev/test or removed after tests are rewritten. | Medium | Engine settings route tests and Settings manual check. |
| `app/engines/bridge.py:119` | production fallback switch | Local refresh clears in-process registry cache. | settings, plugin discovery | Replace product plugin refresh with TTS Server-only behavior. | Medium | Plugin refresh API tests and Settings engine refresh manual check. |
| `app/engines/bridge.py:134` | production fallback switch | Local verify wraps legacy engines in `_LegacyEngineShim`. | verification | Remove from production path after plugin verification is authoritative. | Medium | `./venv/bin/python -m pytest tests/test_api_engines.py tests/test_plugin_loader.py tests/test_tts_server_health.py` |
| `app/engines/bridge.py:185` | production fallback switch | Preview routes remote or local by flag. | preview | TTS Server must be the normal preview path; local path test/dev only or deleted. | High | Preview route tests plus manual Settings "Run test" and voice preview check. |
| `app/engines/bridge.py:191` | production fallback switch | Dependency installation routes remote or local by flag. | settings, setup | Product path should install via TTS Server/plugin manager only. | Medium | Engine dependency installation tests or manual Settings install check. |
| `app/engines/bridge_remote.py:100` | explicit degraded remote behavior | Synthesis-plan request failure logs warning and returns empty `SynthesisPlan`. | synthesis planning | Decide if this should surface an unavailable service instead of silently losing planning metadata. | Medium | Add targeted test for failed plan request; verify queue planning still reports actionable error. |
| `app/engines/bridge_remote.py:138` | service diagnostic | `_get_tts_client()` raises `EngineUnavailableError` when watchdog missing/unhealthy/circuit-open. | synthesis, settings | Keep and reuse as the model for v2-only failure visibility. | Low | Existing `tests/test_bridge_tts_server.py`; add API-level propagation tests. |
| `app/engines/bridge_local.py` | production fallback | Local in-process adapter handler used whenever `USE_TTS_SERVER=0`. | synthesis, preview, settings | Quarantine as test/dev-only, then remove production references once bridge/registry are v2-only. | High | `git grep -n "LocalBridgeHandler\|bridge_local"` and bridge tests after rewrite. |
| `app/engines/registry.py:16` | production fallback import | Registry imports built-in XTTS/Voxtral engine classes at module import time. | engine discovery, import side effects | Remove production imports; plugin manifests should be canonical. | High | `git grep -n "app.engines.voice.xtts.engine\|app.engines.voice.voxtral.engine" app` |
| `app/engines/registry.py:35` | production fallback switch | `load_engine_registry()` uses TTS Server when flag on, otherwise local built-ins. | engine discovery | Make TTS Server registry the product path; local registry only explicit test/dev fixture if retained. | High | `./venv/bin/python -m pytest tests/bridge/test_bridge_registry.py tests/test_api_engines.py tests/test_bridge_tts_server.py` |
| `app/engines/registry.py:77` | explicit degraded remote behavior | Remote registry returns `{}` when TTS Server unavailable. | settings, engine discovery | Keep as visible unavailable/empty state only if API/UI reports service diagnostics clearly. | Medium | API system/engines tests should assert degraded diagnostics. |
| `app/engines/registry.py:249` | production fallback | `_load_builtin_engines()` creates XTTS/Voxtral in-process registrations. | engine discovery, settings | Delete or move behind test-only fixture after callers no longer need production fallback. | High | `git grep -n "_load_builtin_engines\|_builtin_engine_specs"` |
| `app/engines/registry.py:300` | duplicate metadata | Built-in engine specs load `app/engines/voice/*/manifest.json`. | engine discovery | Delete or quarantine duplicate built-in manifests after plugin metadata is canonical. | Medium | `git grep -n "app/engines/voice/.*/manifest.json\|_builtin_engine_specs"` |
| `app/engines/voice/xtts/manifest.json` | duplicate metadata | Loaded by local registry only. | engine discovery | Delete after local registry is removed/quarantined. | Medium | Registry tests updated to use plugin metadata or fixtures. |
| `app/engines/voice/xtts/settings_schema.json` | duplicate metadata | Used by local XTTS adapter schema helper. | settings | Delete after local adapter is removed/quarantined. | Medium | `git grep -n "app/engines/voice/xtts/settings_schema.json\|with_name(\"settings_schema.json\")"` |
| `app/engines/voice/voxtral/manifest.json` | duplicate metadata | Loaded by local registry only. | engine discovery | Delete after local registry is removed/quarantined. | Medium | Registry tests updated to use plugin metadata or fixtures. |
| `app/engines/voice/voxtral/settings_schema.json` | duplicate metadata | Local Voxtral adapter falls back to this when plugin schema is absent. | settings | Remove fallback to local schema; plugin schema is canonical. | Medium | Settings schema route tests and `git grep -n "app/engines/voice/voxtral/settings_schema.json"` |
| `app/engines/voice/xtts/engine.py` | production fallback adapter | Imported by registry; delegates generation and conversion to legacy `app.engines`. | synthesis, preview, settings | Delete or move to test fixture after production imports are gone. | High | `git grep -n "XttsVoiceEngine\|app.engines.voice.xtts.engine"` |
| `app/engines/voice/voxtral/engine.py` | production fallback adapter | Imported by registry; delegates to `app.engines_voxtral` and legacy conversion helper. | synthesis, preview, settings | Delete or move to test fixture after production imports are gone. | High | `git grep -n "VoxtralVoiceEngine\|app.engines.voice.voxtral.engine"` |
| `app/engines/__init__.py:32` | compatibility shim | Loads `app/engines.py` as `app._legacy_engines_module` for unresolved attributes. | mixed: plugin helpers, audio ops, tests | Do not delete first. Narrow after plugin engines stop depending on legacy helpers. | High | `git grep -n "from app.engines import" app plugins tests` |
| `app/engines.py` | compatibility shim | Legacy module still provides ffmpeg/audio helpers and XTTS generation used by plugins and orchestration tasks. | synthesis, export, bake, preview | Split reusable audio/process helpers from legacy engine generation before deleting. | High | `git grep -n "from app.engines import" app plugins tests` plus export/bake/synthesis tests. |
| `app/tts_server/server.py:251` | duplicate metadata/fallback | TTS Server dependency install falls back from plugin `requirements.txt` to built-in XTTS requirements. | settings, setup | Replace with plugin-owned requirements path only once plugin packaging is confirmed. | Medium | `git grep -n "app/engines/voice/xtts/requirements.txt"` and `./venv/bin/python -m pytest tests/test_plugin_loader.py tests/test_tts_server_health.py` |
| `app/tts_server/plugin_loader.py:290` | plugin compatibility | Pip plugin loading synthesizes required manifest fields when distribution `manifest.json` is missing or partial. | startup, plugin discovery | Likely keep as explicit pip-plugin compatibility unless product decides pip plugins must ship full manifests. Do not classify as v1 runtime fallback. | Medium | `./venv/bin/python -m pytest tests/test_plugin_loader.py` |
| `plugins/tts_xtts/engine.py:8` | plugin legacy dependency | TTS Server plugin delegates synthesis to legacy `app.engines.xtts_generate`. | synthesis | Document and defer unless replacing XTTS implementation is in Phase 11 scope; this is plugin-internal, not silent runtime fallback. | High | Plugin synthesis tests/manual XTTS synthesis through TTS Server. |
| `plugins/tts_xtts/engine.py:239` | plugin legacy dependency | Plugin resolves profile inputs through legacy voice helper when no `voice_ref` is provided. | preview, synthesis | Replace with explicit SDK/API payload inputs when available; do not block initial fallback removal on this unless production behavior is hidden. | Medium | Voice preview and synthesis tests with profile id and voice_ref. |
| `plugins/tts_xtts/engine.py:267` | plugin legacy dependency | Plugin calls legacy XTTS generator. | synthesis | Defer as implementation dependency unless a v2 generator boundary exists. | High | End-to-end TTS Server XTTS synthesis. |
| `plugins/tts_xtts/engine.py:283` | plugin legacy dependency | Plugin calls legacy WAV-to-MP3 helper through `app.engines`. | synthesis | Move audio conversion helper to neutral infra/audio module before deleting legacy module. | Medium | MP3 synthesis tests and export tests. |
| `plugins/tts_voxtral/engine.py:7` | plugin legacy dependency | Plugin delegates to `app.engines_voxtral`. | synthesis | Defer or wrap through a plugin-local service until Voxtral runtime is redesigned. Not the first deletion target. | High | Voxtral plugin verification/synthesis tests. |
| `plugins/tts_voxtral/engine.py:252` | plugin legacy dependency | API key resolution uses `app.engines_voxtral`, falling back to environment. | settings, verification | Prefer TTS Server settings store or explicit environment lookup; keep until settings contract is moved. | Medium | Voxtral settings/verification tests. |
| `plugins/tts_voxtral/engine.py:291` | plugin legacy dependency | Plugin calls legacy Voxtral generator. | synthesis | Defer unless a v2 Voxtral generator boundary exists. | High | Voxtral plugin synthesis tests/manual cloud synthesis. |
| `plugins/tts_voxtral/engine.py:304` | plugin legacy dependency | Plugin calls legacy WAV-to-MP3 helper through `app.engines`. | synthesis | Move audio conversion helper before deleting legacy engine module. | Medium | MP3 synthesis tests and export tests. |
| `app/infra/subprocess/__init__.py:7` | docs/scaffold | Intended upstream callers still list built-in local adapters. | docs/comment, architecture scaffold | Update after adapter quarantine/removal. | Low | `git grep -n "INTENDED_UPSTREAM_CALLERS"` |
| `tests/test_boot.py:37` | fallback-asserting test | Asserts watchdog boot failure sets `USE_TTS_SERVER=0`. | tests | Rewrite to assert service-unavailable diagnostics and no mode mutation. | Medium | `./venv/bin/python -m pytest tests/test_boot.py` |
| `tests/test_api_system.py:26` | legacy test fixture | Autouse fixture disables TTS Server/orchestrator for legacy system tests. | tests | Split tests: v2 service-state tests should use defaults; legacy compatibility tests should be explicit. | Medium | `./venv/bin/python -m pytest tests/test_api_system.py` |
| `tests/test_api_system.py:103` | fallback-asserting test | Asserts `Single-Process (Fallback from Crashed Subprocess)` is ready. | tests, startup presentation | Rewrite to expect degraded/unavailable TTS Server service state. | Medium | `./venv/bin/python -m pytest tests/test_api_system.py` |
| `tests/conftest.py:332` | test-only fixture | Forces bridge/domain contract tests to local in-process path. | tests | Move local adapter tests under explicit legacy/test fixture or rewrite to remote TTS Server behavior. | Medium | `./venv/bin/python -m pytest tests/bridge tests/test_domain_contracts.py` |
| `tests/bridge/test_bridge_registry.py` | fallback-asserting test | Requires `USE_TTS_SERVER=0` and asserts built-in XTTS/Voxtral registry. | tests | Convert to test-only local registry fixture or replace with TTS Server/plugin registry tests. | Medium | `./venv/bin/python -m pytest tests/bridge/test_bridge_registry.py` |
| `tests/test_bridge_tts_server.py:166` | fallback-asserting test | Asserts bridge uses local path when TTS Server flag is false. | tests | Retain only if flag remains as explicit dev/test override; otherwise delete/rewrite. | Medium | `./venv/bin/python -m pytest tests/test_bridge_tts_server.py` |
| `wiki/Changelog.md:11` | docs/comment | Current changelog says local in-process fallbacks ensure reliability when server unavailable. | docs | Update when behavior changes ship; do not rewrite historical entry until release note context is clear. | Low | `git grep -n "in-process fallback\|Single-Process" wiki docs plans` |
| `plans/v2_phase_delivery_plan.md:302` | docs/comment | Phase plan already names Phase 11 removal target. | docs | Keep aligned with actual Phase 11 status as implementation progresses. | Low | Plan review before checkpoint commits. |
| `app/db/migration.py` and domain `compatibility*` modules | migration/data compatibility | Handle legacy state/filesystem/project/voice/chapters data. | storage, migration, recovery | Keep unless a targeted audit proves a reader is obsolete. Not part of first runtime fallback deletion. | High | Migration/security/storage tests. |
| `app/config.py` legacy path helpers | migration/data compatibility | Resolve project and global legacy layout paths for text/audio/assets. | storage, preview, artifact serving | Keep for user data compatibility until storage migration exit criteria are separate and verified. | High | `./venv/bin/python -m pytest tests/test_storage_normalization.py tests/test_isolation_security.py tests/security/test_migration_security.py` |

## Dependency-Ordered Cleanup Plan

1. Rewrite fallback-asserting boot/watchdog/system tests so they expect visible TTS Server unavailable/degraded state, not env mutation to `USE_TTS_SERVER=0`.
2. Remove env mutation from `boot_tts_server()` and watchdog failure paths; preserve diagnostics, logs, circuit breaker, and retry behavior.
3. Update API/system presentation so crashed or unavailable TTS Server is not presented as ready Single-Process fallback.
4. Make engine discovery/settings/preview/synthesis API behavior surface remote unavailability explicitly when `USE_TTS_SERVER` is true.
5. Quarantine local bridge and local registry behind explicit test/dev-only seams if still needed by unit tests.
6. Remove production imports of `app.engines.voice.xtts.engine` and `app.engines.voice.voxtral.engine`.
7. Delete or move duplicate built-in manifests/settings schemas once production imports and tests no longer need them.
8. Split neutral audio/process helpers out of `app/engines.py` before attempting to remove the legacy compatibility module.
9. Revisit plugin-internal legacy dependencies after the silent production fallback is gone; they are real debt but not equivalent to automatic failover.

## Verification Gates

- `git grep -n "os.environ[\"USE_TTS_SERVER\"] = \"0\"" app` returns no production fallback mutations.
- `git grep -n "app.engines.voice.xtts.engine\|app.engines.voice.voxtral.engine" app` returns no production imports.
- `./venv/bin/python -m pytest tests/test_boot.py tests/test_api_system.py tests/test_bridge_tts_server.py tests/test_tts_server_health.py`
- `./venv/bin/python -m pytest tests/bridge tests/test_api_engines.py tests/test_plugin_loader.py`
- Manual check: normal boot discovers XTTS/Voxtral through `plugins/*`.
- Manual check: killed or failed TTS Server shows unavailable/retry diagnostics and does not synthesize locally.

## Open Questions

- Should `USE_TTS_SERVER=0` remain as a documented developer/test override, or should it be removed entirely from normal app entry points?
- Should local bridge/registry tests be preserved as legacy adapter contract tests, or moved to plugin fixture coverage as soon as remote behavior is covered?
- What is the correct v2 owner for reusable audio conversion currently reached through `app.engines.wav_to_mp3`?
- Should plugin engines continue to wrap legacy XTTS/Voxtral generators in Phase 11, or should that be a separate plugin-runtime hardening phase after silent fallback is removed?
