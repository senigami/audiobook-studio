# PL-2 addendum review — Constance (structural / top-down panelist)

**Reviewed:** `design-docs/plans/active/final_release/05a_standalone_plugin_repos_addendum.md`
against plan-of-record `05_standalone_plugin_repos.md` and current disk state (2026-07-18).
**Mode:** REVIEW ONLY — no edits, no implementation.
**Verdict:** ACCURATE with minor imprecision on one item, and one material omission.
All 5 new/corrected items check out against disk; the addendum under-scopes the doc-drift
fix it commits to (§3 reversal + 27 stale `plugins/` paths).

## Item-by-item verification (all against disk)

**Item 1 — Doc 05 §4.2/X2 entry-module rename is superseded. VERIFIED, conclusion correct,
supporting claim slightly imprecise.**
- `tts_engines/tts_xtts/manifest.json` `entry_class` = `"interface:XttsPlugin"` — validates as-is.
  Renaming to `plugin.server.engine:XTTSEngine` is churn with no contract benefit: CORRECT.
- Imprecision: the addendum implies the on-disk layout is a flat `interface.py` differing from
  doc 05's `plugin/server/engine.py`. In fact `plugin/server/engine.py` **already exists** and is
  the real impl — `class XttsPlugin(StudioTTSEngine)` lives there; `interface.py` is a thin
  re-export facade (`from .plugin.server.engine import XttsPlugin`). So doc 05's target module is
  already present; the only deltas doc 05 would force are (a) point `entry_class` at the real module
  instead of the facade and (b) rename the class `XttsPlugin`→`XTTSEngine`. The addendum's verdict
  (don't do it) is right; its stated reason (layout differs) understates that doc 05's layout is
  substantially already realized. Recommend the doc-05 fix say "entry_class stays `interface:XttsPlugin`;
  the facade is intentional" rather than implying the target structure doesn't exist.

**Item 2 — New Slice 0 pre-flight. VERIFIED.**
- (2a) `app.*` residue in `plugin/studio/`: confirmed — `adapter.py`, `bake.py`, `app_adapter.py`,
  `handler.py`, `segments.py`, `standard_handler.py` all carry function-body `from app...` imports.
  The loader's own comment (`plugin_loader._load_plugin`) confirms the characterization exactly:
  `validate_studio_handlers(..., module_level_only=True)` tolerates function-body `app.*` imports
  "until S9 dispatcher integration lands." So the residue is real, is gated, and accept-and-document
  is a defensible default. Accurate.
- (2b) License discrepancy: confirmed — manifest `license` = `"CPML-1.0"`; doc 05 X1 hardcodes
  `AGPL-3.0`. Genuinely an owner call before a public repo is created. Good catch, correctly escalated.

**Item 3 — New Slice 4 sync-guard. VERIFIED gap, but the check as specified is under-defined.**
- No drift check between in-tree manifest and registry exists today: `scripts/validate_plugin_manifests.py`
  only asserts the four contract-version fields equal `"1.0"`; it does not read `distribution` or
  cross-check the registry. Real gap.
- Caveat the addendum should note: `app/engines/official_registry.py` entries carry `repo_url` but
  **no `version` field** (grep for version returns nothing). So "assert the in-tree manifest's
  `version` matches the registry entry" cannot work until the registry schema also carries `version`.
  The `git_url` half is checkable now; the `version` half needs a registry-schema addition first.
  Also note in-tree `version` is already `1.0.1` (xtts) / `1.0.0` (voxtral), not doc 05's example
  `2.0.0` — the versions are already out of step with doc 05's prose, reinforcing the need for the guard.

**Item 4 — `Memory/state.json` stale. VERIFIED.**
- Confirmed two live references in doc 05 (line 228 §3, line 441 Group 6.1). Capital-M `Memory/`
  retired 2026-07-04 (per CLAUDE.md). Correct real targets named. Accurate.

**Item 5 — `builtin` vs `built_in` key. VERIFIED.**
- `tts_engines/tts_mixed/manifest.json` uses `"built_in": true`. Doc 05 body says `"builtin"` at
  lines 329, 338, 411. Real discrepancy. Note doc 05 is already **self-contradictory**: its own §5
  status banner (line 354) says "built_in ... not builtin" while the body still says `builtin`. The
  addendum correctly targets the body text.

## What the addendum missed

1. **(Material) Doc 05 §3 "On-disk folder name — KEEP `plugins/`" is fully reversed and not flagged.**
   The folder rename to `tts_engines/` shipped 2026-07-16 (doc 05's own §5 banner admits it). The
   addendum fixes §4.2, the Memory ref, and the key name, but never says §3's core decision is now
   false, nor that **27 `plugins/` path references** throughout doc 05 §2/§4/§5 are stale. The
   addendum's Group-6 doc-fix slice (items 4+5) is scoped to two small string fixes; it should also
   carry "reconcile §3 + normalize `plugins/`→`tts_engines/` paths, or add a single authoritative
   errata note," per the spec/plan-drift rule the addendum itself invokes in item 1. This is the
   largest drift left standing.

2. **(Minor) The §1.1 supersede banner and §1.2 table carry a find-replace scar** — "Host changed
   from GitHub to GitHub", "replaced by their GitHub equivalents", and a "GitHub concept | GitHub
   equivalent" table (a GitLab→GitHub migration that over-replaced). Not blocking and arguably out of
   this addendum's scope, but it lives in the same doc-fix pass and undermines reader trust in §1.

3. **(Minor) Item 1's facade nuance** (above) — worth one sentence so the doc-05 edit doesn't
   accidentally delete `interface.py` thinking it's the flat-layout artifact being superseded.

## Blast-radius note on the addendum's own recommendations

The riskiest downstream coupling the addendum correctly identifies (secondary risk, lines 47-49):
the org name `audiobook-studio` is hardcoded in both manifests' `distribution` blocks AND
`official_registry.py`'s `repo_url` values. Confirmed on disk — three files, one org string. If the
owner-decision "org vs. account" resolves to anything other than `audiobook-studio`, both manifests +
the registry + the trust-pairing E2E (`tests/tts_server/test_install_flow_e2e.py`, confirmed present)
change in one commit. The addendum states this; it holds up.

## Confidence

High on the 5 item verifications (each checked directly against the manifest/loader/registry/script on
disk). High on the §3-omission finding. This is a lone structural pass — not converged with Petra
(empirical/bottom-up) or a fusion-reasoning judge, so treat it as un-ensembled: it did not get the
reliability convergence buys. The falsifier for my main finding would be an intent that the addendum
deliberately leaves §3 to a separate stale-doc sweep — if so, a one-line pointer to that sweep would
close it.
