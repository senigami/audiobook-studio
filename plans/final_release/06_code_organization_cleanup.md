# Plan 06 — Code Organization & Dead-Code Cleanup
Phase 12 final polish. Execute items in the order shown: safe deletions first, then moves, then refactors. Each step lists exact paths, the action, and an acceptance criterion.

> **Policy — Studio 2.0 is NOT in production.** Legacy v1 code is **deleted**, not documented-and-retained. The ONLY v1 surface that survives is the v1→v2 **data migration path**: `app/db/legacy_migration.py` and the legacy import flows that call it (`app/db/migration.py`, `app/api/routers/migration.py:api_import_legacy_migration`). Every item below that previously read "remove or document why retained" is a **removal with a verification step**. Do not add `# TODO retain` comments as an escape hatch.

---

## 0. Pre-flight

- [ ] Commit or stash all uncommitted work before starting.
- [ ] Run `pytest` from repo root; confirm baseline is green.
- [ ] Run `cd frontend && npm run build`; confirm baseline is clean.

---

## 1. Root-level cruft — safe deletions and gitignore

### 1.1 SQLite database files

**Verified from `app/db/core.py`:**
- `audiobook_studio.db` — primary runtime DB (`DB_PATH`, env `DB_PATH`, default `"audiobook_studio.db"`)
- `studio.db` — secondary runtime DB (`STUDIO_DB_PATH`, env `STUDIO_DB_PATH`, default `"studio.db"`)
- `app.db` — **not referenced anywhere in source**; dev leftover
- `database.sqlite` — **not referenced anywhere in source**; dev leftover

**Steps:**

- [ ] **OWNER CONFIRMATION REQUIRED before this step** (set `OWNER_CONFIRMED=1` in your shell or have the owner tick this box). Back up the runtime DBs as well as the leftovers (both runtime DBs hold live data — `audiobook_studio.db` is ~8 MB, `studio.db` ~32 KB):
  ```
  cp audiobook_studio.db audiobook_studio.db.bak
  cp studio.db studio.db.bak
  cp app.db app.db.bak
  cp database.sqlite database.sqlite.bak
  ```
  Then delete the two **0-byte, unreferenced** leftovers only (`app.db` and `database.sqlite` are both 0 bytes and appear nowhere in `app/db/core.py`):
  ```
  rm app.db database.sqlite
  ```
  Do **not** delete `audiobook_studio.db` or `studio.db` — they are the live runtime DBs.
- [ ] `.gitignore` review — `audiobook_studio.db`, `audiobook_studio.db-journal`, `studio.db`, `studio.db-journal` are **already ignored** (verified against the current `.gitignore`). Only add patterns for the backup files, which are NOT yet covered:
  ```
  # SQLite backups produced by cleanup steps
  *.db.bak
  *.sqlite.bak
  ```
- **Acceptance:** `app.db` and `database.sqlite` no longer exist on disk; `git status` shows no `*.db.bak` files; `git check-ignore audiobook_studio.db studio.db` lists both as ignored.

### 1.2 `audiobook.py`

- [ ] File: `audiobook.py` (root). Self-described dead standalone reference script (verified present).
- [ ] Action: `git rm audiobook.py`
- **Acceptance:** `grep -r "from audiobook import\|import audiobook" . --include="*.py"` returns nothing.

### 1.3 `audit_routes.py`

- [ ] File: `audit_routes.py` (root).
- [ ] Determine intent: open the file and check whether it is a one-off script or useful utility.
  - If purely a dev script: `git rm audit_routes.py`
  - If useful to keep: `git mv audit_routes.py scripts/audit_routes.py`
- **Acceptance:** File no longer lives at repo root.

### 1.4 `text_progress_demo.html`

- [ ] File: `text_progress_demo.html` (root).
- [ ] Action: `git mv text_progress_demo.html docs/text_progress_demo.html`
  - Alternative: `git rm text_progress_demo.html` if the demo is superseded by the DevProgressBar page.
