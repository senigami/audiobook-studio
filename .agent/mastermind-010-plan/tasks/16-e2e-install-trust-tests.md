# Task 16 — E2E install-flow + trust-warning tests (§5.3), LOCAL git fixture, no network

Depends on 13, 15.

## Verified facts
- URL validation (`app/tts_server/plugin_staging.py` lines 49–55) allows ONLY
  `https://github.com/<owner>/<repo>` — file:// and local paths are REJECTED. This must NOT be weakened.
- Clone happens in `preview_github_repo` (line 316+) via `subprocess.run(["git","clone",…,depth=1…])`,
  which happily clones a local path/file:// URL IF it gets past validation.

## Design: test seam without weakening validation
Refactor `plugin_staging.py`: extract the post-validation body into
`_clone_and_stage(normalized_url: str, plugins_dir: Path) -> dict`;
`preview_github_repo` = `_clone_and_stage(_validate_git_url(git_url), plugins_dir)`.
Pure refactor (TDD: existing staging tests keep passing; find them:
`grep -rln "preview_github_repo\|plugin_staging" tests`).

## New tests (host suite, e.g. `tests/tts_server/test_install_flow_e2e.py`)
- Fixture: `git init` a temp dir (use tmp_path) containing a valid plugin shape (manifest.json passing
  `_validate_manifest`, interface.py stub, plugin/ skeleton — crib minimal shape from an existing
  staging test fixture if one exists), commit, then call `_clone_and_stage("file://"+path …)`.
- Assert: preview returns manifest metadata + staging token; symlink rejection works (add a symlink
  variant repo → expect rejection, per line 59 docstring); confirm endpoint installs into plugins_dir;
  cancel endpoint sweeps `.preview_*` staging dirs.
- Trust warning (§5.3): community (non-registry) URL → response flags trust warning / UI consent
  requirement. Verify where trust_level is computed
  (`grep -rn "trust" app/tts_server/plugin_staging.py app/api/routers/engines_plugins.py app/engines/official_registry.py`)
  and assert an official-registry id vs unknown repo produce different trust levels.
- Validation hardening test: `_validate_git_url("file:///tmp/x")` and `http://…` raise 400 (R1:
  this is the security-property test — confirm it fails if validation is loosened).
- No sleeps (R4); subprocess git is a real boundary — allowed (local, fast). Timeout via subprocess
  timeout arg, not sleep loops.

Acceptance: new tests green offline (`pytest tests/tts_server/test_install_flow_e2e.py -q` with
network disabled if runner supports); full suite parity; code-map queue entry (plugin_staging refactor);
bump `design-docs/specs/install-distribution.md` in THIS task (install/trust flow documented).
