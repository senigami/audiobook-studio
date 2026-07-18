# Future Work / Post-2.0

**The single place for everything that comes after v2.0.0 ships.** Nothing here gates the
release — see [REMAINING_TASKS.md](REMAINING_TASKS.md) for that. Items are captured as they come
up (a bug investigation, a feature request, an owner aside) even before they're scoped. When the
owner picks one to actually schedule, it graduates into a real plan under `active/` and gets a
line in `REMAINING_TASKS.md`.

*(This file merges the former `post_release_backlog.md` and `TASKS.md`'s "Deferred / post-v2.0"
section — nothing was dropped, only combined into one list.)*

---

## Deferred from the v2.0 plan itself

- **Localization** — `i18next`/`react-i18next` chosen, `frontend/src/i18n/` scaffolded dark (zero
  side effects, not wired into app root), one sample catalog (`WelcomePage`). Repo-wide string
  extraction, provider wiring, and additional locale catalogs still outstanding.
- **Sub-sentence speaker assignment** — [proposal](proposals/sub_sentence_speaker_assignment.md),
  ~90% already built (`chapter_segments` is the span table, `_apply_range_assignment` does the
  surgical split-and-assign, Book-mode drag-select wired end-to-end; word-boundary snapping
  shipped 2026-07-17, PR #143). Remaining genuinely-unbuilt gaps, scoped in
  [proposals/span_resync_preservation.md](proposals/span_resync_preservation.md): `showSafeText`
  offset-fidelity; no executable cross-language twin-parity test for the snapping algorithm; undo
  (generic work, not span-specific); character auto-detection.
- **North Star Phase D** — Review waveform annotations → re-renders, loudness QA. Future work in
  [reference/site_experience_north_star.md](reference/site_experience_north_star.md).
- **Chapter editor art-program, post-v2 slots** — Casting Call tool slot (AI speaker detection),
  Script Supervisor tool slot, session-persistent flags with notes, plugin tool slots, dyslexia
  reading layer, narrow-viewport/mobile collapse.
- **Async-queued MP3 export** — `export_chapter_audio` is synchronous today (fine at chapter
  sizes); only worth an orchestrator-queued variant if bulk export or very-large-chapter encoding
  becomes a measured concern.
- **Audio loudness normalization / post-render polish** — genuinely unbuilt anywhere. If wanted,
  add to the shipped `wav_to_mp3`/`export_chapter_audio` chain, not a resurrected task class. (See
  also ACX loudness QA below, which is the fuller version of this idea.)

## Concurrency / rendering

- **Dynamic VRAM/CPU-aware concurrency auto-throttle** — captured 2026-07-14. XTTS's manifest
  `max_concurrent_workers` ceiling was raised 2→8 so the user's own `tts_parallel_cap`/
  `tts_engine_caps` setting is the real, self-explorable lever for concurrent XTTS warm workers —
  each additional worker loads its own model copy into VRAM, so a too-high setting risks OOM.
  Owner's framing: "monitor CPU/VRAM and dynamically drop parallel segment rendering if VRAM gets
  too high." Shape not decided: candidates include live VRAM/CPU sampling feeding into
  `resolve_effective_cap` (`app/orchestration/scheduler/cap_settings.py`) so the *effective* cap
  can drop below the configured max under memory pressure and recover as pressure eases, surfaced
  in the UI so a throttle-down is visible rather than a silent stall.
- **Per-chapter (not just global) concurrency cap** — captured 2026-07-14. Confirmed in code:
  `tts_parallel_cap`/`tts_engine_caps` is one process-wide semaphore keyed by `engine_id`
  (`get_engine_id_semaphore`/`get_engine_semaphore`,
  `app/orchestration/scheduler/resources.py:397-429`), not one per chapter/job — 2 chapters queued
  simultaneously compete for the same shared slots, not 2 slots each. A future option: a
  per-chapter-aware cap ("N concurrent segments per chapter, up to M chapters in parallel").
  Interacts with the VRAM-auto-throttle item above (both touch `resolve_effective_cap`).
- **Settings UI silent-clamp warning** — captured 2026-07-14. When a requested concurrency setting
  is clamped by a manifest ceiling or the global backstop (`MAX_GLOBAL_CONCURRENT_SYNTHESIS`),
  nothing tells the user their input had no effect — `resolve_effective_cap` just silently returns
  the lower value. Worth a small UI affordance (show the effective value next to the requested
  one, or a warning when they differ).

## Plugin installation

- **Auto-isolated venv for GitHub/zip-installed plugins with conflicting deps** — captured
  2026-07-14. Confirmed: install already does NOT require a restart —
  `plugin_staging.confirm_staged_plugin()` moves the staged repo into `plugins/` and calls
  `server.load_plugins()` in-process, and the install endpoint runs `pip install` into the same
  running venv, both live. The real gap: nothing auto-detects when a newly installed plugin's
  `requirements.txt` conflicts with (or is too heavy to share) the main venv — today that's solved
  per-plugin by hand (XTTS gets its own `~/xtts-env` + separate subprocess). Candidate shape: at
  preview time, diff the plugin's `requirements.txt` against the main venv's installed packages
  and offer a dedicated venv + subprocess bridge, mirroring the XTTS pattern. Not scoped or
  estimated — needs a design pass on the conflict-detection heuristic first.
- Doc 05's `plugins/` → `tts_engines/` rename has shipped — see `COMPLETED_WORK.md`. The remaining
  namespace scope (voice namespace rename, engine-owned test/fixture moves) is tracked in
  `REMAINING_TASKS.md`.

## Product opportunities, ranked by value-for-effort (audiobook-author audience)

1. **ACX loudness QA + normalization (M)** — ffmpeg `loudnorm` analysis per chapter, pass/warn/fail
   column, optional EBU R128 normalize at assembly. Makes Studio output upload-ready for
   Audible/ACX. Lives in `app/engines/audio_qa.py` + assembly option.
2. **Voice A/B audition panel (S–M)** — render one test sentence across 2–4 variants in parallel,
   inline compare/accept. Natural fit with the casting work in
   `active/final_release/04_voice_metadata_and_tagging.md`.
3. **Keyboard-driven render loop (S)** — shortcuts for render-segment / play-last / next / flag in
   the Chapter Editor; frontend-only.
4. **Silence trim & breath control (S)** — `silenceremove` post-step with per-project aggressiveness
   setting.
5. **Pronunciation lexicon (M)** — per-project + global word→pronunciation map applied
   pre-synthesis; "test pronunciation" button in the Voice Lab. Huge for fantasy/technical names.
6. **Diff-aware re-render (M)** — hash rendered text per segment; after edits queue only changed
   segments. Extends the existing revision-safe artifact model.
7. **Dialogue detection & cast suggestions (M)** — regex/light-NLP speaker attribution feeding the
   Characters tab and casting recommendations, no cloud LLM required.
8. **Onboarding tour (S)** — first-run guided path to first audio.
9. **Local insights dashboard (S)** — words/hours produced, render speed trends, voice usage; all
   from existing DB, zero telemetry.
10. **Listening review mode with annotations (L)** — waveform playback, timestamped issue notes
    that convert to re-render jobs. Biggest workflow gap, but large.
    - *First step (owner request, 2026-06-11):* a waveform visualization spike — determine what's
      needed to render a waveform with a playhead bar on the VCR-style segment player, level of
      effort, and where it's practical (short segment audio: yes; very long chapter audio:
      evaluate downsampled peaks or skip). Spike only, no implementation commitment yet.
11. **Project templates (S)** — save/restore structure + cast + settings for series authors.
12. **Export presets (M)** — named ACX/podcast/M4B/custom output configs at assembly.
13. **Crash-recovery checkpoints (M)** — persist task state periodically; on boot offer
    resume/discard for interrupted jobs (extends existing startup reconciliation).
14. **SSML-lite performance markup (M–L)** — `[pause:1s]`, `[whisper]` inline tags normalized to a
    `SpeakAnnotation` model; engines declare support via manifest capabilities.

---

*Owner directive (2026-07-14, when the backlog file this merges from was created): the "clean
break" and versioned-contract policies in `CLAUDE.md` describe pre-release engineering discipline
— they say nothing about what to build after v2.0.0 ships. Post-release scope is this separate,
open list.*