- **Acceptance:** File no longer lives at repo root; `docs/` path is acceptable to owner.

### 1.5 `state.json` (runtime artifact)

- [ ] File: `state.json` (root). **`state.json` is already in `.gitignore`** (verified) — no gitignore edit needed.
- [ ] If the file is still tracked despite the ignore rule: `git rm --cached state.json`. (`git ls-files state.json` shows whether it is tracked.)
- **Acceptance:** `git check-ignore state.json` returns `state.json`; `git ls-files state.json` returns nothing.

### 1.6 `scratch/`, `debug/`, `demo/`

- [ ] Files verified:
  - `scratch/audit_scenarios.py`, `scratch/repro_503.py`
  - `debug/debug_queue.txt`, `debug/debug_segment.txt`, `debug/debug_socket.txt`
  - `demo/demo.zip`
- [ ] **OWNER CONFIRMATION REQUIRED for `scratch/` scripts** (they may be reference material). Set `OWNER_CONFIRMED=1` or have the owner tick this box.
  - If confirmed expendable: `git rm -r scratch/ debug/ demo/` (use `git rm -r --cached` for any dir not currently tracked).
  - Otherwise move scratch scripts: `git mv scratch/ docs/scratch/`
- [ ] `.gitignore` review — `/scratch`, `/debug`, and `/transient/` are **already ignored** (verified). `demo/` is **NOT** ignored; add it:
  ```
  /demo
  ```
- **Acceptance:** `scratch/`, `debug/`, `demo/` absent from `git ls-files`; `git check-ignore demo` returns `demo`.

### 1.7 Root `__pycache__`

- [ ] Add to `.gitignore` (should already be present, verify):
  ```
  __pycache__/
  ```
- [ ] If tracked: `git rm -r --cached __pycache__`
- **Acceptance:** `git status` shows no `__pycache__` entries.

---

## 2. `transient/` consolidation

**Verified:** Two locations exist:
- `transient/render_trace.jsonl`, `transient/tts_server_runtime.json` (root)
- `app/transient/tts_server_runtime.json`

- [ ] Determine canonical write location: grep for `transient/` in Python source to find who writes each file.
  ```
  grep -rn "transient" app/ --include="*.py" | grep -v __pycache__
  ```
- [ ] Consolidate to one location (likely `transient/` at root, or `app/transient/`); update all write paths in source.
- [ ] `.gitignore` review — `/transient/` and `/app/transient/` are **already ignored** (verified). No gitignore edit needed; if either dir is tracked, `git rm -r --cached` it.
- **Acceptance:** Only one `transient/` path; runtime writes go there; no orphan directory; `git check-ignore transient app/transient` lists both.

---

## 3. Backend — placeholder packages and dead imports

### 3.1 `app/infra/subprocess` — implement or re-point

**Verified (corrected):** `app/infra/subprocess/__init__.py` is **not empty** — it is a 57-line module that already defines `run_managed_subprocess` and `run_managed_subprocess_async`, both of which `raise NotImplementedError`, plus a boundary allowlist (`INTENDED_UPSTREAM_CALLERS`, `FORBIDDEN_DIRECT_IMPORTS`). So this is an unimplemented stub with a real signature, not a missing module. It is referenced by:
- `plugins/tts_xtts/plugin/studio/app_adapter.py` line 22: `from app.infra.subprocess import run_managed_subprocess_async` — but the symbol is only used in dead `_ = run_managed_subprocess_async` keep-alive lines (lines 220, 417); it is never actually invoked.
- `plugins/tts_xtts/plugin/studio/app_adapter.py` line 36 (mock patch target string): `"app.infra.subprocess.run_managed_subprocess"`
- `plugins/tts_voxtral/plugin/studio/app_adapter.py` line 28 (mock patch target string): `"app.infra.subprocess.run_managed_subprocess"`

