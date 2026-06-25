# Studio 2.0 Work Order

Epic-level checklist with individual tasks indented beneath each epic. One line per task — full detail lives in the linked files.

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

- [ ] **W2** — Synthesis-only duration; orchestrator sole writer ← *next* — [task 002](active/mixed-synthesis-fused-proposal/tasks/002-synthesis-only-duration-single-writer.md)
  - [ ] `tts_mixed/handler.py`: remove load-inclusive `synthesis_duration_seconds` from final `update_job`
  - [ ] `tts_mixed/handler.py`: remove competing `record_engine_sample` call (orchestrator is sole writer)
  - [ ] `orchestrator_helpers.py`: gate `segment_announced` fallback — only use when no load window exists
  - [ ] `orchestrator_helpers.py`: verify `_record_render_stats_inner` sources synthesis-only duration
  - [ ] `performance.py`: regression test pinning `model_load_seconds` out of CPS

- [ ] **W3** — ETA suspension + per-group preparing phase (serial after W2) — [task 003](active/mixed-synthesis-fused-proposal/tasks/003-eta-suspension-preparing-phase.md)
  - [ ] `orchestrator_publish.py`: null `eta_seconds` clears persisted ETA (explicit clear path)
  - [ ] `orchestrator_helpers.py`: force-emit preparing frames with `indeterminate=true`, cleared ETA, `status="running"`
  - [ ] Verify ETA resumes fresh from zero at engine confirmation (no stale-value snap)

- [ ] **W4** — Frontend preparing-state presentation (after W3) — [task 004](active/mixed-synthesis-fused-proposal/tasks/004-frontend-preparing-presentation.md)
  - [ ] `live-jobs.ts`: derive and surface `is_preparing` / `indeterminate` onto overlay delta
  - [ ] `useStudioChapter.ts`: add `chapterRenderPreparingSegmentIds`; subtract from rendering set
  - [ ] `ScriptView.tsx`: add `preparing` tier (`data-render-status="preparing"`, no render cursor)
  - [ ] `ChapterHeader.tsx`: pass `reasonCode` into `buildSegmentProgressBarProps`
  - [ ] `predictiveProgressBarHelpers.ts`: relabel indeterminate window "Preparing… / Loading voice model…"
  - [ ] `StatusOrb.tsx`: distinct preparing appearance *(optional)*

- [ ] **W5** — Mixed `ResourceClaim` *(deferred — owner-gated)*

- [ ] **W6** — Spec reconciliation — [task 005](active/mixed-synthesis-fused-proposal/tasks/005-spec-reconciliation.md)
  - [ ] `live-events.md` → 1.7.0: document mixed marker resolution + load-window frame contract
  - [ ] `progress-presentation.md` → 1.6.0: segment-granularity preparing tier, remove 120s lane, ETA suspend/resume
  - [ ] `queue-jobs.md` → 1.5.0: clarify per-group phase vs monotonic durable status
  - [ ] `data-model.md` → 1.5.0: note synthesis-only clock + orchestrator sole-writer contract
  - [ ] `system-architecture.md` → 1.3.0 *(only if W1 added explicit handler marker — else no change)*

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

- [ ] **004** — Audio player + waveform scrubber — [task file](master_fix_plan/tasks/004-audio-player-completion.md) · [scrubber plan](active/audio_player_waveform_scrubber/README.md) · [scrubber tasks](active/audio_player_waveform_scrubber/tasks/)
  - [ ] W1: make player scope-agnostic — remove `altScope`/`switchScope`, implement `fitsLegibly()`
  - [ ] RST-8: teach player the segment model for block navigation (uses segment logic from `useStudioChapter`)
  - [ ] W2 (tasks 006–009): port `WaveformTape` renderer, zoom/minimap/ruler, `PlayerBar` integration, CSS + tests
  - [ ] W3 (tasks 010–012): peaks source abstraction, backend sidecar emission, source-swap + virtualization

---

## Milestone 3 — Simplification

