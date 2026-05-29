#!/usr/bin/env python3
"""Authoring helper for the Audiobook Studio Handbook.

This is NOT required to view the site — the handbook is plain static HTML.
It regenerates, from the single information-architecture definition below:

  - handbook/assets/nav-data.js   (the nav tree consumed by nav.js / search.js)
  - handbook/index.html           (landing page)
  - handbook/<section>/<page>.html (one stub page per topic)
  - handbook/OUTLINE.md           (human-readable master table of contents)

Edit IA below and re-run:  python3 handbook/_tools/generate.py
"""

from __future__ import annotations

import json
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # handbook/

# ---------------------------------------------------------------------------
# Information Architecture (single source of truth)
# page = (slug, title, lede, [subtopics], [keywords], flags)
# flags: "" | "progress" (landing in Phase 12) | "future" (planned/post-release)
# ---------------------------------------------------------------------------

def P(slug, title, lede, subs, kw, flag=""):
    return {"slug": slug, "title": title, "lede": lede, "subs": subs, "kw": kw, "flag": flag}


SECTIONS = [
    ("overview", "Overview", [
        P("what-is-audiobook-studio", "What Is Audiobook Studio",
          "A local-first app that turns manuscripts into finished audiobooks with AI voice cloning.",
          ["The production-surface philosophy (not one-click TTS)",
           "Multi-voice narration, segment repair, assembly & export",
           "How the pieces fit together at a glance"],
          ["intro", "overview", "what is", "about"]),
        P("studio-2-at-a-glance", "Studio 2.0 at a Glance",
          "The headline of the 2.0 rearchitecture: a managed plugin-based TTS Server and task orchestrator.",
          ["Managed TTS Server + plugins", "Task orchestration replacing the worker loop",
           "Engine registry & voice bridge", "Pointer to “What's New” for the full story"],
          ["studio 2.0", "v2", "architecture", "new"]),
        P("use-cases", "Who It's For & Use Cases",
          "Indie authors, narrators, and hobbyists producing long-form audio locally.",
          ["Full-book production", "Iterative correction without per-edit cost",
           "Multi-character dialogue", "Studio-as-a-TTS-backend for automation"],
          ["use cases", "audience", "who"]),
        P("privacy-model", "Local-First & Privacy",
          "Your manuscript, samples, and output stay on your machine; cloud is explicit and opt-in.",
          ["What stays local (XTTS path)", "What leaves the machine if Voxtral is enabled",
           "Data ownership & no recurring usage cost"],
          ["privacy", "local-first", "data", "offline"]),
        P("feature-highlights", "Feature Highlights",
          "A scannable tour of the capabilities documented in this handbook.",
          ["Voices, variants & cloning", "Queue, progress & recovery",
           "Assembly/export to M4B/MP3", "Plugin SDK & external API"],
          ["features", "highlights", "capabilities"]),
    ]),

    ("getting-started", "Getting Started", [
        P("requirements", "Requirements",
          "Hardware and software you need before installing.",
          ["OS support (macOS / Linux / Windows)", "Python 3.10+, Node 18+, ffmpeg",
           "GPU recommendations for local XTTS"],
          ["requirements", "prerequisites", "ffmpeg", "gpu", "python", "node"]),
        P("installation", "Installation Paths",
          "Pick the path that matches your comfort level.",
          ["Pinokio (easiest)", "From source (developers)", "Demo library option"],
          ["install", "setup", "pinokio", "source"]),
        P("launchers", "Launcher Scripts (run.sh / run.ps1)",
          "What the one-command launchers do and the flags they accept.",
          ["Provisioning venv + ~/xtts-env + frontend build",
           "Flags: --setup-only, --no-reload, --port", "Windows run.ps1 equivalents"],
          ["run.sh", "run.ps1", "launcher", "start", "setup-only"]),
        P("environments", "The Two Environments",
          "Why XTTS lives in a separate Python environment from the web app.",
          ["./venv — the app", "~/xtts-env — heavy XTTS deps",
           "Dependency-conflict isolation"],
          ["venv", "xtts-env", "environment", "dependencies"]),
        P("first-run", "First Run",
          "Starting the server and opening the app on port 8123.",
          ["uvicorn run:app", "First-run model downloads", "Folders created on first launch"],
          ["first run", "uvicorn", "8123", "startup"]),
        P("demo-library", "Demo Library",
          "Optional sample project and voices to explore the workflow immediately.",
          ["Installing the demo bundle", "What it includes", "Removing it later"],
          ["demo", "sample", "examples"]),
        P("quick-tour", "5-Minute Workflow Tour",
          "End-to-end: project -> chapters -> voices -> generate -> assemble.",
          ["Create a project & add a chapter", "Build/assign a voice",
           "Generate & review", "Assemble the audiobook"],
          ["tour", "quickstart", "workflow", "getting started"]),
        P("platform-validation", "Platform Support & Install Validation",
          "Per-platform install/launch notes and the first-run smoke-test matrix.",
          ["macOS / Windows / Linux install & launch", "Pinokio install & launch flow",
           "First-run: deps, TTS Server startup, plugin discovery, XTTS/Voxtral setup",
           "Smoke test: sample project, test voice, synthesis, relaunch",
           "Platform-specific prerequisites & known limitations"],
          ["platform", "pinokio", "macos", "windows", "linux", "install validation", "smoke test"]),
    ]),

    ("concepts", "Core Concepts", [
        P("content-hierarchy", "Content Hierarchy",
          "How content nests: Library -> Project -> Chapter -> Block/Segment -> Chunk.",
          ["What each level owns", "Segments vs production blocks", "Chunks & the character limit"],
          ["hierarchy", "project", "chapter", "segment", "chunk", "block"]),
        P("characters-narrators", "Characters & Narrators",
          "Assigning distinct voices to narration and dialogue.",
          ["The default narrator", "Project characters & colors", "How assignment drives rendering"],
          ["character", "narrator", "dialogue", "assignment"]),
        P("voices", "Voices, Variants & Samples",
          "The Voice Lab model: a Voice has Variants, built from Samples, bound to an Engine.",
          ["Voice vs variant", "Samples & rebuilds", "Engine-per-voice", "Portable voice profiles"],
          ["voice", "variant", "sample", "profile", "latent"]),
        P("engines-overview", "Engines Overview",
          "The engines Studio can route to and how they differ.",
          ["XTTS (local)", "Voxtral (cloud)", "Composite (mixed) synthesis", "Plugins add more"],
          ["engine", "xtts", "voxtral", "composite", "mixed"]),
        P("production-pipeline", "The Production Pipeline",
          "The stages a chapter passes through to become audio.",
          ["Analysis -> Queue -> Synthesis -> Bake -> Assembly", "What happens at each stage",
           "Where progress comes from"],
          ["pipeline", "analysis", "synthesis", "bake", "assembly", "queue"]),
        P("artifacts-recovery", "Artifacts, Reuse & Recovery",
          "Why completion is decided by validated artifact metadata, not raw files.",
          ["Validated artifacts vs file existence", "Reuse of unchanged audio",
           "Restart recovery & reconciliation", "Immutable shared cache"],
          ["artifact", "reuse", "recovery", "reconciliation", "cache"]),
    ]),

    ("user-guide", "User Guide", [
        P("project-library", "Project Library",
          "Browse, create, and manage your audiobook projects.",
          ["Grid & list view, sorting", "Create project (title/author/series/cover)",
           "Open & delete projects"],
          ["library", "projects", "create project", "list view", "sort"], "progress"),
        P("project-workspace", "Project Workspace",
          "The project view, its header, and sub-navigation tabs.",
          ["Editing project metadata & cover", "Sub-nav: Chapters / Characters / Assemblies / Backups"],
          ["project", "workspace", "tabs", "metadata"]),
        P("chapters-tab", "Chapters",
          "Add and manage the chapters in a project.",
          ["Add chapter (upload .txt or paste)", "Chapter status & stats", "Reorder & delete"],
          ["chapter", "upload", "add chapter", "txt"]),
        P("characters-tab", "Characters",
          "Define project characters and assign each a voice and color.",
          ["Create a character", "Assign a voice profile/variant", "Color coding"],
          ["character", "voice assignment", "color"]),
        P("assemblies-tab", "Assemblies & Export",
          "Combine rendered chapters into finished audiobook files.",
          ["Assemble a project", "Download M4B / manage outputs", "Editable descriptions & stats"],
          ["assembly", "export", "m4b", "audiobook", "download"]),
        P("backups-tab", "Backups",
          "Snapshot a project (optionally with audio samples) and restore later.",
          ["Create a backup (+ comment)", "Include audio samples toggle", "Download / restore / delete"],
          ["backup", "snapshot", "restore"]),
        P("chapter-editor", "Chapter Editor",
          "Edit, assign, generate, and review a chapter — now centered on the Script tab.",
          ["Script tab: assignment, batch assign, generation & progress",
           "VCR playback: play / pause / stop / next / previous",
           "Edit tab: raw text + resync preview",
           "Note: Production/Performance/Preview tabs are folding into Script"],
          ["chapter editor", "script", "edit", "playback", "generate", "vcr"], "progress"),
        P("voice-lab", "Voice Lab",
          "Create, configure, sample, test, and share voices.",
          ["Create a voice & pick an engine", "Variants: add / rename / move / speed / test text",
           "Samples: upload, manage, rebuild", "Test & preview", "Import / export voice bundles",
           "Recording Guide prompt packs"],
          ["voice lab", "voices", "variant", "sample", "bundle", "recording guide"]),
        P("voice-tags-icons", "Voice Icons & Tags",
          "Identify and search voices with images and category tags.",
          ["Upload a 1:1 voice icon", "Tags (male/female/deep/narrator/accent/…)",
           "Searching & filtering by tag", "Per-voice plugin settings"],
          ["voice icon", "image", "tags", "search voices", "per-voice settings"], "progress"),
        P("processing-queue", "Processing Queue",
          "Monitor and control all background rendering and assembly jobs.",
          ["Queue stats & ETA", "Per-job output metadata (duration)", "Reorder, pause/resume, clear",
           "Job history", "Live updates over WebSocket"],
          ["queue", "jobs", "progress", "eta", "pause", "reorder"], "progress"),
        P("settings", "Settings",
          "Configure defaults, engines, the external API, and view diagnostics.",
          ["General (safe mode, default engine/speaker)",
           "Engines (enable/configure, install/import & delete plugins, logs)",
           "API panel", "About / diagnostics"],
          ["settings", "general", "engines", "api", "about", "plugins"]),
        P("audio-formats", "Audio Guidance & File Formats",
          "Supported inputs/outputs and quality guidance.",
          ["Input text & audio formats", "Internal vs output formats", "Bitrate & normalization tips",
           "Per-segment character limits"],
          ["audio", "format", "mp3", "m4b", "wav", "bitrate", "character limit"]),
        P("troubleshooting", "Troubleshooting & FAQ",
          "Common issues and how to resolve them.",
          ["Failed jobs & retries", "Voice quality", "Enabling Voxtral", "Long-sentence warnings"],
          ["troubleshooting", "faq", "help", "errors", "failed"]),
    ]),

    ("engines", "Engines & Voice Cloning", [
        P("xtts", "XTTS (Local)",
          "The private, local-default cloning engine.",
          ["What XTTS is & GPU needs", "Latents & the voice profile", "Strengths and tuning"],
          ["xtts", "coqui", "local", "gpu", "latent"]),
        P("voxtral", "Voxtral (Cloud)",
          "Optional Mistral-hosted engine, hidden until you add an API key.",
          ["Enabling with a Mistral key", "What data is sent", "When to use it"],
          ["voxtral", "mistral", "cloud", "api key"]),
        P("composite", "Composite Synthesis",
          "Combining multiple engines/voices within one chapter.",
          ["When chapters mix engines", "How composite rendering stitches output",
           "Note: formerly “mixed”"],
          ["composite", "mixed", "multi-engine"]),
        P("engine-settings", "Engine Settings & Verification",
          "Per-engine configuration and the verification/self-test flow.",
          ["Schema-driven engine settings", "Verification & test runs", "Enable/disable & status"],
          ["engine settings", "verify", "test", "schema"]),
        P("voice-quality", "Voice Cloning Quality",
          "Why quality varies and how to get the best clone.",
          ["Sample selection heuristics", "Recording quality factors", "Variant strategies"],
          ["quality", "cloning", "samples", "tuning"]),
    ]),

    ("api", "TTS Gateway API", [
        P("overview", "Gateway Overview & Enabling",
          "Use Studio as an external TTS backend over HTTP.",
          ["What the gateway is", "Enabling it in Settings", "OpenAPI docs at /api/v1/tts/docs"],
          ["tts api", "gateway", "external", "http", "openapi"]),
        P("auth", "Authentication & Rate Limiting",
          "Securing the gateway for LAN or shared use.",
          ["API key (Bearer) auth", "LAN binding considerations", "Per-IP rate limiting"],
          ["auth", "api key", "bearer", "rate limit", "security"]),
        P("endpoints", "Endpoints Reference",
          "The routes exposed under /api/v1/tts.",
          ["GET /engines, /engines/{id}", "POST /synthesize, /preview",
           "GET /jobs/{id}, /jobs/{id}/audio"],
          ["endpoints", "synthesize", "preview", "engines", "jobs"]),
        P("sync-vs-queued", "Inline vs Queued + Polling",
          "Short text returns inline; long text queues a job you poll.",
          ["Inline threshold", "Job response & poll URL", "Polling for completion"],
          ["inline", "queued", "polling", "job status"]),
        P("priority", "Priority Policies",
          "How API jobs are scheduled relative to Studio's own work.",
          ["TTS_API_PRIORITY modes", "studio_first / equal / api_first", "Avoiding starvation"],
          ["priority", "scheduling", "TTS_API_PRIORITY", "fairness"]),
        P("examples", "Examples",
          "Copy-paste curl and automation snippets.",
          ["Discover engines", "Synthesize inline & queued", "Poll & download audio"],
          ["examples", "curl", "automation", "snippets"]),
        P("llm-controllers", "LLM / Controller Readiness",
          "Forward-looking: the API surface for future LLM/controller plugins.",
          ["What a controller would need", "Current gaps being verified",
           "Not built yet — planning only"],
          ["llm", "controller", "claude", "automation", "future"], "future"),
    ]),

    ("plugin-sdk", "Plugin SDK", [
        P("overview", "Plugin Architecture",
          "How engines plug into Studio through the TTS Server.",
          ["Folder plugins & discovery", "Studio-owns vs plugin-owns", "The declared-hook model"],
          ["plugin", "sdk", "architecture", "engine"]),
        P("anatomy", "Anatomy of a Plugin",
          "The files that make up a self-contained plugin mini-repo.",
          ["manifest.json, interface.py", "plugin/ (core + studio + server)",
           "settings_schema.json, requirements.txt, tests/"],
          ["anatomy", "layout", "manifest", "interface", "structure"]),
        P("manifest", "manifest.json Reference",
          "Every manifest field and what it controls.",
          ["engine_id, entry_class, capabilities", "behavior (text_chunk_limit, progress_pattern)",
           "resource (gpu/vram), local/cloud/network, languages"],
          ["manifest", "engine_id", "capabilities", "behavior", "resource"]),
        P("engine-contract", "Engine Contract & Hooks",
          "The callables Studio expects an engine to implement.",
          ["check_env()", "synthesize(request)", "verify / run_test / build_voice_asset"],
          ["contract", "hooks", "check_env", "synthesize", "interface"]),
        P("behavior-metadata", "Behavior Metadata",
          "Driving core behavior from manifest metadata instead of engine-ID branches.",
          ["text_chunk_limit / split target", "progress_pattern parsing", "Per-voice settings declaration"],
          ["behavior", "metadata", "chunk limit", "progress pattern"]),
        P("compatibility", "Compatibility & Contract Versioning",
          "Verifying a plugin matches the Studio plugin contract before use.",
          ["Contract version (v1)", "Expected callable existence & signatures", "Compatibility checks at load"],
          ["compatibility", "contract version", "verification", "v1"], "progress"),
        P("plugin-context", "Studio Plugin Context Contract",
          "How plugins reach Studio services without importing app persistence.",
          ["Why plugin/core must stay portable", "Context passed into plugin/studio adapters",
           "Persistence stays Studio-owned"],
          ["plugin context", "boundary", "portable", "adapter"], "progress"),
        P("standalone-repos", "Portable Core & Standalone Repos",
          "First-party engines as standalone repos that also run from a CLI.",
          ["XTTS Web / Voxtral Web repo layout", "CLI entry point & dependency path",
           "The standalone CLI Builder Harness (static page)"],
          ["standalone", "repo", "cli", "builder harness", "portable"], "progress"),
        P("dev-mode", "Studio Dev Mode Preview",
          "The authoritative UI preview path for plugin development.",
          ["What Dev Mode previews", "Scenario fixtures from the plugin", "Using it while building"],
          ["dev mode", "preview", "fixtures", "development"], "progress"),
        P("install-import", "Installing, Importing & Deleting Plugins",
          "Managing plugins from the UI and by zip import.",
          ["Dependency-install feedback", "Zip import/delete flows", "Refreshing plugin state",
           "Note: in-app GitHub/HF download is post-release"],
          ["install plugin", "import", "delete", "zip", "dependencies"], "progress"),
        P("template", "Using the Template",
          "Start from the bundled plugin template.",
          ["Copy docs/plugin-template", "Update manifest & schema", "Implement the interface"],
          ["template", "scaffold", "start", "boilerplate"]),
        P("testing", "Testing Your Plugin",
          "Keeping tests and fixtures inside the plugin folder.",
          ["Plugin-local tests/ collected by pytest", "Contract test", "Fixtures & generated outputs"],
          ["testing", "pytest", "fixtures", "contract test"]),
        P("submission", "Submission Guidelines",
          "What a plugin needs to be accepted.",
          ["Security & safety review", "Stability/performance", "Self-contained & licensed"],
          ["submission", "review", "acceptance", "guidelines", "security"]),
    ]),

    ("architecture", "Architecture", [
        P("overview", "Architecture Overview",
          "The big-picture map of Studio 2.0 subsystems and ownership.",
          ["Ownership split: orchestrator / watchdog / bridge", "Request flow end to end",
           "No import-time side effects"],
          ["architecture", "overview", "subsystems", "diagram"]),
        P("tts-server", "TTS Server & Watchdog",
          "The long-lived TTS Server subprocess and its supervisor.",
          ["tts_server.py & READY signal", "watchdog spawn/health/restart", "Circuit breaker"],
          ["tts server", "watchdog", "subprocess", "health", "restart"]),
        P("voice-bridge", "VoiceBridge",
          "The single routing point from a voice request to an engine.",
          ["Routing over HTTP", "bridge_remote & tts_client", "Engine enablement"],
          ["voice bridge", "routing", "http", "tts_client"]),
        P("orchestration", "Task Orchestration",
          "How background work is scheduled and executed.",
          ["StudioTask abstraction & task types", "orchestrator: submit/cancel/recover",
           "policies / resources / recovery", "job-handler registry, JobKind/TaskType"],
          ["orchestration", "scheduler", "studiotask", "policies", "recovery"]),
        P("progress", "Progress Services",
          "Centralized progress math, ETA, reconciliation, and broadcasting.",
          ["Rounded to 2 decimals, >=1% to broadcast", "ETA estimation", "Reconciliation as truth"],
          ["progress", "eta", "broadcast", "reconciliation"]),
        P("boot", "Boot Sequence",
          "The one explicit place startup side effects are allowed.",
          ["boot_studio() & boot_tts_server()", "Migrations then watchdog", "Idempotent, off the request path"],
          ["boot", "startup", "boot_studio", "migration"]),
        P("state", "State: state.json + SQLite",
          "The live state store and the persistent database.",
          ["state.json: live jobs/settings", "SQLite: projects/chapters/segments/queue history",
           "StorageManager direction"],
          ["state", "sqlite", "state.json", "database", "storage"]),
        P("web-api", "Web & API Layer",
          "The FastAPI app, routers, WebSocket, and the gateway sub-app.",
          ["web.py mounts & lifecycle", "Domain routers", "ws.py broadcasts",
           "jobs REST -> WebSocket migration"],
          ["web", "fastapi", "routers", "websocket", "api"]),
        P("paths-security", "Paths & Security",
          "Treating filesystem paths as an untrusted security surface.",
          ["safe_join / secure_join_flat / find_secure_file", "Containment pattern", "CodeQL alignment"],
          ["paths", "security", "safe_join", "traversal", "codeql"]),
        P("frontend", "Frontend Architecture",
          "How the React app is organized.",
          ["pages / components / hooks / store / theme", "Canonical data vs live overlays",
           "Tests under frontend/tests"],
          ["frontend", "react", "store", "hooks", "pages"]),
        P("internal-api", "Internal HTTP API Reference",
          "The internal domain route groups behind the UI.",
          ["projects / chapters / voices / queue", "generation / jobs / settings / system",
           "analysis / migration / engines"],
          ["internal api", "routers", "endpoints", "rest"]),
    ]),

    ("operations", "Operations & Configuration", [
        P("launcher-options", "Launcher Options",
          "Running the app for different scenarios.",
          ["run.sh / run.ps1 flags", "Generic plugin setup loop", "Port & reload control"],
          ["operations", "launcher", "flags", "port"]),
        P("env-vars", "Environment Variables",
          "Configurable env vars resolved in app/core/config.py.",
          ["AUDIOBOOK_BASE_DIR & storage roots", "PLUGINS_DIR / PLUGIN_DATA_DIR",
           "XTTS_ENV_DIR, ports, test-mode flags"],
          ["env", "environment variables", "config", "AUDIOBOOK_BASE_DIR", "PLUGINS_DIR"]),
        P("storage-layout", "Storage Layout",
          "Where Studio keeps projects, voices, uploads, and transient data.",
          ["projects/<id>/{audio,text,m4b,cover,trash}", "voices/ & plugin_data/", "transient & trash"],
          ["storage", "layout", "folders", "projects dir"]),
        P("xtts-env", "The XTTS Environment",
          "Maintaining the separate ~/xtts-env install.",
          ["What lives in xtts-env", "update_xtts script", "Recreating on stale deps"],
          ["xtts-env", "update_xtts", "coqui", "dependencies"]),
        P("scripts", "Maintenance Scripts",
          "The helper scripts in scripts/.",
          ["backfill_stats / sync_durations", "recover_projects_from_disk", "install_hooks / dev.sh"],
          ["scripts", "maintenance", "backfill", "recover", "dev.sh"]),
        P("backups-recovery", "Backups & Recovery",
          "Protecting and restoring project data.",
          ["Project backups", "Disk-based project recovery", "Startup reconciliation"],
          ["backup", "recovery", "restore", "reconcile"]),
        P("headless-lan", "Headless & LAN Exposure",
          "Running without the UI in focus and exposing on a network.",
          ["Serving on a LAN address", "Securing the gateway", "Reverse-proxy notes"],
          ["headless", "lan", "network", "server mode"]),
        P("performance", "Performance & GPU Tuning",
          "Getting the most throughput from local synthesis.",
          ["GPU/VRAM considerations", "CPS auto-tuning & ETA", "Large-book load performance"],
          ["performance", "gpu", "vram", "tuning", "cps"]),
    ]),

    ("whats-new", "What's New in 2.0", [
        P("at-a-glance", "1.x -> 2.0 at a Glance",
          "The short version of what changed and why it matters.",
          ["Headline changes", "What users feel day-to-day", "What developers gain"],
          ["whats new", "changes", "2.0", "summary"]),
        P("architectural-shifts", "Architectural Shifts",
          "The structural changes under the hood.",
          ["One-shot subprocess -> managed TTS Server", "Worker loop -> orchestrator",
           "Engine-ID branches -> plugin manifests", "Raw-file checks -> validated artifacts"],
          ["architecture", "shifts", "rearchitecture", "changes"]),
        P("new-capabilities", "New Capabilities",
          "Features that didn't exist in 1.x.",
          ["Plugin SDK & external TTS API", "Composite engine, project backups",
           "Predictive progress, VCR playback", "Voice tags & icons"],
          ["new features", "capabilities", "additions"]),
        P("migration", "Migration Notes",
          "What changes for existing 1.x workspaces.",
          ["state.json -> SQLite migration", "Folder/compatibility notes", "What carries over"],
          ["migration", "upgrade", "1.x", "state.json"]),
        P("pr-talking-points", "PR Talking Points",
          "Benefit-framed messaging for announcements and marketing.",
          ["Reliability & recovery story", "Extensibility (plugins/API) story",
           "Polish (playback, progress, voices) story"],
          ["pr", "marketing", "talking points", "announcement", "benefits"]),
        P("changelog", "Changelog",
          "Dated record of shipped behavior changes.",
          ["2.0 highlights", "Recent patch lines", "Pointer to wiki Changelog"],
          ["changelog", "releases", "versions", "history"]),
    ]),

    ("contributing", "Contributing & Project Info", [
        P("workflow", "Contribution Workflow",
          "How to propose changes to the project.",
          ["Fork & PR workflow", "Squash-merge & focused PRs", "Review expectations"],
          ["contributing", "pull request", "fork", "workflow"]),
        P("agent-rules", "Repository Agent Rules",
          "The .agent/rules router and what each rule set covers.",
          ["rules.md router & task map", "Key constraints (modular_architecture)",
           "verification before “done”"],
          ["agent rules", "rules", "conventions", "AGENTS.md"]),
        P("testing-verification", "Testing & Verification",
          "How to verify a change end to end.",
          ["pytest (tests/ + plugins/)", "ruff", "frontend vitest/build", "TDD expectation"],
          ["testing", "pytest", "ruff", "vitest", "verification", "ci"]),
        P("security", "Security Policy",
          "Supported versions and how to report vulnerabilities.",
          ["Supported versions", "Private reporting", "Response expectations"],
          ["security", "vulnerability", "disclosure"]),
        P("license", "License",
          "How the project is licensed.",
          ["MIT license", "Third-party/engine licenses"],
          ["license", "mit", "legal"]),
    ]),

    ("reference", "Reference", [
        P("glossary", "Glossary",
          "Definitions for the terms used throughout the handbook.",
          ["Project / chapter / segment / chunk", "Voice / variant / sample / engine",
           "Task / job / artifact"],
          ["glossary", "terms", "definitions"]),
        P("file-formats", "File Formats",
          "Supported input/output formats in one place.",
          ["Text inputs", "Audio inputs (samples)", "Outputs (WAV/MP3/M4B)"],
          ["formats", "file types", "wav", "mp3", "m4b"]),
        P("ui-cheat-sheet", "UI Cheat Sheet",
          "Quick reference for navigation and shortcuts.",
          ["Main navigation map", "Common actions", "Keyboard shortcuts"],
          ["cheat sheet", "shortcuts", "reference", "ui"]),
    ]),
]

# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

FLAG_BANNER = {
    "progress": ('<div class="callout progress"><span class="ico">&#128679;</span><div>'
                 '<strong>In progress.</strong> This area is changing as part of '
                 '<em>Phase 12 (Polish &amp; Cleanup)</em>. The outline reflects the near-term '
                 'release shape; detailed content lands once the change merges.</div></div>'),
    "future": ('<div class="callout note"><span class="ico">&#128640;</span><div>'
               '<strong>Planned / future.</strong> Described here for orientation; '
               'not part of the current release.</div></div>'),
}


def page_html(section, page):
    root = "../"
    title = escape(page["title"])
    subs = "".join(
        "<li>" + escape(s).replace("-&gt; ", "&rarr; ").replace(" -&gt;", " &rarr;") + "</li>"
        for s in page["subs"]
    )
    banner = FLAG_BANNER.get(page["flag"], "")
    return f"""<!doctype html>
<html lang="en" data-theme="auto">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title} &middot; Audiobook Studio Handbook</title>
  <link rel="stylesheet" href="{root}assets/style.css" />
</head>
<body>
  <a class="skip-link" href="#content">Skip to content</a>
  <header class="topbar">
    <button class="menu-toggle" aria-label="Toggle navigation" aria-expanded="false">&#9776;</button>
    <a class="brand" href="{root}index.html"><span class="brand-mark" aria-hidden="true"></span>Audiobook Studio<span class="brand-sub">Handbook</span></a>
    <div class="search" role="search">
      <input id="search-input" type="search" placeholder="Search the handbook&hellip;  (press /)" autocomplete="off" aria-label="Search the handbook" />
      <div id="search-results" class="search-results" hidden></div>
    </div>
    <button class="theme-toggle" aria-label="Toggle color theme">&#9680;</button>
  </header>
  <div class="layout">
    <aside class="sidebar" id="sidebar" aria-label="Documentation navigation"></aside>
    <main class="content" id="content">
      <div class="content-inner">
        <nav class="breadcrumbs" aria-label="Breadcrumb">
          <a href="{root}index.html">Handbook</a><span class="sep">/</span>
          <span>{escape(section[1])}</span><span class="sep">/</span>
          <span>{title}</span>
        </nav>
        <article>
          <h1>{title}</h1>
          <p class="lede">{escape(page["lede"])}</p>
          {banner}
          <h2>What this page will cover</h2>
          <ul class="subtopics">{subs}</ul>
          <div class="callout todo"><span class="ico">&#9999;&#65039;</span><div>
            <strong>Content TBD.</strong> This is an outline stub. Full walkthroughs, screenshots,
            and examples are written in a later pass once the structure is approved.</div></div>
        </article>
        <footer class="page-footer">
          <span>Section: {escape(section[1])}</span>
          <a href="{root}index.html">&larr; All sections</a>
        </footer>
      </div>
    </main>
  </div>
  <script>window.HANDBOOK_ROOT = "{root}"; window.HANDBOOK_PAGE = "{page['slug']}";</script>
  <script src="{root}assets/nav-data.js"></script>
  <script src="{root}assets/nav.js"></script>
  <script src="{root}assets/search.js"></script>
</body>
</html>
"""


