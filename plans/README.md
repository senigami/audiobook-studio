# Plans Index

Single map of every planning document, with status, so plans aren't scattered. Consolidated
2026‑06‑19 from a verified classification of all plans created on/before 2026‑06‑17.

- **[COMPLETED_WORK_REPORT.md](COMPLETED_WORK_REPORT.md)** — formal v1→v2 "what shipped" narrative
  for the wiki / changelog / release highlights. **Start here for what's done.**
- **Active & partial plans** live at the `plans/` root (the to‑do list below).
- **`_archive/`** — completed/superseded plans with no open work that nothing else references
  (moved here to declutter; history preserved via `git mv`).
- Plans **cited by a `docs/specs/` spec or another active plan are kept in place even when done**
  (moving them would break references); they're marked ✅ below.

> Excluded from this consolidation (intentionally): **`simplification/`** (created 2026‑06‑19, the
> active dead‑code/styling effort) and anything from the in‑progress style‑guide work.

---

## 🔲 Remaining work (active / partially complete) — at `plans/` root

### Release gating
| Plan | Remaining |
|------|-----------|
| [final_release/08_release_sequence.md](final_release/08_release_sequence.md) · [road_to_v2.md](final_release/road_to_v2.md) | Owner‑run manual render verification (Stage 1); doc‑06 cleanup; Phase‑11 checkpoint; staged gates to v2.0.0 |
| [final_release/05_standalone_plugin_repos.md](final_release/05_standalone_plugin_repos.md) | XTTS/Voxtral repo extraction; official registry |
| [final_release/00_overview.md](final_release/00_overview.md) · [01](final_release/01_discrepancies_and_corrections.md) | Living release map; Stages 2–6 in progress |
| [final_release/16_pinokio_distribution.md](final_release/16_pinokio_distribution.md) | PK3 publish wrapper repo (owner); PK7 demo bundle refresh |

### Backlog (cosmetic / hardening / audits)
| Plan | Remaining |
|------|-----------|
| [final_release/09_logic_audit.md](final_release/09_logic_audit.md) | Dead‑code D1–D4, redundancy R1–R5 (overlaps `simplification/`) |
| [final_release/10_ux_improvements.md](final_release/10_ux_improvements.md) | U1–U14 cosmetic items |
| [final_release/11_accessibility_and_performance.md](final_release/11_accessibility_and_performance.md) | A4–A7 a11y items |
| [final_release/12_security_and_opportunities.md](final_release/12_security_and_opportunities.md) | S6/S7/S10/S11 (post‑LAN hardening) |
| [final_release/04_voice_metadata_and_tagging.md](final_release/04_voice_metadata_and_tagging.md) | Phase G taxonomy v2 (language/accent/style, tinted pills) |
| [final_release/06_code_organization_cleanup.md](final_release/06_code_organization_cleanup.md) | §1–§3 cleanup (overlaps `simplification/01`) |
| [final_release/14_live_demo_revamp.md](final_release/14_live_demo_revamp.md) · [17](final_release/17_test_quality_audit.md) · [18](final_release/18_canonical_specs.md) | Demo refresh; T5 coverage spot‑check; SP2/SP3 spec closure |

### Feature / redesign follow‑ons
| Plan | Remaining |
|------|-----------|
| [book_view_redesign/](book_view_redesign/README.md) | Track A: port the two‑level IA from the demo mock into the live app |
| [book_view_ia_proposal.md](book_view_ia_proposal.md) · [book_chapter_ia_proposal.md](book_chapter_ia_proposal.md) | Live restructure to Book + Chapter workspaces |
| [audio_player_waveform_scrubber/](audio_player_waveform_scrubber/README.md) | W1: scope‑agnostic live player (`fitsLegibly()`, drop scope toggle) |
| [phases/phase_12_multilingual_interface_plan.md](phases/phase_12_multilingual_interface_plan.md) + [examples/](phases/phase_12_multilingual_interface_examples/) | i18n **not implemented** — spec + inventory only; no `i18n/` yet |
| [v2_huggingface_voice_interface.md](v2_huggingface_voice_interface.md) · [v2_voice_metadata_and_casting.md](v2_voice_metadata_and_casting.md) | HF browse/upload UI; AI casting suggestions; per‑character casting UI |

