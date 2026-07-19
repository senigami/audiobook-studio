# BR-1 plan review — Constance (structural / top-down panelist)

**Reviewed:** `design-docs/plans/active/br1_jobs_package_move/00-plan.md` (against its source
`.agent/frontier-calibration/references/BR-1.md`)
**Date:** 2026-07-18
**Verdict:** **APPROVE with refinements.** The staging is safe and the importer set is complete and
independently confirmed. Three non-blocking refinements below — one (F1) will cause a false-green
Stage-1 gate if the shim is built literally from the cited precedent, so fix it before executing
Stage 1.

**Ensemble disclosure:** This is a **lone Constance pass** — no Petra pass and no fusion-reasoning
judge accompanied this dispatch. It did not receive the reliability that convergence buys; treat it
as one grounded opinion, not an ensembled verdict.

**Framing:** structural/top-down. I read the plan against the code-map's recorded invariants
(`no-import-side-effects`, `orchestrator-forbidden-imports`, `single-owner-boundaries`) and the boot
flow, then re-derived the importer set from grep rather than the map (whose `called_by` for
`app/jobs/registry.py` is empty — the map under-reports here, as the reference itself flags).

---

## Ground truth loaded / independently verified

The reference is a Fable blast-radius doc; my job was to independently confirm, not restate it.
Every load-bearing claim checks out:

- **Runtime importer set (Class A) — EXACT match.** My `grep -rnE "from app\.jobs|import app\.jobs"`
  over `app tts_engines studio_plugin_sdk conftest.py` (tests excluded) returns exactly the 12 sites
  the reference lists: `boot.py:97`, `orchestrator_helpers.py:36`, `context.py:398` + `:682`, the 7
  plugin sites (xtts bake:39/segments:37/standard_handler:32, voxtral bake:30/segments:30/handler:52,
  mixed handler:98), `mixed handler:118` (`worker_metrics`), `conftest.py:366`. Nothing more, nothing
  fewer. The "9 cross-repo lazy sites (2 SDK, 7 plugin)" count is right.
- **Boot try/except swallows failure — confirmed.** `boot.py:95-99`: `try: from app.jobs.registry
  import initialize_default_handlers … except Exception: logger.exception(...)`. A missed rename here
  boots green with an empty registry. Hazard 1 is real and precisely located.
- **`orchestrator_helpers.py:36` dual-role — confirmed**, `# noqa: F401 (re-export for patch
  targets)` present verbatim. The one module-level (non-lazy) `app.jobs` import in Studio 2.0 code.
- **`app.jobs.worker` / `app.jobs.core` are ghosts — confirmed.** Neither file exists; they appear
  only as forbidden strings in the boundary tests. The guards already forbid non-existent modules.
- **34 test files reference `app.jobs` — confirmed** (`grep -rlE "app\.jobs" tests/ | wc -l` = 34).
- **Boundary guards — confirmed** at `test_import_boundaries.py:22-29,91-102`,
  `test_isolation.py:22-23`, `test_domain_contracts.py:309` (`forbidden = {"app.api.web",
  "app.jobs"}`), rule text at `modular_architecture.md:24`.
- **`worker_helpers.py` has no external importers — confirmed** (shard: `called_by` =
  `app/jobs/worker_metrics.py` only; `worker_voice.py` imports it too — both intra-package).

Confidence in the importer set: **high (~95%)**, same residual as the reference — a fully dynamic
`importlib.import_module` with a computed name would evade grep; I found no literal, but did not do a
post-boot `sys.modules` sweep to close it fully.

---

## Findings (all non-blocking; F1 is the one to action before Stage 1)

### F1 — The cited shim "precedent" contradicts Hazard 3's own requirement (fix before Stage 1)

Hazard 3 correctly states that module-attribute patches
(`patch("app.jobs.handlers.bridge_helpers.create_voice_bridge")`, etc.) only keep biting if the shim
installs the **same module object** in `sys.modules` under the old submodule name — and that a naive
`from new import *` shim silently un-mocks them (false green). That text is right.

But both the plan (Stage 1) and the reference (Hazard 3) cite **`app/studio_plugin_sdk/__init__.py`**
as the precedent for this technique — and it is **not** that technique. I checked:
`app/studio_plugin_sdk/__init__.py` does **no `sys.modules` manipulation at all**; it is a plain
`from studio_plugin_sdk import (names…)` re-export — precisely the "naive re-export" shape Hazard 3
warns against. The actual `sys.modules` object-aliasing technique the hazard requires lives in
`studio_plugin_sdk/_import_utils.py:36-50` (`ensure_plugin_package_hierarchy` — synthetic
`types.ModuleType` entries assigned into `sys.modules`).

**Why it's load-bearing:** an executor who copies the *cited* precedent verbatim builds exactly the
shim that produces a green Stage-1 suite while silently un-mocking these module-attribute patch sites
(counts from my grep of `tests/`):
- `app.jobs.handlers.bridge_helpers.create_voice_bridge` — 5
- `app.jobs.handlers.bridge_helpers.generate_via_bridge` — 1
- `app.jobs.worker_voice.{update_job,_mark_queue_failed,_generate_voice_sample_via_bridge}` — 3
- `app.jobs.handlers.audiobook.assemble_audiobook` — 1
- `app.jobs.registry.get_handler_registry` — 3 (module-function patch; class-method
  `JobHandlerRegistry.get_handler` patches survive via the shared class object regardless)

