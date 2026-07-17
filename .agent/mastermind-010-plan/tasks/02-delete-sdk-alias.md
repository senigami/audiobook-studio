# Task 02 — Delete `_register_sdk_alias` (RISKIEST TASK — engine-loading path)

Context: 00-overview.md. Depends on task 01. The real top-level package now resolves naturally:
pytest has `pythonpath = .` (pytest.ini line 2) and the tts_server subprocess runs with repo root
importable (it imports `app.*`). Two module objects for one class is the top identity hazard; the
alias must go.

## Verify FIRST (put results in PR description)
- How the tts_server subprocess gets its sys.path: `grep -rn "cwd\|PYTHONPATH\|sys.path" app/engines/bridge_remote.py app/tts_server/__main__.py app/tts_server/server.py | head -20`
  and confirm repo root is on the path so `import studio_plugin_sdk` resolves in that process.
- Tests asserting the alias: `tests/engines/test_studio_plugin_sdk.py` lines 34–43
  (`test_sys_modules_alias_registered`, `test_alias_exposes_studio_tts_engine`). Also
  `grep -rn "_register_sdk_alias\|sys.modules\[.studio_plugin_sdk" tests app plugins --include="*.py"`.

## Changes
- `app/tts_server/plugin_loader.py`: delete lines ~31–53 (`_register_sdk_alias` block + call).
  Keep line 23 import, repointed if desired to `studio_plugin_sdk._import_utils`.
- `tests/engines/test_studio_plugin_sdk.py`: replace alias-registration tests with tests that
  `import studio_plugin_sdk` resolves to the top-level package
  (`studio_plugin_sdk.__file__` NOT under `app/`) and identity still holds. This is an intentional
  assertion change — R1 revert-check: with task-01 reverted these new tests must fail.
- Add identity guard: `sys.modules["studio_plugin_sdk"].__file__` matches repo-root package even
  after `import app.studio_plugin_sdk`.

## Acceptance
- `pytest tests/engines -q` then full `pytest -q`, parity.
- Runtime smoke: start the app/tts_server the standard way and `POST /plugins/refresh` succeeds;
  both plugins report loadable. (Loader path: `app/tts_server/plugin_loader.py`.)
- Code-map queue entry (plugin_loader contract change).
