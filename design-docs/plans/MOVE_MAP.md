# Plans Move Map (2026-06-25 reorganization)

On 2026-06-25 the flat `design-docs/plans/` folder was reorganized into buckets
(`active/`, `reference/`, `proposals/`, `_archive/`). All moves used `git mv` (history preserved).
Authoritative external references (CLAUDE.md, `design-docs/specs/`, ADRs) and the master plan's
internal links were updated in the same change. **If you hit a stale link to an old path below,
look it up here and repoint it to the new path.**

Root-level entry points (unchanged): `README.md`, `MOVE_MAP.md`, `COMPLETED_WORK_REPORT.md`,
`master_fix_plan/`.

| Old path (`design-docs/plans/…`) | New path (`design-docs/plans/…`) |
|----------------------------------|----------------------------------|
| `final_release/` | `active/final_release/` |
| `simplification/` | `active/simplification/` |
| `audio_player_waveform_scrubber/` | `active/audio_player_waveform_scrubber/` |
| `mixed-synthesis-fused-proposal/` | `active/mixed-synthesis-fused-proposal/` |
| `master_agnostic_tasks.md` | `active/master_agnostic_tasks.md` |
| `organizational_cleanup.md` | `active/organizational_cleanup.md` |
| `file_split_plan.md` | `active/file_split_plan.md` |
| `v2_phase_delivery_plan.md` | `active/v2_phase_delivery_plan.md` |
| `book_view_ia_proposal.md` | `active/book_view_ia_proposal.md` |
| `book_chapter_ia_proposal.md` | `active/book_chapter_ia_proposal.md` |
| `v2_huggingface_voice_interface.md` | `active/v2_huggingface_voice_interface.md` |
| `v2_voice_metadata_and_casting.md` | `active/v2_voice_metadata_and_casting.md` |
| `book_view_redesign/` | `reference/book_view_redesign/` |
| `site_redesign_rollout/` | `reference/site_redesign_rollout/` |
| `quiet_studio_migration/` | `reference/quiet_studio_migration/` |
| `audio_player_scrubbing_waveform_proposal.md` | `reference/audio_player_scrubbing_waveform_proposal.md` |
| `site_experience_north_star.md` | `reference/site_experience_north_star.md` |
| `site_shell_phase_a_plan.md` | `reference/site_shell_phase_a_plan.md` |
| `master_agnostic_plan.md` | `reference/master_agnostic_plan.md` |
| `v2_plugin_sdk.md` | `reference/v2_plugin_sdk.md` |
| `v2_voice_system_interface.md` | `reference/v2_voice_system_interface.md` |
| `v2_voice_tag_taxonomy.md` | `reference/v2_voice_tag_taxonomy.md` |
| `v2_huggingface_voice_repo_spec.md` | `reference/v2_huggingface_voice_repo_spec.md` |
| `v2_engine_bundle_github_distribution.md` | `reference/v2_engine_bundle_github_distribution.md` |
| `performance_script_model/` | `proposals/performance_script_model/` |
| `sub_sentence_speaker_assignment.md` | `proposals/sub_sentence_speaker_assignment.md` |
| `implementation/` | `_archive/implementation/` |
| `phases/` | `_archive/phases/` |

## Known references updated in this reorg
- **CLAUDE.md** — `final_release/` paths.
- **`design-docs/specs/`** — `voice-taxonomy.json`, `voice.schema.json`, `audio-player.md`,
  `code-organization.md`, `design-system.md`, `engine-bundle-template/{README.md,engine.py}`,
  `install-distribution.md`, `interface-localization.md`, `site-shell-and-book-pipeline.md`, `README.md`.
- **`design-docs/decisions/`** — `ADR-0010-single-owner-audio-player.md`.
- **`master_fix_plan/`** — all internal `../<sibling>` navigation links.

## Not updated (intentionally)
- **`Memory/`** — gitignored session scratch / append-only logs (historical records of what happened
  at the time; not rewritten).
- **`design-docs/personas/`** — owned by a separate concurrent effort; only generic, non-path mentions.
- **Deep cross-links between moved historical docs inside `reference/` and `_archive/`** — low-value;
  use this map to repoint any you encounter while working in those files.
