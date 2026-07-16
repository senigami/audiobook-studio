# PR 05 — Milestone 3 / 010: Standalone plugin repos

**Branch:** `studio2/standalone-plugin-repos-010`
**Target:** `studio-2.0`
**Size:** L
**Gate:** none, but **depends on PR 03** (plugin-SDK consolidation must be clean — zero `app.*`
imports, manifest-complete) and **must match the name PR 04 settled on** (`tts_engines/`). Do this
**last** of the Milestone 3 trio.

## Why

Extract the bundled engines into standalone, installable plugin repositories with a registry and a
paste-URL install flow — the last structural step before release. Much of the install
infrastructure already shipped; this finishes the extraction.

## Authoritative source

- `design-docs/plans/master_fix_plan/tasks/010-standalone-plugin-repos.md` (has a 2026-07-01 PARTIAL
  audit — read what already shipped so you don't rebuild it).
- `design-docs/plans/active/final_release/05_standalone_plugin_repos.md` (the detail, §4/§5/§6).

## Already shipped (do NOT rebuild — verify present, then build on)

Official registry JSON (`official_registry.py`), engines router, `OfficialRegistryPanel.tsx`,
`preview_github_plugin`, paste-URL install UI foundation.

## Scope (the open §4 items)

- Add the SUPERSEDED note to the old `v2_engine_bundle_github_distribution.md` plan (housekeeping).
- **Extract XTTS** into a standalone installable plugin repo (clean boundary after 03's SDK
  consolidation).
- **Extract Voxtral** into a standalone installable plugin repo.
- Official registry JSON — the catalog of installable engines (extend/finalize what shipped).
- Paste-URL install UI — finalize the install-from-git-URL flow.
- **E2E acceptance test** for the install flow + the trust-warning test (§5.3).
- `synthesis_mixed` registration items (doc 05 §4.1 Group 4) — the `tts_mixed` rename (M1) is done;
  finish the registration wiring.
- State/docs updates (6.1–6.3).

**Out / post-v2:** update-flow test (§5.2) and update-flow hardening are post-v2 — leave deferred.

## Key architecture constraints (`.agent/rules/modular_architecture.md`)

- The plugin boundary must be **clean**: an extracted engine repo imports the studio plugin SDK, not
  `app.*`. If you find any `app.*` import in an engine during extraction, that's an INV-3 violation —
  fix it via the SDK, don't ship the leak.
- New engines register via **manifest + the standard engine contract** — never engine-ID branches in
  core (INV-3). The extracted repos must install and register through the same contract.
- Honors INV-1 (`engines-and-plugins.md` spec).

## Verify

- Full backend suite green including the (renamed) engine test suites.
- **Actually run the install flow end-to-end**: launch the app, paste a plugin git URL, confirm the
  trust warning fires, install succeeds, the engine appears in `GET /api/v1/tts/engines`, and a
  synth request routes to it. This is the acceptance test made real — screenshot/log it.
- E2E + trust-warning tests green.
- Specs (`engines-and-plugins.md` / `install-distribution.md`) bumped + changelog.

## Definition of done

- XTTS + Voxtral extractable/installable via the registry + paste-URL flow, verified live.
- E2E install + trust-warning tests added and green.
- Specs + wiki changelog + code-map changelog-queue entry.
- PR via `write-pr` → `studio-2.0` with the live install proof.
