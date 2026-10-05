# Plan — rename/relocate the `app/jobs` package (BE-6)

**Status:** DRAFT — awaiting plan review. No code changes made producing this plan.
**Feeds from:** a blast-radius reference (BR-1, 2026-07-18) — that reference already contains a
complete staged move plan; this document formalizes it as an executable task breakdown. See BR-1
for the full importer classification (A/B/C/D/E) and per-hazard code citations; not fully repeated
here.

## Problem

`app/jobs` is a legacy-named package (97 refs/~40 files) that BE-6 has deferred as "the widest blast
radius in this phase." It must be renamed/relocated without breaking: boot (`boot.py:97`, wrapped in
a failure-swallowing try/except — a missed rename boots green with an empty handler registry), ~60
test monkeypatch strings (module-identity-dependent), 3 boundary-guard tests (which go vacuous, not
failing, if not re-pointed), and 9 cross-repo lazy-import call sites (2 SDK, 7 plugin).

## Ordering hazards (full detail in BR-1.md — summary)

1. Boot's exception-swallowing masks a broken rename as a silent empty-handler-registry boot.
2. The new package's `__init__.py` must stay side-effect-free (matches current).
3. **Patch-target identity**: module-attribute patches only intercept if a shim aliases the SAME
   module object in `sys.modules`, not a copy — a naive `from new import *` shim silently un-mocks
   tests (false green).
4. Boundary guards (`test_import_boundaries.py`, `test_isolation.py`,
   `test_domain_contracts.py:309`) pass trivially post-rename while enforcing nothing, unless
   re-pointed in the same stage.
5. 9 cross-repo lazy-import sites fail at call time (mid-render), not import time — gates must be
   behavioral, not just "imports succeed."
6. A shim must alias modules, never duplicate-load the `JobHandlerRegistry` singleton.

## Tasks (mirrors BR-1.md's staged plan — one commit per stage, gate before the next)

1. **Stage 0 — decide the destination** (owner/plan decision — BE-6/doc 006). Recommendation from
   the reference: `app/orchestration/handlers/`, dropping the `worker_` prefix. **Blocking — nothing
   else proceeds without this.**
2. **Stage 1 — move + identity-preserving shim.** Physically move modules; `app/jobs/__init__.py`
   installs the SAME module objects under old names via `sys.modules` aliasing. **CORRECTED
   PRECEDENT (independent review caught this — the original citation was wrong):**
   do NOT model this on `app/studio_plugin_sdk/__init__.py` — that file is a plain symbol
   re-export and does NOT preserve module-object identity; copied literally it builds exactly the
   naive shim Hazard 3 warns about. The correct mechanism is `_import_utils.py:36-50`'s
   `ensure_plugin_package_hierarchy` pattern (actual `sys.modules[...] = <same object>` aliasing).
   No importer changes yet. Gate: full pytest green; explicit identity check across EVERY moved
   submodule, not just `registry` (`sys.modules["app.jobs.registry"] is sys.modules["<new>.registry"]`,
   and the same for `worker_voice`, `worker_metrics`, `handlers.bridge_helpers`, `handlers.audiobook`
   — a single-submodule check under-covers); at least one mocked test per moved
   submodule deliberately broken-then-fixed to prove the shim doesn't silently un-mock it (R1-style),
   not just one bridge test.
3. **Stage 2 — rewire runtime importers**: `boot.py:97`, `orchestrator_helpers.py:36`,
   `studio_plugin_sdk/context.py:398,682`, all 7 `tts_engines` sites, `conftest.py:366`. Gate: full
   pytest incl. every plugin suite; a real boot smoke test (`./run.sh --no-reload`, confirm no "Job
   handler initialization failed" in logs, one real render dispatches) — this is a
   `abfc-moody` (Moody) job, not a green-test-suite claim.
4. **Stage 3 — migrate the ~60 test patch strings + direct imports** to the new path (mechanical).
   Gate: full pytest; `grep -rn "app\.jobs" tests/` returns only the boundary-guard files; re-run
   Stage 1's mock-bite check against the new strings.
5. **Stage 4 — re-point the guards + paperwork**: the 3 boundary tests, `modular_architecture.md:24`,
   all class-D comments, the 5 affected specs (bump `spec_version` + changelog rows each), the
   code-map changelog-queue entry. Gate: insert a deliberately-violating import in a scratch diff,
   confirm each guard fires (fail-closed check); ruff clean.
6. **Stage 5 — delete the shim** (clean-break policy). Precondition: repo-wide
   `grep -rn "app\.jobs"` returns zero code hits. Gate: full pytest + boot/render smoke again (the
   boot try/except would mask a straggler); final grep.

## Open items requiring owner/engineer input before execution

- Destination package name (Stage 0) — blocks everything.
- Whether a stale worktree with an old `plugins/` layout represents live work that would rebase
  onto this move — check before Stage 1.
- Whether the clean-break directive should be read as forbidding even a *transient* intra-branch
  shim — the reference recommends against collapsing the stages, since the shim is deleted in
  Stage 5, not a shipped compat surface.

## Out of scope

SDK repo extraction (task 010, PL-2) — if it lands first, `context.py`'s two lazy imports become
injected callables instead of repointed paths, shrinking Stage 2's runtime set; this plan doesn't
assume that ordering.