def index_html():
    cards = ""
    for i, (sid, title, pages) in enumerate(SECTIONS, 1):
        first = pages[0]["slug"]
        # short blurb per section = its first page lede, trimmed
        blurb = escape(pages[0]["lede"])
        cards += (
            f'<a class="card" href="{sid}/{first}.html">'
            f'<span class="card-num">{i}</span>'
            f"<h3>{escape(title)}</h3><p>{blurb}</p></a>"
        )
    return f"""<!doctype html>
<html lang="en" data-theme="auto">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Audiobook Studio Handbook</title>
  <link rel="stylesheet" href="assets/style.css" />
</head>
<body>
  <a class="skip-link" href="#content">Skip to content</a>
  <header class="topbar">
    <button class="menu-toggle" aria-label="Toggle navigation" aria-expanded="false">&#9776;</button>
    <a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true"></span>Audiobook Studio<span class="brand-sub">Handbook</span></a>
    <div class="search" role="search">
      <input id="search-input" type="search" placeholder="Search the handbook&hellip;  (press /)" autocomplete="off" aria-label="Search the handbook" />
      <div id="search-results" class="search-results" hidden></div>
    </div>
    <button class="theme-toggle" aria-label="Toggle color theme">&#9680;</button>
  </header>
  <div class="layout">
    <aside class="sidebar" id="sidebar" aria-label="Documentation navigation"></aside>
    <main class="content" id="content">
      <section class="hero">
        <p class="eyebrow">Studio 2.0</p>
        <h1>Audiobook Studio Handbook</h1>
        <p>Everything from first launch to building engine plugins &mdash; for creators, developers,
           integrators, and operators. This is a living outline; sections fill in over time.</p>
      </section>
      <div class="card-grid">
        {cards}
      </div>
    </main>
  </div>
  <script>window.HANDBOOK_ROOT = ""; window.HANDBOOK_PAGE = "";</script>
  <script src="assets/nav-data.js"></script>
  <script src="assets/nav.js"></script>
  <script src="assets/search.js"></script>
</body>
</html>
"""


