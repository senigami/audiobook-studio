# BR-1 plan review — Petra (empirical / bottom-up panelist)

**Reviewed:** `design-docs/plans/active/br1_jobs_package_move/00-plan.md` (formalizes
`.agent/frontier-calibration/references/BR-1.md`).
**Verdict:** APPROVE WITH REQUIRED FIXES. Staging order and the critical hazard are sound;
several gate/enumeration texts are imprecise in ways an executor taking the doc literally
could stumble on.
**Disclosure:** I appear to have been dispatched as a single pass (no visible judge/convergence
step). This output is un-ensembled — it did not get the reliability convergence buys. If Constance
was dispatched in parallel, meet at the judge, not here.

## Ground truth loaded

- Map ritual: loaded code-map core (`map.json`) + `app/jobs` shard route. Confirmed the reference's
  own finding that `registry.py`'s `called_by` is **empty** in the map — the map under-reports here,
  so exhaustive `grep` over code roots is the authority. I re-ran that grep independently rather than
  trusting either the map or the reference.
- Verified against disk: `app/jobs/` contents, `boot.py:88-101`, `app/studio_plugin_sdk/__init__.py`
  + `_import_utils.py`, the three guard tests, and every `app.jobs` import/patch site.

## Independent verification of the importer set — CONFIRMED accurate

Exhaustive grep matches the reference's classification:

- **Runtime (must rewire):** `boot.py:97` (lazy, inside failure-swallowing try/except — verified
  `boot.py:95-100`), `orchestrator_helpers.py:36` (the **only** module-level/import-time `app.jobs`
  importer in Studio 2.0 code, dual-role re-export — verified), `conftest.py:366`,
  `studio_plugin_sdk/context.py:398,682`, and the plugin sites (below).
- **`app.jobs.worker` / `app.jobs.core` do not exist** — confirmed; they survive only as forbidden
  strings in guard tests. Reference correct.
- **No dynamic/computed imports of `app.jobs`.** `registry.py:149-188`'s `importlib.util` is
  plugin-file loading by path, unrelated to the module name. Grep for `import_module`/`__import__`
  found no `app.jobs` construction in the main checkout. Residual grep-evasion risk is therefore
  low; matches the reference's ~95% confidence.
- **Patch surface: 59 `patch("app.jobs…")` strings across 34 test files** — matches the plan's
  "~60 / 34 files" exactly.

## Findings (bottom-up, `path:line`)

### F1 — Stage 2 undercounts the plugin sites: 8, not 7 (minor)
There are **8** `app.jobs` import statements in `tts_engines/` (verified count), not 7:
xtts `bake.py:39`/`standard_handler.py:32`/`segments.py:37`, voxtral
`handler.py:52`/`bake.py:30`/`segments.py:30`, mixed `handler.py:98` (generate_via_bridge) **and**
`handler.py:118` (`from app.jobs.worker_metrics import record_engine_sample`). The plan's Stage 2
says "all 7 tts_engines sites"; the 8th is the `worker_metrics` site. BR-1's section-A table *does*
list `:118`, so the data is present — only the staged enumeration says "7". Backstopped by Stage 5's
grep, but fix the count so an executor rewiring "7 sites" doesn't leave `:118` on the shim.

### F2 — Stage 1 mock-bite gate covers only one module; `worker_voice` needs it too (moderate)
The dangerous hazard (module-attribute patches silently un-mocked by a naive shim) is real and
correctly identified. I confirmed the module-attribute patch class exists beyond `bridge_helpers`:
`patch("app.jobs.handlers.bridge_helpers.create_voice_bridge")` (`test_bridge_helpers.py:10,37,…`)
**and** `app.jobs.worker_voice.update_job` / `._mark_queue_failed` /
`._generate_voice_sample_via_bridge` (in `test_voices_orchestration_integration.py`). Each is a
**separately sys.modules-aliased module** — proving the shim bites for `bridge_helpers` does not
prove it bites for `worker_voice`. Stage 1's gate should (a) assert identity for **every** moved
submodule in a loop (`sys.modules["app.jobs.X"] is sys.modules["<new>.X"]` for X in all submodules),
not just `registry`, and (b) include a `worker_voice` module-attribute revert-check, not only the
one bridge test.

### F3 — the cited shim "precedent" is the wrong mechanism (minor but a trap)
The plan/reference cite `app/studio_plugin_sdk` as the identity-preserving precedent. But
`app/studio_plugin_sdk/__init__.py` (read) is a **symbol re-export** (`from studio_plugin_sdk import
JobResult, …`) — that style does **not** preserve `sys.modules` module-object identity and would
silently defeat exactly the module-attribute patches in F2. The actual module-identity mechanism is
`ensure_plugin_package_hierarchy` in `_import_utils.py` (sys.modules aliasing). An executor who
copies the `__init__.py` precedent literally builds the broken shim. Point Stage 1 at the
`sys.modules`-aliasing mechanism explicitly, not at the symbol-re-export `__init__`.

### F4 — Stage 5's precondition grep can never pass as written (minor, executable-gate defect)
`00-plan.md:54` gives the Stage 5 precondition as repo-wide ``grep -rn "app\.jobs"`` returns zero
code hits. There are ~30 stale worktrees under `.claude/worktrees/` each containing
`app/jobs/registry.py` etc.; a literal repo-wide grep will **never** be zero. BR-1 (line 71) scopes
its grep to `app tests tts_engines studio_plugin_sdk conftest.py` — correct. The 00-plan paraphrase
dropped the scoping. Restore the path-scoped grep in Stages 3 and 5. (This is the same reason the
plan's own open-item about the one named worktree generalizes: worktrees are outside the working
tree's import path, harmless to the move, but they poison unscoped grep gates.)

## Blast-radius assessment
Enumerated from the trace, not felt. Runtime blast radius touches the boot sequence (`boot-sequence`
flow), the synthesis dispatch path (`orchestrator_helpers` → registry), and all three plugin
render paths (`synthesis-request`, `mixed-engine-render`, `parallel-segment-fanout` all reach
`bridge_helpers.generate_via_bridge`). The failure-swallowing boot try/except (verified) means a
missed runtime rename boots **green** with an empty registry and fails every render at dispatch —
this is the single highest-severity property and the plan correctly makes every gate behavioral
(real render dispatch), not import-success. The 59 patch strings are the widest but lowest-severity
surface (fail loudly at test time). The genuinely subtle surface is F2/F3's module-identity, which
fails *silently* (false-green tests) — correctly the focus of Stage 1's R1-style gate.

## Call, confidence, falsifier
- **APPROVE WITH REQUIRED FIXES** (F1, F4 are corrections; F2, F3 are hardening the one hazard that
  fails silently). Staging order is safe and complete once these land.
- **Confidence: high (~90%)** on the importer set and hazard analysis (grep-authority + disk-verified).
  Medium on staging judgment, which is inherently a design call.
- **What would change it:** if the owner reads clean-break as forbidding even a transient shim
  (Stages 1-3 collapse; the reference and I both recommend against), or if SDK repo-extraction
  (task 010) lands first (shrinks Stage 2's `context.py` set to injected callables).
- **Not an escalation.** This is a plan review within remit, cheap to fix if wrong. The one genuine
  owner's-call the plan already correctly routes up: Stage 0 destination name + the clean-break/shim
  question.
