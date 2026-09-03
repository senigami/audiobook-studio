# 006 — Backend namespace rename & remaining code-org (W10)

**Status: MOSTLY DONE (2026-07-17)** — the `plugins/` → `tts_engines/` rename has fully shipped (111
tracked files under `tts_engines/`; `PLUGINS_DIR` resolves there by default), along with `speakers.py`
decomposition, the API router sub-package restructure, dev-only route gating, the `App.tsx` split,
input-style unification, and the `MobileNavDrawer` focus-trap fix (see `COMPLETED_WORK.md`).

*(Superseded 2026-07-01 audit notes, kept for provenance: `app/infra/{subprocess,cache,events,db}`
stub scaffold EXISTS as prescribed; `StorageManager`/`TRANSIENT_DIR` abstraction
(organizational_cleanup §5) is built and consumed. The `api/index.ts` error-handling item was a
FALSE POSITIVE — all 6 named functions already route through `parseApiResponse` with `.ok` checks.
`/progress-test` + `/event-stream` are frontend React Router routes registered unconditionally (not
backend routes) — the gating item means `import.meta.env.DEV` guards in the router.)*

**Remaining, per `REMAINING_TASKS.md`:** a voice-namespace rename, reserving `plugins/` for
app-behavior extensions, moving engine-owned tests/fixtures into bundles, and the doc-06 cleanup
items (`transient/` consolidation, `app/infra/subprocess` implement-or-delete, the
`app/infra/{cache,events,db}` stub decision (C-3), API error-handling normalization).

**Goal:** the structural rename `plugins/` → `tts_engines/` and the remaining code-org items not folded
into 005.
**Authoritative source:** [`master_agnostic_tasks.md`](../../active/master_agnostic_tasks.md) (06-14,
namespace rename). `organizational_cleanup.md`'s residual reorg (DB consolidation, `app/utils/text/`
naming, `speakers.py` decomposition) is done — plan file retired 2026-07-17.

**Open items:**
- Namespace rename `plugins/` → `tts_engines/` — update every importer (core, plugins, manifests,
  `PLUGINS_DIR`, conftest, docs/specs references). **Widest blast radius in the whole plan.**
- `master_agnostic_tasks` leftovers: MobileNavDrawer focus-trap fix (also an a11y item — see 008),
  `CONTRIBUTING.md` plugin docs, Vite ECONNRESET triage, large-book load timing check.

**Map links:** W10. Broad blast radius across all plugin imports → **run alone, not bundled**;
coordinate with W11 (010, standalone repos) since both touch plugin structure. Honors INV-3, INV-6.
Spec: `code-organization.md`, `modular_architecture.md`, `engines-and-plugins.md` if they name `plugins/`.
**Dependencies:** after 005's plugin SDK consolidation (clean boundary first); before/with 010.
**Acceptance:** full `pytest -q` incl. plugin suites; no `plugins/`-path references remain; specs updated.
**Out of scope:** the SDK consolidation itself (005); extracting repos (010).