That's ~13 patch sites across 4 distinct submodules that go false-green under a name-re-export shim.
**Fix:** repoint the precedent citation to `_import_utils.py`'s `sys.modules`-aliasing pattern, and
make Stage 1 explicitly assign each old submodule name (`app.jobs.registry`,
`app.jobs.handlers.bridge_helpers`, `app.jobs.handlers.audiobook`, `app.jobs.worker_voice`,
`app.jobs.worker_metrics`, `app.jobs.worker_helpers`) to the moved module object in `sys.modules`.

### F2 — Stage 1's mock-bite gate under-covers the patched submodules

Stage 1's gate deliberately breaks-then-fixes **one** mocked bridge test to prove the shim doesn't
un-mock (good R1 instinct). But module-attribute patches span **4** submodules (F1 list); proving
`bridge_helpers` is aliased proves nothing about `worker_voice` or `handlers.audiobook`. **Fix:**
the mock-bite check must touch at least one patch site per aliased submodule — one bridge_helpers,
one worker_voice, one audiobook, plus the `get_handler_registry` module-function patch. Cheap, and it
turns the gate from indicative into exhaustive over the false-green surface.

### F3 — The recommended destination weakens the boundary invariant the guards protect (Stage 0)

The reference's recommended destination is `app/orchestration/handlers/`. Structurally this is the
honest home (the registry *is* orchestrator-dispatch machinery). But note the second-order effect the
plan flags only obliquely: `test_import_boundaries.py` and `test_isolation.py` exist to enforce that
**orchestration must not couple to the legacy handler package's internals**. Move the handler package
*into* `app.orchestration` and that coupling becomes **intra-package** — no longer expressible as a
cross-package import ban, and invisible to a prefix-based guard. The invariant doesn't disappear; it
loses its enforcement mechanism. This is a genuine architecture trade, not a mechanical detail, and
it belongs in the Stage 0 decision explicitly: either (a) accept that the boundary becomes a
convention rather than a test, or (b) pick a destination *outside* `app.orchestration` (e.g.
`app/handlers/`) that keeps the guard meaningful. The plan's Stage 0 gate mentions "boundary-test
implications reviewed" — make this the specific question it answers.

### F4 — Double-masking of a missed runtime importer (already mitigated; note only)

Between Stage 1 (shim installed) and Stage 5 (shim deleted), a runtime importer missed in Stage 2 is
masked twice: once by the shim, once by boot's try/except. A pure test-suite-green claim cannot detect
it. The plan already handles this correctly — Stage 2's gate is a **behavioral** boot+render smoke
(a runtime-verifier job, not a green suite), and Stage 5 re-runs boot/render + final grep. No change
needed; I confirm the mitigation is real and the "this is a runtime-verifier job" framing is the
right call. Route Stage 2 and Stage 5 smokes to Plumb.

---

## Blast-radius assessment (structural)

Enumerated, not felt. The move touches: **1 boot-flow entry** (`boot-sequence` flow, step 2), the
**dispatch leg** of `synthesis-request` / `mixed-engine-render` / `parallel-segment-fanout` flows
(all route through `orchestrator_helpers` → `registry` → handlers, and through
`bridge_helpers.generate_via_bridge`), **2 SDK back-references**, **7 plugin call sites across 3
mini-repos** (which move on their own clocks and fail at call time, mid-render), **~13 module-attribute
patch sites + ~40 class-method patch sites across 34 test files**, **3 boundary guards**, and **5
specs**. Two recorded invariants are directly in scope: `no-import-side-effects` (the new
`__init__.py` must stay as empty as the current one — no discovery-triggering re-export) and
`orchestrator-forbidden-imports` (whose text names `app.jobs.worker`/`core` explicitly and must be
rewritten for the new layout). This is correctly characterized as the widest blast radius in the
phase; it is not a small change, and the staged/gated approach is proportionate.

## The call

**Sound, safe, complete — execute after folding in F1 (and ideally F2/F3).** The five-stage
shim→rewire→migrate-tests→repoint-guards→delete ordering is the right shape: it keeps the suite
honest through the runtime move via shared module identity, then retires the scaffold under a
clean-break deletion with a behavioral final gate. The plan faithfully mirrors a well-grounded
reference, and my independent grep confirms the importer set is exact. My only real catch is F1: the
plan's own Hazard-3 requirement and its cited precedent disagree, and the precedent is the wrong one
— left unfixed, Stage 1 gates green while silently un-mocking ~13 patch sites.

**Confidence: high** on the importer set and hazard analysis (independently grep-verified);
**medium-high** on staging (judgment; would shift on the Stage 0 destination choice per F3).
**Falsifier:** a post-boot `sys.modules` sweep finding an `app.jobs` submodule reached by a
computed/dynamic import string that grep can't see would expand the runtime set; I found no such
literal but did not execute the app to rule it out.

**Not escalation-triggering on its own** — but the Stage 0 destination decision (F3) is a real
architecture call the owner/BE-6 owns, and the clean-break-vs-transient-shim question (plan's open
item 3) is a directive interpretation only the owner should settle. Stage those two as decisions, not
executor choices.
