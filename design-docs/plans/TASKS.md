# Studio 2.0 Work Order

Epic-level checklist with individual tasks indented beneath each epic. One line per task — full detail lives in the linked files.

`👁 VISUAL CHECK` markers call out places where human eyes are required. Tests verify code; they cannot verify what you see.

Index: [README.md](README.md) · Master roadmap: [master_fix_plan/README.md](master_fix_plan/README.md)

---

## W-MIX — Mixed-engine model-load progress/ETA fix *(active)*

Plan: [active/mixed-synthesis-fused-proposal/README.md](active/mixed-synthesis-fused-proposal/README.md)

- [x] **W1** — Per-active-engine marker resolution — [task 001](active/mixed-synthesis-fused-proposal/tasks/001-marker-resolution-per-active-engine.md)
  - [x] `generation.py`: add `"engine"` key to each script entry
  - [x] `orchestrator_helpers.py`: resolve active render-group engine for marker + progress matching
  - [x] `tts_mixed/handler.py`: emit `[ENGINE_ACTIVITY_STARTED]` before each group's bridge call
  - [x] `tts_mixed/manifest.json`: declare `ENGINE_ACTIVITY_STARTED` timing marker
  - [x] Tests: mixed marker resolution; Voxtral-first masking regression (R1 revert-checked)

- [x] **W2** — Synthesis-only duration; orchestrator sole writer — [task 002](active/mixed-synthesis-fused-proposal/tasks/002-synthesis-only-duration-single-writer.md) *(commit 28a8317a + review fixes 077d5251)*
  - [x] `tts_mixed/handler.py`: remove load-inclusive `synthesis_duration_seconds` from final `update_job`
  - [x] `tts_mixed/handler.py`: remove competing `record_engine_sample` call (orchestrator is sole writer; wrapper kept as a documented test guard target)
  - [x] `orchestrator_helpers.py`: gate `segment_announced` fallback — only use when no load window exists (retain `segment_load_observed` latch through chapter-complete; INV-3 fix)
  - [x] `orchestrator_helpers.py`: verify `_record_render_stats_inner` sources synthesis-only duration
  - [x] `performance.py`: CPS purity (`model_load_seconds` out of CPS) covered by existing `test_record_render_sample_stores_load_and_pure_render_seconds`; positive marker-path test added in `test_startup_eta.py`

- [x] **W3** — ETA suspension + per-group preparing phase — [task 003](active/mixed-synthesis-fused-proposal/tasks/003-eta-suspension-preparing-phase.md) *(commit f474d300 + refinement 94ee199f)*
  - [x] `orchestrator_publish.py`: `clear_eta` param — null `eta_seconds` + clear → persisted ETA `None`; incidental null never clobbers a good ETA
  - [x] `orchestrator_helpers.py`: force-emit preparing frame with `indeterminate=true`, cleared ETA, `status="running"` — **gated on a real load marker** (per-group `LOADING_MODEL` frame), not every `SEGMENT_PENDING` announce, so warm renders don't flash
  - [x] Verify ETA resumes fresh at engine confirmation (no stale-value snap) — pinned in `test_preparing_window.py`
  - [x] Backend signals verified on the wire (`etaSeconds: null` + `indeterminate: true`); **user-visible chapter-bar effect lands in W4** (frontend consumption)

- [x] **W4** — Frontend preparing-state presentation — [task 004](active/mixed-synthesis-fused-proposal/tasks/004-frontend-preparing-presentation.md) *(mastermind run; commit pending — not pushed)*
  - [x] `live-jobs.ts` + `OverlayDelta`: surface `indeterminate` / `loadingElapsedSeconds` on the delta — **plus the two-layer runtime gap**: `jobEventAdapters.ts` (extract from payload), `queueOverlayFields.ts` (whitelist), `api/hydration/index.ts` (merge) — the fields were dropped at two layers; integration test through `publishStudioSocketMessage`→`useQueueSync` guards it
  - [x] `useStudioChapter.ts`: `chapterRenderPreparingSegmentIds` (reason_code/indeterminate), subtracted from rendering set + exported
  - [x] `ScriptView.tsx` + `.css`: `preparing` tier (`data-render-status="preparing"`, precedence over rendering, no render cursor, reduced-motion-guarded pulse); wired at **both** call sites (`StudioStage.tsx`, `ChapterEditorPage.tsx`)
  - [x] `ChapterHeader.tsx`: pass `reasonCode` into `buildSegmentProgressBarProps` (activates the existing 120s-lane suppression)
  - [x] Label: `getBusyStatusText` → generic `"Preparing…"` (shared across all indeterminate bars — fixes the over-broad relabel an adversarial pass caught); the **segment** load-window bar gets `"Preparing… / Loading voice model…"` via a scoped `busyLabel` prop (`progressBarContracts` + `PredictiveProgressBar`)
  - [x] `segmentsProgressProjector.ts`: forward `indeterminate` (completes end-to-end threading)
  - [ ] `StatusOrb.tsx`: distinct preparing appearance *(optional — deferred; not in acceptance criteria)*

  > 👁 **VISUAL CHECK — W-MIX complete**
  > Trigger a mixed XTTS+Voxtral render on a book with multiple chapters. During the ~30s XTTS model-load window:
  > - Active segment span reads **"Preparing… / Loading voice model…"** — NOT "Working…"
  > - Progress bar is indeterminate (no countdown, no 120s fake lane)
  > - No render cursor animation on the active span
  > - StatusOrb shows a distinct preparing state (dimmed/pulsing, not the spinning loader)
  > - Once synthesis starts: bar flips to "Working…" with a fresh ETA from zero — no stale-value snap
  > - A Voxtral-only render is unaffected (shows Working immediately, no preparing flash)

