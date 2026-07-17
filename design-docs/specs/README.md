# Audiobook Studio 2.0 — Spec Index

This directory contains the authoritative specifications for Audiobook Studio 2.0.
**Specs and code are jointly authoritative — resolve drift explicitly, never silently.**
When a spec and the running code disagree, that is a bug in one or the other; the fix is either
to update the spec (with a version bump and changelog note) or to correct the code. Silently
accepting the divergence is not acceptable.

Last updated: 2026-07-16

---

## Document Index

| File | Description | Version |
|------|-------------|---------|
| [site-shell-and-book-pipeline.md](site-shell-and-book-pipeline.md) | Shared app shell, global chrome, routed book pipeline, Studio Director's Console (3-panel: rail·text·console-right) + Book/Screenplay/Stage views + 4 Cast sub-tools (Select/Voice/Stage/Cue, S/V/G/C shortcuts), brush-size scope model, performance cue 3-axis model (Delivery=pitch/Speed=rate/Emotion=dropdown, independent), stage-direction conversion via Voice tool, rail collapse pill, chapter-list representation, Review stage, platform/manage split, frontend state ownership | 1.9.0 |
| [design-system.md](design-system.md) | Design tokens, theming (System/Light/Dark, no-flash), type scale, voice-pill tints, shared UI primitives, iconography (lucide canonical), attribution encoding (§9.6 color=identity / variation=text / collision=flag), responsive breakpoints, accessibility baseline | 1.13.0 |
| [audio-player.md](audio-player.md) | Global single-owner audio player: `playerBus` store, one `<audio>` in `PlayerBar`, full VCR transport (lucide icons). **Scope-agnostic** — no segment/chapter toggle; scrub representation is duration-driven; far-right `AudioLines` opens an expandable scrubbing-waveform **tape** (paged/moving motion, click+drag scrub, cover-slider zoom presets, minimap, m:ss ruler, fixed-grid rendering); peaks browser-decoded below a duration cap, server sidecar above. Visibility keys on playback state + persists across all routes; content-owned play affordances (§4.1). Tape realized in the mock; live port tracked by design-docs/plans/active/audio_player_waveform_scrubber/ | 1.6.0 |
| [live-events.md](live-events.md) | WebSocket live event topics, envelope schema, reconnect/bootstrap contract | 1.9.5 |
| [queue-jobs.md](queue-jobs.md) | Job statuses, allowed transitions, two-store model, terminal-reset semantics, rebuild-vs-queue reuse (§3.7), broadcast routing, presentation surfaces | 1.11.5 |
| [text-processing.md](text-processing.md) | Six-stage text pipeline (clean→split→pack→group→assign→render), invariants on packing and grouping | 1.1.1 |
| [testing-standards.md](testing-standards.md) | Binding rules R1–R4, mock-boundary discipline, test classification rubric | 1.0.1 |
| [system-architecture.md](system-architecture.md) | Two-process model (Studio + TTS Server), boot sequence, component ownership boundaries; boot must not host destructive reconciliation (I13) | 1.6.2 |
| [data-model.md](data-model.md) | SQLite schema, state.json structure, voice directory layout V2; segment-audio artifacts (group→filename fan-out) + orphan GC; source-of-truth = validated metadata, not file existence | 1.11.0 |
| [api-conventions.md](api-conventions.md) | REST URL patterns, standard error shape, API key auth, WebSocket protocol, external TTS API; live reads must bypass browser cache (`no-store`); per-book GC on project open | 1.1.0 |
| [plugin-contract.md](plugin-contract.md) | `StudioTTSEngine` ABC, manifest schema, SDK types, capability flags | 1.6.0 |
| [performance-script-format.md](performance-script-format.md) | Canonical `performance_data` JSON shape, rendering-mode resolution (`resolve_rendering()`), INV-2; AI pipeline/export layer explicitly deferred | 1.0.0 |
| [engines-and-plugins.md](engines-and-plugins.md) | Plugin discovery, health state machine, verification flow, hot-reload rules | 1.1.2 |
| [video-sample.md](video-sample.md) | Per-chapter shareable MP4 sample (book cover + capped chapter audio); local-only ffmpeg render, letterboxed visual, Studio-logo fallback, orientation/duration params, `POST /chapters/{id}/export-video` | 1.0.0 |
| [voice-bundles.md](voice-bundles.md) | Bundle directory structure, MP3/WAV format rules, voice attribute taxonomy, voice catalog + Voice Lab UI | 1.9.0 |
| [interface-localization.md](interface-localization.md) | Interface localization, locale catalogs, first-run picker, settings selector, locale-aware formatting | 1.0.4 |
| [voice-tone.md](voice-tone.md) | UI copy conventions: casing (Title Case CTAs / sentence case body), confirm-dialog defaults and verb-first labels, irreversibility messaging, the five UI states, loading/empty/success patterns, form-field label suffixes, ellipsis style, product naming | 1.0.0 |
| [progress-presentation.md](progress-presentation.md) | `PredictiveProgressBar` contract, ETA trust model, broadcast thresholds, segment ETA decay-handoff (§4A.10), segment block-fill / render-monitor presentation (§7A) | 1.9.0 |
| [code-organization.md](code-organization.md) | Repo layout, module boundary rules, file-size norms, import constraints | 1.1.0 |
| [security.md](security.md) | Path containment pattern, API key auth, input validation, CodeQL requirements | 1.2.4 |
| [install-distribution.md](install-distribution.md) | `run.sh` behaviour, env var reference, Pinokio wrapper, first-run defaults | 1.2.0 |

