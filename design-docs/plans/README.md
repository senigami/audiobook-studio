# Plans Index

The single map of every planning document. Reorganized 2026-06-25 into buckets so the root stays
clean and each plan's role is obvious. Swept again 2026-07-17: completed plan folders were deleted
outright (history now lives in the wiki/changelog, not here) rather than archived — see
`wiki/Changelog.md` for the shipped-feature narrative that used to live in this folder's now-removed
`COMPLETED_WORK_REPORT.md`/`_archive/`.

## Start here

Status now lives in three focused documents instead of one long file — pick the one that answers
your question:

- **[REMAINING_TASKS.md](REMAINING_TASKS.md)** — what's still open before v2.0.0 ships: visual
  checks, owner design decisions, unwritten code, the release-gating checklist. **Start here if
  you're picking up work.**
- **[COMPLETED_WORK.md](COMPLETED_WORK.md)** — what's already shipped, summarized by workstream.
  **Start here if you're checking what's done.**
- **[FUTURE_WORK.md](FUTURE_WORK.md)** — post-2.0 ideas, not yet scoped, not gating the release.
  Add new post-release ideas here as they come up.
- **[TASKS.md](TASKS.md)** — now a thin index pointing at the three above, kept only so existing
  links into it don't break.
- **[master_fix_plan/](master_fix_plan/README.md)** — the umbrella **map**: how the workstreams
  connect, which sub-plan (in `active/`) is authoritative for each, and the invariants that hold
  across all of them. Read it to understand *why* the remaining work is ordered the way it is —
  its own done/pending markers are point-in-time snapshots that go stale, so don't trust them for
  status; use `REMAINING_TASKS.md`/`COMPLETED_WORK.md` for that.

## Folder structure