- [ ] **W5** — Mixed `ResourceClaim` *(superseded — folded into W-PAR 001; per-engine semaphores replace the binary gate and close the mixed `none()` gap)*

- [x] **W6** — Spec reconciliation — [task 005](active/mixed-synthesis-fused-proposal/tasks/005-spec-reconciliation.md) *(all 5 specs landed alongside their behavior per joint-authority)*
  - [x] `live-events.md` → 1.7.1: mixed marker resolution (1.6.1, W1) + load-window frame contract + load-marker-gated suspension (1.7.0/1.7.1, W3)
  - [x] `progress-presentation.md` → 1.6.0: segment-granularity preparing tier (§2.7), 120s-lane suppression, ETA suspend/resume, load-marker-gated suspension (W4)
  - [x] `queue-jobs.md` → 1.5.1: per-group phase vs monotonic durable status (1.5.0/1.5.1, W3) + synthesis-only clock note (1.4.1, W2)
  - [x] `data-model.md` → 1.4.1: synthesis-only clock + orchestrator sole-writer contract (W2) *(landed as 1.4.1, not 1.5.0 — content complete)*
  - [x] `system-architecture.md` → 1.3.0: per-active-engine marker-resolution note (W1 added the explicit `[ENGINE_ACTIVITY_STARTED]` marker; documented as manifest-driven, not engine-ID branching)

---

## W-PAR — Parallel segment rendering *(active — planned, not started)*

Plan: [active/parallel-segment-rendering/README.md](active/parallel-segment-rendering/README.md) · map: [01-map.md](active/parallel-segment-rendering/01-map.md) · roadmap: [02-roadmap.md](active/parallel-segment-rendering/02-roadmap.md)

Render a chapter's segments **concurrently** across per-engine pools (GPU/CPU/cloud), capped per engine, off-by-default (cap=1). Phase 1 = backend parallelism + multi-active frontend (existing per-segment bars light up at once); Phase 2 = dedicated render monitor (fast-follow). **Subsumes W-MIX W5.** Designed via the 2026-06-26 fusion triage.

