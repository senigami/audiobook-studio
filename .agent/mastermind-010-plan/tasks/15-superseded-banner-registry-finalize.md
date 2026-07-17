# Task 15 — SUPERSEDED banner + registry JSON finalize (mechanical)

- `design-docs/plans/reference/v2_engine_bundle_github_distribution.md`: prepend SUPERSEDED banner
  pointing to plan 05 (follow plan 05 §1.1 wording). (Verify actual location first:
  `find design-docs -name "v2_engine_bundle_github_distribution.md"`.)
- `app/engines/official_registry.py`: finalize entries against plan §1.2 field list — verify every
  §1.2 field present, ids/urls match task-13 manifests, `min_studio`, trust_level "official". If a
  field is added/renamed, TDD: failing test in `tests/engines/` asserting registry shape first.
- Paste-URL install "finalize": read plan 05 Group 1 checklist items still unchecked and confirm the
  shipped `preview_github` → confirm/cancel flow (app/api/routers/engines_plugins.py lines 116–176)
  covers them; anything missing becomes a note to the conductor, NOT silent scope growth.

Acceptance: suite green; code-map queue entry for official_registry.py if changed.
