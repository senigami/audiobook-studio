# Completed Work Report

**What shipped, in one place.** Full narrative history (root causes, commit hashes, live-verify
play-by-plays) lives in `wiki/Changelog.md`; this is the compact "what's actually done" summary
for release sign-off. Anything still open is in [REMAINING_TASKS.md](REMAINING_TASKS.md); anything
post-release is in [FUTURE_WORK.md](FUTURE_WORK.md).

---

## Progress / ETA engine

- **W-MIX — Mixed-engine model-load progress/ETA fix.** Per-active-engine marker resolution,
  synthesis-only duration accounting, ETA suspension + per-group preparing phase, frontend
  preparing-state presentation, 5 specs reconciled. Shipped and visually confirmed on a live mixed
  XTTS+Voxtral render. (One optional item, `StatusOrb.tsx` preparing appearance, was never in
  scope and remains undone — see Remaining Tasks.)
- **W-MIX-LA — Mixed-synthesis load attribution.** Segment-tagged load-marker identity,
  load-aware ETA (`pre_load_eta`). Folded into W-MIX's spec set.

## Parallel rendering

- **W-PAR — Parallel segment rendering.** Per-engine cap + semaphores, parent/child segment
  scheduling + enable-gate, per-segment dispatch isolation, TTS-server concurrent inference,
  correctness invariants (stitch order, artifact validation, retry, heartbeat), frontend
  multi-active segments, ETA-under-parallelism + off-by-default toggle. Owner-verified live
  2026-07-10: segments and chapters both render in parallel. **Parallel rendering (cap > 1) is now
  the shipped default** (owner directive 2026-07-06).
- **Phase 2 — dedicated render monitor.** Segment inventory hydration, milestone a11y, popover
  interaction, peek strip, cap config UI, bracketed ETA wiring, live cap admission. Full green gate.
- **Phase 3 — multi-job render-monitor rows.** Every concurrently-rendering job gets its own strip,
  not just the first found.
- (5 live-render visual checks on this work remain open — see Remaining Tasks.)

## Visual redesign

- **W-QS — Quiet Studio visual redesign.** Font tokens, full token re-skin, forms/Switch,
  status/progress components, glass-surface audit, demo baseline all shipped. (One sub-task, a
  94-file `--accent`→`--action-primary` rename, is owner-gated and deferred; the alias is kept as a
  permanent compat pointer.)

## Performance / casting metadata

- **W-PERF — Per-span performance metadata, safe foundation.** Additive DB schema, canonical JSON
  format, SSML capability manifest field — all additive-only, owner-decided "safe parts now, hold
  the AI pipeline." (The AI extraction pipeline and 5-target export layer are a scheduling decision
  — see Remaining Tasks.)

## Plugin SDK

- **Stage 3 — versioned plugin SDK migration.** `synthesis_mixed` → `tts_mixed` rename; all 10
  sub-stages plus one residue fix landed.

## Foundation & IA

- **Milestone 1 — Safe base.** Dead deps/scripts removed, config consolidated
  (`.coveragerc`→`pyproject.toml`), dead frontend stubs removed, hardcoded-color fixes,
  barrel-export trim.
