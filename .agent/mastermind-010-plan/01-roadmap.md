# Roadmap — 17 tasks, 5 phases. Repo must be GREEN at every phase boundary (and after every task).

Baseline first: run `pytest -q` and record total pass count in a scratch note; parity is checked at
each phase end.

## Phase A — SDK package + shims + identity (plugins untouched, still on old imports)
- 01-create-sdk-package (L, mid) — real `studio_plugin_sdk/` + app shims + identity tests. HIGHEST-RISK setup.
- 02-delete-sdk-alias (M, mid) — remove `_register_sdk_alias`; fix alias tests; verify subprocess import path. **RISKIEST TASK** (engine-loading path).
- 03-sdk-proc-audio (M, mid) — `proc.py`/`audio.py` extraction with injected `scratch_dir`/`quality`; app wrappers.
  Deps: 01 → 02; 01 → 03. Phase gate: full suite green, parity.

## Phase B — plugin import rewrites
- 04-xtts-server-core-rewrite (M, mid) — deps: 02,03
- 05-voxtral-server-rewrite (S, mid) — deps: 02,03
- 06-plugin-studio-sdk-imports (M, mid) — deps: 02 (module-level SDK imports in plugin/studio → studio_plugin_sdk; app.* fn-body stays)
- 07-gates-update (M, mid) — deps: 04,05,06 — s4/s5 gate boundary + new SDK-cleanliness gate. BLOCKED on Checkpoint-2 user confirmation of grep boundary.
- 08-xtts-test-rewrite (L, mid) — deps: 04,06 — 29 files; pass-count parity enforced
- 09-voxtral-test-rewrite (S, light) — deps: 05,06
  Phase gate: boundary greps pass; suite green, parity.

## Phase C — test layout repo-readiness
- 10-evict-studio-integration-tests (M, mid) — deps: 08
- 11-plugin-local-conftest-fakes (L, mid) — deps: 08,09,10
  Phase gate: `pytest plugins/tts_xtts/tests plugins/tts_voxtral/tests` passes standalone-ish (local conftest, no root fixtures); full suite green.

## Phase D — folder hygiene (mostly mechanical)
- 12-license-gitignore (S, light; LICENSE choice needs user answer on CPML vs AGPL)
- 13-manifest-distribution-blocks (S, light) — deps: none hard; after B for gate stability
- 14-pyproject-readme-dev-assets (M, mid) — deps: 12,13 (README documents the studio boundary)
  Phase gate: suite green; loader refresh OK with new manifest keys.

## Phase E — plan-05 remainder + closure
- 15-superseded-banner-registry-finalize (S, light)
- 16-e2e-install-trust-tests (L, mid) — deps: 13,15 — local git fixture, no network
- 17-tts-mixed-group4-docs-close (S→M, light/mid) — Group 4 verification + specs/changelog sweep + final DoD run
  Phase gate: suite green; all greps + full suite + parity.

Mechanical / light-tier OK: 09, 12, 13, 15, parts of 17.
Judgment-needing / mid-tier: 01, 02, 03, 04, 05, 06, 07, 08, 10, 11, 14, 16.
