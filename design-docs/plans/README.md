# Plans Index

The single map of every planning document. Reorganized 2026-06-25 into buckets so the root stays
clean and each plan's role is obvious. Old paths → new paths are in [MOVE_MAP.md](MOVE_MAP.md).

## Start here

- **[TASKS.md](TASKS.md)** — **the live work order.** One line per task, checkbox status.
  **If you want to know what to work on or what's already done, start here — it's the only
  file in this folder where status is kept current.**
- **[master_fix_plan/](master_fix_plan/README.md)** — the umbrella **map**: how the workstreams
  connect, which sub-plan (in `active/`) is authoritative for each, and the invariants that hold
  across all of them. Read it to understand *why* TASKS.md is ordered the way it is — its own
  done/pending markers are point-in-time snapshots that go stale, so don't trust them for status.
- **[COMPLETED_WORK_REPORT.md](COMPLETED_WORK_REPORT.md)** — the mirror: what's already shipped
  (v1→v2 narrative for wiki / changelog).

## Folder structure

| Folder | Meaning |
|--------|---------|
| `TASKS.md` | **Live status** — the one checklist to check or update; every other doc defers to it. |
| `master_fix_plan/` | The structural map (workstream connections, invariants, sub-plan routing) — not a status source. |
| `active/` | Plans with **open work**, each an authoritative data source the master points at. |
| `reference/` | **Done/superseded** plans kept because a spec or active plan **cites them as provenance**. Not a to-do list. |
| `proposals/` | **Undecided design drafts** awaiting a decision before they become work. |
| `_archive/` | **Done, nothing depends on them.** History only; narrated by COMPLETED_WORK_REPORT. |

Everything below is accounted for in exactly one bucket. The master plan covers every item in
`active/` and `proposals/`; `reference/` and `_archive/` hold no open work the master needs to schedule.

---

## `active/` — open work (tracked by the master)

Routing only — for current status/remaining work, check [TASKS.md](TASKS.md).

| Plan | What it covers |
|------|--------------------|
| [final_release/](active/final_release/00_overview.md) | The v2.0.0 release plan (docs 00–18). Phases 0–11 done; Stage-1 owner render gate, standalone repos (05), taxonomy v2 Phase G (04), Pinokio (16), and the cosmetic/audit backlogs (09–12, 17, 18) remain. |
| [simplification/](active/simplification/00_overview.md) | Dead-code/dup removal, large-file splits, CSS separation, **restore lost functionality (07)**. Master W2/W3 — not started. |
| [audio_player_waveform_scrubber/](active/audio_player_waveform_scrubber/README.md) | Live-app port of the scrub-track + expandable tape. Mock + spec done; real-app tasks 005–012 open. Master W5. |
| [mixed-synthesis-fused-proposal/](active/mixed-synthesis-fused-proposal/README.md) | **Mixed-engine model-load progress/ETA fix** (newly folded into the master). **DONE (W1–W4, W6; W5 superseded by W-PAR 001).** Kept active pending W-MIX-LA follow-up closure. |
| [mixed-synthesis-load-attribution/](active/mixed-synthesis-load-attribution/README.md) | W-MIX follow-up: segment-tagged load attribution + load-aware ETA. 007 spec-reconciliation + 👁 G0 re-check gates W-PAR resume. |
| [parallel-segment-rendering/](active/parallel-segment-rendering/README.md) | W-PAR: per-engine concurrent segment rendering. 001+004 shipped dark (cap=1); 002/003/005/006/007 pending; resume gated on W-MIX-LA 007. Phase 2 render monitor designed. |
| [master_agnostic_tasks.md](active/master_agnostic_tasks.md) | Namespace rename (`plugins/`→`tts_engines/`), MobileNav focus-trap, CONTRIBUTING. Master W6. |
| [organizational_cleanup.md](active/organizational_cleanup.md) | `speakers.py` decomposition, router reorg finish. Master W6 (overlaps simplification). |
| [file_split_plan.md](active/file_split_plan.md) | Retired 2026-07-01 — 3 of 5 items already right-sized; residual (`ChapterHeader.tsx`) folded into simplification/04. |
| [v2_phase_delivery_plan.md](active/v2_phase_delivery_plan.md) | Phase 12 active; Phase 13 (release docs) not started. |
| [book_view_ia_proposal.md](active/book_view_ia_proposal.md) · [book_chapter_ia_proposal.md](active/book_chapter_ia_proposal.md) | Book + Chapter workspace IA. Live port substantially done (W4); design source kept active. |
| [v2_huggingface_voice_interface.md](active/v2_huggingface_voice_interface.md) · [v2_voice_metadata_and_casting.md](active/v2_voice_metadata_and_casting.md) | HF browse/upload UI; AI casting suggestions; per-character casting UI. Open feature work. |

