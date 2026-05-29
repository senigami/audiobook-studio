# Audiobook Studio Handbook — Outline

Master table of contents for the static documentation site in this folder.
Open `index.html` to browse it. The handbook is split into two parts — **For Users** and **For Developers & Integrators**. Legend: **[soon]** = landing in Phase 12 · **[future]** = planned/post-release.

## For Users

_Install, create projects, build voices, and produce finished audiobooks._

### 1. Overview

- [What Is Audiobook Studio](overview/what-is-audiobook-studio.html) — A local-first app that turns manuscripts into finished audiobooks with AI voice cloning.
  - The production-surface philosophy (not one-click TTS)
  - Multi-voice narration, segment repair, assembly & export
  - How the pieces fit together at a glance
- [Studio 2.0 at a Glance](overview/studio-2-at-a-glance.html) — The headline of the 2.0 rearchitecture: a managed plugin-based TTS Server and task orchestrator.
  - Managed TTS Server + plugins
  - Task orchestration replacing the worker loop
  - Engine registry & voice bridge
  - Pointer to “What's New” for the full story
- [Who It's For & Use Cases](overview/use-cases.html) — Indie authors, narrators, and hobbyists producing long-form audio locally.
  - Full-book production
  - Iterative correction without per-edit cost
  - Multi-character dialogue
  - Studio-as-a-TTS-backend for automation
- [Local-First & Privacy](overview/privacy-model.html) — Your manuscript, samples, and output stay on your machine; cloud is explicit and opt-in.
  - What stays local (XTTS path)
  - What leaves the machine if Voxtral is enabled
  - Data ownership & no recurring usage cost
- [Feature Highlights](overview/feature-highlights.html) — A scannable tour of the capabilities documented in this handbook.
  - Voices, variants & cloning
  - Queue, progress & recovery
  - Assembly/export to M4B/MP3
  - Plugin SDK & external API

### 2. Getting Started

- [Requirements](getting-started/requirements.html) — Hardware and software you need before installing.
  - OS support (macOS / Linux / Windows)
  - Python 3.10+, Node 18+, ffmpeg
  - GPU recommendations for local XTTS
- [Installation Paths](getting-started/installation.html) — Pick the path that matches your comfort level.
  - Pinokio (easiest)
  - From source (developers)
  - One-command launcher setup
  - Demo library option
- [Launcher Scripts (run.sh / run.ps1)](getting-started/launchers.html) — What the one-command launchers do and the flags they accept.
  - Provisioning venv + ~/xtts-env + frontend build
  - Flags: --setup-only, --no-reload, --port
  - Windows run.ps1 equivalents
- [The Two Environments](getting-started/environments.html) — Why XTTS lives in a separate Python environment from the web app.
  - ./venv — the app
  - ~/xtts-env — heavy XTTS deps
  - Dependency-conflict isolation
- [First Run](getting-started/first-run.html) — Starting the server and opening the app on port 8123.
  - uvicorn run:app
  - First-run model downloads
  - Folders created on first launch
- [Demo Library](getting-started/demo-library.html) — Optional sample project and voices to explore the workflow immediately.
  - Installing the demo bundle
  - What it includes
  - Removing it later
- [5-Minute Workflow Tour](getting-started/quick-tour.html) — End-to-end: project -> chapters -> voices -> generate -> assemble.
  - Create a project & add a chapter
  - Build/assign a voice
  - Generate & review
  - Assemble the audiobook
- [Platform Support & Install Validation](getting-started/platform-validation.html) — Per-platform install/launch notes and the first-run smoke-test matrix.
  - macOS / Windows / Linux install & launch
  - Pinokio install & launch flow
  - First-run: deps, TTS Server startup, plugin discovery, XTTS/Voxtral setup
  - Smoke test: sample project, test voice, synthesis, relaunch
  - Platform-specific prerequisites & known limitations

### 3. Core Concepts

- [Content Hierarchy](concepts/content-hierarchy.html) — How content nests: Library -> Project -> Chapter -> Block/Segment -> Chunk.
  - What each level owns
  - Segments vs production blocks
  - Chunks & the character limit
- [Characters & Narrators](concepts/characters-narrators.html) — Assigning distinct voices to narration and dialogue.
  - The default narrator
  - Project characters & colors
  - How assignment drives rendering
- [Voices, Variants & Samples](concepts/voices.html) — The Voice Lab model: a Voice has Variants, built from Samples, bound to an Engine.
  - Voice vs variant
  - Samples & rebuilds
  - Engine-per-voice
  - Portable voice profiles
- [Engines Overview](concepts/engines-overview.html) — The engines Studio can route to and how they differ.
  - XTTS (local)
  - Voxtral (cloud)
  - Composite (mixed) synthesis
  - Plugins add more
- [The Production Pipeline](concepts/production-pipeline.html) — The stages a chapter passes through to become audio.
  - Analysis -> Queue -> Synthesis -> Bake -> Assembly
  - What happens at each stage
  - Where progress comes from
- [Artifacts, Reuse & Recovery](concepts/artifacts-recovery.html) — Why completion is decided by validated artifact metadata, not raw files.
  - Validated artifacts vs file existence
  - Reuse of unchanged audio
  - Restart recovery & reconciliation
  - Immutable shared cache

### 4. User Guide

- [Project Library](user-guide/project-library.html) **[soon]** — Browse, create, and manage your audiobook projects.
  - Grid & list view, sorting
  - Create project (title/author/series/cover)
  - Open & delete projects
- [Project Workspace](user-guide/project-workspace.html) — The project view, its header, and sub-navigation tabs.
  - Editing project metadata & cover
  - Sub-nav: Chapters / Characters / Assemblies / Backups
- [Chapters](user-guide/chapters-tab.html) — Add and manage the chapters in a project.
  - Add chapter (upload .txt or paste)
  - Chapter status & stats
  - Reorder & delete
- [Characters](user-guide/characters-tab.html) — Define project characters and assign each a voice and color.
  - Create a character
  - Assign a voice profile/variant
  - Color coding
- [Assemblies & Export](user-guide/assemblies-tab.html) — Combine rendered chapters into finished audiobook files.
  - Assemble a project
  - Download M4B / manage outputs
  - Editable descriptions & stats
- [Backups](user-guide/backups-tab.html) — Snapshot a project (optionally with audio samples) and restore later.
  - Create a backup (+ comment)
  - Include audio samples toggle
  - Download / restore / delete
- [Chapter Editor](user-guide/chapter-editor.html) **[soon]** — Edit, assign, generate, and review a chapter — now centered on the Script tab.
  - Script tab: assignment, batch assign, generation & progress
  - VCR playback: play / pause / stop / next / previous
  - Edit tab: raw text + resync preview
  - Note: Production/Performance/Preview tabs are folding into Script
- [Voice Lab](user-guide/voice-lab.html) — Create, configure, sample, test, and share voices.
  - Create a voice & pick an engine
  - Variants: add / rename / move / speed / test text
  - Samples: upload, manage, rebuild
  - Test & preview
  - Import / export voice bundles
  - Recording Guide prompt packs
- [Voice Icons & Tags](user-guide/voice-tags-icons.html) **[soon]** — Identify and search voices with images and category tags.
  - Upload a 1:1 voice icon
  - Tags (male/female/deep/narrator/accent/…)
  - Searching & filtering by tag
  - Per-voice plugin settings
- [Processing Queue](user-guide/processing-queue.html) **[soon]** — Monitor and control all background rendering and assembly jobs.
  - Queue stats & ETA
  - Per-job output metadata (duration)
  - Reorder, pause/resume, clear
  - Job history
  - Live updates over WebSocket
- [Settings](user-guide/settings.html) — Configure defaults, engines, the external API, and view diagnostics.
  - General (safe mode, default engine/speaker)
  - Engines (enable/configure, install/import & delete plugins, logs)
  - API panel
  - About / diagnostics
- [Audio Guidance & File Formats](user-guide/audio-formats.html) — Supported inputs/outputs and quality guidance.
  - Input text & audio formats
  - Internal vs output formats
  - Bitrate & normalization tips
  - Per-segment character limits
- [Troubleshooting & FAQ](user-guide/troubleshooting.html) — Common issues and how to resolve them.
  - Failed jobs & retries
  - Voice quality
  - Enabling Voxtral
  - Long-sentence warnings

### 5. Engines & Voice Cloning

- [XTTS (Local)](engines/xtts.html) — The private, local-default cloning engine.
  - What XTTS is & GPU needs
  - Latents & the voice profile
  - Strengths and tuning
- [Voxtral (Cloud)](engines/voxtral.html) — Optional Mistral-hosted engine, hidden until you add an API key.
  - Enabling with a Mistral key
  - What data is sent
  - When to use it
- [Composite Synthesis](engines/composite.html) — Combining multiple engines/voices within one chapter.
  - When chapters mix engines
  - How composite rendering stitches output
  - Note: formerly “mixed”
- [Engine Settings & Verification](engines/engine-settings.html) — Per-engine configuration and the verification/self-test flow.
  - Schema-driven engine settings
  - Verification & test runs
  - Enable/disable & status
- [Voice Cloning Quality](engines/voice-quality.html) — Why quality varies and how to get the best clone.
  - Sample selection heuristics
  - Recording quality factors
  - Variant strategies

### 6. What's New in 2.0

- [1.x -> 2.0 at a Glance](whats-new/at-a-glance.html) — The short version of what changed and why it matters.
  - Headline changes
  - What users feel day-to-day
  - What developers gain
- [Architectural Shifts](whats-new/architectural-shifts.html) — The structural changes under the hood.
  - One-shot subprocess -> managed TTS Server
  - Worker loop -> orchestrator
  - Engine-ID branches -> plugin manifests
  - Raw-file checks -> validated artifacts
- [New Capabilities](whats-new/new-capabilities.html) — Features that didn't exist in 1.x.
  - Plugin SDK & external TTS API
  - Composite engine, project backups
  - Predictive progress, VCR playback
  - Voice tags & icons
- [Migration Notes](whats-new/migration.html) — What changes for existing 1.x workspaces.
  - state.json -> SQLite migration
  - Folder/compatibility notes
  - What carries over
- [PR Talking Points](whats-new/pr-talking-points.html) — Benefit-framed messaging for announcements and marketing.
  - Reliability & recovery story
  - Extensibility (plugins/API) story
  - Polish (playback, progress, voices) story
- [Changelog](whats-new/changelog.html) — Dated record of shipped behavior changes.
  - 2.0 highlights
  - Recent patch lines
  - Pointer to wiki Changelog

### 7. Reference

- [Glossary](reference/glossary.html) — Definitions for the terms used throughout the handbook.
  - Project / chapter / segment / chunk
  - Voice / variant / sample / engine
  - Task / job / artifact
- [File Formats](reference/file-formats.html) — Supported input/output formats in one place.
  - Text inputs
  - Audio inputs (samples)
  - Outputs (WAV/MP3/M4B)
- [UI Cheat Sheet](reference/ui-cheat-sheet.html) — Quick reference for navigation and shortcuts.
  - Main navigation map
  - Common actions
  - Keyboard shortcuts

## For Developers & Integrators

_Extend Studio with engine plugins, drive it over the external API, and run it._

### 8. Plugin SDK

- [Plugin Architecture](plugin-sdk/overview.html) — How engines plug into Studio through the TTS Server.
  - Folder plugins & discovery
  - Studio-owns vs plugin-owns
  - The declared-hook model
- [Anatomy of a Plugin](plugin-sdk/anatomy.html) — The files that make up a self-contained plugin mini-repo.
  - manifest.json, interface.py
  - plugin/ (core + studio + server)
  - settings_schema.json, requirements.txt, tests/
- [manifest.json Reference](plugin-sdk/manifest.html) — Every manifest field and what it controls.
  - engine_id, entry_class, capabilities
  - behavior (text_chunk_limit, progress_pattern)
  - resource (gpu/vram), local/cloud/network, languages
- [Engine Contract & Hooks](plugin-sdk/engine-contract.html) — The callables Studio expects an engine to implement.
  - check_env()
  - synthesize(request)
  - verify / run_test / build_voice_asset
- [Behavior Metadata](plugin-sdk/behavior-metadata.html) — Driving core behavior from manifest metadata instead of engine-ID branches.
  - text_chunk_limit / split target
  - progress_pattern parsing
  - settings_schema.json + x-ui rendering hints
  - Per-voice settings declaration
- [Compatibility & Contract Versioning](plugin-sdk/compatibility.html) **[soon]** — Verifying a plugin matches the Studio plugin contract before use.
  - Contract version (v1)
  - Expected callable existence & signatures
  - Compatibility checks at load
- [Studio Plugin Context Contract](plugin-sdk/plugin-context.html) **[soon]** — How plugins reach Studio services without importing app persistence.
  - Why plugin/core must stay portable
  - Context passed into plugin/studio adapters
  - Persistence stays Studio-owned
- [Portable Core & Standalone Repos](plugin-sdk/standalone-repos.html) **[soon]** — First-party engines as standalone repos that also run from a CLI.
  - XTTS Web / Voxtral Web repo layout
  - CLI entry point & dependency path
  - The standalone CLI Builder Harness (static page)
- [Studio Dev Mode Preview](plugin-sdk/dev-mode.html) **[soon]** — The authoritative UI preview path for plugin development.
  - What Dev Mode previews
  - Scenario fixtures from the plugin
  - Using it while building
- [Installing, Importing & Deleting Plugins](plugin-sdk/install-import.html) **[soon]** — Managing plugins from the UI and by zip import.
  - Dependency-install feedback
  - Zip import/delete flows
  - Refreshing plugin state
  - Note: in-app GitHub/HF download is post-release
- [Using the Template](plugin-sdk/template.html) — Start from the bundled plugin template.
  - Copy docs/plugin-template
  - Update manifest & schema
  - Implement the interface
- [Testing Your Plugin](plugin-sdk/testing.html) — Keeping tests and fixtures inside the plugin folder.
  - Plugin-local tests/ collected by pytest
  - Contract test
  - Fixtures & generated outputs
- [Submission Guidelines](plugin-sdk/submission.html) — What a plugin needs to be accepted.
  - Security & safety review
  - Stability/performance
  - Self-contained & licensed

### 9. TTS Gateway API

- [Gateway Overview & Enabling](api/overview.html) — Use Studio as an external TTS backend over HTTP.
  - What the gateway is
  - Enabling it in Settings
  - OpenAPI docs at /api/v1/tts/docs
- [Authentication & Rate Limiting](api/auth.html) — Securing the gateway for LAN or shared use.
  - API key (Bearer) auth
  - LAN binding considerations
  - Per-IP rate limiting
- [Endpoints Reference](api/endpoints.html) — The routes exposed under /api/v1/tts.
  - GET /engines, /engines/{id}
  - POST /synthesize, /preview
  - GET /jobs/{id}, /jobs/{id}/audio
- [Inline vs Queued + Polling](api/sync-vs-queued.html) — Short text returns inline; long text queues a job you poll.
  - Inline threshold
  - Job response & poll URL
  - Polling for completion
- [Priority Policies](api/priority.html) — How API jobs are scheduled relative to Studio's own work.
  - TTS_API_PRIORITY modes
  - studio_first / equal / api_first
  - Avoiding starvation
- [Examples](api/examples.html) — Copy-paste curl and automation snippets.
  - Discover engines
  - Synthesize inline & queued
  - Poll & download audio
- [LLM / Controller Readiness](api/llm-controllers.html) **[future]** — Forward-looking: the API surface for future LLM/controller plugins.
  - What a controller would need
  - Current gaps being verified
  - Not built yet — planning only

### 10. Architecture

- [Architecture Overview](architecture/overview.html) — The big-picture map of Studio 2.0 subsystems and ownership.
  - Ownership split: orchestrator / watchdog / bridge
  - Request flow end to end
  - No import-time side effects
- [TTS Server & Watchdog](architecture/tts-server.html) — The long-lived TTS Server subprocess and its supervisor.
  - tts_server.py & READY signal
  - watchdog spawn/health/restart
  - Circuit breaker
- [VoiceBridge](architecture/voice-bridge.html) — The single routing point from a voice request to an engine.
  - Routing over HTTP
  - bridge_remote & tts_client
  - Engine enablement
- [Task Orchestration](architecture/orchestration.html) — How background work is scheduled and executed.
  - StudioTask abstraction & task types
  - orchestrator: submit/cancel/recover
  - policies / resources / recovery
  - job-handler registry, JobKind/TaskType
- [Progress Services](architecture/progress.html) — Centralized progress math, ETA, reconciliation, and broadcasting.
  - Rounded to 2 decimals, >=1% to broadcast
  - ETA estimation
  - Reconciliation as truth
- [Boot Sequence](architecture/boot.html) — The one explicit place startup side effects are allowed.
  - boot_studio() & boot_tts_server()
  - Migrations then watchdog
  - Idempotent, off the request path
- [State: state.json + SQLite](architecture/state.html) — The live state store and the persistent database.
  - state.json: live jobs/settings
  - SQLite: projects/chapters/segments/queue history
  - StorageManager direction
- [Web & API Layer](architecture/web-api.html) — The FastAPI app, routers, WebSocket, and the gateway sub-app.
  - web.py mounts & lifecycle
  - Domain routers
  - ws.py broadcasts
  - jobs REST -> WebSocket migration
- [Paths & Security](architecture/paths-security.html) — Treating filesystem paths as an untrusted security surface.
  - safe_join / secure_join_flat / find_secure_file
  - Containment pattern
  - CodeQL alignment
- [Frontend Architecture](architecture/frontend.html) — How the React app is organized.
  - pages / components / hooks / store / theme
  - Canonical data vs live overlays
  - Tests under frontend/tests
- [Internal HTTP API Reference](architecture/internal-api.html) — The internal domain route groups behind the UI.
  - projects / chapters / voices / queue
  - generation / jobs / settings / system
  - analysis / migration / engines

### 11. Operations & Configuration

- [Launcher Options](operations/launcher-options.html) — Running the app for different scenarios.
  - run.sh / run.ps1 flags
  - Generic plugin setup loop
  - Port & reload control
- [Environment Variables](operations/env-vars.html) — Configurable env vars resolved in app/core/config.py.
  - AUDIOBOOK_BASE_DIR & storage roots
  - PLUGINS_DIR / PLUGIN_DATA_DIR
  - XTTS_ENV_DIR, ports, test-mode flags
- [Storage Layout](operations/storage-layout.html) — Where Studio keeps projects, voices, uploads, and transient data.
  - projects/<id>/{audio,text,m4b,cover,trash}
  - voices/ & plugin_data/
  - transient & trash
- [The XTTS Environment](operations/xtts-env.html) — Maintaining the separate ~/xtts-env install.
  - What lives in xtts-env
  - update_xtts script
  - Recreating on stale deps
- [Maintenance Scripts](operations/scripts.html) — The helper scripts in scripts/.
  - backfill_stats / sync_durations
  - recover_projects_from_disk
  - install_hooks / dev.sh
- [Backups & Recovery](operations/backups-recovery.html) — Protecting and restoring project data.
  - Project backups
  - Disk-based project recovery
  - Startup reconciliation
- [Headless & LAN Exposure](operations/headless-lan.html) — Running without the UI in focus and exposing on a network.
  - Serving on a LAN address
  - Securing the gateway
  - Reverse-proxy notes
- [Performance & GPU Tuning](operations/performance.html) — Getting the most throughput from local synthesis.
  - GPU/VRAM considerations
  - CPS auto-tuning & ETA
  - Large-book load performance

### 12. Contributing & Project Info

- [Contribution Workflow](contributing/workflow.html) — How to propose changes to the project.
  - Fork & PR workflow
  - Squash-merge & focused PRs
  - Review expectations
- [Repository Agent Rules](contributing/agent-rules.html) — The .agent/rules router and what each rule set covers.
  - rules.md router & task map
  - Key constraints (modular_architecture)
  - verification before “done”
- [Testing & Verification](contributing/testing-verification.html) — How to verify a change end to end.
  - pytest (tests/ + plugins/)
  - ruff
  - frontend vitest/build
  - TDD expectation
- [Security Policy](contributing/security.html) — Supported versions and how to report vulnerabilities.
  - Supported versions
  - Private reporting
  - Response expectations
- [License](contributing/license.html) — How the project is licensed.
  - MIT license
  - Third-party/engine licenses

---

## Parked / open decisions

Tracked here so they don't get lost; revisit before the content pass closes.

- **IA review (#1)** — Steven to review this outline / section structure.
- **Voice-creation + Hugging Face shape** — _[future]_ placeholder. The exact flow for
  creating voices via Hugging Face isn't settled yet. Hold off documenting it; revisit
  once the shape is defined. Likely lands on `user-guide/voice-lab` and/or the
  `engines/*` pages. Page-model recommendation already agreed for when we get there.

---
_12 sections · 90 topic pages._
