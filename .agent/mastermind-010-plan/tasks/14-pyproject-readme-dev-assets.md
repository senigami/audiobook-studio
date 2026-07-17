# Task 14 — Per-plugin pyproject.toml, README rewrite, dev/scenarios.json, assets check

Depends on 12, 13.

## Changes (per plugin)
- `pyproject.toml`: name (`studio-plugin-tts-xtts` style), version = manifest version, license =
  task-12 outcome, future dep `studio-plugin-sdk` (commented or extras — it isn't on PyPI; keep inert),
  `[tool.pytest.ini_options] testpaths=["tests"]`. Must be inert in-tree: root pytest.ini still governs
  (verify `pytest plugins -q` collection unchanged after adding).
- README rewrite to standalone-repo framing: what it is, install (paste-URL/registry), resource
  profile per plan 05 §2, and the boundary paragraph: "plugin/studio/ is host-integration code (runs
  in-process in Studio, uses host APIs); everything else imports only studio_plugin_sdk."
  Include `host_api_used` inventory from task 06 if produced.
- `dev/scenarios.json` (both plugins): check usage — `grep -rn "scenarios.json" app plugins --include="*.py"`.
  If used by tests → move under `tests/fixtures/`; if unused → delete.
- Assets: `latent.pth` is 132K (verified — NOT multi-MB; keep in repo, no release-asset flow needed;
  note this resolves the approach doc's flag). Logos fine.

Acceptance: suite green; README boundary text present; code-map queue entry if mapped files moved.
