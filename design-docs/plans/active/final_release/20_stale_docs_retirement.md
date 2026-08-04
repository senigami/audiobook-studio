# 20 — Stale-docs retirement (release readiness)

**Purpose:** the concrete execution plan for the Stage-6 "strip planning scaffolding / delete stale
docs" gate in [REMAINING_TASKS.md](../../REMAINING_TASKS.md). Goal: after release, `design-docs/`
holds only what's relevant for moving forward; everything whose history is captured in the wiki
changelog is retired.

**Precondition — MET.** `wiki/Changelog.md` (897 lines) is the history-of-record and is current
through 2026-07-17: read-along reader, word-boundary snapping, standalone plugin repos, the
`plugins/`→`tts_engines/` rename, and the earlier Studio 2.0 workstreams all have dated entries
(wiki catch-up shipped in #152, plans consolidation in #153). Deleting a done plan therefore loses
no history — the narrative lives in the wiki.

---

## A. Retired now (this pass — safe, self-contained)

- **`docs/design-critique/`** (12 files, authored 2026-07-11 — moved to `design-docs/` earlier this
  branch, then retired here) — a development aid; its
  findings (A11Y-3, H-5, F3.1/F3.2/F5.7, etc.) were acted on and shipped. Code carries the "why"
  as inline `(design-critique follow-up)` comments, which don't depend on the files existing. One
  real provenance citation — a `design-system.md` v1.16.0 changelog row — was repointed (finding
  IDs kept, dead path dropped) before deletion. The designer agent profile's output-location note
  still points at `design-docs/design-critique/`; that's fine, the dir is recreated on demand when a
  future critique is written.
- **`design-docs/audits/voice_queue_event_stream_audit.md`** (+ the now-empty `audits/` dir) —
  a 2026-06-07 "implementation complete" handoff whose live contract is now
  `design-docs/specs/event-stream-processing-schema.md`. Uncited, superseded by the spec.
- **Agent-profile report output paths** — moved `docs/agent-reports/` to a hidden internal
  reports directory (the dir never existed, so nothing to migrate; this closes the same "internal
  output into the published site" trap the docs move addressed).
- **`_archive/` eliminated.** The category is retired — the repo keeps no archive going forward
  (a done plan is deleted outright, narrative to the wiki). Its one surviving fragment, the
  **localization interface inventory**, was **relocated, not deleted** — see the critical finding
  below — to `plans/proposals/localization_interface_{plan.md,examples/}`, and its three citers
  (`interface-localization.md`, `specs/README.md`, `master_fix_plan/012`) repointed.

## ⚠ Critical finding: "stale" ≠ "in reference/ or _archive/"

The single most important correction to the naive "delete what's archived" plan: **a
provenance-cited plan is only deletable if the feature it documents actually SHIPPED.** Several
docs sitting in `_archive/`/`reference/`/`proposals/` are the **design source for DEFERRED
features** — cited by an *active* spec for work that isn't built yet. Deleting those would gut the
spec. They must be kept (relocated out of misleading folders), never deleted:

- **Localization** (`interface-localization.md` `status: active`; impl deferred, `completion=0`,
  `frontend/src/i18n/` is a dark scaffold) — the `phase_12_multilingual` inventory is its working
  text-map/locale-JSON source. **Relocated to `proposals/`** (done, this pass).
- **W-PERF performance script** (`performance-script-format.md`: "AI extraction pipeline and export
  layer explicitly deferred… nothing writes/reads `performance_data` in production yet") —
  `proposals/performance_script_model/` is its design source. **Keep** (already in `proposals/`).
- **HuggingFace voice interface / AI casting** (open owner decision in `REMAINING_TASKS.md`) —
  `reference/v2_voice_system_interface.md`, `reference/v2_huggingface_voice_repo_spec.md`, and the
  `research_*` proposals back it. **Keep** until that decision lands.

## B. Release-gating remainder — repoint-then-delete (deliberate, NOT a blitz)

Split by feature status. Only **B1** deletes; **B2** stays.

### B1 — SHIPPED feature → repoint the citing spec, then `git rm`
Repoint each citation to the wiki changelog (or reword to drop the dead path, keeping self-describing
IDs), then delete. ~8 spec files; one focused, reviewed commit — mass-editing specs right before the
tag is the "expensive if wrong" case, so sequenced, not blind.

| Stale doc (feature shipped) | Repoint these first |
|---|---|
| `plans/reference/site_experience_north_star.md` | specs/{voice-bundles, audio-player, design-system, site-shell-and-book-pipeline} |
| `plans/reference/site_redesign_rollout/` | specs/{voice-bundles, design-system, site-shell-and-book-pipeline}, decisions/ADR-0010 |
| `plans/reference/v2_plugin_sdk.md` | specs/engine-bundle-template/{README.md, engine.py} |
| `plans/reference/v2_engine_bundle_github_distribution.md` | specs/engine-bundle-template/README.md |
| `plans/reference/v2_voice_tag_taxonomy.md` (taxonomy 2.0 shipped; `voice-taxonomy.json` is canonical) | specs/{voice.schema.json, voice-taxonomy.json} |
| `plans/proposals/audio_player_scrubbing_waveform_proposal.md` | specs/audio-player.md |
| `plans/pr-dispatch/08-video-utils-decision.md` (+ the `pr-dispatch/` dir) | specs/video-sample.md |

### B2 — DEFERRED feature design source → KEEP (do not delete)
`plans/proposals/localization_interface_*`, `plans/proposals/performance_script_model/`,
`plans/reference/v2_voice_system_interface.md`, `plans/reference/v2_huggingface_voice_repo_spec.md`,
`plans/proposals/research_*`. Retire each only when its feature ships or is formally dropped.

**Also in scope for Stage 6, no repoint needed** (verify done + wiki-covered, then delete):
- Done workstream folders under `plans/active/` whose only remaining items are owner visual checks
  tracked in `REMAINING_TASKS.md` — e.g. `simplification/`, `parallel-segment-rendering/`,
  `book_*_ia_proposal.md`, `frontend_testability_sweep/`. Cross-check each against
  `REMAINING_TASKS.md`/`COMPLETED_WORK.md`; keep any with genuinely open code.
- `plans/master_fix_plan/` (+ `OVERNIGHT_LOG.md`) — the master map + session narrative; retire once
  its remaining pointers are all closed.

## C. Keep — forward-relevant (do not retire)

- `specs/` — canonical, source of truth. `decisions/` — ADRs, permanent architectural record.
- `personas/` — curated reviewer roster (owner-confirmed keep).
- `style-guide/` — canonical written style guide (`design-system.md` companion).
- `reference/voice-archetypes/` — **data**, not a plan: archetype CSV/JSON + portrait prompts the
  casting/portrait features consume; `default-portrait-prompts.md` is an open owner task in
  `REMAINING_TASKS.md`.
- `workflows/` — product IA/workflow docs still cited by active IA plans.
- `plans/active/final_release/` (this release plan) + `REMAINING_TASKS.md` / `COMPLETED_WORK.md` /
  `FUTURE_WORK.md` + open `proposals/` (e.g. `span_resync_preservation.md`).

## Sequence

1. **(done)** Section A retirements.
2. Section B, per row: repoint citing spec → `git rm` doc. One commit, reviewed.
3. Section B "no repoint" folders: cross-check against tracker, delete done ones.
4. When every item clears, delete this file and the rest of `plans/active/final_release/` scaffolding
   as the final pre-tag step (per REMAINING_TASKS Stage-6 note), leaving `design-docs/` = specs +
   decisions + personas + style-guide + reference-data + workflows.