---

## Product Summary

Audiobook Studio is a local-first web application that converts written manuscripts into
finished audiobooks using AI voice cloning. It is aimed at authors, narrators, and small
production houses who want professional output without cloud processing or subscription fees.
The app is distributed as a self-hosted package (a `run.sh` / `run.ps1` launcher that
provisions Python virtualenvs, builds the React frontend, and starts a uvicorn server on
`localhost:8123`). Studio 2.0 uses a two-process model: the **Studio process** (FastAPI, SQLite,
orchestrator) handles all user-facing HTTP and WebSocket traffic, while a separate
**TTS Server subprocess** hosts the engine plugin and owns the GPU — the two communicate over a
local HTTP channel managed by the watchdog. All data stays on the user's machine; no account or
internet connection is required during synthesis.

---

## Key Decisions

| Decision | Choice | ADR |
|----------|--------|-----|
| Runtime architecture | Two-process model: Studio (FastAPI) + TTS Server (uvicorn subprocess) | [ADR-0001](../decisions/ADR-0001-two-process-architecture.md) |
| Versioning policy | Clean break from v1; no compatibility shims, data migration path only | [ADR-0002](../decisions/ADR-0002-clean-break-from-v1.md) |
| Live state stores | Dual store: SQLite for durable records, state.json for live in-memory job state | [ADR-0003](../decisions/ADR-0003-dual-state-store.md) |
| Engine architecture | Plugin manifest + `StudioTTSEngine` ABC; no engine-ID branches in core code | [ADR-0004](../decisions/ADR-0004-plugin-first-engine-architecture.md) |
| Real-time updates | WebSocket live events over polling; typed envelope, topic-filtered broadcast | [ADR-0005](../decisions/ADR-0005-websocket-live-events.md) |
| Startup side effects | Explicit boot sequence in `app/core/boot.py`; import must not start threads or mutate state | [ADR-0006](../decisions/ADR-0006-explicit-boot-sequence.md) |
| Path safety | `normpath` + `startswith` barrier (`safe_join`/`secure_join_flat`); CodeQL-recognized pattern | [ADR-0007](../decisions/ADR-0007-codeql-path-containment-pattern.md) |
| Voice directory layout | Nested V2 layout (`voices/<id>/voice.json`, `samples/`, `speaker_wav/`) | [ADR-0008](../decisions/ADR-0008-nested-voice-directory-layout.md) |
| Shell + book pipeline | Shared app shell in `app/layout` and routed `/book/:id/...` workflow | [ADR-0009](../decisions/ADR-0009-app-shell-and-book-pipeline.md) |
| Audio playback | Single-owner `playerBus` + one `<audio>` in the `PlayerBar`; all other players are adapters | [ADR-0010](../decisions/ADR-0010-single-owner-audio-player.md) |
| Frontend state ownership | Canonical entities via API hydration; store owns only overlays/reconnect/notifications/drafts; `queue.items` is the sole row authority | [ADR-0011](../decisions/ADR-0011-frontend-state-ownership.md) |
| Segment-artifact reconciliation | DB is truth (validated metadata, not file existence); orphan segment WAVs GC'd per-book on open, never library-wide at boot | [ADR-0013](../decisions/ADR-0013-segment-orphan-reconciliation.md) |
| Chapter editor layout | Director's Console: three-panel (rail · text · console-right) + Book/Screenplay/Stage views (one editor surface) | [ADR-0014](../decisions/ADR-0014-directors-console-layout.md) |
| Dialogue attribution encoding | Color = character identity only (one per character); variation = text label; voice collision = ⚠ flag — never overload color | [ADR-0015](../decisions/ADR-0015-attribution-color-is-identity.md) |

