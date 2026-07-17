# Task 13 — Manifest `distribution` blocks (+ optional lenient validation)

## Changes
- Add to `plugins/tts_xtts/manifest.json` and `plugins/tts_voxtral/manifest.json` a `distribution`
  block per plan 05 §1.2 shape (read `design-docs/plans/active/final_release/05_standalone_plugin_repos.md`
  §1.2/§2.1 for exact keys) with repo URLs `https://github.com/audiobook-studio/tts-xtts` /
  `…/tts-voxtral` — MUST match `app/engines/official_registry.py` repo_url values (verified those use
  `.git` suffix; keep consistent with §1.2 spec shape).
- Loader ignores unknown keys today (verify: `grep -n "_validate_manifest" -A 30 app/tts_server/plugin_loader.py`)
  → additive, zero risk. OPTIONAL: lenient shape check in `_validate_manifest` (if `distribution`
  present → must be dict), TDD failing test first in `tests/tts_server/`. Do NOT add a new required field.
- Standalone repos never set `built_in` — assert absent in both manifests.

Acceptance: `POST /plugins/refresh` OK; full suite green; code-map queue entry if plugin_loader touched.
Spec note: manifest field addition is documented in `design-docs/specs/engines-and-plugins.md` — bump
it HERE (same change) per spec-sync rule.