- [ ] **005** — Code simplification — [task file](master_fix_plan/tasks/005-code-simplification.md) · [simplification plan](active/simplification/00_overview.md)
  - [ ] FE dead-code removal ([simplification/02](active/simplification/02_frontend_dead_code_removal.md)) — DC-1b gated on 004
  - [ ] Styling separation ([simplification/03](active/simplification/03_styling_separation.md)): QW-6 dead CSS, U3 type scale, U9 button/input system, U10 z-index source
  - [ ] Large-file splits ([simplification/04](active/simplification/04_large_file_splits.md)): `scriptViewProgress.ts`, `state_jobs.py`, `speakers.py`, `plugin_loader.py`
  - [ ] Backend cleanup ([simplification/05](active/simplification/05_backend_cleanup.md)): speakers decomposition, router restructure, legacy engine-path deletions
  - [ ] Plugin SDK consolidation ([simplification/06](active/simplification/06_plugin_consolidation.md)): document/unify `to_bridge_request`; do NOT delete xtts adapter (INV-5)

- [ ] **006** — Backend namespace rename + code-org — [task file](master_fix_plan/tasks/006-backend-namespace-and-codeorg.md) · [agnostic tasks](active/master_agnostic_tasks.md)
  - [ ] Rename `plugins/` → `tts_engines/` — update all importers, manifests, `PLUGINS_DIR`, conftest, docs
  - [ ] Finish `speakers.py` decomposition (if not done in 005)
  - [ ] API router sub-package restructure
  - [ ] `MobileNavDrawer` focus-trap fix (a11y — also tracked in 008)
  - [ ] `CONTRIBUTING.md` plugin docs
  - [ ] Vite ECONNRESET triage + large-book load timing check

---

## Milestone 4 — Feature + polish backlog

- [ ] **007** — Voice taxonomy v2 Phase G — [task file](master_fix_plan/tasks/007-voice-taxonomy-v2.md) · [detail](active/final_release/04_voice_metadata_and_tagging.md)
  - [ ] Add `language` (multi-select), `accent` (single), `style` (multi) attributes
  - [ ] UI: category-tinted pills + "+N" overflow (absorbs U8)
  - [ ] HF tag mappings (`as-<section>-<id>`) for new attributes
  - [ ] Bump `voice-taxonomy.json` + `voice.schema.json` with changelog

- [~] **008** — UX / A11y / Perf backlog — [task file](master_fix_plan/tasks/008-ux-a11y-perf-backlog.md) · [UX detail](active/final_release/10_ux_improvements.md) · [A11y/Perf detail](active/final_release/11_accessibility_and_performance.md)
  - [x] A4 icon-button aria-labels · A6 live regions · A7 JsonSchemaForm labels · A8 StatusOrb `role=img` · A10 landmarks
  - [x] P7 interval hygiene · P8 bundle chunking · P9 mega-payload debounce
  - [ ] A5 keyboard drag-reorder *(deferred — no Framer Motion public API)*
  - [ ] A11 `--text-muted` contrast fix
  - [ ] A12 `prefers-reduced-motion` guards
  - [ ] U1 undo toasts · U2 focus management · U4 startup experience
  - [ ] U5 queue-drawer affordances · U6 guided failure recovery · U7 ActionMenu correctness
  - [ ] U11 resync→queue flow · U12 cancel single queued job
  - [ ] U13 first-run onboarding · U14 route transitions

- [x] **009** — Security backlog — [task file](master_fix_plan/tasks/009-security-backlog.md)
  - [x] S6 WebSocket origin check · S7 rate-limiter docs · S10 secret-aware plugin settings · S11 ffmpeg quoting verified
  - [ ] S12 dep bumps at release: `vite` >7.3.4, `@babel/core`, `js-yaml` *(hygiene — not blocking)*

- [ ] **010** — Standalone plugin repos — [task file](master_fix_plan/tasks/010-standalone-plugin-repos.md) · [detail](active/final_release/05_standalone_plugin_repos.md)
  - [ ] Extract XTTS into standalone installable plugin repo
  - [ ] Extract Voxtral into standalone installable plugin repo
  - [ ] Publish official registry JSON (catalog of installable engines)
  - [ ] Paste-URL install UI (install a plugin from a git URL)
  - [ ] E2E acceptance test for the install flow

---

## Milestone 5 — Release *(owner-run, last)*

