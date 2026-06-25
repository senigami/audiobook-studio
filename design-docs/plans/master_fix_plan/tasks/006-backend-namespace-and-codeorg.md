# 006 — Backend namespace rename & remaining code-org (W10)

**Status: NOT STARTED**

**Goal:** the structural rename `plugins/` → `tts_engines/` and the remaining code-org items not folded
into 005.
**Authoritative sources:** [`master_agnostic_tasks.md`](../../active/master_agnostic_tasks.md) (06-14,
namespace rename) + [`organizational_cleanup.md`](../../active/organizational_cleanup.md) (residual reorg).

**Open items:**
- Namespace rename `plugins/` → `tts_engines/` — update every importer (core, plugins, manifests,
  `PLUGINS_DIR`, conftest, docs/specs references). **Widest blast radius in the whole plan.**
- Residual code-org from `organizational_cleanup`: finish `speakers.py` decomposition (if not done in
  005), `app/utils/text/` naming, API router sub-package restructure.
- `master_agnostic_tasks` leftovers: MobileNavDrawer focus-trap fix (also an a11y item — see 008),
  `CONTRIBUTING.md` plugin docs, Vite ECONNRESET triage, large-book load timing check.

**Map links:** W10. Broad blast radius across all plugin imports → **run alone, not bundled**;
coordinate with W11 (010, standalone repos) since both touch plugin structure. Honors INV-3, INV-6.
Spec: `code-organization.md`, `modular_architecture.md`, `engines-and-plugins.md` if they name `plugins/`.
**Dependencies:** after 005's plugin SDK consolidation (clean boundary first); before/with 010.
**Acceptance:** full `pytest -q` incl. plugin suites; no `plugins/`-path references remain; specs updated.
**Out of scope:** the SDK consolidation itself (005); extracting repos (010).