---

## Spec Coverage by Domain

| Domain | Primary spec | Supporting specs |
|--------|-------------|-----------------|
| WebSocket / live updates | `live-events.md` | `api-conventions.md` (WebSocket section) |
| Job lifecycle & queue | `queue-jobs.md` | `system-architecture.md` (orchestrator), `live-events.md` (broadcast routing) |
| Text processing pipeline | `text-processing.md` | `plugin-contract.md` (chunk limit), `queue-jobs.md` (segment granularity) |
| TTS engine plugins | `plugin-contract.md`, `engines-and-plugins.md` | `system-architecture.md` (watchdog/bridge), `voice-bundles.md` |
| Voice data & bundles | `voice-bundles.md` | `data-model.md` (voice directory layout), `install-distribution.md` (defaults) |
| Interface localization / locale packs | `interface-localization.md` | `site-shell-and-book-pipeline.md` (shell/book labels), `design-system.md` (layout expansion), `design-docs/plans/_archive/phases/phase_12_multilingual_interface_examples/` |
| Progress & ETA | `progress-presentation.md` | `live-events.md` (progress event envelope), `queue-jobs.md` (ETA ownership) |
| REST API & external TTS | `api-conventions.md` | `security.md` (API key auth), `queue-jobs.md` (job IDs) |
| Data persistence | `data-model.md` | `system-architecture.md` (state stores), `queue-jobs.md` (two stores) |
| Security & path safety | `security.md` | `api-conventions.md` (auth), `code-organization.md` (import rules) |
| Install & deployment | `install-distribution.md` | `system-architecture.md` (boot sequence), `engines-and-plugins.md` (plugin dirs) |
| Testing | `testing-standards.md` | All specs (each is testable via R1–R4) |
| Module & repo structure | `code-organization.md` | `system-architecture.md` (component ownership) |
| Frontend shell & book pipeline | `site-shell-and-book-pipeline.md` | `code-organization.md` (placement), `progress-presentation.md` (status UI), `queue-jobs.md` (job/queue coupling), `design-system.md` (chrome styling) |
| Design system & theming | `design-system.md` | `voice-bundles.md` (pill taxonomy values), `progress-presentation.md` (PredictiveProgressBar primitive), `site-shell-and-book-pipeline.md` (shell chrome) |
| Audio playback (player bar) | `audio-player.md` | `site-shell-and-book-pipeline.md` (shell mount, Review), `progress-presentation.md` (audio availability), `queue-jobs.md` (rendered audio jobs) |
| Queue presentation surfaces | `queue-jobs.md` | `live-events.md` (row authority), `progress-presentation.md` (bars), `site-shell-and-book-pipeline.md` (Activity page) |
