# BR-1 reference — blast radius of renaming/moving `app/jobs`

## The question, restated

REMAINING_TASKS.md (BE-6, `design-docs/plans/REMAINING_TASKS.md:67-68`) defers renaming/relocating the legacy-named `app/jobs` package ("97 refs/~40 files, widest blast radius in this phase"). Produce: (1) the complete importer set with each reference classified, (2) the ordering hazards created by the import-side-effect ban, the boot sequence, and `JobHandlerRegistry` still living under this package, (3) a safe staged move plan with a verification gate per stage.

## What I examined (path:line)

- `app/jobs/` contents: `__init__.py` (empty namespace docstring only — no side effects), `registry.py` (`JobHandlerRegistry`, module-level `_registry` singleton, `get_handler_registry`, `initialize_default_handlers` at :75 with plugin manifest discovery + `_load_plugin_callable` dynamic loading at :149-188), `worker_helpers.py`, `worker_voice.py`, `worker_metrics.py`, `handlers/{audiobook.py, bridge_helpers.py}`. Note: `app.jobs.worker` and `app.jobs.core` **no longer exist** — they appear only as forbidden names in boundary tests (ghosts of deleted modules).
- Code-map: `.agent/code-map/tools/lookup.sh app/jobs/registry.py` — record confirms purpose ("wired in boot sequence and orchestrator dispatch") and calls, but its `called_by` is **empty**, so the map alone is insufficient for the importer set; the exhaustive `grep -rn "app\.jobs"` over `app tests tts_engines studio_plugin_sdk scripts examples conftest.py` (worktrees and `__pycache__` excluded) is the authority below.
- `app/core/boot.py:96-100` (boot step 2), `app/orchestration/scheduler/orchestrator_helpers.py:36`, `studio_plugin_sdk/_import_utils.py` + `app/studio_plugin_sdk/__init__.py` (the identity-preserving shim precedent), `.agent/rules/modular_architecture.md:24`, the three boundary tests, all seven plugin adapter call sites.

## 1. The importer set, classified

### A. Load-bearing runtime wiring (must be rewired; breakage = broken app)

| Ref | Site | Nature |
|---|---|---|
| `app/core/boot.py:97` | `from app.jobs.registry import initialize_default_handlers` | Boot step 2. Lazy, **inside try/except that swallows failure** (:95-100) — a missed rename here does not crash boot; the app comes up with zero handlers and every render fails at dispatch. |
| `app/orchestration/scheduler/orchestrator_helpers.py:36` | `from app.jobs.registry import get_handler_registry, initialize_default_handlers  # noqa: F401 (re-export for patch targets)` | **Dual-role**: the orchestrator's real dispatch import *and* a deliberate re-export so tests can patch. Module-level (not lazy) — the one place `app.jobs` is imported at import time by Studio 2.0 code. |
| `studio_plugin_sdk/context.py:398` | lazy `from app.jobs.handlers.bridge_helpers import generate_via_bridge` | SDK → app back-reference (boundary inversion; SDK is slated for repo extraction, task 010). |
| `studio_plugin_sdk/context.py:682` | lazy `from app.jobs.worker_voice import handle_voice_job` | Same inversion. |
| `tts_engines/tts_xtts/plugin/studio/bake.py:39`, `standard_handler.py:32`, `segments.py:37` | lazy `generate_via_bridge` imports | Plugin → host contract references. |
| `tts_engines/tts_voxtral/plugin/studio/segments.py:30`, `handler.py:52`, `bake.py:30` | same | |
| `tts_engines/tts_mixed/handler.py:98` (`generate_via_bridge`), `:118` (`from app.jobs.worker_metrics import record_engine_sample`) | | tts_mixed is the only importer of `worker_metrics` outside `app/jobs` and tests. |
| `conftest.py:366` | `from app.jobs.registry import get_handler_registry` | Test-harness runtime (registry reset between tests) — behaves like runtime wiring, not a patch string. |

