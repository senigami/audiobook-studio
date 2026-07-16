# PR 04 — Milestone 3 / 006: Backend namespace rename + code-org

**Branch:** `studio2/backend-namespace-006`
**Target:** `studio-2.0`
**Size:** L — the `plugins/` → `tts_engines/` rename is the **widest blast radius in the whole plan**.
**Gate:** ⚠️ **Owner-gated for the rename decision** (confirm the target name `tts_engines/` is still
what's wanted, and the `mixed.py`→`composite.py` question below). Get sign-off before starting.
**Runs solo:** ⚠️ **Yes, absolutely.** Land after PR 03, on a quiet tree, before PR 05. Nothing else
should be touching `plugins/`, core imports, manifests, or conftest while this is in flight. Merge
it fast.

## Why

Structural rename + the remaining code-org items not folded into 005. Renaming the plugin namespace
now (before 010 extracts standalone repos) means the extracted repos and install paths match the
final name from day one.

## Authoritative sources

- `design-docs/plans/master_fix_plan/tasks/006-backend-namespace-and-codeorg.md` (has an important
  2026-07-01 audit note — several sub-items are already done or false positives; read it).
- `design-docs/plans/active/master_agnostic_tasks.md` (namespace block).
- `design-docs/plans/active/organizational_cleanup.md` (residual reorg).
- `design-docs/plans/active/final_release/06_code_organization_cleanup.md` (doc-06 cleanup).

## Scope

**In:**
- **Rename `plugins/` → `tts_engines/`** — update *every* importer (core, plugins, manifests,
  `PLUGINS_DIR` env resolution in `app/core/config.py`, `conftest.py`, `pytest.ini` collection,
  docs/specs references, `run.sh`/`run.ps1` if they reference the path). The CLAUDE.md and code-map
  references to `plugins/` will need updating too.
- **Namespace-block remainder** (master_agnostic): rename voice namespace, reserve `plugins/` for
  app-behavior extensions, move engine-owned tests/fixtures into bundles, and the
  **`mixed.py` → `composite.py` decision** (make the call with the owner — it's a naming decision,
  not mechanical).
- **doc-06 cleanup**: `transient/` consolidation, `app/infra/subprocess` implement-or-delete,
  `app/infra/{cache,events,db}` stub decision (C-3). ⚠️ Per the 2026-07-01 audit: the
  `app/infra/*` scaffold + `StorageManager`/`TRANSIENT_DIR` are **already built**, and the
  `api/index.ts` error-handling item is a **false positive** (all 6 functions already route through
  `parseApiResponse`) — **drop that item.**
- Residual: `speakers.py` decomposition (if PR 03 didn't do it), `app/utils/text/` naming, API router
  sub-package restructure.

**Out:** anything already marked done in the audit note; the `JobHandlerRegistry`/plugin-driven
reconciliation decision (separate, deferred — leave the `[ ]` as-is).

## The rename procedure (do this carefully — it's the risky part)

1. Full inventory first: `grep -rn 'plugins/' --include='*.py' --include='*.json' --include='*.md'`
   plus `grep -rn 'PLUGINS_DIR\|from plugins\|import plugins'` across the repo, and the two launchers.
   Write the list down — this is your checklist.
2. Do the move + rewrite imports in one pass; keep it a pure rename (no behavior change).
3. Update `PLUGINS_DIR` resolution and the conftest that points it at the real dir. Test isolation
   depends on this — `conftest.py` sets `PLUGINS_DIR` to the real engines dir.
4. Update every `manifest.json` path assumption and the plugin_loader discovery root.
5. Grep again for stragglers: zero references to the old path should remain except intentional
   compatibility notes.

## Verify

- `./venv/bin/python -m pytest -q` — **the whole suite, including `plugins/*/tests` (now
  `tts_engines/*/tests`)**. pytest.ini collects from both roots; confirm collection still finds the
  plugin suites after the rename.
- `ruff check .` clean.
- **Actually launch the app** (`./run.sh --no-reload`) and confirm the TTS server boots, plugins are
  discovered, and `GET /api/v1/tts/engines` lists them — a rename that breaks discovery passes unit
  tests but fails here. Screenshot/log the engine list for the PR.
- CodeQL shape intact (path helpers unchanged).
- Bump `code-organization.md` spec + changelog; update CLAUDE.md + code-map `plugins/` references.

## Definition of done

- Rename complete, discovery + boot verified live, full suite green, `mixed.py`/`composite.py`
  decision recorded.
- Specs + wiki changelog + code-map changelog-queue entry.
- PR via `write-pr` → `studio-2.0`, clearly labeled as the namespace rename with the boot/engine-list
  proof.