def nav_data_js():
    tree = {"sections": []}
    for sid, title, pages in SECTIONS:
        tree["sections"].append({
            "id": sid,
            "title": title,
            "pages": [{
                "id": p["slug"],
                "title": p["title"],
                "url": f"{sid}/{p['slug']}.html",
                "keywords": p["kw"],
                "inProgress": p["flag"] in ("progress", "future"),
            } for p in pages],
        })
    return ("/* Generated by handbook/_tools/generate.py — single source of truth for nav + search.\n"
            "   Safe to hand-edit; re-running the generator overwrites it. */\n"
            "window.NAV_DATA = " + json.dumps(tree, indent=2) + ";\n")


def outline_md():
    lines = [
        "# Audiobook Studio Handbook — Outline",
        "",
        "Master table of contents for the static documentation site in this folder.",
        "Open `index.html` to browse it. Legend: **[soon]** = landing in Phase 12 · "
        "**[future]** = planned/post-release.",
        "",
    ]
    for i, (sid, title, pages) in enumerate(SECTIONS, 1):
        lines.append(f"## {i}. {title}")
        lines.append("")
        for p in pages:
            tag = " **[soon]**" if p["flag"] == "progress" else (" **[future]**" if p["flag"] == "future" else "")
            lines.append(f"- [{p['title']}]({sid}/{p['slug']}.html){tag} — {p['lede']}")
            for s in p["subs"]:
                lines.append(f"  - {s}")
        lines.append("")
    total = sum(len(pages) for _, _, pages in SECTIONS)
    lines.append("---")
    lines.append(f"_{len(SECTIONS)} sections · {total} topic pages._")
    lines.append("")
    return "\n".join(lines)


def main():
    (ROOT / "assets").mkdir(parents=True, exist_ok=True)
    (ROOT / "assets" / "nav-data.js").write_text(nav_data_js(), encoding="utf-8")
    (ROOT / "index.html").write_text(index_html(), encoding="utf-8")
    (ROOT / "OUTLINE.md").write_text(outline_md(), encoding="utf-8")

    count = 0
    for section in SECTIONS:
        sid, title, pages = section
        sec_dir = ROOT / sid
        sec_dir.mkdir(parents=True, exist_ok=True)
        for page in pages:
            (sec_dir / f"{page['slug']}.html").write_text(page_html(section, page), encoding="utf-8")
            count += 1
    print(f"Generated nav-data.js, index.html, OUTLINE.md, and {count} stub pages "
          f"across {len(SECTIONS)} sections.")


if __name__ == "__main__":
    main()