**Action:**

- [ ] First confirm whether anything actually *calls* these functions (not just imports/patches them): `grep -rn "run_managed_subprocess" plugins/ app/ --include="*.py" | grep -v __pycache__`. As verified above, the only real usages are the dead `_ =` keep-alive references and mock-patch target strings — there is no live caller.
- [ ] Because the stub has no live caller, treat this as a boundary placeholder: either (a) **implement** `run_managed_subprocess`/`run_managed_subprocess_async` with real managed-lifecycle wrappers and route the plugin adapters' actual subprocess launches through them, or (b) **delete the package and the dead `_ = run_managed_subprocess_async` lines plus the mock-patch target strings** if the adapters already manage their own subprocesses. Pick (a) only if doc 02 commits to this boundary; otherwise (b). Do **not** leave it as a permanent `NotImplementedError` stub.
- [ ] After the change: `pytest` from repo root — confirm no import errors from the plugin adapters and the mock patches still resolve (if kept).
- **Acceptance:** Either `python -c "from app.infra.subprocess import run_managed_subprocess_async, run_managed_subprocess"` exits 0 AND a real call path exercises them; or the package is gone and `grep -rn "app.infra.subprocess" plugins/ app/ --include="*.py"` returns nothing.

### 3.2 `app/orchestration/` — not empty (do not delete)

**Verified:** `app/orchestration/` has real subpackages (`progress/`, `tasks/`, `scheduler/`). No action needed — initial report was incorrect for this package.

- [ ] No action. Mark confirmed.

### 3.3 `app/infra/` other subpackages

**Verified:** `app/infra/` contains `cache/`, `db/`, `events/`, `subprocess/`. The command below returns **nothing** today (every subpackage is `__init__.py`-only):
```
find app/infra -name "*.py" ! -name "__init__.py" | grep -v __pycache__
```
- `app/infra/cache/__init__.py` — stub exporting `build_cache_key` that raises `NotImplementedError`.
- `app/infra/events/__init__.py` — stub exporting `publish_internal_event` that raises `NotImplementedError`.
- `app/infra/db/__init__.py` — empty placeholder.
- `app/infra/subprocess/__init__.py` — handled in 3.1 above.

Per the policy banner, these are NOT legacy-migration code and must not be kept as documented placeholders.

- [ ] For each subpackage (`cache/`, `db/`, `events/`): grep for live callers first: `grep -rn "app.infra.cache\|app.infra.events\|app.infra.db\|build_cache_key\|publish_internal_event" app/ plugins/ --include="*.py" | grep -v __pycache__`.
- [ ] If a subpackage has zero live callers: `git rm -r app/infra/<subpackage>/`. If it has callers, implement it (do not retain as a raising stub).
- **Acceptance:** `find app/infra -name "*.py" ! -name "__init__.py"` is non-empty only for packages with real implementations; no `__init__.py`-only package with a `raise NotImplementedError` body remains, and `grep -rn "NotImplementedError" app/infra/` returns nothing.

### 3.4 Duplicate `_ensure_plugin_package_hierarchy`

**Note:** This item is tracked in sibling doc `plans/02_*` (SDK migration). Do not re-plan here — reference only.

- [ ] Defer to the SDK migration plan (doc 02). When that plan runs, ensure `app/tts_server/plugin_loader.py` and `app/jobs/registry.py` both pull from the shared utility extracted there.

### 3.5 Legacy in-process engine registry path in `app/engines/registry.py`

**Policy: DELETE (not document).** This is the legacy in-process engine-loading path and is explicitly scoped for removal — it is NOT part of the surviving v1→v2 data-migration path.

