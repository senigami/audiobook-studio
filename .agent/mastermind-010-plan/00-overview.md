# Plan 010 — Repo-ready plugin folders + real studio_plugin_sdk

Inputs (binding): `.agent/mastermind-010-problem-statement.md`, `.agent/mastermind-010-approach.md`.
Authoritative feature plan: `design-docs/plans/active/final_release/05_standalone_plugin_repos.md`.
Branch `studio2/standalone-plugin-repos-010` → PR to `studio-2.0`.

## Goal
Make `plugins/tts_xtts/` and `plugins/tts_voxtral/` liftable as-is into standalone GitHub
repos later, WITHOUT extracting now and with zero behavior change. Core move: invert the
SDK dependency.

## Dependency inversion (target state)

    BEFORE                              AFTER
    plugins → app.engines.voice.sdk     app (shims re-export) ─┐
    plugins → app.studio_plugin_sdk                            ▼
      (via sys.modules alias hack)      studio_plugin_sdk/  (REAL top-level package)
                                                           ▲
                                        plugins ───────────┘  (direct import, no alias)

- `studio_plugin_sdk/` at repo root: `types.py`, `engine.py`, `context.py`, `plugin_utils.py`,
  `errors.py` (clean hierarchy), `_import_utils.py`, `proc.py`, `audio.py`, `__init__.py`
  (`SDK_VERSION = "1.0"`), `py.typed`. No pyproject for the SDK itself. Definitions MOVE, never copy.
- `app/engines/voice/sdk.py`, `app/engines/voice/base.py` (StudioTTSEngine only),
  `app/studio_plugin_sdk/*` become re-export shims. `BaseVoiceEngine` + app-flavored helpers stay in app.
- The `_register_sdk_alias` sys.modules hack in `app/tts_server/plugin_loader.py` is DELETED.

## Invariants — must hold after EVERY task
1. **Module identity**: exactly one module object per class. Test asserts
   `app.engines.voice.sdk.TTSRequest is studio_plugin_sdk.types.TTSRequest` (and peers).
2. **Zero behavior change** to synthesis/queue/engine loading. `POST /plugins/refresh` works;
   both plugins load + synthesize in-tree.
3. **Suite green at every phase boundary** with pass-count parity vs baseline
   (record baseline count in Phase 0). `pytest` (pytest.ini: `testpaths = tests plugins`).
4. modular_architecture.md: no engine-ID branches in core (INV-3); no import-time side effects;
   `_validate_manifest` in `app/tts_server/plugin_loader.py` stays the authoritative validator.
5. tts_mixed untouched except Group-4 verification.

## Import boundary (renegotiated DoD grep — CONFIRMED by user at Checkpoint 2)
- ZERO `app.*` imports (any position) in: `plugin/server/`, `plugin/core/`, `interface.py`, `cli.py`.
- ZERO **module-level** `app.*` in `plugin/studio/` — function-body app.* imports stay
  (host-integration code; documented in plugin READMEs).
- ZERO `app.*` imports anywhere in `studio_plugin_sdk/` EXCEPT function-body imports inside
  `context.py` (the host-implemented context — see caveat below).
- Enforced by the existing s4/s5 gate tests (`plugins/*/tests/test_s{4,5}_import_cleanliness.py`),
  extended per task 07.

### Known deviation from the approach doc (flag, do not silently absorb)
The approach doc says `context.py` "is stdlib-only already". **It is not**: it contains ~40
function-body `from app.…` imports (verified). They are lazy and only execute in the Studio host
process, so moving the file works, but the "SDK has zero app.*" gate must be module-level-only for
`context.py`. Surface this to the user at Checkpoint 2 alongside the grep renegotiation.

## Definition of done
- Boundary greps above pass (subject to user confirmation).
- Both plugins load + synthesize in-tree; full suite green with pass-count parity.
- LICENSE + `.gitignore` + `distribution` manifest block + pyproject + standalone README per plugin.
- SUPERSEDED banner on `design-docs/plans/reference/v2_engine_bundle_github_distribution.md`.
- Registry finalized; E2E install-flow + trust-warning tests (§5.3) green with a LOCAL git fixture (no network).
- Group 4 tts_mixed verification done.
- Specs bumped: `design-docs/specs/engines-and-plugins.md`, `design-docs/specs/install-distribution.md`;
  wiki changelog entry; code-map changelog-queue entries in `docs/code-map/queue/`.

## Explicitly NOT doing
No StudioPluginContext capability expansion; no PyPI/SDK repo split/vendoring; no gate loosening;
no tts_mixed changes beyond Group 4; no update-flow test §5.2.

## Testing standards (CLAUDE.md)
TDD for behavior-affecting tasks (failing test first, named per task). R1 revert-check for bug-fix
tests and any test whose assertions changed. R2 mock only at boundaries. R4 no sleep-based timing.
Every task touching mapped code appends a code-map changelog-queue entry (`docs/code-map/queue/`).
