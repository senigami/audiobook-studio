# Task 17 — Group 4 tts_mixed verification + docs/state/changelog closure

## tts_mixed (verify, minimal touch)
- `plugins/tts_mixed/manifest.json` line 11 already has `"built_in": true` (verified — problem
  statement said `"builtin"`; the loader/models use `built_in`: app/tts_server/server.py:293,477,
  health.py:192, models.py:52 — key naming check RESOLVED: `built_in` is correct; note in PR).
- Add/verify test: uninstall of a built_in plugin returns 400 "Built-in plugins cannot be
  uninstalled" (app/tts_server/server.py:477–480). Check existing coverage first:
  `grep -rln "cannot be uninstalled\|built_in" tests`. If missing, TDD it — assert current behavior;
  R1 check: flip manifest built_in→false in a fixture and expect the test to fail.
- Verify tts_mixed loads and is registered post-refresh (existing suite should cover; confirm).
- Document tts_mixed as the in-tree-only exception (app.* imports allowed) in
  `design-docs/specs/engines-and-plugins.md`.

## Docs/state closure (plan 05 §6.1–6.3 — read the section for exact items)
- Bump `design-docs/specs/engines-and-plugins.md` (SDK inversion, boundary rule, built_in exception,
  distribution block — coordinate: task 13 already touched it; this task sweeps completeness).
- Confirm `design-docs/specs/install-distribution.md` bumped (task 16).
- Wiki changelog entry (follow repo convention — wiki/Changelog.md dated entry).
- Code-map changelog-queue: verify every task's entry landed in `.agent/code-map/queue/`; add the
  summary entry for the SDK package addition.
- Mark plan 05 checklist items done in `design-docs/plans/active/final_release/05_standalone_plugin_repos.md`
  ONLY for what this branch actually shipped; leave §5.2 update-flow unchecked (post-v2).

## Final DoD run
- Boundary greps from 00-overview.md; full `pytest -q` parity vs Phase-0 baseline; `POST /plugins/refresh` smoke.
