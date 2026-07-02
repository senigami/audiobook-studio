# 010 — Standalone plugin repos (W11)

**Status: NOT STARTED** — blocked on 005 (plugin SDK consolidation) + coordination with 006 (namespace rename).

*(PARTIAL as of 2026-07-01: official registry JSON + paste-URL install UI SHIPPED (`official_registry.py`,
engines router, `OfficialRegistryPanel.tsx`, `preview_github_plugin`). Remaining: repo extraction
X1-X6/V1-V3, trust-warning e2e §5.3, update-flow §5.2 (post-v2), state/docs 6.1-6.3.)*

**Goal:** extract the bundled engines into standalone, installable plugin repositories with a registry
and a paste-URL install flow.
**Authoritative source:** [`final_release/05_standalone_plugin_repos.md`](../../active/final_release/05_standalone_plugin_repos.md)
(06-15). **Supersedes** `v2_engine_bundle_github_distribution.md` (archived) per the date rule and the
plan's own header note.

**Open items (§4):**
- Add the SUPERSEDED note to the old GitHub-distribution plan (housekeeping).
- Extract XTTS and Voxtral into standalone plugin repos (clean boundary after 005 SDK consolidation).
- Official registry JSON (the catalog of installable engines).
- Paste-URL install UI (install a plugin from a git URL).
- E2E acceptance test for the install flow.

**Map links:** W11. **Depends on** W2 (005) plugin SDK consolidation — the plugin boundary must be
clean (zero `app.*` imports, manifest-complete) before extraction. **Coordinate with W10 (006)**
namespace rename — if `plugins/`→`tts_engines/` happens, the extracted repos and install paths must
match the final name. Honors INV-3 (no engine-ID branches), INV-1 (`engines-and-plugins.md`,
`install-distribution.md`, `plugin-contract.md`).
**Dependencies:** after 005; coordinate with 006; feeds 011 (release).
**Acceptance:** XTTS/Voxtral install from URL via the registry; e2e test green; specs updated.
**Out of scope:** the SDK contract itself (done); Pinokio wrapper (011).
