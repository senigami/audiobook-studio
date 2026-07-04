# BE-2 — Replace dead INTENDED_*/FORBIDDEN_* constants (code-map queue entry)

Task: `design-docs/plans/active/simplification/05_backend_cleanup.md` BE-2.

Pure documentation cleanup, zero behavior change. `INTENDED_UPSTREAM_CALLERS`,
`INTENDED_DOWNSTREAM_DEPENDENCIES`, and `FORBIDDEN_DIRECT_IMPORTS` were module-level tuples read
nowhere in the codebase (confirmed via a repo-wide grep for each name as a *usage*, not just a
definition — zero hits beyond the definitions themselves). Present in 12 modules.

## Approach taken

Mixed (a)/(b) per the doc's guidance, decided per-module by risk and by whether the module's
stated forbidden-import intent is actually true of the code today:

**(b) executable import-boundary test** — `tests/orchestration/test_import_boundaries.py` (new):
- `app/orchestration/scheduler/orchestrator.py` — must not import `app.jobs.worker` /
  `app.jobs.core` / `app.db.queue`.
- `app/engines/bridge_utils.py` — must not import `app.api.routers` / `app.db` / `app.jobs`.

Both modules' real imports were verified clean against their forbidden lists before enforcing.
The test parses `from`/`import` lines (ignoring comments) and asserts none match a forbidden
prefix; a `test_guarded_modules_exist` sanity test fails loudly if a guarded path is renamed
instead of silently no-op-ing. Detection logic was verified against a synthetic snippet
containing `app.jobs.core`, `app.db.queue`, `app.jobs` imports (all three flagged) before wiring
it to the real files — R1-equivalent revert-check without needing to break a real, imported
module (a real forbidden import in `orchestrator.py` fails at collection with `ModuleNotFoundError`
before the assertion even runs, so the synthetic-snippet check is the correct-shaped test of the
regex logic itself).

**`app/orchestration/progress/service.py` was deliberately excluded from (b)**: its former
`FORBIDDEN_DIRECT_IMPORTS` claimed no `app.api.routers`/`app.engines` imports, but the module
already makes two lazy, function-local imports that violate this —
`app.api.routers.voices_helpers._voice_job_title` (line ~493, voice-test title lookup) and
`app.engines.behavior.DEFAULT_BASELINE_ENGINE_CPS` (line ~902, per-segment ETA baseline). This is
pre-existing boundary drift, out of scope for a documentation-only cleanup task. Enforcing it here
would either fail immediately (wrong) or require fixing the drift (a real behavior-touching
change, not requested). Replaced with a comment instead, noting the drift explicitly rather than
hiding it.

**(a) one-line comment** — all other 9 modules (their stated import edges are either already true
or unenforceable placeholders/scaffolds, not worth an executable test):
- `app/orchestration/progress/service.py` (see above)
- `app/domain/artifacts/service.py`, `app/domain/settings/service.py`,
  `app/domain/projects/service.py`, `app/domain/voices/service.py` — Phase-1 domain-service
  scaffolds with placeholder bodies; the boundary is aspirational, not load-bearing yet.
- `app/core/logging.py`, `app/infra/db/__init__.py`, `app/infra/subprocess/__init__.py` — stub
  packages with `NotImplementedError` bodies (see PL-5 sibling task for the plugin-side version
  of this same "caller-less stub" pattern).
- `plugins/tts_xtts/plugin/studio/app_adapter.py`, `plugins/tts_voxtral/plugin/studio/app_adapter.py`
  — plugin-boundary intent already covered by the existing
  `tests/engines/test_plugin_boundary_leak.py` (portable `plugin/core/` must not import `app.*`);
  these `studio/` adapters are the Studio-facing side and adding a second boundary test here would
  duplicate that coverage for little gain.

## Files changed
- `app/orchestration/scheduler/orchestrator.py` — tuples → comment (kept as prose boundary note;
  now enforced by the new test).
- `app/engines/bridge_utils.py` — tuples → comment (now enforced by the new test).
- `app/orchestration/progress/service.py` — tuples → comment documenting the known drift.
- `app/domain/artifacts/service.py`, `app/domain/settings/service.py`,
  `app/domain/projects/service.py`, `app/domain/voices/service.py` — tuples → one comment block
  each.
- `app/core/logging.py`, `app/infra/db/__init__.py`, `app/infra/subprocess/__init__.py` — tuples →
  one comment block each (the subprocess module keeps its existing "intentional plugin-boundary
  allowlist" note, merged into the same comment).
- `plugins/tts_xtts/plugin/studio/app_adapter.py`, `plugins/tts_voxtral/plugin/studio/app_adapter.py`
  — tuples → one comment block each.
- `tests/orchestration/test_import_boundaries.py` (new) — the two enforced boundary checks
  described above.

## Verification
- Repo-wide grep for `INTENDED_UPSTREAM_CALLERS`/`INTENDED_DOWNSTREAM_DEPENDENCIES`/
  `FORBIDDEN_DIRECT_IMPORTS` in `app/`, `plugins/`, `tests/` → zero hits outside prose in the new
  test file's docstring/comments.
- `./venv/bin/python -m pytest -q` (full suite, incl. plugin suites run separately) → 2180 passed,
  3 skipped; `plugins/tts_xtts/tests plugins/tts_voxtral/tests plugins/tts_mixed/tests` → 240
  passed, 2 skipped.
- `./venv/bin/python -m ruff check .` → All checks passed.
- One pre-existing test (`tests/orchestration/test_isolation.py::TestLegacyIsolation::test_app_jobs_worker_not_imported_by_orchestrator`)
  does a naive raw-source substring check for the literal text `"import app.jobs"` — my first
  comment draft in `orchestrator.py` happened to contain that substring in prose
  ("`import app.jobs.worker`"). Reworded the comment to avoid the literal substring while keeping
  the same documented meaning; confirmed the test passes again.

## Flow impact
None. No import graph changed, no runtime behavior changed — only documentation-as-dead-tuples
became documentation-as-comments (9 modules) or documentation-as-an-enforced-test (2 modules).