## `reference/` — done/superseded, cited as data sources (don't treat as to-do)

| Plan | Cited by |
|------|----------|
| [book_view_redesign/](reference/book_view_redesign/README.md) | Done (tasks 001–019); the executed IA port. Master W4 provenance. |
| [site_redesign_rollout/](reference/site_redesign_rollout/) | Done (R1–R7); cited by `design-system.md`, `site-shell-and-book-pipeline.md`, ADR-0010. |
| [quiet_studio_migration/](reference/quiet_studio_migration/README.md) | Done; cited by `design-system.md`, `voice-tone.md`. One owner-gated rename deferred. |
| [site_experience_north_star.md](reference/site_experience_north_star.md) | Superseded; cited by 4 specs (`design-system`, `site-shell-and-book-pipeline`, `audio-player`, `voice-bundles`). |
| [site_shell_phase_a_plan.md](reference/site_shell_phase_a_plan.md) · [master_agnostic_plan.md](reference/master_agnostic_plan.md) | Superseded with residuals tracked elsewhere; cited by active plans. |
| [v2_plugin_sdk.md](reference/v2_plugin_sdk.md) · [v2_voice_system_interface.md](reference/v2_voice_system_interface.md) · [v2_voice_tag_taxonomy.md](reference/v2_voice_tag_taxonomy.md) · [v2_huggingface_voice_repo_spec.md](reference/v2_huggingface_voice_repo_spec.md) · [v2_engine_bundle_github_distribution.md](reference/v2_engine_bundle_github_distribution.md) | Superseded; cited as provenance by `design-docs/specs/` templates + schemas (`voice.schema.json`, `voice-taxonomy.json`, `engine-bundle-template/`). |

## `proposals/` — undecided design drafts

| Plan | State |
|------|-------|
| [performance_script_model/](proposals/performance_script_model/README.md) | Design draft (no tasks). Per-span performance metadata + casting export. **Couples with sub-sentence assignment** — shared span/DB model; ship together. |
| [sub_sentence_speaker_assignment.md](proposals/sub_sentence_speaker_assignment.md) | Open proposal — sub-sentence span model undecided. Master W13 (owner decision pending). |
| [audio_player_scrubbing_waveform_proposal.md](proposals/audio_player_scrubbing_waveform_proposal.md) | Active design input for M2/004 (waveform scrubber); cited by `audio-player.md`. Work not yet started. |

## `_archive/` — done, nothing depends on them

Historical, narrated by [COMPLETED_WORK_REPORT.md](COMPLETED_WORK_REPORT.md). Added 2026-06-25:
**`implementation/`** (per-area v2 conversion impl docs, Phase-11 closeout) and **`phases/`** (the
phase 0–13 conversion plan; `phases/phase_12_multilingual_*` remains the localization design source,
cited by `interface-localization.md`, but localization is deferred post-v2). Plus the earlier v1→v2
conversion docs, completed delivery folders (`progress_routing_unification/`, `audit_systemic_bug_classes/`,
`checklists/`), and superseded design docs already archived in the 2026-06-19 pass.

---

*Reorg method:* a per-file/-folder status + inbound-reference audit (grep across `design-docs/specs/`,
`CLAUDE.md`, `.agent/`, code, and cross-plan links), then `git mv` into buckets with all authoritative
references repointed in the same change. The three plans postdating the master (`mixed-synthesis-fused-proposal`,
`performance_script_model`, `quiet_studio_migration`) were explicitly folded into
[master_fix_plan/](master_fix_plan/README.md) so nothing sits outside the master's coverage.
