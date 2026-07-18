# Remaining Tasks & Verification Needed

**The single place to check for what's still open before v2.0.0 ships.** Everything here is
either unfinished code, an owner design decision blocking further work, or a `👁 VISUAL CHECK`
that requires a human to look at the live app — tests cannot substitute for these. Completed work
is summarized in [COMPLETED_WORK.md](COMPLETED_WORK.md); anything post-release belongs in
[FUTURE_WORK.md](FUTURE_WORK.md) instead of here.

Each item links to its detail file where one exists. Check items off in place; when a whole
section clears, delete it from here and add a line to `COMPLETED_WORK.md`.

---

## 👁 Visual checks (owner-run, code already shipped)

These are the highest-value remaining items — the code is in and gate-passed, only live
observation is missing.

- **Release gating, Stage 1** — [release sequence](active/final_release/08_release_sequence.md)
  - Manual XTTS / Voxtral / mixed render verification session: cold-load preparing state → correct
    ETA; Voxtral immediate synthesis; mixed groups show preparing only where expected; cancel
    mid-render clears cleanly; concurrent renders respect fairness/priority mode
  - Site-redesign live-app validation items 1–18 + manually verify fixed-but-pending Phase-11
    behaviors
- **W-PAR render monitor** (Phases 1–3, all code shipped 2026-07-12) — [detail](active/parallel-segment-rendering/10-phase2-render-monitor.md)
  - Real char-weighted segment blocks + failure cue on a live render, cap ≥2 (task 008)
  - Peek strip auto-appear/expand in both light and dark theme (task 011)
  - XTTS `max_concurrent_workers=4` + per-engine override → restart → confirm 4 concurrent renders
    actually occur (task 012)
  - Bracketed ETA showing a real range/"estimating…" on a live parallel render (task 013)
  - Two chapters rendering simultaneously → two independent monitor strips, light + dark (task 015)
- **Audio player + waveform scrubber** (004) — owner sign-off pending, see
  [02-roadmap.md](active/audio_player_completion_004/02-roadmap.md): scope-agnostic playback,
  segment prev/next + "Block N of M", waveform tape (open/scrub/motion toggle/minimap/zoom),
  peaks-sidecar fallback above 10min, reduced-motion static tape
- **Styling separation (005)** — owner visual sign-off still pending on the token re-skin
- **Recording cue & persona samples** — owner generates the 103 default portrait images from
  `design-docs/reference/voice-archetypes/default-portrait-prompts.md` into
  `frontend/public/archetype-portraits/`; owner live-verifies the character library end-to-end
  (picker ranking/narrowing, dev-mode copy button, mad-lib composed cue/image prompts,
  square-portrait output) — not yet done, this worktree had no local Python venv for a backend
  click-through
- **Stage 6 demo + screenshots** — `docs/demo/` loads with no broken assets; `v1.html` screenshots
  reflect the current 2.0 UI; Pinokio PK8 fresh macOS install → launches, home loads, can create a
  project

## Owner design decisions blocking further work

- **W-PERF (per-span performance metadata / casting export)** — schedule the AI extraction
  pipeline + 5-target export layer (tasks 005–012, [detail](active/performance_script_model_execution/README.md)), or hold indefinitely? Safe additive schema/format/manifest work (1–3) already shipped.
- **HuggingFace voice interface / AI casting** — per-character multi-language handling in v1?
  In-app casting at release or fast-follow? ([HF plan](active/v2_huggingface_voice_interface.md), [casting plan](active/v2_voice_metadata_and_casting.md))
- **Backend namespace (006)** — `mixed.py` → `composite.py` rename decision; `JobHandlerRegistry` /
  plugin-driven reconciliation (`engine.check_output`) decision

## Code still to write

- **W-MIX** — `StatusOrb.tsx` distinct preparing appearance (optional, not in original acceptance
  criteria)
- **Milestone 2 IA port (003)** — spans don't survive source-text resync, scoped in
  [proposals/span_resync_preservation.md](proposals/span_resync_preservation.md)
- **Milestone 3 simplification (005)**
  - `ChapterHeader.tsx` (615 lines) — last oversized split target, perf-gated
  - LF-6 `progress/service.py` `enrich()` extraction — deliberately deferred to a follow-up
    session with closer supervision (dense, numbered historical bug fixes; mechanical cut-paste risk)
  - BE-6 rename/move `app/jobs` package — deliberately deferred to its own dedicated session
    (97 refs/~40 files, widest blast radius in this phase)
  - Four-way input-class consolidation (redesign-scale, still open); U10 z-index
  - LF-1 `useStudioChapter.ts` split — blocked on DC-1a, no payoff since DC-1b closed will-not-delete
