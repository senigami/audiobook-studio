# 011 — Release gating (W12) — owner-driven, LAST

**Status: NOT STARTED** — owner-driven; requires prior milestones. Holding for when all upstream workstreams are complete.

**Goal:** run the staged release sequence to ship v2.0.0. Several gates are **owner-run** (INV-8) — do
not automate or skip them.
**Authoritative sources:** [`final_release/08_release_sequence.md`](../../active/final_release/08_release_sequence.md)
+ [`final_release/road_to_v2.md`](../../active/final_release/road_to_v2.md) (06-15, the living gate list).

**Open items by stage:**
- **Stage 1 (owner):** manual render verification session — confirm real XTTS/Voxtral/mixed renders
  end-to-end. (Recall INV-5: xtts renders through the registry adapter → bridge → TTS Server.)
- **Stage 2:** doc-06 dead-code cleanup (→ done via 001/005) + Phase-11 plan-file checkpoint.
- **Stage 3:** SDK plugin contract — **COMPLETE.**
- **Stage 4:** voice metadata Phase G (→ 007) + standalone repos (→ 010).
- **Stage 5:** perf items P1–P6 (most shipped; P7–P9 → 008) + axe baseline decision.
- **Stage 6:** wiki corrections (W1/W3/W4 + the W5–W20 itemized set in `final_release/13`), demo/showcase
  release wiring + `v1.html` screenshot refresh to the current 2.0 UI, **Pinokio PK3** (publish wrapper
  repo — owner), **PK7** (demo bundle refresh — blocked on 007), **PK8** (first-run smoke test macOS+Windows),
  **SP9** spec-conformance cross-check pass (**gates the tag**), release notes + install matrix + version tag.
- **Stage 6 — Resource cleanup before the squash merge (owner-decided 2026-06-20):** the working branch
  squash-merges to `main`, so all planning scaffolding can be stripped at release and never lands in
  production history. **Partially done ahead of schedule (2026-07-17 doc-cleanup pass):** every
  completed plan folder confirmed to have no spec citing its path was deleted already —
  `design-docs/plans/_archive/` (fully retired 2026-07-18; its last fragment, the localization inventory `interface-localization.md` cites, was relocated to `proposals/localization_interface_*`),
  `COMPLETED_WORK_REPORT.md`, `MOVE_MAP.md`, and several completed `active/` folders; their
  narrative now lives in the wiki changelog rather than a `COMPLETED_WORK_REPORT.md`. **Still to
  delete at Stage 6:** `design-docs/plans/master_fix_plan/`, and the remaining open-source plan
  folders once they too are done (`simplification/`, `final_release/`, `master_agnostic_tasks.md`, etc.).
  **KEEP (owner — still useful, to be linked from the in-app debug/hidden-pages section):** the
  **style guide** and the **demo/showcase + workup pages** (`frontend/src/demo/`, the `docs/demo/`
  build, the in-app styleguide route).
  **Before deleting any remaining spec-cited plan, repoint or inline its provenance first** —
  `design-docs/specs/` still link into `reference/site_experience_north_star.md`,
  `reference/audio_player_scrubbing_waveform_proposal.md`, the `reference/v2_*` set,
  `reference/site_redesign_rollout/`, and
  `pr-dispatch/08-video-utils-decision.md`; rewrite those spec references or remove the links so no
  spec is left with a dangling pointer. (`active/audio_player_waveform_scrubber/`,
  `active/huggingface_voice_upload/`, and `active/synced_reader/` were already deleted and their
  citations repointed to `wiki/Changelog.md` in the 2026-07-17 docs consolidation — no longer on
  this list.)

**Map links:** W12. Consumes outputs of W1/W2/W6/W7/W8/W9/W11. SP9 enforces INV-1 across all specs.
Owner gates per INV-8.
**Dependencies:** effectively last — most other workloads feed a stage here. PK7 ← 007; Stage 4 ← 007/010;
Stage 5 ← 008.
**Acceptance:** all stage gates closed; SP9 conformance pass green; v2.0.0 tagged; release notes published.
**Out of scope:** post-v2 backlog (012).