### Code‑org / refactor
| Plan | Remaining |
|------|-----------|
| [phases/phase_12_polish_and_cleanup.md](phases/phase_12_polish_and_cleanup.md) | Taxonomy v2 Phase G; VCR/segment follow‑ups; wiki/changelog |
| [master_agnostic_tasks.md](master_agnostic_tasks.md) | Namespace rename (`plugins/`→`tts_engines/`); MobileNav focus‑trap; CONTRIBUTING |
| [v2_phase_delivery_plan.md](v2_phase_delivery_plan.md) | Phase 12 (active); Phase 13 (release docs) not started |
| [organizational_cleanup.md](organizational_cleanup.md) | `speakers.py` decomposition; router reorg finish |
| [file_split_plan.md](file_split_plan.md) | `scriptViewProgress.ts` extraction (split #5) |
| [sub_sentence_speaker_assignment.md](sub_sentence_speaker_assignment.md) | Open proposal — sub‑sentence span model undecided |
| **[simplification/](simplification/00_overview.md)** | **New (06‑19):** dead‑code/styling cleanup + restore lost functionality. Owner‑gated. |

---

## ✅ Done — kept in place (cited by specs or active plans; not archived)

| Plan | Status | Why kept | Owned by |
|------|--------|----------|----------|
| [final_release/](final_release/00_overview.md) | mixed (release folder) | CLAUDE.md + 4 specs cite it; still the live release roadmap | — |
| [site_redesign_rollout/](site_redesign_rollout/01_overview_and_phases.md) | completed (R1–R7) | cited by design‑system / site‑shell / voice‑bundles | `site-shell-and-book-pipeline.md` |
| [site_experience_north_star.md](site_experience_north_star.md) | superseded | cited by 5 specs | `site-shell-and-book-pipeline.md` |
| [audio_player_scrubbing_waveform_proposal.md](audio_player_scrubbing_waveform_proposal.md) | superseded | cited by `audio-player.md` | `audio-player.md` |
| [implementation/](implementation/) | mostly superseded/completed | cited by `.agent/notes.md`; coherent impl set | various specs |
| [phases/](phases/) | early phases completed | holds the cited `phase_12_multilingual*` | various specs |
| [v2_plugin_sdk.md](v2_plugin_sdk.md) · [v2_voice_system_interface.md](v2_voice_system_interface.md) · [v2_voice_tag_taxonomy.md](v2_voice_tag_taxonomy.md) · [v2_huggingface_voice_repo_spec.md](v2_huggingface_voice_repo_spec.md) · [v2_engine_bundle_github_distribution.md](v2_engine_bundle_github_distribution.md) | superseded | cited as provenance by `docs/specs/` templates + schemas | `plugin-contract.md`, `voice-bundles.md`, `install-distribution.md` |
| [master_agnostic_plan.md](master_agnostic_plan.md) · [site_shell_phase_a_plan.md](site_shell_phase_a_plan.md) | superseded w/ minor open items | small residual tasks tracked elsewhere | `engines-and-plugins.md`, `site-shell-and-book-pipeline.md` |

---

## 🗄️ Archived → [`_archive/`](_archive/)

Completed or fully spec‑superseded, no open work, nothing references them. Moved to declutter; the
[COMPLETED_WORK_REPORT.md](COMPLETED_WORK_REPORT.md) narrates what they delivered.

**v1→v2 conversion (superseded by `docs/specs/`):** `current_architecture.md`,
`current_behavior_preservation_audit.md`, `v2_future_work_analysis.md`, `v2_conversion_roadmap.md`,
`v2_folder_structure.md`, `v2_chapter_editor_workflow.md`, `v2_navigation_ux.md`,
`v2_progress_tracking.md`, `v2_project_library_management.md`, `v2_queuing_system.md`,
`v2_local_tts_api.md`, `v2_settings_architecture.md`, `v2_tts_server.md`, `proposed_epic_update.md`,
`github_branching_and_beta_strategy.md`, `plugin_contract_qa_hooks_plan.md`, `phase_11_audit.md`.

**Completed delivery folders:** `audit_systemic_bug_classes/` (6 systemic‑bug fixes),
`progress_routing_unification/` (12‑task progress engine unification), `checklists/` (ETA rebuild +
synthesis success‑path audits).

**Superseded design docs:** `book_chapter_ia_options.md` (→ `book_view_ia_proposal.md`),
`player_piano_scrolling_plan.md` (shipped in demo mock).

---

*Method:* classified by a 6‑batch agent audit (status from each plan's own completion markers +
canonical‑spec supersession + code presence), then archival restricted to items with zero inbound
references (verified by grep across `docs/`, `.agent/`, code, and other plans).