- **Milestone 3 backend namespace (006)**
  - Rename `plugins/` → `tts_engines/` — update all importers, manifests, `PLUGINS_DIR`, conftest, docs
  - Namespace block remainder: rename voice namespace, reserve `plugins/` for app-behavior
    extensions, move engine-owned tests/fixtures into bundles
  - doc-06 cleanup: `transient/` consolidation, `app/infra/subprocess` implement-or-delete,
    `app/infra/{cache,events,db}` stub decision (C-3), API error handling normalization
  - Post-release/opportunistic: react-refresh lint warnings (11, demo stages), demo transport nits
- **Milestone 4 backlog**
  - **007 taxonomy** — C6 copyable icon image-generation prompt (owner direction, separate scope)
  - **008 UX/A11y/Perf** — U4 first-run/startup experience; U13 first-run onboarding (A5 keyboard
    drag-reorder deferred, no Framer Motion public API; U7 dropped 2026-07-14, no confirmed bug)
  - **010 standalone plugin repos** — extract XTTS into its own installable repo; extract Voxtral
    into its own installable repo; E2E acceptance test for the install flow + trust-warning test
    (5.3); `synthesis_mixed` registration items (doc 05 §4.1 Group 4); state/docs updates (6.1–6.3)
    + update-flow test (5.2) *(post-v2)*
- **Chapter editor art-program** — [plan](active/chapter_editor_catalog_completion/README.md), design decisions resolved 2026-06-26, scaffold + all four tool bodies shipped 2026-07-10:
  - Cast mode: mutation-batching collector queue (prerequisite for the rest), brush size selector,
    variation 3-way toggle, Match Voice eyedropper, Stage Direction/Performance Cue + Cue Editor
  - Booth mode: annotation gutter glyphs, playback speed control, session-only margin pins
  - Revise mode: real two-way segment split on buffer overflow (needs a new backend endpoint; the
    balanced-split algorithm itself is built and unit-tested)
  - Render-on-mode-exit (queue changed segments on Cast→any switch) + ambient On Air indicator
  - Kill Script/Source-Text tab pair; kill per-span inline dropdowns; unify generate actions
  - A11y keyboard model: roving-tabindex composite manuscript, `C+N` load-brush, `Shift+Arrow`
    range select *(hard requirement)*

## Release-gating checklist (owner-run, last)

[Full detail](master_fix_plan/tasks/011-release-gating.md) · [release sequence](active/final_release/08_release_sequence.md)

- [ ] Stage 1 (owner): manual render verification + site-redesign validation (see Visual checks above)
- [ ] Stage 2: doc-06 cleanup checkpoint + Phase-11 closeout + doc-01 plan-file corrections
- [ ] Stage 4: voice taxonomy Phase G C6 + standalone plugin repo extraction complete
- [ ] Stage 5: perf P1–P6 confirmed; final broad `pytest` gate; `npm audit` re-run (hygiene, was 0
      vulns at last check)
- [ ] Stage 6: wiki — W1/W3/W4 items (WAV/MP3 callout, responsive/theming/plugin-distro pages,
      Mixed Generation concept); refresh 12 stale wiki screenshots
- [ ] Stage 6: demo/showcase + `v1.html` screenshot refresh; R6-T10 dead-code retirement
      (supervised, full-suite run)
- [ ] Stage 6: Pinokio PK3 (publish wrapper, owner) · PK7 (demo bundle refresh, needs 007) · PK8
      (smoke test macOS+Windows) · PK5/PK6/PK9/PK10 (update-flow hardening, deep-reset,
      version-pinning, bash-only doc)
- [ ] Stage 6: SP9 spec-conformance cross-check pass *(gates the tag)*
- [ ] Stage 6: release notes + install matrix + v2.0.0 tag
- [ ] Stage 6 cleanup: strip planning scaffolding before squash merge; before deleting any
      remaining spec-cited plan, repoint provenance first — specs still link into
      `reference/site_experience_north_star.md`, `reference/audio_player_scrubbing_waveform_proposal.md`,
      the `reference/v2_*` set, `reference/site_redesign_rollout/`,
      `pr-dispatch/08-video-utils-decision.md`

---

*When every item above clears and Stage 6's tag lands, this file should be empty — retire it and
say so in `COMPLETED_WORK.md` instead of leaving a stale checklist behind.*
