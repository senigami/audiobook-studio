# PL-2 addendum review — Tamsin (empirical / bottom-up, disk-verified)

**Reviewed:** `design-docs/plans/active/final_release/05a_standalone_plugin_repos_addendum.md`
against plan of record `05_standalone_plugin_repos.md` and current disk state (branch `studio-2.0`).
**Method:** every claim traced to the file/line it asserts, not to the doc's self-description. Code
map present and current (`synced_commit ebf484b`); this analysis is grounded, not un-mapped.
**Verdict: SOUND but INCOMPLETE.** All 5 items are accurate against disk. The addendum missed at
least two material corrections to its own plan of record, and items 3 and 4 have precision gaps that
would misfire if executed verbatim.

---

## The 5 items — verified accurate

| # | Claim | Disk check | Verdict |
|---|---|---|---|
| 1 | Doc 05 §4.2/X2 rename is superseded; in-tree manifest validates as-is (`interface:XttsPlugin`) | `tts_engines/tts_xtts/manifest.json` → `entry_class: interface:XttsPlugin`; matches `plugin_loader._CALLABLE_RE` (`^[a-z_][a-z0-9_.]*:[A-Za-z_]…$`) — module part `interface`, class `XttsPlugin` both pass | ACCURATE |
| 2a | Studio-handler `app.*` import residue in `plugin/studio/` | `tts_engines/tts_xtts/plugin/studio/adapter.py`: `from app.db.models import Job`, `from app.db.speakers import …` | ACCURATE (see nuance below) |
| 2b | XTTS license is CPML-1.0, not doc 05's AGPL-3.0 example | manifest `license: CPML-1.0` | ACCURATE |
| 3 | No mechanical sync check between in-tree manifest and registry today | `scripts/validate_plugin_manifests.py` exists (checks the four `*_version` fields only); no `git_url`/`version`/registry comparison anywhere | ACCURATE (see precision gap) |
| 4 | `Memory/state.json` reference is stale; real targets are `REMAINING_TASKS.md` + status banner | No capital-`Memory/` dir; `design-docs/plans/REMAINING_TASKS.md` exists | ACCURATE (scope too narrow — see below) |
| 5 | Manifest key is `built_in`, not `builtin` | `tts_engines/tts_mixed/manifest.json` → `built_in: true`; no `builtin` key on any manifest | ACCURATE |

"Already shipped" block also checks out: `tts_engines/tts_mixed/` folder rename done, `built_in: true`
present, `distribution` blocks present on both in-tree manifests.

---

## Nuance on item 2a (the riskiest step) — the framing overstates the openness

The residue is real but is **function-body (lazy) imports in `adapter.py`/`handler.py`**, not
module-level. The module-level `from app.*` imports the addendum's ancestry worried about were
**already resolved 2026-07-11** — `stage3_sdk_migration_plan.md` (S4/S9 notes) records both
`app_adapter.py` files migrated to `studio_plugin_sdk`, and the import-cleanliness tests now cover
them. So "block on finishing S9" is a heavier prerequisite than the residue warrants: the standalone
template (per that same plan) already carries zero `app` refs.

The genuinely open question the addendum should have sharpened: **is `plugin/studio/` even shipped to
the standalone repo?** Doc 05 §2 lists `plugin/studio/` as "optional Studio-side adapter if needed,"
and stage3 says standalone repos use a template with no app refs — which implies the studio-side
handler stays *in Studio* and never ships. If that's true, the "community author copies the exception"
risk largely evaporates and 2a collapses to a documentation note, not an owner blocker. The addendum
treats it as a live owner decision without resolving whether the residue files are in the shipped
surface at all. That's the question to settle first; it may dissolve the whole slice.

---

## What the addendum MISSED

**M1 (material) — Doc 05 §3's "KEEP `plugins/`" decision is inverted by shipped reality, and the
corrections list ignores it.** §3 (lines 221–231) decides "keep `plugins/` as the on-disk folder
through the 2.0 release" and records the `tts_engines/` rename as a *post-release candidate*. Disk:
**no `plugins/` dir exists; `tts_engines/` is the only one** (rename shipped 2026-07-16). The doc's
own status banner acknowledges this in passing, but the §3 body decision still stands stale and
self-contradictory — a bigger drift than any of items 4/5, an entire section whose decision is now
backwards. This belongs in the same "fix doc 05 in the drift-resolution pass" bucket the addendum
applies to items 1, 4, 5.

**M2 (material, doc-quality) — Doc 05 carries broken find-replace gibberish the addendum doesn't
flag.** §1.1's SUPERSEDED banner literally reads "Host changed from GitHub to GitHub," and §1.2's
comparison table is headed "GitHub concept | GitHub equivalent" with identical columns. This is a
botched GitLab→GitHub migration. The plan of record is the doc the addendum is telling implementers
to trust for the "complete 8-slice sequence"; leaving nonsensical sections unflagged undercuts that.

**M3 (precision — item 3) — the sync-guard as worded can't be built against the current registry.**
Item 3 says assert "the in-tree manifest's `version`/`distribution.git_url` matches the registry
entry." But `app/engines/official_registry.py` entries have **no `version` field** and use
**`repo_url`** (`…tts-xtts.git`), not `git_url`. So the guard can compare `distribution.git_url` ==
registry `repo_url`, but the version half is impossible until a `version` field is added to the
registry. Separately, in-tree `tts_xtts` version is `1.0.1` while doc 05's manifest example shows
`2.0.0` — a live version-drift the guard would need a decision on before it can assert anything.

**M4 (precision — item 4 scope) — there are TWO stale `Memory/state.json` references, and item 4
only names the Group 6 one.** Line 441 (6.1) *and* line 228 (in §3, outside Group 6). Item 4 says
"fix in the Group 6 docs slice" — that misses line 228. This compounds with M1 since line 228 is part
of the same inverted §3 decision.

---

## Confidence & falsifier

**High** on the five items being accurate and on M1/M4 (direct file/line evidence). **Medium** on the
2a reframing — it turns on whether `plugin/studio/` ships in the standalone repo, which is asserted
across stage3/§2 docs but not something I drove end-to-end; a runtime-verifier pass on an actual
extraction (or the owner confirming the shipped-repo file manifest) would settle it. **Falsifier for
my "incomplete" verdict:** if the addendum's authors intentionally scoped it to *only* the deltas
PL-2's research surfaced and deliberately excluded pre-existing doc-05 defects (M1/M2), then M1/M2 are
out of scope by design rather than missed — but M3/M4 remain accuracy gaps within items the addendum
did claim.

## Recommendation

Accept the 5 items. Before the doc-05 drift-resolution pass, fold in: M1 (retire the §3 keep-`plugins/`
decision), M4 (fix both Memory refs), M3 (reword item 3 to `git_url`↔`repo_url` and flag the missing
registry `version` field + the 1.0.1/2.0.0 drift), and at minimum note M2. Resolve the 2a
"does `plugin/studio/` ship?" question before treating S9 as a blocking pre-flight — it may be a doc
note, not a week of work. Nothing here is an owner-authority call that Esther and I converging would
let me make; the license (2b) and org (Slice 1) decisions the addendum already routes to the owner are
correctly placed.