Notes: `worker_helpers.py` has **no external importers** — only `worker_voice.py:12` and `worker_metrics.py:6` inside the package. Plugin manifests (`worker_logic`/`job_handler` specs, e.g. `tts_engines/tts_mixed/manifest.json:27`) are plugin-relative (`"handler:handle_mixed_job"`) and do **not** encode `app.jobs` — manifests are unaffected by the move. `registry.py:7` imports `app.studio_plugin_sdk._import_utils` (inbound dep, moves with the package).

### B. Test monkeypatch strings / direct test imports (34 test files)

- **Patch-string targets** (`patch("app.jobs...")`): the dominant class. `app.jobs.registry.JobHandlerRegistry.get_handler` / `get_handler_registry` patched across `tests/orchestration/` (test_xtts_timing.py:105,166,220,266,335,387,431; test_multi_segment_marker_emission.py:480,562; test_synthesis_task_and_resources.py:184; test_progress_contract_v140.py:319,1465; test_live_segment_concurrency.py:223,302; test_load_aware_eta.py:111; test_segment_id_marker_fallback.py:99,144; test_watchdog_progress_logic.py:171,294,335,366,497; test_ephemeral_child_no_durable_job.py:199,544; test_submit.py:187; test_chapter_fanout_dispatch_eta.py:211; test_cap1_old_vs_new_path_equivalence.py:174; test_progress_logic.py:1217,1270,1328,1405; test_b8_marker_stream_characterization.py:174; test_cancel_no_segment_resurrection.py:96; test_recover.py:162; test_model_load_started_marker.py:172,232,290,337,480,599; test_inter_group_gap_eta.py:94,131; test_dispatch_isolation.py:183,254,326,403,446; test_grouped_progress_size_weighted.py:192; test_voices_orchestration_integration.py:56,312,348,349) plus `tests/api/test_api_voices_versions.py:46`, `tests/engines/test_studio_plugin_sdk.py:544`, `tests/bridge/test_bridge_helpers.py:10,37,56,75,95`, `tests/orchestration/test_assembly_orchestration_integration.py:51`, `tests/db/test_performance_metrics_storage.py:585`.
- **Direct test imports**: `tests/orchestration/test_registry_dispatch.py:5`, `test_voices_orchestration_integration.py:286,330` (`worker_voice`), `test_audiobook_handler_filename.py:15`, `tests/db/test_performance_metrics_storage.py:170-651` (`worker_metrics`, `bridge_helpers`), `tests/api/test_api_generation.py:753,823,853,878,992,1002`, `tests/bridge/test_bridge_helpers.py:4`, `tests/engines/test_plugin_layout_contracts.py:10`.

### C. Boundary-guard references (encode the *old name as forbidden* — must be re-pointed or the guard goes vacuous)

- `tests/orchestration/test_import_boundaries.py:22-29,91-102` — forbidden prefixes `app.jobs.worker`, `app.jobs.core`, `app.jobs` for orchestration modules; parses source AST.
- `tests/orchestration/test_isolation.py:22-23` — raw string asserts `"from app.jobs" not in src` / `"import app.jobs" not in src` on `orchestrator.py` source.
- `tests/domain/test_domain_contracts.py:309` — `forbidden = {"app.api.web", "app.jobs"}` for domain modules.
- `.agent/rules/modular_architecture.md:24` — the rule the tests enforce.

### D. Comments/docstrings only (grep-visible, not load-bearing)

`app/engines/bridge_utils.py:9`, `app/orchestration/scheduler/orchestrator.py:18,43`, `app/db/speakers_settings.py:46`, `app/domain/{settings,artifacts,projects,voices}/service.py` header comments, `studio_plugin_sdk/_import_utils.py:5`, `app/studio_plugin_sdk/_import_utils.py:4`, `tests/bridge/conftest.py:11`, `tests/domain/test_domain_contracts.py:31`, `tts_engines/tts_xtts/plugin/studio/{app_adapter.py:45, bake.py:33}`, `tts_engines/tts_voxtral/plugin/studio/app_adapter.py:46`. Update in the final sweep.