**Verified:** `app/engines/registry.py`:
- Line 43–44: `registry = _load_builtin_engines()` then `registry.update(_load_plugin_engines())`.
- Lines 263–265: header comment "Legacy in-process registry path (retained only for quarantined test/dev use)".
- Line 267–279: `_load_builtin_engines()` — actually functional; iterates `_plugin_adapter_specs()` and builds an `EngineRegistrationModel` per manifest. (The earlier draft's claim that this was a no-op was wrong; it is `_load_plugin_engines` at 282–284 that is the `return {}` no-op.)
- Line 282–284: `_load_plugin_engines()` — always returns `{}`.

**Action:**

- [ ] Map every live consumer of the in-process registry before deleting: `grep -rn "_load_builtin_engines\|_load_plugin_engines\|from app.engines.registry\|engines.registry import" app/ plugins/ tests/ --include="*.py" | grep -v __pycache__`. Capture the list of callers of whatever public function wraps lines 43–44.
- [ ] **Owner-confirmation flag required** (`OWNER_CONFIRMED=1` or owner ticks this box), since this removes an engine-discovery code path. Confirm the production path is the out-of-process plugin/manifest loader (`app/tts_server/plugin_loader.py`) and that nothing production-critical depends on the in-process path.
- [ ] Delete `_load_builtin_engines`, `_load_plugin_engines`, the legacy header comment block (lines ~263–265), and the lines 43–44 that call them. Remove now-orphaned helpers (`_plugin_adapter_specs`, `_load_engine_manifest`) only if they have no remaining callers after this deletion — re-grep to confirm.
- [ ] If any test depended on the in-process path purely for fixturing, port it to the supported loader or delete the test.
- **Acceptance (verification step):** `grep -rn "_load_builtin_engines\|_load_plugin_engines" app/ tests/ --include="*.py"` returns nothing; `pytest` from repo root is green; the app still discovers engines via the supported out-of-process loader.

### 3.6 `mixed.py` → `composite.py` rename

**Verified (corrected):** No file named `mixed.py` exists anywhere in the repo (`find . -name "mixed.py"` outside `venv/` returns nothing) and no `composite.py` exists in app code either. The rename target referenced by `plans/master_agnostic_tasks.md` and doc 01 §P-3 therefore points at a file that is **already absent** — either the rename was already performed, or the original target path was wrong. References to "mixed" remain in `app/engines/behavior.py`, `app/db/queue.py`, `app/db/models.py`, and the `plugins/synthesis_mixed/` plugin, but those are mixed-*generation* identifiers, not a `mixed.py` module.

- [ ] Resolve the contradiction with doc 01 §P-3 before doing anything: run `find . -path ./venv -prune -o -name "mixed.py" -print` and `find . -path ./venv -prune -o -name "composite.py" -print`.
- [ ] **If `mixed.py` truly does not exist** (current finding): mark the rename **already satisfied / N/A** in `plans/master_agnostic_tasks.md` line 48 and `plans/phases/phase_12_polish_and_cleanup.md` line 63 with a note "no `mixed.py` module found 2026-06-10 — item closed as not-applicable", and tell doc 01 §P-3 to do the same rather than performing a rename of a nonexistent file. **Needs human judgment** to confirm this isn't a misnamed reference to `plugins/synthesis_mixed/`.
- [ ] **If a `mixed.py` is found** at some path, then schedule the rename per doc 01 §P-3 option A/B (do not duplicate the decision here).
- [ ] No code rename is executed in this step from this doc.

---

## 4. Frontend dead code

### 4.1 Delete stub API files

**Verified:**
- `frontend/src/api/client.ts` — throws `'Studio 2.0 API client is not implemented yet.'`
- `frontend/src/api/queries/index.ts` — throws `'Studio 2.0 query helpers are not implemented yet.'`
- Real client: `frontend/src/api/index.ts`

- [ ] Check for any imports of these files:
  ```
  grep -rn "from.*api/client\|from.*api/queries" frontend/src --include="*.ts" --include="*.tsx"
  ```
- [ ] If no live imports: `git rm frontend/src/api/client.ts frontend/src/api/queries/index.ts`
  - If `frontend/src/api/queries/` directory becomes empty, remove it too.
- **Acceptance:** `npm run build` passes; grep for the deleted files returns nothing.

### 4.2 Delete shared placeholder stubs

**Verified:** The following files each contain only a stub export:
- `frontend/src/shared/components/index.ts`
- `frontend/src/shared/hooks/index.ts`
- `frontend/src/shared/lib/index.ts`
- `frontend/src/shared/types/index.ts`

- [ ] Check for imports of each:
  ```
  grep -rn "from.*shared/components\|from.*shared/hooks\|from.*shared/lib\|from.*shared/types" frontend/src --include="*.ts" --include="*.tsx"
  ```
- [ ] For each with no live imports: `git rm` the file.
- [ ] If the parent directories become empty, remove them too.
- **Acceptance:** `npm run build` passes.

### 4.3 `VoicesModals.tsx` — collapse pass-through

**Verified:** `frontend/src/components/VoicesModals.tsx` imports from `@/pages/Voices/components` and re-exports. It is not a standalone implementation.

- [ ] Find all import sites of `VoicesModals` (from the components path):
  ```
  grep -rn "VoicesModals" frontend/src --include="*.tsx" --include="*.ts"
  ```
- [ ] Update each import site to point directly to `@/pages/Voices/components/VoiceModals` (or the canonical export from that module).
- [ ] `git rm frontend/src/components/VoicesModals.tsx`
- **Acceptance:** `npm run build` passes; no import references the deleted file.

### 4.4 Move misfiled feature panels

**Verified present at `frontend/src/components/`:**
- `CharactersTab.tsx` — belongs with ChapterEditor or Characters page
- `ProjectBackupsPanel.tsx` — belongs with a project-level page

- [ ] Determine owning page for each:
  ```
  grep -rn "CharactersTab\|ProjectBackupsPanel" frontend/src --include="*.tsx" | grep import
  ```
- [ ] `git mv frontend/src/components/CharactersTab.tsx frontend/src/pages/<OwningPage>/components/CharactersTab.tsx`
- [ ] `git mv frontend/src/components/ProjectBackupsPanel.tsx frontend/src/pages/<OwningPage>/components/ProjectBackupsPanel.tsx`
- [ ] Update all import paths.
- **Acceptance:** `npm run build` passes; `frontend/src/components/` no longer contains feature-specific panels.

### 4.5 Gate dev-only routes

**Verified:** `frontend/src/app/App.tsx` lines 299–300 register:
- `/progress-test` → `ProgressBarTestPage`
- `/event-stream` → `LiveOutputPage`

These are dev tools, not production features.

- [ ] Add a compile-time guard using `import.meta.env.DEV`:
  ```tsx
  {import.meta.env.DEV && (
    <>
      <Route path="/progress-test" element={<ProgressBarTestPage />} />
      <Route path="/event-stream" element={<LiveOutputPage />} />
    </>
  )}
  ```
- [ ] Lazy-import the two page components so they tree-shake from prod bundles:
  ```tsx
  const ProgressBarTestPage = lazy(() => import('@/pages/DevProgressBar/DevProgressBarPage').then(m => ({ default: m.ProgressBarTestPage })));
  const LiveOutputPage = lazy(() => import('@/pages/LiveOutput/LiveOutputPage').then(m => ({ default: m.LiveOutputPage })));
  ```
- **Acceptance:** `npm run build` prod bundle does not include `DevProgressBarPage` or `LiveOutputPage` chunks (verify with `npx vite-bundle-visualizer` or `grep -r "progress-test" dist/`).

### 4.6 Split `App.tsx` (schedule — do not execute in this pass)

**Verified:** `frontend/src/app/App.tsx` is 442 lines combining routes, drawer, toasts, modal, loading, and overlay logic.

- [ ] This is a scheduling item only. Create a follow-up task:
  - Extract `QueueDrawerHost` (wraps the queue slide-over drawer state)
  - Extract `NotificationsHost` (wraps toast/notification state)
  - Extract `StartupGate` (wraps the loading/overlay shown on first mount)
  - Leave routing in `App.tsx`
- [ ] File the task in `plans/master_agnostic_tasks.md` under a Phase 13 heading.
- **Acceptance:** Task is filed; no code changed in this step.

### 4.7 `runtimeDebug.ts` — split/schedule

- [ ] This is a scheduling item. `frontend/src/utils/runtimeDebug.ts` (~400 lines). Plans call for retiring the legacy timeline portion.
- [ ] File in `plans/master_agnostic_tasks.md`: split into `timelineDebug.ts` (to be retired) and `runtimeMetrics.ts` (to be retained).
- **Acceptance:** Task is filed.

### 4.8 Normalize API error handling in `frontend/src/api/index.ts`

**Verified:** Lines 17–121 mix `parseApiResponse` (which checks `!res.ok`) with raw `res.json()` calls that do not check status.

- [ ] Audit every method in `frontend/src/api/index.ts` that calls `res.json()` without a `!res.ok` guard.
- [ ] Replace each raw `res.json()` call with `parseApiResponse(res)`.
- [ ] Re-run `npm test` (or the frontend test suite).
- **Acceptance:** `grep "return res.json()" frontend/src/api/index.ts` returns zero results; all API methods use `parseApiResponse`.

### 4.9 Unify input styles

**Verified:** Three CSS classes define input styling:
- `.input-group input` / `.input-group textarea` — `frontend/src/theme/components.css` lines 216–234
- `.input-field` — `frontend/src/theme/components.css` lines 235–246
- `.form-input` — `frontend/src/theme/components.css` lines 384–396
- Component: `frontend/src/components/forms/GlassInput.tsx`

- [ ] **Owner decision:** choose one canonical class name (recommended: `.form-input`) and one canonical component (`GlassInput`).
- [ ] Migrate all uses of `.input-group input`, `.input-field` to `.form-input` or `<GlassInput>`.
- [ ] Remove the superseded CSS rules.
- **Acceptance:** `grep -rn "input-group\|input-field" frontend/src --include="*.tsx" --include="*.css"` returns only definition sites, not usage sites.

---

## 5. Order of execution summary

| Step | Type | Risk | Pre-req |
|------|------|------|---------|
| 1.1–1.7 | Deletions / gitignore | Low–Medium | Owner confirms 1.1, 1.6 |
| 2 | Consolidation | Medium | Source grep first |
| 3.1 | Implementation | Medium | Understand current subprocess usage |
| 3.5 | Deletion (legacy engine path) | Medium | Owner confirms; map callers first |
| 4.1–4.2 | Delete stubs | Low | Import grep |
| 4.3–4.4 | Move/collapse | Low | Import grep |
| 4.5 | Gate dev routes | Low | — |
| 4.8 | Normalize API | Medium | Manual audit |
| 4.9 | Unify inputs | Medium | Owner CSS decision |
| 3.4, 4.6, 4.7 | Schedule only | None | — |

---

## 6. Final verification

- [ ] `pytest` from repo root — green.
- [ ] `cd frontend && npm run build` — zero errors, zero TypeScript errors.
- [ ] `git status` — no unintended tracked files remain; runtime artifacts are gitignored.
- [ ] `grep -rn "not implemented" frontend/src/api/ --include="*.ts"` — returns nothing.
- [ ] `grep -rn "_load_builtin_engines\|_load_plugin_engines" app/ tests/ --include="*.py"` — returns nothing (legacy in-process engine path removed).
- [ ] `grep -rn "NotImplementedError" app/infra/ --include="*.py"` — returns nothing (no raising stubs retained).
- [ ] Legacy v1→v2 migration path is intact: `app/db/legacy_migration.py` still exists and `python -c "import app.db.legacy_migration"` exits 0.
