# Studio 2.0 — Completed Work Report (v1 → v2.0)

**Purpose:** a formal, mineable record of what was *built and shipped* in the v1 → Studio 2.0
conversion and the subsequent visual redesign — for the **wiki, changelog, and release highlights**.
**Scope:** synthesizes every plan created on or before 2026‑06‑17, classified by a verified audit
(2026‑06‑19). **Status basis:** "shipped" reflects each plan's own completion markers cross‑checked
against the live code and the canonical specs. Where a subsystem is now owned by a `design-docs/specs/`
spec, that spec — not this report — is the binding contract; this report is the *narrative* of what
changed.

> **One‑line story:** Audiobook Studio was rebuilt from a single‑process v1 (in‑process worker loop,
> engine‑coupled, file‑existence truth, flat storage) into **Studio 2.0** — a two‑process app with a
> managed TTS Server, a plugin‑based engine system, a task orchestrator, reconciliation‑based state,
> nested portable storage, a centralized progress/ETA engine, and a fully redesigned routed frontend.

**Companion docs:** [README.md](README.md) (the live status index of all plans) ·
[final_release/](final_release/08_release_sequence.md) (remaining release gates) ·
`design-docs/specs/` (binding contracts).

---

## 1. Runtime architecture — single‑process → two‑process

**Shipped:**
- **Two‑process model:** a Studio process (FastAPI + SQLite + orchestrator) and a separate
  **managed TTS Server subprocess** that owns the GPU, communicating over local HTTP.
- **`tts_server.py`** entry point; **`app/tts_server/`** runtime (server, plugin_loader, health,
  verification, settings stores); **`READY:{port}`** stdout handshake.
- **Watchdog** (`app/engines/watchdog.py`): spawn → wait‑for‑READY → `/health` heartbeat → crash
  restart with circuit breaker.
- **Explicit boot sequence** (`app/core/boot.py`): import‑time side effects banned; `boot_studio()`
  runs migrations then `boot_tts_server()`. Direct in‑process mode retained only as an explicit
  fallback.
- **Version 2.0.0** stamped across backend/frontend/About.

*Now specified in:* `system-architecture.md`. *From:* phase_1, phase_3, phase_5, phase_10,
v2_tts_server, current_architecture, proposed_epic_update.

## 2. Engine plugins & the plugin SDK — engine‑coupled → plugin‑first

**Shipped:**
- **Plugin architecture:** self‑contained engines under `plugins/` (`tts_xtts`, `tts_voxtral`,
  `tts_mixed`), each a mini‑repo with `manifest.json`, `interface.py`, `plugin/`, and plugin‑local
  tests. **No engine‑ID branches in core.**
- **Manifest contract:** versioned manifest validated *before* code import; capabilities + behavior
  (`text_chunk_limit`, `progress_pattern`, sanitize categories) are the source of truth.
- **StudioTTSEngine ABC** + **StudioPluginContext SDK** (13 service groups / 30+ methods) in
  `app/studio_plugin_sdk/`; all three plugins migrated; zero module‑level `app.*` imports in
  plugins; AST no‑app‑imports validator + CI manifest validator.
- **`synthesis_mixed` → `tts_mixed`** rename/migration; SDK migration (10 slices, S1–S10).
- pip entry‑point plugin discovery; guided dependency‑install flow; plugin zip import/delete; plugin
  trust dialog; example third‑party plugin; submission guidelines.

*Now specified in:* `plugin-contract.md` (1.3.x), `engines-and-plugins.md`. *From:* phase_3, phase_9,
v2_plugin_sdk, v2_voice_system_interface, master_agnostic_plan, final_release/02, /03,
stage3_sdk_migration_plan.

## 3. Orchestration & queue — worker loop → task orchestrator

**Shipped:**
- **`StudioTask` hierarchy:** Synthesis, ApiSynthesis, Assembly, Bake, Export, SampleBuild,
  SampleTest, MixedSynthesis.
- **Scheduler** (`app/orchestration/scheduler/`): resource‑claim model (GPU/exclusive gates),
  priority policies (`studio_first` / `equal` / `api_first` via `TTS_API_PRIORITY`), recovery on
  restart, cancel propagation, parent/child job tree.
- **Explicit queue states** including `waiting_for_resources` / `finalizing` / `recovered`;
  reconciliation as completion truth (not raw file existence).
- Mixed‑engine chapter renders; bake task; rebuild‑vs‑queue reuse semantics (`force_rerender`).

*Now specified in:* `queue-jobs.md`. *From:* phase_5, v2_queuing_system, v2_local_tts_api,
queuing_service_impl.

## 4. Voice system, metadata & portability

**Shipped:**
- **VoiceBridge** (`app/engines/bridge.py`) as the single routing point; `bridge_remote.py` +
  `tts_client.py` HTTP routing; engine registry with cached discovery.
- **Nested V2 voice storage** (`voices/<id>/voice.json`, `samples/`, `speaker_wav/`, nested
  variants); one‑time v1→v2 voice migration.
