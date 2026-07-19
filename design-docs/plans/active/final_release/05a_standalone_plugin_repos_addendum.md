# Addendum to doc 05 (standalone plugin repos) — from PL-2 calibration finding

**Status:** DRAFT — awaiting twin + Fable plan review. No code changes made producing this plan.
**Feeds from:** `.agent/frontier-calibration/references/PL-2.md`. **This is an addendum, not a
replacement** — `05_standalone_plugin_repos.md` remains the plan of record; this document captures
what PL-2's fresh research found already-shipped (so it isn't re-planned) and the new/corrected
slices it identified.

## Already shipped — do not re-plan (verified against disk 2026-07-18)

SDK inversion (PR #140), plugins standalone-liftable in-tree, `distribution` blocks in both
manifests, `synthesis_mixed`/Group 4 registration (folder rename to `tts_engines/tts_mixed/`,
`built_in: true`, uninstall 403, UI suppression), backend install/trust E2E, official registry MVP.

**Genuinely open** (matches doc 05, confirmed current): X1-X6 (XTTS repo creation), V1-V3 (Voxtral),
§5.1 clean-machine E2E, §5.3 UI acceptance, Group 6 docs/state, §5.2 (post-v2, not gating).

## New/corrected items from PL-2's research

1. **Doc 05 §4.2 (X2) is superseded — do not rename the entry module.** Doc 05 calls for renaming
   to `plugin.server.engine:XTTSEngine`; the in-tree manifest already validates as-is
   (`interface:XttsPlugin`) against `plugin_loader._validate_manifest`, and the repo root must equal
   the folder Studio clones into `PLUGINS_DIR/tts_xtts/`. Renaming is churn with no contract benefit
   and would desync the bundled copy. **Fix doc 05's §4.2 text in the same change that resolves
   this**, per the spec/plan-drift rule — don't leave the superseded instruction standing.
2. **New Slice 0 (pre-flight, blocking X1):** two decisions must be made before the repo goes
   public: (a) the studio-handler `app.*` import residue in `plugin/studio/` (stage3 S9) — default
   recommendation is to accept and document (these files only execute inside Studio's process), not
   block on finishing S9; (b) the XTTS license discrepancy (CPML-1.0 vs. doc 05's AGPL-3.0 example)
   — **owner call, must be settled before the repo is created** since it becomes public immediately.
3. **New Slice 4 (small, CI-enforced):** a sync-guard script (extend
   `scripts/validate_plugin_manifests.py` or a sibling) asserting the in-tree manifest's
   `version`/`distribution.git_url` matches the registry entry — the dual-source drift risk (in-tree
   copy vs. standalone repo diverging) has no mechanical check today.
4. **Doc 05's `Memory/state.json` reference is stale** (capital-M Memory retired 2026-07-04) — the
   real state targets are `REMAINING_TASKS.md` (mark 010 done, detail to COMPLETED_WORK.md) and doc
   05's own status banner. Fix in the Group 6 docs slice.
5. **Doc 05 text still says the manifest key is `builtin`; the actual key is `built_in`** — fix in
   the same doc pass as item 4.

## Riskiest step (unchanged from PL-2.md, restated)

Publishing the in-tree layout as-is (item 2a above) means the standalone repo ships studio-handler
files with `app.*` imports that only work inside a Studio checkout — a community author copying the
official repo as a template would copy the exception. If the owner rules this unacceptable for a
public repo, S9 ctx-injection becomes a blocking prerequisite before X1 (adds ~1 week). Secondary
risk: registry URLs hardcode an org (`audiobook-studio`) that may not exist yet — if the actual repo
lands elsewhere, the registry, both manifests' `distribution` blocks, and the trust-level test that
enforces their pairing all change together, one commit, spec-sync included.

## Open owner decisions (blocking, not deferrable)

- GitHub org vs. owner account (blocks Slice 1).
- License: AGPL-3.0 vs. CPML-1.0 (blocks Slice 0/1 — repo is public on creation).
- Studio-handler residue acceptance (Slice 0) — accept-and-document (default) vs. block on S9.

## Out of scope

Re-deriving the full slice-by-slice execution plan already in doc 05 — see PL-2.md's "Ordered plan"
section for the complete 8-slice sequence (pre-flight → XTTS repo → smoke → Voxtral → CI guard →
trust UI → install E2E → mixed verification → docs) if a from-scratch read is needed; this addendum
only adds/corrects what doc 05 didn't already have right.
