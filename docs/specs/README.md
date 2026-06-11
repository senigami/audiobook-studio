# Audiobook Studio 2.0 — Spec Index

This directory contains the authoritative specifications for Audiobook Studio 2.0.
**Specs and code are jointly authoritative — resolve drift explicitly, never silently.**
When a spec and the running code disagree, that is a bug in one or the other; the fix is either
to update the spec (with a version bump and changelog note) or to correct the code. Silently
accepting the divergence is not acceptable.

Last updated: 2026-06-10

---

## Document Index

| File | Description | Version |
|------|-------------|---------|
| [live-events.md](live-events.md) | WebSocket live event topics, envelope schema, reconnect/bootstrap contract | 1.1.0 |
| [queue-jobs.md](queue-jobs.md) | Job statuses, allowed transitions, two-store model, terminal-reset semantics, broadcast routing | 1.0.2 |
| [text-processing.md](text-processing.md) | Six-stage text pipeline (clean→split→pack→group→assign→render), invariants on packing and grouping | 1.0.1 |
| [testing-standards.md](testing-standards.md) | Binding rules R1–R4, mock-boundary discipline, test classification rubric | 1.0.0 |
| [system-architecture.md](system-architecture.md) | Two-process model (Studio + TTS Server), boot sequence, component ownership boundaries | 1.0.0 |
| [data-model.md](data-model.md) | SQLite schema, state.json structure, voice directory layout V2 | 1.0.0 |
| [api-conventions.md](api-conventions.md) | REST URL patterns, standard error shape, API key auth, WebSocket protocol, external TTS API | 1.0.0 |
| [plugin-contract.md](plugin-contract.md) | `StudioTTSEngine` ABC, manifest schema, SDK types, capability flags | 1.0.0 |
| [engines-and-plugins.md](engines-and-plugins.md) | Plugin discovery, health state machine, verification flow, hot-reload rules | 1.0.0 |
| [voice-bundles.md](voice-bundles.md) | Bundle directory structure, MP3/WAV format rules, voice attribute taxonomy | 1.0.0 |
| [progress-presentation.md](progress-presentation.md) | `PredictiveProgressBar` contract, ETA trust model, broadcast thresholds | 1.0.0 |
| [code-organization.md](code-organization.md) | Repo layout, module boundary rules, file-size norms, import constraints | 1.0.0 |
| [security.md](security.md) | Path containment pattern, API key auth, input validation, CodeQL requirements | 1.0.0 |
| [install-distribution.md](install-distribution.md) | `run.sh` behaviour, env var reference, Pinokio wrapper, first-run defaults | 1.0.0 |

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
| Runtime architecture | Two-process model: Studio (FastAPI) + TTS Server (uvicorn subprocess) | [ADR-0001](decisions/ADR-0001.md) |
| Versioning policy | Clean break from v1; no compatibility shims, data migration path only | [ADR-0002](decisions/ADR-0002.md) |
| Live state stores | Dual store: SQLite for durable records, state.json for live in-memory job state | [ADR-0003](decisions/ADR-0003.md) |
| Engine architecture | Plugin manifest + `StudioTTSEngine` ABC; no engine-ID branches in core code | [ADR-0004](decisions/ADR-0004.md) |
| Real-time updates | WebSocket live events over polling; typed envelope, topic-filtered broadcast | [ADR-0005](decisions/ADR-0005.md) |
| Startup side effects | Explicit boot sequence in `app/core/boot.py`; import must not start threads or mutate state | [ADR-0006](decisions/ADR-0006.md) |
| Path safety | `normpath` + `startswith` barrier (`safe_join`/`secure_join_flat`); CodeQL-recognized pattern | [ADR-0007](decisions/ADR-0007.md) |
| Voice directory layout | Nested V2 layout (`voices/<id>/voice.json`, `samples/`, `speaker_wav/`) | [ADR-0008](decisions/ADR-0008.md) |

---

## Spec Coverage by Domain

| Domain | Primary spec | Supporting specs |
|--------|-------------|-----------------|
| WebSocket / live updates | `live-events.md` | `api-conventions.md` (WebSocket section) |
| Job lifecycle & queue | `queue-jobs.md` | `system-architecture.md` (orchestrator), `live-events.md` (broadcast routing) |
| Text processing pipeline | `text-processing.md` | `plugin-contract.md` (chunk limit), `queue-jobs.md` (segment granularity) |
| TTS engine plugins | `plugin-contract.md`, `engines-and-plugins.md` | `system-architecture.md` (watchdog/bridge), `voice-bundles.md` |
| Voice data & bundles | `voice-bundles.md` | `data-model.md` (voice directory layout), `install-distribution.md` (defaults) |
| Progress & ETA | `progress-presentation.md` | `live-events.md` (progress event envelope), `queue-jobs.md` (ETA ownership) |
| REST API & external TTS | `api-conventions.md` | `security.md` (API key auth), `queue-jobs.md` (job IDs) |
| Data persistence | `data-model.md` | `system-architecture.md` (state stores), `queue-jobs.md` (two stores) |
| Security & path safety | `security.md` | `api-conventions.md` (auth), `code-organization.md` (import rules) |
| Install & deployment | `install-distribution.md` | `system-architecture.md` (boot sequence), `engines-and-plugins.md` (plugin dirs) |
| Testing | `testing-standards.md` | All specs (each is testable via R1–R4) |
| Module & repo structure | `code-organization.md` | `system-architecture.md` (component ownership) |