### E. Outside code (docs/map — same-change or follow-up obligations)

Specs naming `app/jobs`: `design-docs/specs/{code-organization, system-architecture, engines-and-plugins, queue-jobs, plugin-contract}.md` (spec-drift rule: fix in the same change, bump `spec_version`). Code-map shards + `hashes.json` reference the paths — a changelog-queue entry is part of definition-of-done. Plans/ADR mentions are historical and stay.

## 2. Ordering hazards, tied to code

1. **Silent boot failure.** `boot.py:95-100` wraps handler init in `except Exception: logger.exception(...)` — if the rename lands and boot's string import isn't updated *in the same commit*, the app boots green with an empty registry. The registry fallback chain (registry.py notes: engine match → kind match → voice_task fallback → standard rendering) then misroutes or fails every job. **Gate implication: every stage's verification must exercise dispatch, not just "imports succeed".**
2. **Import-side-effect ban.** `initialize_default_handlers()` does filesystem discovery over `PLUGINS_DIR` and dynamic module loading (`registry.py:98-145,149-188`) — it must remain callable only from `boot_studio()`. The new package's `__init__.py` must stay as empty as the current one; any convenience re-export in it that touches `registry` discovery would violate `.agent/rules/modular_architecture.md` ("importing a module must not… register listeners"). `orchestrator_helpers.py:36` imports `registry` at module import time today — legal only because importing `registry` is side-effect-free; preserve that property.
3. **Patch-target identity.** ~60 `patch("app.jobs...")` strings resolve modules by `sys.modules` name. If the move ships with an identity-preserving re-export shim (precedent: `app/studio_plugin_sdk/__init__.py`), class-method patches (`JobHandlerRegistry.get_handler`) keep working because the class object is shared — but *module-attribute* patches (`patch("app.jobs.handlers.bridge_helpers.create_voice_bridge")`, `tests/bridge/test_bridge_helpers.py:10` etc.) only intercept if the shim re-exports the **same module object** (`sys.modules["app.jobs.handlers.bridge_helpers"] = new_module`), not a copy. A naive `from new import *` shim silently un-mocks those tests — false green.
4. **Boundary guards go vacuous.** After a rename, `test_import_boundaries.py`, `test_isolation.py`, `test_domain_contracts.py:309` all pass trivially (nothing imports a name that no longer exists) while the invariant they protect — orchestration/domain must not couple to the handler package's internals — stops being enforced. They must be re-pointed to the new name in the same stage that moves the last runtime importer, and the rule text at `modular_architecture.md:24` updated with them.
5. **Cross-boundary consumers move on different clocks.** `studio_plugin_sdk/context.py` (destined for repo extraction) and all three engine plugins (self-contained mini-repos) hard-code the host path. All are lazy imports, so they fail at *call time* (mid-render), not import time — another reason gates must be behavioral. All seven plugin sites + two SDK sites must move in one stage.
6. **`JobHandlerRegistry` singleton state.** `_registry` is module-level; during any window where old and new module names both import the *implementation* separately (instead of aliasing), two singletons exist and boot registers handlers into one while the orchestrator dispatches from the other. The shim must alias modules in `sys.modules`, never duplicate-load.

## 3. Staged move plan (judgment; each stage is one commit, gate before the next)

**Stage 0 — decide the destination** (owner/plan decision, doc 006 namespace work): e.g. `app/orchestration/handlers/` (registry + handlers are orchestrator-dispatch machinery) with `worker_voice`/`worker_metrics`/`worker_helpers` folded in and the `worker_` prefix dropped. Gate: name recorded in the plan; boundary-test implications reviewed (moving *into* `app.orchestration` changes what `test_import_boundaries.py` may forbid).