- [ ] **011** — Release gating — [task file](master_fix_plan/tasks/011-release-gating.md) · [release sequence](active/final_release/08_release_sequence.md)
  - [ ] Stage 1 (owner): manual XTTS / Voxtral / mixed render verification session
  - [ ] Stage 2: doc-06 cleanup checkpoint + Phase-11 plan-file checkpoint
  - [ ] Stage 4: voice metadata Phase G (→ 007) + standalone repos (→ 010) complete
  - [ ] Stage 5: perf P1–P6 confirmed; axe baseline decision
  - [ ] Stage 6: wiki corrections (W1/W3/W4 + itemized W5–W20 set)
  - [ ] Stage 6: demo/showcase + `v1.html` screenshot refresh to current 2.0 UI
  - [ ] Stage 6: Pinokio PK3 (publish wrapper — owner) · PK7 (demo bundle refresh, needs 007) · PK8 (smoke test macOS+Windows)
  - [ ] Stage 6: SP9 spec-conformance cross-check pass *(gates the tag)*
  - [ ] Stage 6: release notes + install matrix + v2.0.0 tag
  - [ ] Stage 6 cleanup: strip planning scaffolding before squash merge; repoint spec citations that link into deleted plan folders

---

## Unscheduled — design decisions pending

These plans exist but need a design/owner call before they become schedulable work.

- [ ] **Chapter editor art-program** — Mode≠View≠Panel palette redesign — [exploration doc](../workflows/chapter-editor-modes.md)
  - [ ] Design decision: what is the paint unit? (segment / sentence / word span)
  - [ ] Design decision: mutation-batching approach to fix 409 revision-conflict bug (B2) during drag-paint
  - [ ] Design decision: "unlock editing" guard for Edit mode vs one-tap peer of Voices/Read
  - [ ] Design decision: quasimode (hold Space in Voices → temporarily Read) — ship in v1?
  - [ ] *After decisions:* build left-rail palette (Voices / Read / Edit modes + keyboard shortcuts `V`/`R`/`E`)
  - [ ] *After decisions:* Voices mode paint gestures (load brush, drag-paint, variation as brush tip, eyedropper, eraser)
  - [ ] *After decisions:* Read mode (karaoke highlight, tap-to-play, flag-a-line, speed control, auto-scroll)
  - [ ] *After decisions:* Edit Text mode (replaces Source-Text tab; commit → Resync Preview)
  - [ ] *After decisions:* ambient render pill in top bar (visible across all modes)
  - [ ] *After decisions:* kill Script/Source-Text tab pair; kill per-span inline dropdowns; unify generate actions

- [ ] **HuggingFace voice browse + upload** — [plan](active/v2_huggingface_voice_interface.md)
  - [ ] Import flow: search HF Hub → inspect card + license → consent gate → download → build voice asset → annotate metadata
  - [ ] Browse/search UI: card UI filtered to `audiobook-studio-voice` tag
  - [ ] Export: bundle generator → `.asvoice.zip` for manual upload
  - [ ] Upload to HF: push loose files via user token; auto-set `as-*` tags
  - [ ] Token handling: optional, stored as secret, never logged or bundled

- [ ] **AI casting + voice metadata UI** — [plan](active/v2_voice_metadata_and_casting.md)
  - [ ] Extend `VoiceProfile`: `icon_path`, `description`, `attributes`, `tags`, `provenance`, `language_primary`
  - [ ] `VoiceAttributes` controlled vocab: class, gender, age, accent, tone, timbre, pace, use_case, quality
  - [ ] Casting card: machine-readable serialization of a voice for AI scoring
  - [ ] Casting contract: ranked recommendation output with `reason` per pick (never auto-apply)
  - [ ] Voice Lab UX: icon/chip card view, edit panel, "Suggest voices for this character" action
  - [ ] Design decision: per-character multi-language handling in v1?
  - [ ] Design decision: in-app casting at release or fast-follow?

---

## Deferred / post-v2.0

- [ ] **012** — Localization + sub-sentence assignment — [task file](master_fix_plan/tasks/012-deferred-and-open-questions.md)
  - [ ] Localization: pick i18n library, implement `frontend/src/i18n/`, wire committed source catalogs *(post-v2)*
  - [ ] Sub-sentence speaker assignment: needs design decision (segments→spans model, backend vs frontend split, undo)

---

*Legend: `[x]` done · `[~]` partially done · `[ ]` not started · `*(deferred)*` owner-gated*
