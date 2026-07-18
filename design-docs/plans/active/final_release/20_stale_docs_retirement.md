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

- **`design-docs/design-critique/`** (12 files, authored 2026-07-11) — a development aid; its
  findings (A11Y-3, H-5, F3.1/F3.2/F5.7, etc.) were acted on and shipped. Code carries the "why"
  as inline `(design-critique follow-up)` comments, which don't depend on the files existing. One
  real provenance citation — a `design-system.md` v1.16.0 changelog row — was repointed (finding
  IDs kept, dead path dropped) before deletion. The designer agent's output-location note in
  `.claude/agents/designer.md` still points at `design-docs/design-critique/`; that's fine, the
  dir is recreated on demand when a future critique is written.
- **`design-docs/audits/voice_queue_event_stream_audit.md`** (+ the now-empty `audits/` dir) —
  a 2026-06-07 "implementation complete" handoff whose live contract is now
  `design-docs/specs/event-stream-processing-schema.md`. Uncited, superseded by the spec.
- **`.claude/agents/{designer,engineer,runtime-verifier}.md`** — agent report output path moved
  `docs/agent-reports/` → `.agent/reports/` (the dir never existed, so nothing to migrate; this
  closes the same "internal output into the published site" trap the docs move addressed).

## B. Release-gating remainder (repoint-then-delete — deliberate, NOT a blitz)

Each doc below is **done/superseded** and a deletion candidate, but is cited **by a spec or ADR as
provenance**. The binding rule (CLAUDE.md canonical-specs; plans `README.md`) is: repoint the
citing spec first, then delete. This is a ~10-spec-file edit and should be one focused, reviewed
commit near the tag — mass-editing specs right before release is exactly the "expensive if wrong"
case, so it is sequenced here rather than done blind.

For each: repoint the citing spec's reference to the wiki changelog (or reword to drop the dead
path, keeping self-describing IDs), then `git rm` the doc.

| Stale doc (under `design-docs/`) | Repoint these first |
|---|---|
| `plans/reference/site_experience_north_star.md` | specs/{voice-bundles, audio-player, design-system, site-shell-and-book-pipeline} |
| `plans/reference/site_redesign_rollout/` | specs/{voice-bundles, design-system, site-shell-and-book-pipeline}, decisions/ADR-0010 |
| `plans/reference/v2_plugin_sdk.md` | specs/engine-bundle-template/{README.md, engine.py} |
| `plans/reference/v2_voice_system_interface.md` | specs/engine-bundle-template/engine.py |
| `plans/reference/v2_voice_tag_taxonomy.md` | specs/{voice.schema.json, voice-taxonomy.json} |
| `plans/reference/v2_huggingface_voice_repo_spec.md` | specs/voice.schema.json |
| `plans/reference/v2_engine_bundle_github_distribution.md` | specs/engine-bundle-template/README.md |
| `plans/proposals/audio_player_scrubbing_waveform_proposal.md` | specs/audio-player.md |
| `plans/proposals/performance_script_model/` | specs/performance-script-format.md |
| `plans/proposals/research_character_brief_extraction_and_persona_casting.md` | specs/voice-bundles.md |
| `plans/proposals/research_voice_engine_marketplace_ui_prior_art.md` | specs/engines-and-plugins.md |
| `plans/pr-dispatch/08-video-utils-decision.md` (+ the `pr-dispatch/` dir) | specs/video-sample.md |
| `plans/_archive/phases/phase_12_multilingual_interface_*` (22 files) | specs/{interface-localization.md, README.md} |

**Also in scope for Stage 6, no repoint needed** (verify done + wiki-covered, then delete):
- Done workstream folders under `plans/active/` whose work shipped and whose only remaining items
  are owner visual checks tracked in `REMAINING_TASKS.md` — e.g. `simplification/`,
  `parallel-segment-rendering/`, `book_*_ia_proposal.md`, `frontend_testability_sweep/`. Cross-check
  each against `REMAINING_TASKS.md`/`COMPLETED_WORK.md` before removing; keep any with genuinely open
  code.
- `plans/master_fix_plan/` and the `master_fix_plan/OVERNIGHT_LOG.md` — the master map + session
  narrative; retire once its remaining pointers are all closed.

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