- **Voice metadata & taxonomy v1.0:** structured attributes (class/gender/age/accent/tone/timbre/
  pace/use‑case/quality), controlled values + HF tag mappings (`as-<section>-<id>`), taxonomy
  versioning; `voice.schema.json` + `voice-taxonomy.json` published.
- **Voice bundles:** `.asvoice.zip` export/import with README generation; HF‑aligned format; whole‑
  voice portability UX.
- **Voice Lab UI:** catalog, phase stepper, SampleManager, VariantEditor, icon upload, test strip,
  export; casting card model.

*Now specified in:* `voice-bundles.md`, `data-model.md` (voice layout). *From:* phase_8,
v2_voice_*, final_release/04, organizational_cleanup. *Partial:* in‑app HF browse/upload UI and
AI "suggest voices for character" casting action are not confirmed shipped (see README).

## 5. Progress & ETA — the centralized engine

**Shipped:**
- **Centralized progress** (`app/orchestration/progress/`): reconciliation, ETA, broadcaster.
- **Single `ProgressService.enrich()` kernel** (RLock‑guarded) — both emit paths enrich before
  building events; `app/api/contracts/events.py` is the single event‑builder authority; the old
  `compute_progress_confidence` echo was deleted (true convergence).
- **ETA decay‑handoff** (§4A.10): grounded‑baseline ↔ observed blend on the implied‑total axis,
  per‑segment confidence, evidence‑weight fraction, `eta_basis`, `estimated_end_at`; cold‑start ETA
  never null; segment→chapter composition; convergence‑trust.
- ETA math overhaul: segment CPS, startup + remaining with inter‑group overhead, uncalibrated
  suppression; `render_performance_samples` schema; calibrate/reset endpoint.

*Now specified in:* `progress-presentation.md` (1.5.x). *From:* progress_routing_unification (12
tasks), final_release/15, v2_progress_tracking, phase_4, checklists/eta_rebuild.

## 6. Live events & frontend state

**Shipped:**
- **Canonical `studio_event` envelope**; scoped topics (`queue.items`, `chapters.*`, `segments.*`,
  `tts.logs`, `voice.test`, `projects.*`, `system.*`, `plugins.*`); consumer registry; legacy
  normalizer retired.
- Frontend stores (`live-jobs`, `editor-session`), typed contracts (`events.ts`, `liveEvents.ts`),
  anti‑regression merge rules, reconnect hydration.

*Now specified in:* `live-events.md` (1.6.x). *From:* event_bus, live_event_stream_contract,
studio_event_broadcaster_contract, frontend_state_impl, phase_4, phase_6.

## 7. Frontend redesign — flat tabs → routed shell + book pipeline

**Shipped (site redesign R1–R7):**
- **App shell:** grouped NavRail (CREATE/MONITOR/PLATFORM/MANAGE), TopBar with breadcrumb +
  connection dot + queue drawer, Activity page, theme toggle.
- **Routed book pipeline** `/book/:id/{manuscript,casting,studio,review,publish}` replacing the old
  ProjectDetail + ChapterEditor; legacy `/project/:id` + `/chapter/:id` redirects.
- **Stages:** Manuscript (chapter table, import, lifecycle pills), Casting (Narrator pinned row,
  characters), Studio (ScriptView, CastPalette, AnalysisStrip, commit/resync), **Review (net‑new:
  follow‑along playback + annotations + per‑segment re‑render)**, Publish (book info, assemblies,
  backups).
- **Global PlayerBar:** single audio owner via `playerBus`, full VCR transport, scope toggle,
  wavesurfer waveform strip; programmatic seek.
- **Theming:** dark mode via `[data-theme]` token overrides, no‑flash bootstrap, ~200 hardcoded
  colors → semantic tokens (33 new), route code‑splitting (entry 876→346 kB).

*Now specified in:* `site-shell-and-book-pipeline.md`, `design-system.md`, `audio-player.md`.
*From:* site_redesign_rollout, site_experience_north_star, site_shell_phase_a, v2_navigation_ux,
v2_chapter_editor_workflow, v2_project_library_management, v2_settings_architecture,
final_release/07, /10, player_piano_scrolling.
> ⚠️ **Known regressions from this redesign** (owner‑confirmed 2026‑06‑19): some chapter‑list and
> editor capabilities were lost and some features were built‑but‑never‑wired. Tracked for restoration
> in [simplification/07_restore_lost_functionality.md](simplification/07_restore_lost_functionality.md).

## 8. External TTS API (Studio as a gateway)

**Shipped:** `app/api/tts_api.py` mounted at `/api/v1/tts`; `ApiSynthesisTask` through the
orchestrator; API‑key auth + rate limiting (`app/core/security.py`); priority modes; OpenAPI/Swagger
at `/api/v1/tts/docs`; queue visibility with API badge; LAN binding option; gateway docs.
*Now specified in:* `api-conventions.md`, `security.md`. *From:* phase_9, v2_local_tts_api.

## 9. Security

