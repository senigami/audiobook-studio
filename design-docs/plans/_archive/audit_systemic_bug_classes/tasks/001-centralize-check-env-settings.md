# 001 — Centralize settings-aware check_env into one shared helper

- **Status:** done
- **Workload:** Workload 1 — Central fixes
- **Severity / type:** major · correctness / DRY
- **Effort:** S
- **Blocked by:** nothing
- **Blocks:** nothing

## Goal

Every place that calls a plugin engine's `check_env()` does so through one shared helper that
performs signature inspection and loads the plugin's persisted settings, so a settings-keyed
engine (e.g. Voxtral, whose Mistral API key lives in engine settings) can never be checked
"bare" again.

## Why this matters

Three shipped bugs (`daedcfea`, `e106311a`, and the boot-readiness symptom they describe)
were all the same defect: a call site invoked `check_env()` without persisted settings. Two
call sites are still bare and the signature-inspection helper exists twice, so the next call
site anyone writes will regress the same way.

## Context an executor needs

- Spec: `design-docs/specs/engines-and-plugins.md` (health state machine), `design-docs/specs/plugin-contract.md`.
- Canonical fixed pattern: `app/tts_server/health.py:46-55` (`_accepts_settings` at :70) and
  `app/tts_server/plugin_loader.py:283-291` (`_check_env_accepts_settings` at :37, with
  `load_settings(plugin_dir)` from `app/tts_server/settings_store.py`).
- Bare site 1: `app/tts_server/server.py:413` — post-pip-install recovery
  (`ok, msg = plugin.engine.check_env()`).
- Bare site 2: `app/tts_server/plugin_loader.py:398` — pip entry-point load path. Note the
  plugin dir for pip plugins is resolved later at :416 (`plugins_dir / f"tts_{ep.name}"`);
  hoist that resolution above the check so settings can be loaded from it.
- Doc drift: `app/engines/voice/base.py:110-116` docstring shows the bare pattern as the SDK
  contract.

## Target shape / contract

One helper, exported from `app/tts_server/health.py` (or a small shared module both health
and plugin_loader import without creating a cycle):

```python
def call_check_env(engine, plugin_dir: Path | None) -> tuple[bool, str | None]:
    """Call engine.check_env, passing persisted settings when the engine accepts them."""
```

It owns: signature inspection, best-effort `load_settings(plugin_dir)` (empty dict on
error/None dir), and the call itself. `health.engine_status`, `plugin_loader` discovery
(:289), `plugin_loader` pip path (:398), and `server.py` install recovery (:413) all use it.
Delete the duplicated `_accepts_settings` / `_check_env_accepts_settings` in favor of the
single helper's internal check.

## Steps

1. Add `call_check_env` to `app/tts_server/health.py`; refactor `engine_status` to use it
   (keeping the `current_settings` override parameter for callers that already merged
   settings, e.g. `server.py:274`).
2. Replace `plugin_loader.py:283-291` body with the helper; delete
   `_check_env_accepts_settings`.
3. Fix `plugin_loader.py:398`: resolve the pip plugin dir first, then call the helper.
4. Fix `server.py:413` install-recovery block to call the helper with `plugin.plugin_dir`.
5. Update the `app/engines/voice/base.py` docstring to show the settings-aware call.
6. Tests (R1 — must fail pre-fix): a settings-keyed fake engine (a) reports ok in the
   install-recovery path, (b) passes check_env at pip entry-point load when its settings are
   persisted. Place beside `tests/engines/test_tts_server_health.py` /
   `tests/engines/test_plugin_loader.py`, following their existing fixtures.

## Acceptance criteria

- [ ] `grep -rn "check_env()" app/ --include='*.py' | grep -v tests` shows no bare call on a
      plugin engine object (engine-internal `self.check_env()` in plugins is fine).
- [ ] Exactly one signature-inspection implementation remains.
- [ ] New tests fail when the fix is stashed, pass with it; full backend suite green.

## Out of scope

Engine-side `check_env` implementations; verification flow; settings store format.