- [ ] **G0 (prereq — owner):** verify the W-MIX `👁 VISUAL CHECK` on a live mixed render before starting (don't stack parallelism on an unverified core)
- [x] **001** — Per-engine cap declaration + scheduler semaphores — [task 001](active/parallel-segment-rendering/tasks/001-per-engine-cap-and-semaphores.md) *(DONE 2026-06-26: per-engine counting semaphores + manifest caps + global cap; ships dark via `ENGINE_CLASS_ADMISSION` env flag default OFF → single-flight = today; **W5 closed at runtime**; adversarial-reviewed, 434 tests green. Real caps + the toggle-as-setting land in 007.)*
- [ ] **002** — Parent/child segment scheduling — [task 002](active/parallel-segment-rendering/tasks/002-parent-child-segment-scheduling.md) *(chapter parent job fans child segment units into a bounded pool; one job per chapter for UI/recovery)*
- [ ] **003** — Per-segment dispatch isolation *(keystone, R-A)* — [task 003](active/parallel-segment-rendering/tasks/003-per-segment-dispatch-isolation.md) *(each concurrent segment gets its own timing/marker state; isolate the ~700-line `_dispatch` closure)*
- [ ] **004** — TTS-server concurrent inference — [task 004](active/parallel-segment-rendering/tasks/004-tts-server-concurrent-inference.md) *(warm-worker semaphore + lazy VRAM-aware spawn + `run_in_threadpool`; cloud free)*
- [ ] **005** — Correctness invariants under parallelism — [task 005](active/parallel-segment-rendering/tasks/005-correctness-invariants.md) *(stitch-order barrier, artifact-validated completion, cancel join-all, recovery K-of-N, SQLite per-segment writes, stuck-segment heartbeat — TDD)*
- [ ] **006** — Frontend multi-active segments — [task 006](active/parallel-segment-rendering/tasks/006-frontend-multi-active.md) *(chapter-level `active_segments_map` threaded end-to-end via the W4 two-layer pattern; `useStudioChapter` set; rAF-coalesced; existing bars light up in parallel)*
- [ ] **007** — ETA under parallelism + off-by-default toggle + spec reconciliation — [task 007](active/parallel-segment-rendering/tasks/007-eta-toggle-and-specs.md) *(bracketed throughput ETA; cap-default-1 toggle; bump queue-jobs/system-architecture/data-model/live-events/progress-presentation; final invariant gate)*
- [ ] **Phase 2** — dedicated BitTorrent-style render monitor *(fast-follow; design captured)* — [10-phase2-render-monitor.md](active/parallel-segment-rendering/10-phase2-render-monitor.md)

  > 👁 **VISUAL CHECK — W-PAR Phase 1 complete**
  > Raise an engine's concurrency cap above 1, then render a multi-segment chapter:
  > - Multiple segment bars (gray→black text + per-segment progress) advance **simultaneously**, not one at a time
  > - Chapter finishes noticeably faster than at cap=1; the chapter WAV plays back correct and in order (no shuffled/garbled segments)
  > - Cancel mid-render stops cleanly (no orphan audio, queue clears); re-render resumes only unfinished segments
  > - With the cap back at 1, behavior is exactly as before (ships dark)
  > - Overall progress + ETA stay coherent (ETA shown as a range / "estimating…", not a false precise countdown)

---

## W-QS — Quiet Studio visual redesign *(done — for the record)*

Plan: [reference/quiet_studio_migration/README.md](reference/quiet_studio_migration/README.md) · registered in [master README](master_fix_plan/README.md)

- [x] P0 fonts · P1 token re-skin · P2 forms/Switch · P3 status/progress · P4 glass audit · P6 demo baseline
- [ ] P5 sub-task B: `--accent` → `--action-primary` 94-file rename *(deferred — owner-gated; alias kept as a permanent compat pointer)*

---

## W-PERF — Per-span performance metadata / casting export *(proposal — not scheduled)*

Plan: [proposals/performance_script_model/README.md](proposals/performance_script_model/README.md) · registered in [master README](master_fix_plan/README.md)

- [ ] Design decision: schedule it? Shares the span/DB model with sub-sentence assignment (012) — the two must ship together or the DB migrates twice
- [ ] Canonical performance-script JSON format ([01](proposals/performance_script_model/01-canonical-json-format.md))
- [ ] Rich character profiles + AI extraction pipeline ([02](proposals/performance_script_model/02-character-profiles-and-extraction-spec.md), [05](proposals/performance_script_model/05-ai-extraction-agent-prompt.md))
- [ ] DB schema changes ([03](proposals/performance_script_model/03-db-schema-changes.md))
- [ ] Multi-target export layer ([04](proposals/performance_script_model/04-export-targets.md))
- [ ] Plugin-contract addition: `behavior` block fields (`export_format`, `supports_per_span_voice`, `supports_emotion_style`) — not yet in the contract

---

## Plugin SDK / contract — Stage 3 *(done — for the record)*

Plan: [final_release/stage3_sdk_migration_plan.md](active/final_release/stage3_sdk_migration_plan.md)

- [x] S1–S10: versioned plugin SDK + communication contract migration complete; `synthesis_mixed` → `tts_mixed` rename done
- [ ] C-1 residue: `grep "from app\." plugins/` → zero — module-level imports cleared; function-body imports in bake/segments/standard_handler still pending ([final_release/01](active/final_release/01_discrepancies_and_corrections.md))

---

## Milestone 1 — Safe base *(done)*

- [x] **001** — Foundation cleanup — [task file](master_fix_plan/tasks/001-foundation-cleanup.md)
  - [x] QW-1: remove dead deps (`clsx`, `tailwind-merge`, `mistralai`, `beautifulsoup4`)
  - [x] QW-2: delete legacy scripts (`audiobook.py`, `audit_routes.py`, `text_progress_demo.html`)
  - [x] QW-3: migrate `.coveragerc` settings into `pyproject.toml`, delete `.coveragerc`
  - [x] QW-4: add `last_test.json` to `.gitignore`
  - [x] QW-5: delete confirmed-dead FE stubs
  - [x] QW-6 *(deferred to 005)*: dead CSS selectors in `components.css`
  - [x] QW-7: fix 5 hardcoded-color `§2.2` violations
  - [x] QW-8: audit/trim `shared/` barrel exports

---

## Milestone 2 — Two-level IA port

- [x] **002** — Wire orphaned features — [task file](master_fix_plan/tasks/002-restore-lost-functionality.md)
  - [x] WIRE-1: mount `VoiceDropzone` in the New Voice modal (samples at creation + duration validation)
  - [x] WIRE-2: expose `VoiceModules` as a live "Module Settings" tab on `/engines`
  - [x] WIRE-3: swap `SearchableSelect` into speaker-assignment `<select>`s

  > 👁 **VISUAL CHECK — 002 complete**
  > - **WIRE-1:** Create a new voice → verify you can drop/upload sample files in the modal and see duration validation feedback
  > - **WIRE-2:** Open `/engines` → confirm a "Module Settings" tab exists and shows per-engine settings
  > - **WIRE-3:** Open speaker assignment → confirm dropdowns are searchable (type to filter)

- [~] **003** — Book/Chapter IA live-app port — [task file](master_fix_plan/tasks/003-ia-live-app-port.md) · [IA plan](active/book_view_ia_proposal.md) · [port tasks](reference/book_view_redesign/tasks/)
  - [x] Two-level shell: Contents / Cast / Lexicon / Publish / Backups tabs
  - [x] Chapter Workspace + chapter switcher + last-edited bookmark
  - [x] Review redesign: left rail + load-on-select
  - [x] Cast panel 3-tier + chapter-scoped temp characters
  - [x] Bookmarks + jump-to-next-unrendered
  - [x] RST-1 per-row live progress bar
  - [x] RST-2 chapter play via global player
  - [x] RST-3 audio download
  - [x] RST-4 destructive-action guards (rebuild / large-chapter / delete confirms)
  - [x] RST-5 in-Studio source edit
  - [x] RST-6 chapter default-voice picker
  - [x] RST-7 engine-unavailable banner
  - [x] Book-scope pronunciation Lexicon (`apply_lexicon` wired across all render paths)
  - [ ] RST-8 segment-aware player *(→ task 004, deferred by owner)*
  - [ ] Per-span range assignment *(deferred by owner)*
  - [ ] DC-1b dead-tree deletion *(gated on RST-8)*
  - [ ] Follow-up: fix the underlying XTTS synthesis failure surfaced by [task 015](reference/book_view_redesign/tasks/015-surface-xtts-worker-error-on-failure.md) (diagnostics shipped; root-cause fix still open)
  - [ ] Follow-up: live-verify XTTS progress relay + segment highlights; check task_id mismatch if highlights don't fire ([task 019](reference/book_view_redesign/tasks/019-relay-xtts-progress-over-http.md))

  > 👁 **VISUAL CHECK — 003 substantially done (RST-1..7)**
  > Open any book with multiple chapters and some rendered audio:
  > - Book view shows **Contents / Cast / Lexicon / Publish / Backups** tabs (not the old 5-stage pipeline)
  > - Open a chapter → Chapter Workspace loads; chapter switcher (prev/next) works; last-edited chapter remembered on return
  > - Contents tab: each chapter row shows a **live progress bar** while rendering (RST-1)
  > - Contents tab: **Play** button plays the chapter audio via global player (RST-2)
  > - Contents tab: **Download** button downloads rendered audio (RST-3)
  > - Attempt rebuild / delete → confirm dialog appears before proceeding (RST-4)
  > - Chapter editor has an **Edit Source** action that opens the source text inline (RST-5)
  > - Chapter editor shows a **Default Voice** picker in the header (RST-6)
  > - Disable an engine → verify the **engine-unavailable banner** appears (RST-7)
  > - Lexicon tab exists; adding a word applies it when rendering

- [ ] **004** — Audio player + waveform scrubber — [task file](master_fix_plan/tasks/004-audio-player-completion.md) · [scrubber plan](active/audio_player_waveform_scrubber/README.md) · [scrubber tasks](active/audio_player_waveform_scrubber/tasks/)
  - [ ] W1: make player scope-agnostic — remove `altScope`/`switchScope`, implement `fitsLegibly()` *(spec rewrite `audio-player.md` 1.6.0 already done — task 004)*
  - [ ] RST-8: teach player the segment model for block navigation (uses segment logic from `useStudioChapter`)
  - [ ] W2 (tasks 006–009): port `WaveformTape` renderer, zoom/minimap/ruler, `PlayerBar` integration, CSS + tests
  - [ ] W2 also: "Play book" whole-book sequenced playback (`onEnded` advance), paged↔moving motion toggle (forced-paged under reduced-motion), ~10–15 min duration cap (fall back to plain bar), single-`<audio>`-owner invariant grep check
  - [ ] W3 (tasks 010–012): peaks source abstraction, backend sidecar emission, source-swap + virtualization

  > 👁 **VISUAL CHECK — 004 complete**
  > Open a chapter with rendered segments:
  > - Global player works without a scope toggle — plays book-level and chapter-level audio from the same bar
  > - **Segment navigation:** prev/next segment buttons jump between individual segment clips
  > - **Waveform tape** renders below the player bar — scrub by dragging; playhead follows
  > - Zoom presets (fit / 1× / 2× / etc.) change the tape resolution; minimap shows position in long chapters
  > - Reduced-motion: waveform renders statically, no animated transitions

---

## Milestone 3 — Simplification

- [ ] **005** — Code simplification — [task file](master_fix_plan/tasks/005-code-simplification.md) · [simplification plan](active/simplification/00_overview.md)
  - [ ] FE dead-code ([simplification/02](active/simplification/02_frontend_dead_code_removal.md)): DC-1a extract shared (`VoiceProfileSelect`/`useChapterStatus`/`ResyncPreviewData`/`ChapterEditorTab`), DC-1b dead-tree *(gated on 004)*, DC-2 stub-route infra, DC-3b safe independent deletions
  - [ ] Styling separation ([simplification/03](active/simplification/03_styling_separation.md)): ST-1 (QW-6 dead CSS), ST-2 shared classes (`form-label` ×52 / `input-field` ×8), ST-3 inline-`style`→class in top-15 hotspots, ST-4 spec bumps (+ U3 type scale, U9 button/input, U10 z-index incl. `--z-drawer` from [final_release/10](active/final_release/10_ux_improvements.md))
  - [ ] Large-file splits ([simplification/04](active/simplification/04_large_file_splits.md)): LF-1 `useStudioChapter.ts`, LF-2 `EngineCard.tsx`, LF-3 `PredictiveProgressBar.tsx`, LF-4 `MetadataEditorModal.tsx`, LF-5 `App.tsx`, LF-6 `progress/service.py`, LF-7 `tts_server/server.py`
  - [ ] Older split audit ([file_split_plan](active/file_split_plan.md), perf-gated): `QueueItem.tsx`, `useJobs.ts`, `ChapterHeader.tsx`, `useQueueSync.ts`, `scriptViewProgress.ts` — reconcile overlap with LF-*
  - [ ] Backend cleanup ([simplification/05](active/simplification/05_backend_cleanup.md)): BE-1 dead code, BE-2 `INTENDED_*`/`FORBIDDEN_*` constants, BE-3 `events.py` command-set dedup, BE-4 duplicate segment-timing math, BE-5 per-request `_resolved_segment_profiles`, BE-6 rename/move `app/jobs` package
  - [ ] Plugin consolidation ([simplification/06](active/simplification/06_plugin_consolidation.md)): PL-1 one SDK context factory, PL-2 shared segment-marker handler + `_group_needs_render`, PL-3 app-adapter helpers→`BaseVoiceEngine`, PL-4 shared XTTS synthesis loop, PL-5 remove ABC stubs *(PL-6: xtts adapter is LIVE — do NOT delete, INV-5)*
  - [ ] Logic-audit cleanup ([final_release/09](active/final_release/09_logic_audit.md)): D1/D2 dead FE files + D3 registry stub; R1 dup `_ensure_plugin_package_hierarchy`, R2/R3 adapter+Voxtral dedup, R6 unify queue/jobs overlay; F14 `ScriptView` `data.paragraphs` crash, F15 `useInitialData` fetch-failure signal; B14–B17 test-infra fixes; T5 coverage-honesty spot-check
  - [ ] Text-ops package ([organizational_cleanup §2](active/organizational_cleanup.md)): create `app/text/`, consolidate `textops_*`/`text_processing.py`

  > 👁 **VISUAL CHECK — 005 styling separation**
  > In both **light and dark** themes:
  > - Buttons and inputs look consistent across all pages — no rogue sizes, colors, or border radii
  > - No visible regressions from the dead-CSS removal (spot-check the demo/styleguide route `/#/styleguide`)
  > - Type scale feels consistent — body, labels, headings all use the token scale, nothing obviously oversized or tiny

- [ ] **006** — Backend namespace rename + code-org — [task file](master_fix_plan/tasks/006-backend-namespace-and-codeorg.md) · [agnostic tasks](active/master_agnostic_tasks.md)
  - [ ] Rename `plugins/` → `tts_engines/` — update all importers, manifests, `PLUGINS_DIR`, conftest, docs
  - [ ] Namespace block remainder ([master_agnostic](active/master_agnostic_tasks.md)): rename voice namespace, reserve `plugins/` for app-behavior extensions, move engine-owned tests/fixtures into bundles, `mixed.py`→`composite.py` decision
  - [ ] Finish `speakers.py` decomposition (if not done in 005)
  - [ ] API router sub-package restructure
  - [ ] doc-06 cleanup ([final_release/06](active/final_release/06_code_organization_cleanup.md)): `transient/` consolidation, `app/infra/subprocess` implement-or-delete, `app/infra/{cache,events,db}` stub decision (C-3), gate dev-only routes (`/progress-test`, `/event-stream`) behind `import.meta.env.DEV`, split `App.tsx` (QueueDrawerHost/NotificationsHost/StartupGate) + `runtimeDebug.ts`, normalize API error handling (`api/index.ts`), unify input styles (`.input-field`→`.form-input`)
  - [ ] `JobHandlerRegistry` / plugin-driven reconciliation (`engine.check_output`) decision ([master_agnostic](active/master_agnostic_tasks.md) Phase 12)
  - [ ] Phase-12 owner decisions: generic plugin setup-loop (implement or defer), voice-settings placement, system-API surface for 3rd-party controllers, Settings→API tab honesty
  - [ ] `MobileNavDrawer` focus-trap fix (a11y — also tracked in 008)
  - [ ] `CONTRIBUTING.md` plugin/template docs + plugin-doc prep for release (Phase 13)
  - [ ] Vite ECONNRESET triage + large-book load timing check
  - [ ] Post-release/opportunistic: react-refresh lint warnings (11, demo stages), demo transport nits (`restart()`/`play()`/`warnedRoutes`)

  > 👁 **VISUAL CHECK — 006 complete**
  > - App starts cleanly with no import errors in the console
  > - On mobile viewport: open the nav drawer → **Tab key stays trapped inside** the drawer until it closes (focus-trap fix)
  > - XTTS and Voxtral render a test segment successfully end-to-end (plugins still load under the new path)

---

## Milestone 4 — Feature + polish backlog

- [ ] **007** — Voice taxonomy v2 Phase G — [task file](master_fix_plan/tasks/007-voice-taxonomy-v2.md) · [detail](active/final_release/04_voice_metadata_and_tagging.md)
  - [ ] G1–G3: add `language` (multi-select), `accent` (single), `style` (multi) attributes
  - [ ] G4 UI: category-tinted pills + "+N" overflow (absorbs U8)
  - [ ] G5: HF bundle tag mappings (`as-language`/`as-accent`/`as-style`)
  - [ ] G6: bump `voice-taxonomy.json` + `voice.schema.json` + docs with changelog
  - [ ] C6: copyable icon image-generation prompt (owner direction)

  > 👁 **VISUAL CHECK — 007 complete**
  > Open the Voice Lab with several voices that have metadata:
  > - Each voice card shows **tinted pills** for language, accent, and style — each category has a distinct color tint
  > - When a voice has many tags, extra pills collapse to **"+N more"** rather than overflowing the card
  > - Editing a voice lets you set language (multi), accent (one), and style (multi) from controlled dropdowns
  > - In both light and dark themes — pill contrast is legible in both

- [~] **008** — UX / A11y / Perf backlog — [task file](master_fix_plan/tasks/008-ux-a11y-perf-backlog.md) · [UX detail](active/final_release/10_ux_improvements.md) · [A11y/Perf detail](active/final_release/11_accessibility_and_performance.md)
  - [x] A4 icon-button aria-labels · A6 live regions · A7 JsonSchemaForm labels · A8 StatusOrb `role=img` · A10 landmarks
  - [x] P7 interval hygiene · P8 bundle chunking · P9 mega-payload debounce · P10 model warm-holding spike *(source doc 11 still shows these `[ ]` — sync the doc)*
  - [ ] A5 keyboard drag-reorder *(deferred — no Framer Motion public API)*
  - [ ] A11 `--text-muted` contrast fix
  - [ ] A12 `prefers-reduced-motion` guards
  - [ ] U1 undo toasts · U2 focus management · U4 startup experience
  - [ ] U5 queue-drawer affordances · U6 guided failure recovery · U7 ActionMenu correctness
  - [ ] U11 resync→queue flow · U12 cancel single queued job
  - [ ] U13 first-run onboarding · U14 route transitions
  - [ ] U15 navigation design review · U16 unified audio-player surface *(claimed delivered via the R1–R6 redesign; confirm, then tick doc 10)*
  - [ ] R6-T7 responsive sweep — 1280/768/420px; CastPalette @420px, Voice Lab @390px ([master_agnostic](active/master_agnostic_tasks.md))
  - [ ] Stage-5 gate ([final_release/07 §4](active/final_release/07_frontend_themes_and_responsive.md)): viewport×theme Playwright snapshots + axe contrast scans; keyboard-only walkthrough; axe/visual baseline rollout decision (owner)

  > 👁 **VISUAL CHECK — 008 A11y contrast**
  > - In dark theme: muted text (timestamps, helper labels, secondary copy) is **legible against the background** — not washed out
  > - Run `axe` in devtools on the book view and chapter editor — zero serious/critical violations

  > 👁 **VISUAL CHECK — 008 reduced-motion**
  > Enable **Reduce Motion** in your OS accessibility settings, reload:
  > - Progress bar breathing stripes are **static** (not animated)
  > - StatusOrb does not spin or pulse
  > - Page transitions are instant cuts, not slides or fades
  > - Waveform tape (if 004 is done) renders statically

  > 👁 **VISUAL CHECK — 008 UX flows** *(check each when implemented)*
  > - **U1:** Delete a segment → an **undo toast** appears with a timer and undo action
  > - **U4:** First load with no project → startup experience guides you to create one (not a blank screen)
  > - **U5:** Queue drawer has a clear affordance for opening (not hidden)
  > - **U6:** A failed render shows a **recovery action** — not just a red error state with no path forward
  > - **U13:** Brand-new install with no voices → onboarding flow explains what to do first

- [x] **009** — Security backlog — [task file](master_fix_plan/tasks/009-security-backlog.md)
  - [x] S6 WebSocket origin check · S7 rate-limiter docs · S10 secret-aware plugin settings · S11 ffmpeg quoting verified
  - [ ] S12 dep bumps at release: `vite` >7.3.4, `@babel/core`, `js-yaml` *(hygiene — not blocking)*

- [ ] **010** — Standalone plugin repos — [task file](master_fix_plan/tasks/010-standalone-plugin-repos.md) · [detail](active/final_release/05_standalone_plugin_repos.md)
  - [ ] Extract XTTS into standalone installable plugin repo
  - [ ] Extract Voxtral into standalone installable plugin repo
  - [ ] Publish official registry JSON (catalog of installable engines)
  - [ ] Paste-URL install UI (install a plugin from a git URL)
  - [ ] E2E acceptance test for the install flow + trust-warning test (5.3)
  - [ ] State/docs updates (6.1–6.3); update-flow test (5.2) *(post-v2)*
  - [ ] `synthesis_mixed` registration items (doc 05 §4.1 Group 4) *(M1 `tts_mixed` rename already done)*

  > 👁 **VISUAL CHECK — 010 complete**
  > - Open Settings → Engines (or equivalent) → paste a GitHub URL for the XTTS plugin repo
  > - Confirm the plugin installs, appears in the engine list, and can render a test segment
  > - Verify the registry card shows name, version, and description from the repo manifest

---

## Milestone 5 — Release *(owner-run, last)*

- [ ] **011** — Release gating — [task file](master_fix_plan/tasks/011-release-gating.md) · [release sequence](active/final_release/08_release_sequence.md)
  - [ ] Stage 1 (owner): manual XTTS / Voxtral / mixed render verification session
  - [ ] Stage 1 (owner): site-redesign live-app validation items 1–18 + manually verify fixed-but-pending Phase-11 behaviors ([site_redesign 99](reference/site_redesign_rollout/99_progress_log.md))
  - [ ] Stage 2: doc-06 cleanup checkpoint + Phase-11 closeout + doc-01 plan-file corrections (P-4 casting header, P-5 SDK directory-naming note, P-6 settings cross-ref)
  - [ ] Stage 4: voice metadata Phase G (→ 007) + standalone repos (→ 010) complete
  - [ ] Stage 5: perf P1–P6 confirmed; final broad `pytest` gate; axe baseline decision
  - [ ] Stage 6: author missing specs SP2 `plugin-contract.md`, SP3 `voice-bundles.md`, SP5 `progress-presentation.md`, SP7 `install-distribution.md` ([final_release/18](active/final_release/18_canonical_specs.md)) — prereqs to SP9
  - [ ] Stage 6: wiki — W1/W3/W4 (doc-01 items: WAV/MP3 callout, responsive/theming/plugin-distro pages, Mixed Generation concept) *(W5–W20 already done)*; refresh 12 stale wiki screenshots
  - [ ] Stage 6: demo/showcase + `v1.html` screenshot refresh to current 2.0 UI; R6-T10 dead-code retirement (supervised, full-suite run)
  - [ ] Stage 6: Pinokio PK3 (publish wrapper — owner) · PK7 (demo bundle refresh, needs 007) · PK8 (smoke test macOS+Windows) · PK5/PK6/PK9/PK10 (update-flow hardening, deep-reset, version-pinning, bash-only doc)
  - [ ] Stage 6: SP9 spec-conformance cross-check pass *(gates the tag)*
  - [ ] Stage 6: release notes + install matrix + v2.0.0 tag
  - [ ] Stage 6 cleanup: strip planning scaffolding before squash merge; **before deleting spec-cited plans, repoint provenance** — specs link into `site_experience_north_star.md` (×9), `audio_player_scrubbing_waveform_proposal.md` (×3), the `v2_*` set, `site_redesign_rollout/`, `phases/phase_12_multilingual_*`

  > 👁 **VISUAL CHECK — Stage 1 (owner-run render verification)**
  > Run these in the live app — not tests, not the demo:
  > - **XTTS cold render:** queue a chapter with XTTS from a cold start — confirm the model-load preparing state shows, then synthesis begins with a correct ETA
  > - **Voxtral render:** queue a chapter with Voxtral — no preparing state, synthesis starts immediately, ETA is accurate
  > - **Mixed render:** queue a chapter with mixed XTTS+Voxtral groups — XTTS groups show preparing, Voxtral groups skip straight to working; overall progress and ETA are coherent
  > - **Cancel mid-render:** cancel a running job — confirm the queue clears cleanly, no orphan processes
  > - **Concurrent renders:** queue two books simultaneously — confirm fairness / priority mode behaves as configured

  > 👁 **VISUAL CHECK — Stage 6 demo + screenshots**
  > - Open `docs/demo/` in a browser — confirm it loads, all stages work, no broken assets
  > - `v1.html` screenshots reflect the current 2.0 UI (not old pre-redesign screenshots)
  > - Pinokio wrapper (PK8): fresh install on macOS → app launches, home screen loads, can create a project

---

## Unscheduled — design decisions pending

These plans exist but need a design/owner call before they become schedulable work.

- [ ] **Chapter editor art-program** — Mode≠View≠Panel palette redesign — [exploration doc](../workflows/chapter-editor-modes.md)
  - [ ] Design decision: what is the paint unit? (segment / sentence / word span)
  - [ ] Design decision: mutation-batching approach to fix 409 revision-conflict bug (B2) during drag-paint
  - [ ] Design decision: "unlock editing" guard for Edit mode vs one-tap peer of Voices/Read
  - [ ] Design decision: quasimode (hold Space in Voices → temporarily Read) — ship in v1?
  - [ ] Design decision: primary persona (Nontechnical Author vs Power User defaults; cast-panel pinned default)
  - [ ] Design decision: flag follow-through depth (written notes + session persistence vs margin pins only)
  - [ ] *After decisions:* a11y keyboard model — roving-tabindex composite manuscript, `C+N` keyboard load-brush, `Shift+Arrow` range select *(hard requirement, not optional)*
  - [ ] *After decisions:* dyslexia reading layer (`D` toggle: wider spacing, ~65ch column, optional dyslexia face, desaturated tints)
  - [ ] *After decisions:* build left-rail palette (Voices / Read / Edit modes + keyboard shortcuts `V`/`R`/`E`)
  - [ ] *After decisions:* Voices mode paint gestures (load brush, drag-paint, variation as brush tip, eyedropper, eraser)
  - [ ] *After decisions:* Read mode (karaoke highlight, tap-to-play, flag-a-line, speed control, auto-scroll)
  - [ ] *After decisions:* Edit Text mode (replaces Source-Text tab; commit → Resync Preview)
  - [ ] *After decisions:* ambient render pill in top bar (visible across all modes)
  - [ ] *After decisions:* kill Script/Source-Text tab pair; kill per-span inline dropdowns; unify generate actions

  > 👁 **VISUAL CHECK — chapter editor art-program complete**
  > Open a chapter in the editor:
  > - A **left-rail palette** is visible with Voices / Read / Edit icons; the active mode is unambiguously highlighted
  > - Pressing `V` / `R` / `E` switches modes instantly; mode label shown in the header
  > - **Voices mode:** click a character in the Cast panel → cursor changes to a paint cursor; click a text span → it takes that character's color; drag across spans → paints a run in one gesture
  > - **Read mode:** page dissolves to a clean reading column; tap any line → audio plays from that point; karaoke highlight follows the playhead
  > - **Edit mode:** text becomes editable; tints stay visible but spans aren't click-targets; committing shows the Resync Preview diff
  > - Switch modes rapidly — scroll position, playback position, and assignments are all preserved across every switch

- [ ] **HuggingFace voice browse + upload** — [plan](active/v2_huggingface_voice_interface.md)
  - [ ] Import flow: search HF Hub → inspect card + license → consent gate → download → build voice asset → annotate metadata
  - [ ] Browse/search UI: card UI filtered to `audiobook-studio-voice` tag
  - [ ] Export: bundle generator → `.asvoice.zip` for manual upload
  - [ ] Upload to HF: push loose files via user token; auto-set `as-*` tags
  - [ ] Token handling: optional, stored as secret, never logged or bundled
  - [ ] Design decision: full in-app browse UI vs paste-a-Hub-ID/URL for the first version
  - [ ] Shared `VoiceProvenance` data-model field + migration (also required by AI casting below)

  > 👁 **VISUAL CHECK — HuggingFace voice UI complete**
  > - Voice Lab → "Browse Hugging Face" → search returns voice cards with name, author, license badge, and a sample preview
  > - A voice with a restrictive license (non-commercial) shows a **warning badge** — not blocked, just flagged
  > - Clicking Import → consent dialog appears → confirm → voice appears in the library with pre-filled metadata from the HF card
  > - Export a voice → `.asvoice.zip` downloads correctly and contains the expected bundle structure
  > - HF token (if entered) is **not visible** anywhere in settings after saving — stored as a secret

- [ ] **AI casting + voice metadata UI** — [plan](active/v2_voice_metadata_and_casting.md)
  - [ ] Extend `VoiceProfile`: `icon_path`, `description`, `attributes`, `tags`, `provenance`, `language_primary`
  - [ ] `VoiceAttributes` controlled vocab: class, gender, age, accent, tone, timbre, pace, use_case, quality
  - [ ] Casting card: machine-readable serialization of a voice for AI scoring
  - [ ] Casting contract: ranked recommendation output with `reason` per pick (never auto-apply)
  - [ ] Voice Lab UX: icon/chip card view, edit panel, "Suggest voices for this character" action
  - [ ] Design decision: per-character multi-language handling in v1?
  - [ ] Design decision: in-app casting at release or fast-follow?

  > 👁 **VISUAL CHECK — AI casting complete**
  > - Voice Lab: each card shows **icon, name, attribute chips** (gender, age, accent), and a short description
  > - Edit a voice → can upload a 1:1 icon (cropped), write a description, and set attributes from controlled dropdowns
  > - In the chapter editor, right-click a character → **"Suggest voices"** → a ranked list appears with a one-line reason per voice
  > - Selecting a suggestion assigns it — it does **not** auto-assign without confirmation
  > - A voice with no structured attributes still appears in suggestions, with a lower confidence label

---

## Deferred / post-v2.0

- [ ] **012** — Localization + sub-sentence assignment — [task file](master_fix_plan/tasks/012-deferred-and-open-questions.md)
  - [ ] Localization: pick i18n library, implement `frontend/src/i18n/`, wire committed source catalogs *(post-v2)*
  - [ ] Sub-sentence speaker assignment ([proposals/sub_sentence](proposals/sub_sentence_speaker_assignment.md)): segments→spans model, backend vs frontend split, undo — **must land before render-group/safe-text packing is finalized** (write the packing pipeline span-aware from day one); shares the DB model with W-PERF
  - [ ] Cross-ref: the HF voice + AI casting product backlog (Unscheduled, above) is the post-v2 product surface tracked here; north-star Phase D (Review waveform annotations→re-renders, loudness QA) is future work in [site_experience_north_star](reference/site_experience_north_star.md)

---

*Legend: `[x]` done · `[~]` partially done · `[ ]` not started · `*(deferred)*` owner-gated*
*`👁 VISUAL CHECK` = human verification required — tests cannot substitute*