- **Milestone 2 — Two-level IA port.** Orphaned features wired back in (`VoiceDropzone`, Module
  Settings tab, `SearchableSelect`). Book/Chapter two-level shell (Contents/Cast/Lexicon/
  Publish/Backups), Chapter Workspace, Review redesign, Cast panel 3-tier, bookmarks, the full RST
  suite (progress bar/play/download/guards/edit/default-voice/engine-banner/segment-aware player),
  book-scope Lexicon, per-span range assignment including word-boundary snapping (PR #143). A
  previously "dead" tree (`DC-1b`) was found to have live callers and kept, not deleted. (One real
  gap remains — spans don't survive a source-text resync — see Remaining Tasks.)
- **Audio player + waveform scrubber.** Scope-agnostic single-owner player, expandable waveform
  tape (paged/moving motion, zoom presets, minimap, `m:ss` ruler), duration-cap-gated peaks
  sidecar (browser-decoded below the cap, server-sidecar above it, emitted proactively at render
  finalization), segment/block navigation fix. The "whole-book play" affordance was deliberately
  dropped as duplicative of `ContinueListeningCard`. (Owner visual sign-off still open — see
  Remaining Tasks.)

## Simplification

- **Milestone 3 — Code simplification.** Frontend dead-code removal, styling separation
  (`components.css` → an 11-file split), large-file splits including `ChapterHeader.tsx` (now a
  6-line barrel over `useChapterStatus`/`ChapterTopBar`/`ChapterScriptToolbar`), backend cleanup,
  plugin consolidation, a new shared text-ops package. (A couple of items — an `enrich()`
  extraction and a wide-blast-radius package move — were deliberately deferred to dedicated
  follow-up sessions rather than rushed; see Remaining Tasks.)
- **Backend namespace & code-org.** `plugins/` → `tts_engines/` rename fully shipped (111 tracked
  files under `tts_engines/`; `PLUGINS_DIR` resolves there by default — the old `plugins/` path
  that may still appear on a local disk is untracked runtime state, not part of the repo).
  `speakers.py` decomposition, API router sub-package restructure, dev-only route gating,
  `App.tsx` split, input-style unification, Phase-12 owner decisions, `MobileNavDrawer`
  focus-trap, plugin docs, a Vite dev-server triage, a large-book load-timing fix. (A voice
  namespace rename and a few doc-cleanup items remain — see Remaining Tasks.)

## Feature & polish backlog

- **Voice taxonomy v2, Phase G.** `language`/`style` attributes, Edit Metadata UI, HuggingFace tag
  mappings, taxonomy schema bumped 1.0→2.0.
- **UX / A11y / Perf backlog.** All scoped accessibility items, all scoped performance items,
  contrast + reduced-motion fixes, the full UX punch list, a responsive sweep, and an axe a11y gate
  — all landed. (One item, `U7` ActionMenu correctness, was dropped from scope after finding no
  confirmed bug; two first-run/onboarding items remain — see Remaining Tasks.)
- **Security backlog.** All scoped hardening items done; dependency audit clean at last check.
- **Standalone plugin repos.** Official registry JSON + paste-URL install UI shipped. (Extracting
  XTTS/Voxtral into their own repos and the install-flow E2E test remain — see Remaining Tasks.)

## Chapter editor art-program

- **Director's Console** (Cast/Booth/Revise/Write mode switcher) — design decisions resolved
  2026-06-26, scaffold + wiring + all four tool bodies shipped 2026-07-10. (A real catalog of
  follow-on polish items per mode remains — see Remaining Tasks.)
- **Dynamic recording-guide prompts.** "Suggest from voice qualities" scores a voice's tagged
  attributes against 39 curated archetypes and suggests a recording prompt/sample text.
- **Recording cue & persona sample expansion.** Mad-lib cue composer, filtered character-library
  ranking, square-portrait image prompts, character library expanded 39→103 archetypes across 8
  genre buckets, dev-mode-gated portrait-prompt export tooling. Established repo-wide convention:
  `useDevMode()` gates contributor-only/in-progress/beta tooling, not just debugging. **NOT
  complete — the owner's portrait-image generation and a live end-to-end verification are still
  outstanding, so the source plan stays in place until then** (see Remaining Tasks).
- **HuggingFace voice browse + upload.** Code + endpoints landed (import/browse/export/upload/
  token-handling/provenance; spec `voice-bundles.md` 1.3.0–1.9.0, 2026-07-03/07-12). **NOT yet
  owner-signed-off — untested end-to-end; treated as built-but-unverified, not shipped.** See
  Remaining Tasks. *(Corrected 2026-07-18: the earlier "all shipped/live" claim was overstated.)*
- **AI casting + voice metadata UI.** **NOT shipped — marked future in the app, currently
  placeholder UI.** The taxonomy-driven attribute scoring exists, but the AI-casting surface is a
  placeholder pending an owner scope decision (see Remaining Tasks / Future Work). *(Corrected
  2026-07-18: the earlier "all shipped" claim was wrong — this belongs under future work, not
  completed.)*
- **Voice-variant version history.** Filesystem-based `versions/` schema per variant,
  non-destructive rebuild snapshots, promote-to-active, A/B panel.
- **Voice variant tagging + IA redesign.** Per-variant `performance_tags`, count-based variant
  switcher, default-variant star, restored icon-prompt affordance, consolidated overflow menu.

## Cleanup along the way

- `app/domain/demo_bundle.py` launcher path bug fixed (was silently skipping demo-library install).
- `ExportTask`/`BakeTask` deleted as redundant with the shipped `AssemblyTask`/
  `export_chapter_audio` paths; a latent M4B double-extension bug found and fixed during the
  comparison.
- `app/engines/video_utils.py`'s `generate_video_sample()` shipped as "Export Video Sample."
- Voice catalog grid virtualization — investigated and declined 2026-07-15: the "40-100+ voices"
  premise traced to a persona doc that was actually about the *projects* list, not voices. Revisit
  trigger: a real workspace reporting 150+ voices with observed jank.

## Documentation consolidation (this pass)

- Deleted ~150 completed-plan files from `_archive/` and 10 of 11 merged-PR briefs from
  `pr-dispatch/` — narrative history now lives in `wiki/Changelog.md`.
- Deleted 3 more completed plan folders that were only being kept for a spec citation
  (`audio_player_waveform_scrubber/`, `huggingface_voice_upload/`, `synced_reader/`) and repointed
  those citations at the wiki.
- Fixed a pre-existing broken spec link (`voice-bundles.md` → `final_release/04_voice_metadata_and_tagging.md`).
- Replaced the old sprawling `TASKS.md` (823 lines, status + history + backlog all mixed together)
  with this three-document split: `REMAINING_TASKS.md`, `FUTURE_WORK.md` (merged with the former
  `post_release_backlog.md`), and this file.
