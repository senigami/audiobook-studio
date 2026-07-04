# PL-5 — Remove unimplemented ABC stubs (code-map queue entry)

Task: `design-docs/plans/active/simplification/06_plugin_consolidation.md` PL-5.

Pure dead-code removal, zero behavior change. `validate_environment` and `build_voice_asset` were
overridden in both `XttsVoiceEngine` and `VoxtralVoiceEngine` with bodies that only
`raise NotImplementedError` (no callers anywhere — confirmed via
`grep -rn "\.validate_environment(\|\.build_voice_asset(" app/ plugins/ tests/` returning zero
hits before the change).

## Decision: base class is not an ABC

Checked `app/engines/voice/base.py`. `BaseVoiceEngine` (what both plugin engines actually
subclass) is a **plain class**, not an ABC — no `ABC` base, no `@abstractmethod` decorators.
(`StudioTTSEngine`, a separate contract in the same file for the TTS-Server-side SDK, *is* an ABC
with `@abstractmethod` members, but neither plugin's `app_adapter.py` engine subclasses it.)
`BaseVoiceEngine.validate_environment` / `.build_voice_asset` already carry their own
`raise NotImplementedError("Subclasses must implement ...")` bodies as a soft-abstract convention.

Per the task's explicit instruction ("if these are NOT `@abstractmethod`, delete the four stubs
entirely from the two subclasses"): deleted all four subclass overrides. They were exact
duplicates of the base's default behavior — removing them changes nothing observable; calling
`.validate_environment()`/`.build_voice_asset()` on either engine still raises the same
`NotImplementedError` message, now via the inherited base method instead of a redundant subclass
copy.

Left `BaseVoiceEngine`'s own two methods untouched (task scope is the two plugin subclasses only,
not the base contract) and left the unrelated `VoiceBridge.build_voice_asset` in
`app/engines/bridge.py` untouched (different class, not named in PL-5's scope).

## Files changed
- `plugins/tts_xtts/plugin/studio/app_adapter.py` — removed `XttsVoiceEngine.validate_environment`
  (was `app_adapter.py:177-179`) and `XttsVoiceEngine.build_voice_asset` (was `:405-408`,
  including a stray `_ = run_managed_subprocess_async` no-op reference inside the dead body; the
  import itself stays live via the identical pattern still present in `synthesize()`).
- `plugins/tts_voxtral/plugin/studio/app_adapter.py` — removed
  `VoxtralVoiceEngine.validate_environment` (was `:146-148`) and
  `VoxtralVoiceEngine.build_voice_asset` (was `:367-369`).

## Verification
- `grep -rn "validate_environment\|build_voice_asset" plugins/tts_xtts/tests plugins/tts_voxtral/tests tests/` → zero hits (no test referenced either method on either engine).
- `./venv/bin/python -m pytest plugins/tts_xtts/tests plugins/tts_voxtral/tests -q --no-cov` → 217 passed, 2 skipped.
- `./venv/bin/python -m pytest -q --no-cov` (full suite) → 2180 passed, 3 skipped — identical
  count to pre-change baseline.
- `./venv/bin/python -m ruff check .` → All checks passed.

## Flow impact
None. Neither method was reachable from any code path (registry, orchestrator, routes, or tests);
their absence changes no runtime behavior. Calling them directly on either engine instance still
raises `NotImplementedError` with the same message, now from `BaseVoiceEngine`.
