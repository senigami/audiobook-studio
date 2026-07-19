# PL-2 reference — Plan: standalone plugin repo extraction + install E2E

## The question restated

Produce a self-contained, executor-ready implementation plan to extract XTTS and Voxtral into
their own installable GitHub repos, sequenced so the bundled default engine never breaks;
include the install-flow E2E acceptance test and the trust-warning test, the `synthesis_mixed`
registration items, and the state/docs updates — all grounded in the actual SDK/contract
surface and existing plan docs, treating the shipped SDK inversion (PR #140) as the foundation.

## What I examined

- `design-docs/plans/active/final_release/05_standalone_plugin_repos.md` — the plan of record,
  incl. its 2026-07-16 status banner (branch `studio2/standalone-plugin-repos-010`).
- `design-docs/plans/active/final_release/stage3_sdk_migration_plan.md` — S1–S10 status; S9
  residue (function-body `app.*` imports in studio handlers) still present.
- `design-docs/specs/install-distribution.md` (spec_version 1.3.0) — the pinned GitHub
  install/trust contract (§ "GitHub install/trust flow").
- `design-docs/specs/plugin-contract.md` (referenced; 1.5.0 per stage3 notes).
- `design-docs/plans/REMAINING_TASKS.md` — "010 standalone plugin repos" scope line.
- `studio_plugin_sdk/` — real top-level package (`engine.py`, `context.py`, `types.py`,
  `errors.py`, `audio.py`, `proc.py`, `plugin_utils.py`, `py.typed`) — PR #140 foundation.
- `tts_engines/tts_xtts/` — manifest (has validated `distribution` block pointing at
  `audiobook-studio/tts-xtts`; `entry_class: interface:XttsPlugin`; LICENSE, pyproject, README,
  tests already per-plugin), `plugin/server/` + `interface.py` verified **zero** `app.*` imports;
  `plugin/studio/{bake,segments,standard_handler}.py` still carry ~15 documented function-body
  `app.*` imports (stage3 S9 residue — studio-process side, not shipped in the standalone repo's
  server path but currently part of the same folder).
- `tts_engines/tts_voxtral/manifest.json` — `distribution` block present.
- `tts_engines/tts_mixed/manifest.json` — folder rename already shipped; `built_in: true`
  (key is `built_in`, not doc 05's `builtin`), `engine_id: "mixed"`.
- `tests/tts_server/test_install_flow_e2e.py` — offline backend E2E already pins staging,
  URL hardening, symlink rejection, and registry trust (TestCloneAndStage,
  TestUrlValidationHardening, TestTrustLevels).
- `app/api/routers/engines.py` (+ `engines_plugins`/`engines_registry` split),
  `app/engines/official_registry.py`, `frontend/src/components/overlays/PluginTrustModal.tsx`
  and its unit test, `OfficialRegistryPanel.test.tsx`, `EngineCardInstall.test.tsx`.

## Current-state delta (what is ALREADY done — the plan must not re-plan it)

Per doc 05 §5 status banner, verified against disk:

- SDK inversion shipped (`studio_plugin_sdk/` top-level, alias hack deleted) — PR #140.
- Plugins are standalone-liftable in-tree (LICENSE/pyproject/README/tests per plugin).
- `distribution` blocks landed in both xtts and voxtral manifests (items 2.5 / 3.5).
- Group 4 (`synthesis_mixed` registration) is **complete on disk**: folder renamed to
  `tts_engines/tts_mixed/` (2026-07-16 rename shipped, superseding doc 05 §3's "keep plugins/"),
  `built_in: true` set, uninstall returns 403, UI suppresses the button (doc 05 4.1–4.3 all [x];
  item 1.1 `BUILTIN_PLUGINS` allowlist is obsolete — rename decision superseded it).
- Backend install/trust E2E exists and is pinned into install-distribution.md 1.3.0.
- Official registry MVP shipped (`official_registry.py`, registry route, `OfficialRegistryPanel`,
  `preview_github_plugin`).

**Genuinely open:** X1–X6 (XTTS repo creation/extraction), V1–V3 (Voxtral), §5.1 clean-machine
install E2E, §5.3 *UI* acceptance (Community badge + consent walkthrough), Group 6 docs/state
(6.1–6.3), and post-v2 §5.2 (update flow — explicitly NOT release-gating).

## Ordered plan

Sequencing principle that keeps the bundled default working at every step: **the in-tree
`tts_engines/tts_xtts/` copy is never deleted or moved during extraction** — the standalone repo
is created as an export of it, and only the final clean-machine test (Slice 6) exercises a
delete-then-clone; every slice ends with the bundled engine still loading (`pytest -q` green,
`GET /api/engines` lists `xtts`, `voxtral`, `mixed`).

### Slice 0 — Pre-flight verification (checkable required elements)

Re-verify the foundation before creating anything external:

- `grep -rE "from app|import app" tts_engines/tts_xtts/plugin/server tts_engines/tts_xtts/interface.py`
  returns nothing (X3 — already true; the gate must run again at extraction time).
- Decide the **studio-handler residue question** (see Riskiest step): the standalone repo ships
  the whole plugin folder including `plugin/studio/`, whose bake/segments/standard_handler files
  still late-import `app.*` (stage3 S9 residue). Either (a) accept and document it — these run
  only inside Studio's process where `app` exists, per stage3's wrapper-boundary ruling — or
  (b) finish S9 ctx-injection first. Default: (a), documented in the repo README and doc 02
  contract notes; the plan does not block on S9.
- Resolve the **license discrepancy** flagged in X1: in-tree manifest history mentions CPML-1.0
  (Coqui model terms) vs doc 05's AGPL-3.0 example; manifest `license` and repo LICENSE must
  match. Owner call; must be settled before X1 because the repo is public on creation.

*Gate:* grep clean; license decision recorded; residue decision recorded in doc 05.

### Slice 1 — XTTS standalone repo creation (X1–X4)

1. Create `audiobook-studio/tts-xtts` (or owner-account equivalent — the registry `repo_url`
   in `app/engines/official_registry.py` and the manifest `distribution.git_url` must match
   whatever is created; `TestTrustLevels.test_registry_urls_match_in_tree_manifest_distribution`
   enforces the pairing).
2. Populate from the in-tree folder. **Keep the existing layout** (`interface:XttsPlugin`,
   `manifest.json`, `plugin/`, `settings_schema.json`, `requirements.txt`, LICENSE, README,
   tests) rather than doc 05 §2.2's `plugin.server.engine:XTTSEngine` rename — the in-tree
   manifest already validates against `plugin_loader._validate_manifest` (incl. the four
   version fields: `contract_version`, `sdk_version`, `settings_schema_version`,
   `event_envelope_version`), and the repo root must equal the folder Studio clones into
   `PLUGINS_DIR/tts_xtts/`. Renaming the entry module is churn with no contract benefit and
   would desync the bundled copy. (This is a deliberate deviation from doc 05 §4.2 X2 as
   written; doc 05's own §2.1 note concedes either naming works.)
3. Tag `v2.0.0` (matching manifest `version`).
4. Confirm the official registry entry's `repo_url`/`trust_level: "official"` fields — already
   hardcoded in `official_registry.py`; update only if the created URL differs.

*Gate:* fresh `git clone <repo> /tmp/x && diff -r` against in-tree copy shows only intended
deltas (no `__pycache__`, no dev droppings); clone dropped into a temp `PLUGINS_DIR` as
`tts_xtts/` passes `POST /plugins/refresh` with no `PluginLoadError`; existing offline E2E and
full pytest still green (bundled copy untouched).

### Slice 2 — XTTS smoke test (X6) — gate to Voxtral

On a working Studio checkout: move aside in-tree `tts_engines/tts_xtts/`, clone the new repo in
its place, refresh, engine reaches `verified` (deps already in `~/xtts-env`), render one short
segment, WAV produced. Restore the in-tree copy afterward (bundled default preserved).

*Gate:* doc 05 item 2.6 — do not start Group 3 until this passes.

### Slice 3 — Voxtral repo (V1–V3)

Same as Slices 1–2 for `tts_voxtral`: create repo, populate, tag, registry check. Plus V2:
`grep -rE "MISTRAL_API_KEY|mistral_key"` in the repo shows only a settings read. Smoke: with a
key, synthesis returns audio; without, `needs_setup` with human-readable reason.

*Gate:* V2 grep + smoke both directions (key / no key).

### Slice 4 — CI sync-guard between bundled copy and standalone repos (new, small)

The dual-source risk (in-tree copy drifts from the standalone repo) needs a mechanical check:
a script (extend `scripts/validate_plugin_manifests.py` or sibling) asserting in-tree manifest
`version`/`distribution.git_url` matches the registry entry, and (optionally, network-gated)
that the tagged repo tree matches the in-tree folder. Minimum release bar: the offline
version/URL consistency check in CI.

*Gate:* check runs in CI; deliberately breaking a URL fails it.

### Slice 5 — Trust-warning UI acceptance (§5.3, the open half)

Backend trust semantics are already pinned (`TestTrustLevels`; spec 1.3.0: trust = registry
membership, classified client-side). Open work is the **UI acceptance**:

- Add/extend frontend tests (`PluginTrustModal.test.tsx`, `EngineCardInstall.test.tsx`) to cover
  the full flow: preview of a non-registry URL → Community badge (not Official) → consent dialog
  names the source repo → Cancel calls `DELETE /plugins/staging/{token}` (no code loaded) →
  Confirm calls `POST /plugins/confirm/{token}`. R3/R4 compliant (contract-typed frames if any
  socket events; fake timers, `waitFor`).
- One manual walkthrough with a mock community entry, screenshots staged for the owner
  (perceptual acceptance is owner-gated per mandate).

*Gate:* vitest green on the new assertions; the "no code loaded until consent" property is
asserted by test (confirm endpoint never hit on cancel path), matching spec 1.3.0 clause 2.

### Slice 6 — Install-flow E2E acceptance (§5.1)

Two layers:

- **Automated (repo-network variant of the existing offline E2E):** extend
  `tests/tts_server/test_install_flow_e2e.py`'s pattern — the existing tests use local git
  fixtures; add one test parameterizable to the real repo URL, skipped by default
  (network-marked), exercising preview → confirm → refresh → engine listed.
- **Clean-machine acceptance (release gate, owner/Plumb-run):** Studio install with
  `tts_engines/tts_xtts/` deleted → clone from GitHub → refresh → `GET /api/engines` shows
  `available`/`needs_setup` → install deps → Verify → `verified` → one-sentence render → audio.
  This is dispatched to runtime-verifier (Plumb) — it is behavioral verification, exactly
  that role's mandate.

*Gate:* doc 05 5.1 acceptance verbatim; evidence (command log + artifact) staged.

### Slice 7 — `synthesis_mixed` registration items

**Status: already complete** (Group 4 all [x]; folder is `tts_engines/tts_mixed/`,
`built_in: true`, engine_id `mixed`, uninstall 403 + UI suppression verified 2026-07-16).
Remaining slice work is verification-only, not implementation:

- Re-run the acceptance greps: `grep -rn "synthesis_mixed"` outside `design-docs/plans/`
  returns nothing; `GET /api/engines` after refresh lists `xtts`, `voxtral`, `mixed`.
- Confirm doc 05 §4.4's contract-note obligation landed in doc 02 (`built_in` exception to the
  no-app-imports rule); fix the doc-05 text that still says key `builtin` (actual key is
  `built_in`) if unfixed.

*Gate:* greps + engines-list check; doc 02/05 wording consistent with the `built_in` key.

### Slice 8 — Docs and state (Group 6)

Same-change obligations, per repo rules:

- **6.1 state:** doc 05's `Memory/state.json` reference is stale (capital-M Memory retired
  2026-07-04) — the real targets are `design-docs/plans/REMAINING_TASKS.md` (mark 010 done,
  move detail to COMPLETED_WORK.md) and doc 05's status banner. Record the `tts_engines/`
  rename as already-shipped (it is), and §5.2 update-flow as post-v2.
- **6.2 handbook/wiki:** Settings → TTS Engines user docs — ZIP install, GitHub-URL install,
  registry install, dependency setup, trust prompts. Dated `wiki/Changelog.md` entry.
  Dispatch: user-docs-writer (Rosetta), gated on Slices 5–6 actually passing.
- **6.3 contributor guide:** "Publishing a TTS plugin" — repo shape (as shipped, i.e. the real
  in-tree layout, not doc 05 §2.2's aspirational one), `distribution` block, the four manifest
  version fields, registry submission, trust model. Must state the standalone-plugin rule:
  server code imports only `studio_plugin_sdk`, never `app.*` (stage3 S7 guidance).
- **spec sync:** `install-distribution.md` bump if any behavior changed (registry URL, network
  test); `plugin-contract.md` only if the residue decision (Slice 0) adds a documented exception.

*Gate:* Edda-style check — no doc claims "shipped" for anything Slice 6's evidence doesn't cover.

### Release-gating dependencies (call-out)

- Release-gating: Slices 0–3, 5, 6 (5.1 + 5.3), 7-verification, 8 (6.1–6.3). Matches
  REMAINING_TASKS 010 and the Stage-4 line in the release-gating checklist.
- NOT gating: §5.2 update flow (post-v2 per doc 05), open GitHub topic search, richer update UX.
- External dependency: GitHub org/account decision (`audiobook-studio` org vs owner account) —
  owner call, blocks Slice 1 step 1.

## Riskiest step + what would change the plan

**Riskiest: Slice 1's decision to publish the in-tree layout as-is, combined with the
studio-handler `app.*` residue.** The standalone repo ships `plugin/studio/` files that
late-import `app.db`/`app.jobs` — fine when installed into a Studio checkout (they execute in
Studio's process), but it makes the "engines must not import app" story publicly muddy, and a
community author copying the official repo as a template will copy the exception. If the owner
(or an S9 completion) rules the residue unacceptable for a public repo, the plan changes shape:
S9 ctx-injection becomes a blocking prerequisite slice before X1, adding roughly a week and a
dispatcher-integration test, and Slice 1's "publish as-is" becomes "publish post-S9". Secondary
risk: the registry URLs are hardcoded to an org (`audiobook-studio`) that may not exist yet —
if the actual repo lands elsewhere, `official_registry.py`, both manifests' `distribution`
blocks, and `TestTrustLevels.test_registry_urls_match_in_tree_manifest_distribution` all change
together (one commit, spec-sync included).

Doc 05 §4.2's module-rename instruction (X2) vs the shipped in-tree layout is a live spec/plan
drift: whichever way Slice 1 goes, doc 05 must be corrected in the same change, not silently.

## Could not determine here

- The final license for the XTTS repo (AGPL-3.0 vs CPML-1.0 weights-terms question) — owner
  decision, flagged in Slice 0.
- Whether the GitHub org `audiobook-studio` exists / who creates it — external to the repo.
- Whether `design-docs/specs/plugin_template/` (doc 05 P1 acceptance) exists at that exact path;
  the template obligations appear satisfied via doc 03 + `docs/plugin-sdk/plugin-template`
  (stage3 S2), but I did not verify that path directly.
- Whether the doc-02 contract note for the `tts_mixed` built-in exception actually landed
  (Slice 7 verifies it rather than assuming).