**Shipped:** path‑containment helpers (`safe_join`/`secure_join_flat`/`find_secure_file`); API‑key
redaction; timing‑safe key compare; zip path‑traversal defense; voice_ref containment; plugin trust
dialog; `safe_basename` hardening; backup filename defense. **All 53 CodeQL alerts addressed**
(33 path‑injection + 16 stack‑trace‑exposure + 4 ReDoS).
*Now specified in:* `security.md`. *From:* final_release/12, /audits, audit_systemic_bug_classes.

## 10. Testing & quality

**Shipped:** standing rules **R1–R4** (revert‑check bug‑fix tests, mock‑boundary discipline, typed
event frames, no sleep‑timing); plugin‑local test suites; full test‑quality audit with classification
tables (15 audit files); vacuous/mocked‑out tests deleted or rewritten; ~1500 tests passing at SDK
migration close.
*Now specified in:* `testing-standards.md`. *From:* final_release/17, /18, /audits.

## 11. Distribution, demo & localization

**Shipped:** `run.sh`/`run.ps1` provisioning with torch‑backend selection; Pinokio wrapper (Coqui
fork pinned to SHA, machine‑path audit clean); **interactive live demo** (typed scene‑script engine,
mock API client, 4 stages + styleguide, `build:demo` → `docs/demo/`, token‑sync script); wiki
corrections (all W‑items); localization **spec + inventory** (ICU key model, first‑run picker,
catalog layout).
*Now specified in:* `install-distribution.md`, `interface-localization.md`. *From:* phase_9,
final_release/13, /14, /16, phase_12_multilingual. *Partial:* localization is spec'd + inventoried
but **not implemented** (no `i18n/` yet); demo bundle refresh pending.

---

## 12. Quiet Studio visual redesign — Phase 12.5 (P0 + P1 shipped 2026-06-20)

**Shipped (branch `studio2/phase-12.5-style`, PR #126, base `studio-2.0`):**

The "Quiet Studio — Precision Pressroom" visual redesign — a token-layer re-skin of the CSS-variable design system (no Tailwind, no framework rewrite). Direction converged from a 5-lens fusion panel (Apple HIG + design critique + WCAG AA + modern-web + personas); every color value WCAG-AA-verified.

- **P0 — Fonts** (commit `3e3067ed`): self-hosted **Geist** (UI/body), **Geist Mono** (logs), **Source Serif 4** (reading column) via `@fontsource`; added `--font-ui`/`--font-display`/`--font-reading`/`--font-mono` tokens; repointed `base.css` stacks. spec_version → 1.5.0.
- **P1 — Token re-skin** (commits `c6b974cd`→`9bdcc17f`): rationed accent `#1e4fd8`/`#6b9fff` (light/dark), studio near-black `--bg #0d0f14`, 3-stop dark text ladder, `--action-primary`/`--on-action` canonical role tokens, `--on-success`/`--status-cached-*`, tightened radii (card 10/button 8/compact 6), double-ring focus, reduced-motion-guard-first with essential busy-indicator exemptions (spinners, indeterminate bars), flat buttons (no gradient/glow/lift), calm-pulse keyframe. Three review rounds ran (4-angle fusion audit + 2 adversarial passes); the loop stopped clean at round 2. spec_version → 1.6.3.

**P2–P6 pending** (forms/Switch → status icon-insets → glass audit → cleanup → demo+baseline). Plan at [`design-docs/plans/reference/quiet_studio_migration/`](reference/quiet_studio_migration/).

*Now specified in:* `design-docs/specs/design-system.md` (v1.6.3). *Canonical rendered targets:* `design-docs/style-guide/proposed-quiet-studio.html` (redesign) · `docs/style-guide/current.html` (frozen pre-redesign baseline).

---

## 13. What remains before v2.0.0 (pointer, not detail)

The conversion is functionally complete; remaining work is **release polish**, not architecture:
- **Release gates** (`final_release/08`, `road_to_v2`): owner‑run manual render verification, doc‑06
  dead‑code cleanup, Phase‑11 checkpoint, standalone plugin repo extraction, Pinokio repo publish.
- **Phase 12 polish** (`phases/phase_12_polish_and_cleanup`): taxonomy v2 Phase G, VCR/segment
  follow‑ups, plugin setup loop, namespace rename (`plugins/` → `tts_engines/`?).
- **Redesign follow‑ons:** book_view_redesign Track A live‑app port; audio_player_waveform_scrubber
  W1; **restore lost functionality** (simplification/07).
- **UX/a11y/security backlog** (`final_release/09–12`): remaining U/A/S items.
- **Localization implementation** (spec done, code not started).
- **The simplification effort** (`simplification/`): dead‑code/styling cleanup (this is new, 06‑19).

See [README.md](README.md) for the per‑plan status of every remaining item.

---

*Confidence note:* status is high‑confidence for shipped architecture (verified against live code +
canonical specs). A few "partial" items carry unconfirmed sub‑features (flagged inline and in the
index). This report is a narrative for documentation; the canonical `design-docs/specs/` files are the
binding contracts.