**Stage 1 — move implementation, leave an identity-preserving shim at `app/jobs`.** Physically move modules; make `app/jobs/__init__.py` (and per-module stubs) install the *same module objects* under the old names via `sys.modules` aliasing (follow `app/studio_plugin_sdk` precedent). No importer changes yet. **Gate:** full `./venv/bin/python -m pytest -q` green (all 34 test files' patch strings still intercept via shared identity); plus an explicit identity check — assert `sys.modules["app.jobs.registry"] is sys.modules["<new>.registry"]` — and `tests/orchestration/test_registry_dispatch.py` + one mocked bridge test (`tests/bridge/test_bridge_helpers.py`) deliberately broken-then-fixed to prove the mock still bites (R1-style revert check against hazard 3).

**Stage 2 — rewire runtime importers to the new path**: `boot.py:97`, `orchestrator_helpers.py:36`, `studio_plugin_sdk/context.py:398,682`, the seven `tts_engines` sites, `conftest.py:366`. **Gate:** full pytest including every plugin suite (`pytest tts_engines/...`); boot smoke — start the app (`./run.sh --no-reload`) and confirm the log contains no "Job handler initialization failed" and a real render dispatches (behavioral, per hazards 1 and 5; this is a runtime-verifier job, not a test-suite-green claim).

**Stage 3 — migrate the 34 test files' patch strings and direct imports** to the new path (mechanical; safe to delegate). **Gate:** full pytest; `grep -rn "app\.jobs" tests/` returns only the boundary-guard files; re-run the Stage-1 mock-bite check against the *new* strings.

**Stage 4 — re-point the guards and the paperwork**: update `test_import_boundaries.py` / `test_isolation.py` / `test_domain_contracts.py:309` to forbid the appropriate names under the new layout (and keep forbidding `app.jobs` so nothing regresses onto the shim); update `modular_architecture.md:24`; fix all class-D comments; update the five specs (bump `spec_version` + changelog rows) and append the code-map changelog-queue entry. **Gate:** insert a deliberate violating import in a scratch diff and confirm each guard fires (guards must fail-closed, per hazard 4); ruff clean.

**Stage 5 — delete the shim** (clean-break policy: legacy names are deleted, not preserved). Precondition: `grep -rn "app\.jobs"` across `app tests tts_engines studio_plugin_sdk conftest.py` returns zero code hits. **Gate:** full pytest + boot/render smoke again (the try/except in boot would mask a straggler); final repo-wide grep.

## Confidence & what would change it

- **Importer set: high (≈95%).** Derived from an exhaustive grep of every `.py` under all code roots plus root-level entry files, cross-checked against the code-map record (whose empty `called_by` for registry.py means the map under-reports here — grep is the authority). Residual risk: string-built imports (`importlib.import_module("app.jobs...")` with a computed name) — I searched for the literal and found none, but a fully dynamic construction would evade grep. A `python -c` runtime sweep of `sys.modules` after boot would close that gap.
- **Classification: high**, except `orchestrator_helpers.py:36`, which is deliberately dual-role (runtime + patch re-export per its own `noqa` comment) — treat as runtime in staging.
- **Ordering hazards: checkable, high** — each is tied to specific code above.
- **Staging: judgment.** Would change if: (a) the owner picks a destination outside `app.orchestration` (changes Stage 4's guard rewrite), (b) the clean-break directive is read as forbidding even a *transient* shim (then Stages 1–3 collapse into one large commit and the gate burden concentrates — I recommend against; the shim is intra-branch scaffolding deleted in Stage 5, not a shipped compat surface), (c) SDK repo extraction (task 010 follow-up) lands first — then `context.py`'s two imports should become injected callables rather than repointed paths, shrinking the runtime set.

## What I could not determine here

- The intended destination name — BE-6 and doc 006 defer it; the plan above is destination-agnostic except Stage 4.
- Whether `.claude/worktrees/agent-a0b0646327352831e` (which still contains a stale pre-rename tree, including an old `plugins/` layout) is live work; I excluded it from the importer set as out-of-scope, but if that worktree is active its copies rebase onto this move.
- Non-`.py` runtime consumers: I verified plugin manifests carry no `app.jobs` strings, but did not execute the app to confirm no config/env value embeds the module path.
