# Post-2.0 Backlog

**The single place to record post-release ideas.** Nothing here gates the v2.0.0 release
(see `active/final_release/08_release_sequence.md`'s "Post-release backlog" section, which
points here). Items are captured as they come up — during a bug investigation, a feature
request, an owner aside — even before they're scoped. Scoping/prioritizing happens later,
when the owner picks an item to actually schedule; at that point it graduates into a real
plan under `active/` and gets a line in `TASKS.md`.

This file replaces the "Part 2 — Product opportunities" list that used to live inside
`active/final_release/12_security_and_opportunities.md` (that doc's Part 2 section now just
points here, so the backlog isn't split across two files).

Owner directive (2026-07-14, when this file was created): "clean break" and versioned-contract
policies in `CLAUDE.md` describe pre-release engineering discipline — they say nothing about
what to build after v2.0.0 ships. Post-release scope is a separate, open list; this doc is
where it accumulates.

---

## Concurrency / rendering

- **Dynamic VRAM/CPU-aware concurrency auto-throttle** — captured 2026-07-14. Context: XTTS's
  manifest `max_concurrent_workers` ceiling was raised 2 → 8 (see
  `design-docs/specs/system-architecture.md` changelog 1.7.1) so the user's own
  `tts_parallel_cap`/`tts_engine_caps` setting is now the real, self-explorable lever for how
  many concurrent XTTS warm workers run — each additional worker loads its own model copy into
  VRAM, so a too-high setting risks OOM. Owner's own framing: "it would be nice to have it
  monitor the existing CPU and VRAM, and if VRAM gets too high it could start dropping the
  parallel segment rendering, dynamically adapted" — explicitly flagged by the owner as future
  scope, not part of that fix. Shape not yet decided: candidates include live VRAM/CPU sampling
  feeding into `resolve_effective_cap` (`app/orchestration/scheduler/cap_settings.py`) so the
  *effective* cap can drop below the user's configured max under memory pressure and recover
  as pressure eases, surfaced in the UI so a throttle-down is visible rather than a silent stall.
- **Per-chapter (not just global) concurrency cap** — captured 2026-07-14, owner question:
  "does the max concurrent setting apply to each parallel chapter, or is it an overall count?"
  Current behavior (confirmed in code): `tts_parallel_cap`/`tts_engine_caps` is enforced by a
  single process-wide semaphore keyed by `engine_id`
  (`get_engine_id_semaphore`/`get_engine_semaphore`, `app/orchestration/scheduler/resources.py:397-429`)
  — one shared counter across the whole app, not one per chapter/job. So `tts_parallel_cap=2`
  with 2 chapters queued simultaneously means 2 segments total render concurrently across both
  chapters combined (they compete for the same 2 slots), not 2 per chapter (4 total). Owner
  deferred deciding whether this should change — a future option would be a per-chapter-aware
  cap (e.g. "N concurrent segments per chapter, up to M chapters in parallel") — to a future
  decision, not scoped or committed to. If pursued, this interacts with the VRAM-auto-throttle
  item above (both would touch `resolve_effective_cap` / the admission path in `resources.py`).
- **Settings UI silent-clamp warning** — captured 2026-07-14. When a requested concurrency
  setting (`tts_parallel_cap` / `tts_engine_caps`) is clamped by a manifest ceiling or the
  global backstop (`MAX_GLOBAL_CONCURRENT_SYNTHESIS`), nothing in Settings → General or the
  Engines page tells the user their input had no effect — `resolve_effective_cap` just silently
  returns the lower value. Worth a small UI affordance (e.g. show the *effective* value next to
  the requested one, or a tooltip/warning when they differ).

## Plugin installation

- **Auto-isolated venv for GitHub/zip-installed plugins with conflicting deps** — captured
  2026-07-14, owner question: "how are we handling GitHub plugin installs — don't we need a
  restart, like Stable Diffusion does?" Investigated and confirmed: install already does NOT
  require a restart — `plugin_staging.confirm_staged_plugin()` moves the staged repo into
  `plugins/` and calls `server.load_plugins()` in-process
  (`app/tts_server/plugin_staging.py:427-464`), and `POST /engines/{engine_id}/install`
  (`app/tts_server/server.py:361`) runs `pip install -r requirements.txt` into the same running
  venv, both live, no process restart. The existing "Restart server" button
  (`ServerDiagnostics.tsx`, `watchdog.restart()`) only bounces the TTS Server subprocess when
  actually needed — same shape as SD WebUI's "soft restart" (self-exec), not a full app relaunch.
  The real gap: nothing auto-detects when a newly installed plugin's `requirements.txt` has
  packages that conflict with (or are simply too heavy to share) the main venv — today that's
  solved per-plugin by hand (XTTS gets its own `~/xtts-env` and runs its warm workers as a
  separate subprocess, `plugins/tts_xtts/plugin/core/warm_worker.py`). A live-installed GitHub
  plugin with similarly heavy/conflicting deps has no equivalent automatic isolation. Candidate
  shape: at `preview_github`/`preview_plugin` time, diff the plugin's `requirements.txt` against
  the main venv's installed packages (version conflicts, or a size/GPU-library heuristic) and
  offer to provision a dedicated venv + subprocess bridge for that plugin, mirroring the XTTS
  pattern, instead of installing into the shared venv. Not scoped or estimated — needs a design
  pass on the conflict-detection heuristic before sizing.

## From doc 12 Part 2 (moved 2026-07-14, unedited)

Ranked by value-for-effort for the audiobook-author audience:

1. **ACX loudness QA + normalization (M)** — ffmpeg `loudnorm` analysis per chapter, pass/warn/fail column, optional EBU R128 normalize at assembly. Makes Studio output upload-ready for Audible/ACX. Lives in `app/engines/audio_qa.py` + assembly option.
2. **Voice A/B audition panel (S–M)** — render one test sentence across 2–4 variants in parallel, inline compare/accept. Natural fit with the casting work in `active/final_release/04_voice_metadata_and_tagging.md`.
3. **Keyboard-driven render loop (S)** — shortcuts for render-segment / play-last / next / flag in the Chapter Editor; frontend-only. Pairs with doc 10 U5.
4. **Silence trim & breath control (S)** — `silenceremove` post-step with per-project aggressiveness setting.
5. **Pronunciation lexicon (M)** — per-project + global word→pronunciation map applied pre-synthesis; "test pronunciation" button in the Voice Lab. Huge for fantasy/technical names.
6. **Diff-aware re-render (M)** — hash rendered text per segment; after edits queue only changed segments. Extends the existing revision-safe artifact model.
7. **Dialogue detection & cast suggestions (M)** — regex/light-NLP speaker attribution feeding the Characters tab and the doc 04 casting recommendations, no cloud LLM required.
8. **Onboarding tour (S)** — first-run guided path to first audio; complements doc 10 U13.
9. **Local insights dashboard (S)** — words/hours produced, render speed trends, voice usage; all from existing DB, zero telemetry.
10. **Listening review mode with annotations (L)** — waveform playback, timestamped issue notes that convert to re-render jobs. The biggest workflow gap, but large.
    - *First step (owner request, 2026-06-11):* a **waveform visualization spike** — determine what's needed to render a waveform with a playhead bar on the VCR-style segment player (and anywhere else audio appears), level of effort, and where it's practical (short segment audio: yes; very long chapter audio: evaluate downsampled peaks or skip). Spike only — no implementation commitment yet.
11. **Project templates (S)** — save/restore structure + cast + settings for series authors.
12. **Export presets (M)** — named ACX/podcast/M4B/custom output configs at assembly.
13. **Crash-recovery checkpoints (M)** — persist task state periodically; on boot offer resume/discard for interrupted jobs (extends existing startup reconciliation).
14. **SSML-lite performance markup (M–L)** — `[pause:1s]`, `[whisper]` inline tags normalized to a `SpeakAnnotation` model; engines declare support via manifest capabilities (slots into the doc 02 contract).

## Other post-release items already tracked elsewhere (not duplicated here)

- Doc 05's deferred rename (`plugins/` → `tts_engines/`) — tracked in `active/master_agnostic_tasks.md`.
- Doc 11 P8–P9 performance leftovers, doc 12 S-hardening beyond the release blockers, plugin signing — tracked in `active/final_release/`.
