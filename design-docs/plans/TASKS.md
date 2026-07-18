# Studio 2.0 Work Order

Epic-level checklist with individual tasks indented beneath each epic. One line per task for
anything **done** — full narrative history now lives in the wiki/changelog, not here. Open/future
work keeps its full actionable detail.

`👁 VISUAL CHECK` markers call out places where human eyes are required. Tests verify code; they
cannot verify what you see.

Index: [README.md](README.md) · Master roadmap: [master_fix_plan/README.md](master_fix_plan/README.md)

---

## W-MIX — Mixed-engine model-load progress/ETA fix *(done)*

Fix spec'd in `design-docs/specs/live-events.md` (1.7.1) and `progress-presentation.md` (1.6.0);
plan folder retired after completion (narrative in the wiki changelog).

- [x] W1–W4, W6 — per-active-engine marker resolution, synthesis-only duration, ETA suspension +
  per-group preparing phase, frontend preparing-state presentation, spec reconciliation (5 specs
  bumped). All shipped and visually confirmed on a live mixed XTTS+Voxtral render.
- [ ] W4 optional: `StatusOrb.tsx` distinct preparing appearance — not in original acceptance
  criteria, still undone.
- [x] W5 — superseded, folded into W-PAR 001 (per-engine semaphores replace the binary gate).

---

## W-MIX-LA — Mixed-synthesis load attribution *(done 2026-07-02)*

W-MIX follow-up: segment-tagged load-marker identity, load-aware ETA (`pre_load_eta`), all 007
tasks + the 👁 G0 re-check complete. Folded into W-MIX's spec set above.

---

## W-PAR — Parallel segment rendering *(Phase 1–3 shipped; owner live-verification still open on a few items)*

Plan: [active/parallel-segment-rendering/README.md](active/parallel-segment-rendering/README.md)

Render a chapter's segments concurrently across per-engine pools (GPU/CPU/cloud), capped per
engine. **Parallel rendering (cap > 1) is the shipped default** (owner directive 2026-07-06).

- [x] **001–007** — per-engine cap + semaphores, parent/child segment scheduling + enable-gate,
  per-segment dispatch isolation, TTS-server concurrent inference, correctness invariants (stitch
  order, artifact validation, retry, heartbeat), frontend multi-active segments, ETA-under-parallelism
  + off-by-default toggle. All done, full green gate, owner-verified live 2026-07-10 (segments and
  chapters both render in parallel).
- [x] **Phase 2** — dedicated render monitor (segment inventory hydration, milestone a11y, popover
  interaction, peek strip, cap config UI, bracketed ETA wiring, live cap admission) — [detail](active/parallel-segment-rendering/10-phase2-render-monitor.md). All 008–014 done, full green gate.
- [x] **Phase 3** — multi-job render-monitor rows (every concurrently-rendering job gets its own
  strip, not just the first) — [detail](active/parallel-segment-rendering/11-phase3-multi-job-rows.md). 015–016 done.

  > 👁 **VISUAL CHECK — still open (non-blocking, code is in and gate-passed)**
  > - Real char-weighted segment blocks + failure cue on a live render with cap ≥2 (008)
  > - Peek strip auto-appear/expand in both light and dark theme (011)
  > - XTTS `max_concurrent_workers=4` + per-engine override → restart → confirm 4 concurrent
  >   renders actually occur (012)
  > - Bracketed ETA showing a real range/"estimating…" on a live parallel render (013)
  > - Two chapters rendering simultaneously → two independent monitor strips, light + dark (015)

---

## W-QS — Quiet Studio visual redesign *(done — for the record)*

Plan: [reference/quiet_studio_migration/README.md](reference/quiet_studio_migration/README.md)

- [x] P0 fonts · P1 token re-skin · P2 forms/Switch · P3 status/progress · P4 glass audit · P6 demo baseline
- [ ] P5 sub-task B: `--accent` → `--action-primary` 94-file rename *(deferred — owner-gated; alias kept as a permanent compat pointer)*

---

## W-PERF — Per-span performance metadata / casting export *(safe foundation shipped; AI pipeline + export layer deferred)*

Execution plan: [active/performance_script_model_execution/](active/performance_script_model_execution/README.md) · design source: [proposals/performance_script_model/](proposals/performance_script_model/README.md)

- [x] Workloads 1–3 (schema, canonical JSON format, SSML capability manifest field) — DONE 2026-07-16,
  additive-only, owner-decided "safe parts now, hold the AI pipeline."
- [ ] Character discovery pass, segmentation/speaker attribution, performance-annotation pass —
  [tasks 005–007](active/performance_script_model_execution/tasks/)