| Folder | Meaning |
|--------|---------|
| `REMAINING_TASKS.md` | **Live status of open work** — check or update this, not `TASKS.md`. |
| `COMPLETED_WORK.md` | Compact shipped-work summary by workstream; full narrative lives in `wiki/Changelog.md`. |
| `FUTURE_WORK.md` | Post-2.0 ideas, not yet scoped or gating — a raw capture list, not a to-do list. |
| `TASKS.md` | Thin redirect to the three files above — kept only for existing inbound links. |
| `master_fix_plan/` | The structural map (workstream connections, invariants, sub-plan routing) — not a status source. |
| `active/` | Plans with **open work**, each an authoritative data source the master points at. |
| `reference/` | **Done/superseded** plans kept because a spec **cites them as provenance** — do not delete without repointing the citing spec first (see `REMAINING_TASKS.md`'s release-gating checklist). |
| `proposals/` | **Undecided design drafts** awaiting a decision before they become work. |
| `pr-dispatch/` | Self-contained PR briefs. All but one shipped and merged 2026-07-16/17 and were deleted; `08-video-utils-decision.md` stays because `design-docs/specs/video-sample.md` cites it in its `sources:` list. |
| `_archive/phases/phase_12_multilingual_*` | The one surviving fragment of the deleted `_archive/` — kept because `interface-localization.md` cites it directly as the localization design source. Everything else that was in `_archive/` (149 files: v1→v2 conversion docs, phase 0–13 conversion plan, completed delivery folders) is gone; its narrative lives in the wiki changelog now. |

Everything below is accounted for in exactly one bucket. The master plan covers every item in
`active/` and `proposals/`; `reference/` holds no open work the master needs to schedule.

---

## `active/` — open work (tracked by the master)

Routing only — for current status/remaining work, check [REMAINING_TASKS.md](REMAINING_TASKS.md).

| Plan | What it covers |
|------|--------------------|
| [final_release/](active/final_release/00_overview.md) | The v2.0.0 release plan (docs 00–18). Phases 0–11 done; Stage-1 owner render gate, standalone repos (05), taxonomy v2 Phase G (04), Pinokio (16), and the cosmetic/audit backlogs (09–12, 17, 18) remain. |
| [simplification/](active/simplification/00_overview.md) | Dead-code/dup removal, large-file splits, CSS separation. Most sub-parts done; LF-1/LF-6/BE-6/doc-06 remain (see REMAINING_TASKS.md). |
| [parallel-segment-rendering/](active/parallel-segment-rendering/README.md) | W-PAR: per-engine concurrent segment rendering. Phases 1–3 shipped and the shipped default; a handful of owner live-render visual checks remain (see REMAINING_TASKS.md). |
| [performance_script_model_execution/](active/performance_script_model_execution/README.md) | W-PERF execution plan. Workloads 1–3 (safe foundation) shipped; AI extraction pipeline + multi-target export layer (tasks 005–012) deferred pending an owner schedule decision. |
| [audio_player_completion_004/](active/audio_player_completion_004/README.md) | Remaining audio-player work (tape wiring, peaks sidecar, segment-nav fix). Owner visual sign-off pending. |
| [chapter_editor_catalog_completion/](active/chapter_editor_catalog_completion/README.md) | Research-only plan (not yet dispatched) for the Director's Console catalog additions still open in REMAINING_TASKS.md's "Chapter editor art-program" section. |
| [frontend_testability_sweep/](active/frontend_testability_sweep/README.md) | Saved-for-later plan (not yet dispatched): stable-selector convention for agent/Playwright reliability. |
| [master_agnostic_tasks.md](active/master_agnostic_tasks.md) | Namespace rename (`plugins/`→`tts_engines/`), MobileNav focus-trap, CONTRIBUTING. Master W6. |
| [v2_phase_delivery_plan.md](active/v2_phase_delivery_plan.md) | Phase 12 active; Phase 13 (release docs) not started. |
| [book_view_ia_proposal.md](active/book_view_ia_proposal.md) · [book_chapter_ia_proposal.md](active/book_chapter_ia_proposal.md) | Book + Chapter workspace IA. Live port substantially done (W4); design source kept active. |
| [v2_huggingface_voice_interface.md](active/v2_huggingface_voice_interface.md) · [v2_voice_metadata_and_casting.md](active/v2_voice_metadata_and_casting.md) | HF browse/upload UI; AI casting suggestions; per-character casting UI. Two open design decisions remain (see REMAINING_TASKS.md). |
| [library_project_usability/](active/library_project_usability/README.md) | Project-create series combo box, optional series position, and multi-file chapter import drag-and-drop. |

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
| [performance_script_model/](proposals/performance_script_model/README.md) | Design draft cited as provenance by `active/performance_script_model_execution/` (its schema-overlap-with-sub-sentence-assignment coupling claim was investigated and found false — see that plan's task 000). |
| [sub_sentence_speaker_assignment.md](proposals/sub_sentence_speaker_assignment.md) | ~90% already shipped (see FUTURE_WORK.md); remaining gaps scoped in `span_resync_preservation.md`. |
| [span_resync_preservation.md](proposals/span_resync_preservation.md) | Open proposal — spans surviving a source-text resync, undecided. |
| [audio_player_scrubbing_waveform_proposal.md](proposals/audio_player_scrubbing_waveform_proposal.md) | Design source for the shipped waveform tape; cited by `audio-player.md`. |
| [research_*.md](proposals/) | Prior-art / academic research backing the sub-sentence and casting proposals above — reference material, not a to-do list. |

---

*Reorg method (2026-06-25):* a per-file/-folder status + inbound-reference audit (grep across
`design-docs/specs/`, `CLAUDE.md`, `.agent/`, code, and cross-plan links), then `git mv` into
buckets with all authoritative references repointed in the same change.

*Cleanup pass (2026-07-17):* every plan folder/file confirmed complete with **no spec citing its
path** was deleted outright rather than archived (`_archive/` in full except the one
spec-cited fragment noted above, `COMPLETED_WORK_REPORT.md`, `MOVE_MAP.md`, the misplaced
`active/archive/span_word_boundary_snapping/`, `mixed-synthesis-fused-proposal/`,
`mixed-synthesis-load-attribution/`, `north_star_screen_parity/`, `organizational_cleanup.md`,
`file_split_plan.md`, and 10 of 11 `pr-dispatch/` briefs whose PRs all merged). `TASKS.md` was
rewritten to compress every completed item to one line; open/future work kept full detail. The
shipped-feature narrative these used to carry now lives in the wiki changelog, not here.

*Consolidation pass (2026-07-17, later same day):* `TASKS.md`'s remaining 302 lines were split
into `REMAINING_TASKS.md`, `COMPLETED_WORK.md`, and `FUTURE_WORK.md` (which absorbed the former
`post_release_backlog.md`) — one document per question ("what's left," "what shipped," "what's
next") instead of one file mixing all three. `TASKS.md` itself is now a thin redirect so the ~40
existing inbound links to it keep resolving.