- [ ] Reconciliation registry carryforward, review-queue backend API, review-state UI — [tasks 008/009/012](active/performance_script_model_execution/tasks/)
- [ ] Capability-matrix degradation engine + 5-target exporters (SSML, Polly, Azure, ElevenLabs,
  Google) — [tasks 010/011](active/performance_script_model_execution/tasks/)
- [ ] Design decision: schedule the AI pipeline + export layer, or hold indefinitely?

---

## Plugin SDK / contract — Stage 3 *(done — for the record)*

- [x] S1–S10 versioned plugin SDK migration + `synthesis_mixed`→`tts_mixed` rename; C-1 `app_adapter.py` residue fixed 2026-07-11.

---

## Milestone 1 — Safe base *(done)*

- [x] **001** — Foundation cleanup (dead deps/scripts, `.coveragerc`→`pyproject.toml`, dead FE stubs, hardcoded-color fixes, barrel-export trim) — [task file](master_fix_plan/tasks/001-foundation-cleanup.md)

---

## Milestone 2 — Two-level IA port

- [x] **002** — Wire orphaned features (`VoiceDropzone`, Module Settings tab, `SearchableSelect`) — [task file](master_fix_plan/tasks/002-restore-lost-functionality.md)

- [x] **003** — Book/Chapter IA live-app port — [task file](master_fix_plan/tasks/003-ia-live-app-port.md) · [IA plan](active/book_view_ia_proposal.md)
  Two-level shell (Contents/Cast/Lexicon/Publish/Backups), Chapter Workspace, Review redesign,
  Cast panel 3-tier, bookmarks, RST-1..8 (progress bar/play/download/guards/edit/default-voice/
  engine-banner/segment-aware player), book-scope Lexicon, per-span range assignment
  (word-boundary snapping shipped 2026-07-17, PR #143), DC-1b closed 2026-07-16 as will-not-delete
  (tree no longer dead — real routes/components depend on it).
  - [ ] Remaining gap: spans don't survive source-text resync — scoped in [proposals/span_resync_preservation.md](proposals/span_resync_preservation.md)

- [~] **004** — Audio player + waveform scrubber — [task file](master_fix_plan/tasks/004-audio-player-completion.md) · [completion plan](active/audio_player_completion_004/README.md) (waveform-scrubber plan shipped and removed; see `wiki/Changelog.md`)
  W1–W3 done: scope-agnostic player, PlayerBar tape wiring, peaks-sidecar source-swap,
  RST-8 segment/block navigation fix. "Play book" whole-book affordance dropped (duplicative of
  `ContinueListeningCard`).
  > 👁 **VISUAL CHECK — owner sign-off pending** (see `audio_player_completion_004/02-roadmap.md`):
  > scope-agnostic playback, segment prev/next + "Block N of M", waveform tape (open/scrub/motion
  > toggle/minimap/zoom), peaks-sidecar fallback above 10min, reduced-motion static tape.

---

## Milestone 3 — Simplification

- [~] **005** — Code simplification — [task file](master_fix_plan/tasks/005-code-simplification.md) · [plan](active/simplification/00_overview.md)
  - [x] FE dead-code, styling separation (ST-1–ST-4, `components.css`→11-file split), large-file
    splits LF-2..5/7 + LF-new (`plugin_loader.py`), backend cleanup BE-1..3/5, plugin consolidation
    PL-1..5, text-ops package — all done. DC-1b closed will-not-delete (see 003 above).
  - [ ] LF-1 `useStudioChapter.ts` split — blocked on DC-1a (no payoff, not attempted since DC-1b closed)
  - [ ] LF-6 `progress/service.py` `enrich()` extraction — deliberately left for a follow-up
    session with closer supervision (dense, numbered historical bug fixes; mechanical cut-paste risk)
  - [ ] `ChapterHeader.tsx` (615 lines) — last oversized split target, perf-gated
  - [ ] BE-6 rename/move `app/jobs` package — deliberately deferred to its own dedicated session
    (97 refs/~40 files, widest blast radius in this phase)
  - [ ] Four-way input-class consolidation (redesign-scale, still open); U10 z-index; owner visual
    sign-off on styling separation still pending

- [ ] **006** — Backend namespace rename + code-org — [task file](master_fix_plan/tasks/006-backend-namespace-and-codeorg.md) · [agnostic tasks](active/master_agnostic_tasks.md)
  - [ ] Rename `plugins/` → `tts_engines/` — update all importers, manifests, `PLUGINS_DIR`, conftest, docs
  - [ ] Namespace block remainder: rename voice namespace, reserve `plugins/` for app-behavior
    extensions, move engine-owned tests/fixtures into bundles, `mixed.py`→`composite.py` decision
  - [x] `speakers.py` decomposition, API router sub-package restructure, dev-only route gating,
    `App.tsx` split, input-style unification, Phase-12 owner decisions, `MobileNavDrawer` focus-trap,
    `CONTRIBUTING.md` plugin docs, Vite ECONNRESET triage, large-book load timing fix — all done 2026-07-14
  - [ ] doc-06 cleanup: `transient/` consolidation, `app/infra/subprocess` implement-or-delete,
    `app/infra/{cache,events,db}` stub decision (C-3), API error handling normalization
  - [ ] `JobHandlerRegistry` / plugin-driven reconciliation (`engine.check_output`) decision
  - [ ] Post-release/opportunistic: react-refresh lint warnings (11, demo stages), demo transport nits

---

## Milestone 4 — Feature + polish backlog

- [~] **007** — Voice taxonomy v2 Phase G — [task file](master_fix_plan/tasks/007-voice-taxonomy-v2.md)
  - [x] G1–G6 — `language`/`style` attributes, Edit Metadata UI, HF tag mappings, taxonomy 1.0→2.0 + schema bumps — all done 2026-07-04
  - [ ] C6 — copyable icon image-generation prompt (owner direction) — separate scope, not part of this pass

- [~] **008** — UX / A11y / Perf backlog — [task file](master_fix_plan/tasks/008-ux-a11y-perf-backlog.md)
  - [x] A4/A6/A7/A8/A10 a11y items, P7-P10 perf items, A11/A12 contrast + reduced-motion, U1/U2/U5/U6/U11/U12/U14/U15/U16 UX items, R6-T7 responsive sweep, Stage-5 axe gate — all done
  - [ ] A5 keyboard drag-reorder *(deferred — no Framer Motion public API)*
  - [ ] U4 first-run/startup experience
  - [ ] U7 ActionMenu correctness — dropped from scope 2026-07-14, no confirmed bug
  - [ ] U13 first-run onboarding

- [x] **009** — Security backlog — [task file](master_fix_plan/tasks/009-security-backlog.md) — S6/S7/S10/S11 done, S12 deps satisfied (`npm audit` 0 vulns; re-run at release as hygiene)

- [~] **010** — Standalone plugin repos — [task file](master_fix_plan/tasks/010-standalone-plugin-repos.md)
  - [x] Official registry JSON + paste-URL install UI — shipped
  - [ ] Extract XTTS into standalone installable plugin repo
  - [ ] Extract Voxtral into standalone installable plugin repo
  - [ ] E2E acceptance test for the install flow + trust-warning test (5.3)
  - [ ] State/docs updates (6.1–6.3); update-flow test (5.2) *(post-v2)*
  - [ ] `synthesis_mixed` registration items (doc 05 §4.1 Group 4)

---

## Milestone 5 — Release *(owner-run, last)*

- [ ] **011** — Release gating — [task file](master_fix_plan/tasks/011-release-gating.md) · [release sequence](active/final_release/08_release_sequence.md)
  - [ ] Stage 1 (owner): manual XTTS / Voxtral / mixed render verification session
  - [ ] Stage 1 (owner): site-redesign live-app validation items 1–18 + manually verify fixed-but-pending Phase-11 behaviors
  - [ ] Stage 2: doc-06 cleanup checkpoint + Phase-11 closeout + doc-01 plan-file corrections
  - [ ] Stage 4: voice metadata Phase G (→ 007) + standalone repos (→ 010) complete
  - [ ] Stage 5: perf P1–P6 confirmed; final broad `pytest` gate
  - [ ] Stage 6: wiki — W1/W3/W4 items (WAV/MP3 callout, responsive/theming/plugin-distro pages, Mixed Generation concept); refresh 12 stale wiki screenshots
  - [ ] Stage 6: demo/showcase + `v1.html` screenshot refresh to current 2.0 UI; R6-T10 dead-code retirement (supervised, full-suite run)
  - [ ] Stage 6: Pinokio PK3 (publish wrapper — owner) · PK7 (demo bundle refresh, needs 007) · PK8 (smoke test macOS+Windows) · PK5/PK6/PK9/PK10 (update-flow hardening, deep-reset, version-pinning, bash-only doc)
  - [ ] Stage 6: SP9 spec-conformance cross-check pass *(gates the tag)*
  - [ ] Stage 6: release notes + install matrix + v2.0.0 tag
  - [ ] Stage 6 cleanup: strip planning scaffolding before squash merge; **before deleting spec-cited plans, repoint provenance** — specs still link into `reference/site_experience_north_star.md`, `reference/audio_player_scrubbing_waveform_proposal.md`, the `reference/v2_*` set, `reference/site_redesign_rollout/`, `pr-dispatch/08-video-utils-decision.md` (docs cleanup round 2 already repointed and removed `active/audio_player_waveform_scrubber/`, `active/huggingface_voice_upload/`, `active/synced_reader/`)

  > 👁 **VISUAL CHECK — Stage 1 (owner-run render verification)**
  > Run these in the live app — not tests, not the demo:
  > - XTTS cold render: model-load preparing state, then synthesis with a correct ETA
  > - Voxtral render: no preparing state, immediate synthesis, accurate ETA
  > - Mixed render: XTTS groups show preparing, Voxtral groups skip straight to working; coherent overall progress/ETA
  > - Cancel mid-render: queue clears cleanly, no orphan processes
  > - Concurrent renders: fairness/priority mode behaves as configured

  > 👁 **VISUAL CHECK — Stage 6 demo + screenshots**
  > - `docs/demo/` loads, all stages work, no broken assets
  > - `v1.html` screenshots reflect the current 2.0 UI
  > - Pinokio wrapper (PK8): fresh macOS install → launches, home screen loads, can create a project

---

## Unscheduled — design decisions pending

- [~] **Chapter editor art-program** — Director's Console (Cast/Booth/Revise/Write) — [design doc](../workflows/chapter-editor-modes.md)
  Design decisions resolved 2026-06-26; scaffold + wiring + all four tool bodies DONE 2026-07-10.
  Remaining catalog items are real follow-on work, tracked in [active/chapter_editor_catalog_completion/](active/chapter_editor_catalog_completion/README.md):
  - [ ] Cast mode: brush size selector, variation 3-way toggle, Match Voice eyedropper, Stage
    Direction/Performance Cue + Cue Editor, mutation-batching collector queue (prerequisite for
    the others — see the plan's sequencing finding)
  - [ ] Booth mode: annotation gutter glyphs, playback speed control, session-only margin pins
  - [ ] Revise mode: real two-way segment split on buffer overflow (needs a new backend endpoint;
    the balanced-split algorithm itself is built and unit-tested)
  - [ ] Render-on-mode-exit (queue changed segments on Cast→any switch) + ambient On Air indicator
  - [ ] Kill Script/Source-Text tab pair; kill per-span inline dropdowns; unify generate actions
  - [ ] A11y keyboard model: roving-tabindex composite manuscript, `C+N` load-brush, `Shift+Arrow` range select *(hard requirement)*
  - [ ] Future/post-v2 (not scheduled): Casting Call tool slot (AI speaker detection), Script
    Supervisor tool slot, session-persistent flags with notes, plugin tool slots, dyslexia reading
    layer, narrow-viewport/mobile collapse

- [x] **Dynamic recording-guide prompts** — DONE 2026-07-10. "Suggest from voice qualities" action
  in the voice-profile Script Editor scores a voice's tagged attributes against 39 curated
  archetypes and suggests a recording prompt / sample text (narrative history in the wiki changelog).

- [x] **Recording cue & persona sample expansion** — DONE 2026-07-17. Mad-lib cue composer
  (`cueComposer.ts`), filtered character library ranking, square-portrait image prompts, character
  library expanded 39→103 archetypes across 8 genre buckets, mad-lib image-description composer,
  dev-mode-gated portrait-prompt export tooling. Established convention: `useDevMode()` is the
  default gate for contributor-only/in-progress/beta tooling repo-wide, not just debugging.
  - [ ] Owner generates the 103 default portrait images from `design-docs/reference/voice-archetypes/default-portrait-prompts.md` and drops them into `frontend/public/archetype-portraits/`
  - [ ] Owner live-verifies the character library end-to-end (picker ranking/narrowing, dev-mode
    copy button, mad-lib composed cue/image prompts, square-portrait output) — this worktree had
    no local Python venv, so backend click-through wasn't possible this session

- [~] **HuggingFace voice browse + upload** — [plan](active/v2_huggingface_voice_interface.md) — LIVE as of 2026-07-03; import/browse/export/upload/token-handling/provenance all shipped, Hub-repo-shape gaps closed (2026-07-12, see `voice-bundles.md` 1.7.0/1.8.0).
  - [~] Build voice asset from downloaded audio — NOT a distinct HF step; `bridge.py`'s
    `build_voice_asset` is itself unimplemented for the TTS Server path. User picks an engine and
    clicks the existing "Build" action instead. Flagged: an end-to-end async job that also
    triggers the build would be a reasonable v2, not built here.
  - [ ] Design decision: per-character multi-language handling in v1?
  - [ ] Design decision: in-app casting at release or fast-follow?

- [~] **AI casting + voice metadata UI** — [plan](active/v2_voice_metadata_and_casting.md) — `VoiceProfile` extensions, controlled vocab, casting card/contract, Voice Lab UX, "Suggest voices for this character" action all shipped.
  - [ ] Design decision: per-character multi-language handling in v1?
  - [ ] Design decision: in-app casting at release or fast-follow?

---

## Pre-built, not yet wired *(agent-built ahead of schedule)*

- [x] `app/domain/demo_bundle.py` — launcher module-path bug fixed 2026-07-12 (`run.sh`/`run.ps1` were invoking the wrong import path, silently skipping demo-library install)
- [x] `ExportTask`/`BakeTask` — deleted 2026-07-16 as redundant with the shipped `AssemblyTask`/`export_chapter_audio` paths; also fixed a latent M4B double-extension bug (`<name>.m4b.m4b`) found during the comparison
- [ ] `app/engines/video_utils.py` — `generate_video_sample()` builds a real ffmpeg MP4 preview command; wired via [pr-dispatch/08](pr-dispatch/08-video-utils-decision.md) → now shipped as "Export Video Sample" (`design-docs/specs/video-sample.md`). Waveform clip-select is a planned follow-up.
- [ ] **Audio loudness normalization / post-render polish** — genuinely unbuilt anywhere. If wanted, add to the shipped `wav_to_mp3`/`export_chapter_audio` chain, not a resurrected task class.
- [ ] **Async-queued MP3 export** — `export_chapter_audio` is synchronous (fine at chapter sizes). Only worth an orchestrator-queued variant if bulk export or very-large-chapter encoding becomes a measured concern.

## Declined / deferred with rationale

- [x] **Voice catalog grid virtualization — declined, 2026-07-15.** The "40-100+ voices" premise
  traced to a persona doc that was actually about the *projects* list, not voices; no evidence
  supports large voice rosters. Per-card cost is cheap and the grid is fluid (breaks
  `react-window`'s fixed-cell-size assumption). **Revisit trigger:** a real workspace reporting
  150+ voices with observed jank — profile first (`React.memo` may suffice) before windowing.

## Voice-variant version history *(done, 2026-07-15)*

Filesystem-based `versions/` schema per variant, non-destructive rebuild snapshots, promote-to-active,
A/B panel. All 12 tasks + 3 review-round fixes shipped. Plan: `~/.claude/plans/audiobook-factory/voice-variant-version-history/`.

## Voice variant tagging + IA redesign *(done, 2026-07-15)*

Per-variant `performance_tags`, count-based variant switcher, default-variant star, restored
icon-prompt affordance, consolidated overflow menu. All 14 tasks shipped. Plan archived at
`~/.claude/plans/audiobook-factory/archive/voice-variant-tagging-and-ia/`.

---

## Deferred / post-v2.0

- [ ] **012** — Localization + sub-sentence assignment — [task file](master_fix_plan/tasks/012-deferred-and-open-questions.md)
  - [~] Localization: `i18next`/`react-i18next` chosen, `frontend/src/i18n/` scaffolded dark
    (zero side effects, not wired into app root), one sample catalog (`WelcomePage`). Repo-wide
    string extraction, provider wiring, and additional locale catalogs still outstanding.
  - [~] Sub-sentence speaker assignment ([proposal](proposals/sub_sentence_speaker_assignment.md)) —
    ~90% already built (`chapter_segments` is the span table, `_apply_range_assignment` does the
    surgical split-and-assign, Book-mode drag-select wired end-to-end). Word-boundary snapping
    shipped 2026-07-17 (PR #143). Remaining genuinely-unbuilt gaps, scoped in
    [proposals/span_resync_preservation.md](proposals/span_resync_preservation.md): spans don't
    survive a source-text resync; `showSafeText` offset-fidelity; no executable cross-language
    twin-parity test for the snapping algorithm; undo (generic U1 work, not span-specific);
    character auto-detection.
  - [ ] Cross-ref: the HF voice + AI casting product backlog (Unscheduled, above) is the post-v2
    product surface tracked here; north-star Phase D (Review waveform annotations→re-renders,
    loudness QA) is future work in [reference/site_experience_north_star.md](reference/site_experience_north_star.md)

See also [post_release_backlog.md](post_release_backlog.md) for post-2.0 ideas not yet scheduled here.

---

*Legend: `[x]` done · `[~]` partially done · `[ ]` not started · `*(deferred)*` owner-gated*
*`👁 VISUAL CHECK` = human verification required — tests cannot substitute*
