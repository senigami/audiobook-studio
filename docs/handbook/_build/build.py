#!/usr/bin/env python3
"""Build the docs handbook pages from one content source.

Emits LEAN page shells: head + article content + placeholders + 3 script lines.
The shared chrome (top nav, sidebar, breadcrumb, prev/next, footer) is injected
at runtime by assets/hb-nav.js from assets/nav-data.js — it is NOT baked per page.
So this script handles only per-page content; navigation lives in one place.

Run:  python3 docs/handbook/_build/build.py
"""
from __future__ import annotations
import html, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # docs/handbook/

# ---- content helpers (return HTML strings) ------------------------------------
def esc(s): return html.escape(s, quote=True)
def h2(t): return f"<h2>{t}</h2>"
def h3(t): return f"<h3>{t}</h3>"
def p(t): return f"<p>{t}</p>"
def ul(items): return "<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>"
def ol(items): return "<ol>" + "".join(f"<li>{i}</li>" for i in items) + "</ol>"
def tip(t): return f'<div class="tip"><b>Tip —</b> {t}</div>'
def note(t): return f'<div class="note"><b>Note —</b> {t}</div>'
def warn(t): return f'<div class="warning"><b>Heads up —</b> {t}</div>'
def future(t): return f'<div class="future"><b>Coming with 2.0 —</b> {t}</div>'
def soon(t): return f'<div class="soon-note"><b>In progress —</b> {t}</div>'
def glance(items):
    return ('<div class="at-glance"><div class="at-title">At a glance</div><ul>'
            + "".join(f"<li>{i}</li>" for i in items) + "</ul></div>")
def pre(code): return f"<pre><code>{esc(code)}</code></pre>"
def table(headers, rows):
    th = "".join(f"<th>{c}</th>" for c in headers)
    body = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f"<table><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table>"
def L(href, text): return f'<a href="@@{href}@@">{text}</a>'  # resolved to a #route at render
def demo(demo_id): return f'<div class="hb-demo" data-demo="{demo_id}"></div>'  # SPA mounts the player

SHELL = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title} | Handbook</title>
    <meta name="description" content="{desc}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="../../assets/studio2.css" />
    <link rel="stylesheet" href="../../assets/handbook.css" />
  </head>
  <body>
    <nav class="site-nav" id="hb-top"></nav>
    <div class="doc-shell">
      <aside class="doc-sidebar" id="hb-sidebar"></aside>
      <article class="doc-article">
        <div class="doc-breadcrumb" id="hb-crumb"></div>
        <h1>{h1}</h1>
        <p class="lede">{lede}</p>
        {body}
        <div class="next-links" id="hb-next"></div>
      </article>
    </div>
    <footer class="site-footer" id="hb-foot"></footer>
    <script>window.HB_ROOT = "../"; window.HB_SECTION = "{section}"; window.HB_PAGE = "{slug}";</script>
    <script src="../../assets/nav-data.js"></script>
    <script src="../../assets/hb-nav.js"></script>
  </body>
</html>
"""

# ---- content: { "section/slug": (title, desc, lede, body_html) } ---------------
# Authored to STYLE.md: simple natural language, bold lead sentences, scannable,
# callouts for visual distinction, local/cloud framing (XTTS default).
C = {}
def page(key, title, desc, lede, *blocks):
    C[key] = (title, desc, lede, "\n        ".join(blocks))

# ============================ OVERVIEW =========================================
page("overview/what-is-audiobook-studio",
  "What Is Audiobook Studio",
  "A local-first app that turns manuscripts into finished audiobooks with AI voice cloning — a full production surface, not one-click text-to-speech.",
  "Audiobook Studio is a local-first app that turns a manuscript into a finished, multi-voice audiobook using AI voice cloning — all on your own machine.",
  glance([
    "It runs on <strong>your computer</strong>; your text and audio stay local unless you choose otherwise.",
    "It's a <strong>production surface</strong>, not one-click text-to-speech — you direct narration line by line.",
    "One default <strong>local engine</strong> means no accounts and no per-word cost.",
    "You assemble narrated chapters into a real audiobook file (M4B/MP3)."]),
  h2('A production tool, not a "read it aloud" button'),
  p("<strong>Most text-to-speech tools give you one voice and one pass.</strong> Audiobook Studio is built for the messy reality of a whole book: many characters, lines that need a second take, pronunciation you want to fix, and a finished file at the end."),
  p("You stay in control of the result. Assign a voice to the narrator and a different one to each character, regenerate just the lines you change, and listen back as you go."),
  h2("What it does"),
  ul([
    "<strong>Multi-voice narration.</strong> Give the narrator one voice and every character their own.",
    "<strong>Voice cloning &amp; a library.</strong> Build voices from samples; organize them with icons and tags.",
    "<strong>Targeted repair.</strong> Edit a line and regenerate only that segment — no charge.",
    "<strong>Assembly &amp; export.</strong> Combine finished chapters into an audiobook file."]),
  h2("Local-first by design"),
  p("<strong>Your manuscript, samples, and audio stay on your machine.</strong> The default voice engine runs locally, so you can narrate an entire book with no account and no usage meter. If you ever enable an optional cloud engine, that choice is explicit and clearly disclosed."),
  tip("Prefer to keep everything offline? You can. The local engine needs no network once it's set up."),
  h2("How the pieces fit together"),
  ol([
    "<strong>Project &amp; chapters</strong> — your book, broken into chapters of text.",
    "<strong>Voices &amp; casting</strong> — voices assigned to the narrator and characters.",
    "<strong>Generation</strong> — a managed engine turns assigned text into audio.",
    "<strong>Assembly</strong> — finished chapters become a single audiobook file."]),
  p("In 2.0, generation runs in a <strong>managed, crash-isolated TTS Server</strong> with installable engines. See " + L("studio-2-at-a-glance.html", "Studio 2.0 at a Glance") + "."))

page("overview/studio-2-at-a-glance",
  "Studio 2.0 at a Glance",
  "The headline of the 2.0 rearchitecture: a managed plugin-based TTS Server, a task orchestrator, and an engine registry with a voice bridge.",
  "Studio 2.0 is a ground-up rearchitecture. The big idea: move synthesis into a managed, crash-isolated <strong>TTS Server</strong>, and make engines and voices first-class, installable pieces.",
  glance([
    "<strong>Managed TTS Server</strong> runs engines in a separate, supervised process.",
    "A <strong>task orchestrator</strong> replaces the old single worker loop.",
    "An <strong>engine registry</strong> and <strong>voice bridge</strong> keep voices independent of engines.",
    "Engines install from GitHub; voices come from a Hugging Face library."]),
  h2("A managed TTS Server"),
  p("<strong>Synthesis no longer runs inside the app.</strong> A dedicated TTS Server process hosts the voice engines, manages GPU memory, and exposes a clean internal API. Studio supervises it with a watchdog and restarts it if it stops responding. An engine can crash without taking down the app or losing your work."),
  h2("A task orchestrator"),
  p("<strong>Work is scheduled, not improvised.</strong> Instead of one worker loop juggling everything, 2.0 uses an orchestrator that queues jobs, tracks progress centrally, and recovers cleanly after a restart. Completion is decided by validated artifacts, not loose files."),
  h2("Engine registry &amp; voice bridge"),
  p("<strong>One boundary routes every synthesis request.</strong> The registry knows what engines are installed and what they can do; the voice bridge is the only path that hands a request to an engine. Because a voice's identity is kept separate from any engine's assets, the same voice can move between engines without being rebuilt."),
  tip("You can add, update, or swap engines without rewrites rippling into the queue, the editor, or your projects."),
  h2("Installable engines &amp; a voice library"),
  p("<strong>Engines and voices are bundles you can install and share.</strong> Engines are GitHub repos you install like Stable Diffusion extensions (clone to install, pull to update). Voices come from a Hugging Face library with icons, playable samples, and rich tags."),
  future("the engine browser, the Hugging Face voice library, and AI voice casting are part of the 2.0 rollout."),
  h2("What stayed the same"),
  p("The workflow you already know — projects, chapters, voices, generate, assemble — is intact. 2.0 changes the machinery underneath, not the shape of producing a book."))

page("overview/use-cases",
  "Who It's For &amp; Use Cases",
  "Who Audiobook Studio is for — indie authors, narrators, hobbyists, and developers — and the workflows it's built to handle.",
  "Audiobook Studio is for anyone producing long-form spoken audio locally — indie authors, narrators, hobbyists, and developers who want to build on top of it.",
  glance([
    "Built for <strong>whole-book production</strong>, not one-off clips.",
    "Iterate freely — fixing a line costs nothing to regenerate.",
    "Handles <strong>multi-character</strong> dialogue with distinct voices.",
    "Doubles as a local <strong>TTS backend</strong> you can automate."]),
  h2("Who it's for"),
  ul([
    "<strong>Indie authors &amp; self-publishers.</strong> Produce an audiobook of your own work at home, no studio time or per-word fees.",
    "<strong>Narrators &amp; voice artists.</strong> Build and reuse voices, scale narration, keep audio on your own machine.",
    "<strong>Hobbyists &amp; accessibility users.</strong> Turn fan fiction, web serials, notes, or documents into audio.",
    "<strong>Developers &amp; integrators.</strong> Use the gateway API, write engine plugins, publish voices."]),
  h2("What it's built to do"),
  h3("Full-book production"),
  p("<strong>The whole point is the long haul.</strong> Chapters, characters, a queue that survives restarts, and assembly into a finished file."),
  h3("Iterative correction without per-edit cost"),
  p("<strong>Revising is free.</strong> Because the default engine runs locally, re-record a clumsy line as many times as you like. Change the text, regenerate that segment, move on."),
  h3("Multi-character dialogue"),
  p("<strong>Every character can sound like themselves.</strong> See " + L("../concepts/characters-narrators.html", "Characters &amp; Narrators") + " for casting."),
  h3("Studio as a TTS backend"),
  p("<strong>It's also a local speech engine for your own tools.</strong> Through the gateway API, scripts and apps generate speech via the engines you've installed."),
  future("the documented gateway API and installable engines make automation first-class. See " + L("../api/overview.html", "TTS Gateway API") + "."),
  h2("When it might not fit"),
  p("Studio is a production tool. For a single short clip with no editing, a simpler utility may be faster. Studio shines when there's a <em>book's worth</em> of work to manage."))

page("overview/privacy-model",
  "Local-First &amp; Privacy",
  "How Audiobook Studio keeps your manuscript, samples, and output on your machine — and exactly what happens if you enable an optional cloud engine.",
  "Your manuscript, voice samples, and finished audio stay on your machine. Anything that leaves is optional, opt-in, and clearly disclosed.",
  glance([
    "The <strong>default engine is local</strong> — text and audio never leave your computer.",
    "Cloud engines are <strong>optional and off by default</strong>.",
    "When something would leave the machine, Studio <strong>tells you first</strong>.",
    "No accounts, no recurring usage cost to run locally."]),
  h2("What stays local"),
  p("<strong>Everything, by default.</strong> With the local engine, your chapters, the voice samples you upload, and every rendered file are processed and stored on your own machine. You can work completely offline once setup is done."),
  h2("What leaves the machine — only if you choose"),
  p("<strong>Cloud engines are opt-in.</strong> Studio supports optional cloud voice engines (enabled with an API key), but none are installed or active by default. If you turn one on, the text to be spoken — and any reference audio that engine needs — is sent to that provider to generate the audio."),
  warn("a cloud engine means some data leaves your device. Studio surfaces this clearly before you use one, and shows which engines send data off-machine."),
  p("This is a deliberate trade-off you control, not a default. The " + L("../engines/voxtral.html", "Cloud Engines") + " page explains each engine's data behavior."),
  h2("No silent fallback"),
  p("<strong>Studio won't quietly route your work somewhere else.</strong> If a local engine can't do something, it tells you — it does not silently fall back to a cloud service. What runs where is always visible."),
  h2("Data ownership &amp; cost"),
  ul([
    "<strong>You own your files.</strong> Projects, voices, and output live in folders you can back up, move, or delete.",
    "<strong>No usage meter locally.</strong> The local engine has no per-word or per-minute charge.",
    "<strong>No account required</strong> to install and use the local workflow."]),
  tip("For maximum privacy, simply don't enable any cloud engine. The local default covers full audiobook production on its own."))

page("overview/feature-highlights",
  "Feature Highlights",
  "A scannable tour of Audiobook Studio's capabilities — voices and cloning, the queue and recovery, assembly and export, the plugin SDK, and the external API.",
  "A quick, scannable tour of what Audiobook Studio can do. Each capability has its own deeper page later in the handbook.",
  glance([
    "Voices, variants, and cloning, organized in a real library.",
    "A reliable queue with progress and restart recovery.",
    "Assembly and export to M4B / MP3.",
    "Extensible: a plugin SDK and an external API."]),
  h2("Voices, variants &amp; cloning"),
  p("<strong>Build a voice once, reuse it everywhere.</strong> Create voices from audio samples, keep multiple variants, and identify them with icons and tags. Voices are independent of any one engine. See " + L("../concepts/voices.html", "Voices") + " and the " + L("../user-guide/voice-lab.html", "Voice Lab") + "."),
  h2("Queue, progress &amp; recovery"),
  p("<strong>Long jobs are handled gracefully.</strong> Generation and assembly run through a queue with live progress and ETAs. If the app restarts, work recovers — completion is judged by validated audio artifacts, not by whether a file happens to exist."),
  h2("Assembly &amp; export"),
  p("<strong>End up with a real audiobook.</strong> Combine finished chapters into an <strong>M4B</strong> (or MP3) you can keep, play on any device, and share — with editable metadata and chapter titles."),
  h2("Extensibility"),
  ul([
    "<strong>Plugin SDK.</strong> Wrap any TTS engine behind a small contract and publish it.",
    "<strong>External API.</strong> Use Studio as a local text-to-speech backend for your own scripts."]),
  future("installable engines from GitHub, a Hugging Face voice library, and AI voice casting. See " + L("../plugin-sdk/overview.html", "Plugin SDK") + "."),
  h2("Where to go next"),
  p("Ready to install? Head to " + L("../getting-started/requirements.html", "Getting Started") + ". Want the concepts first? Start with " + L("../concepts/content-hierarchy.html", "Core Concepts") + "."))

# ============================ GETTING STARTED ==================================
page("getting-started/requirements",
  "Requirements",
  "The hardware and software you need before installing Audiobook Studio.",
  "Before installing, make sure your machine meets a few basics. The local engine benefits from a GPU, but you can get started without one.",
  glance([
    "Works on <strong>macOS, Linux, and Windows</strong>.",
    "<strong>Python 3.11</strong>, Node 18+, and ffmpeg.",
    "A CUDA GPU is recommended for fast local synthesis.",
    "Disk space for models and your audio output."]),
  h2("Operating system"),
  p("<strong>Studio runs on macOS, Linux, and Windows.</strong> The easiest install path (Pinokio) is available on all three; see " + L("installation.html", "Installation Paths") + "."),
  h2("Software"),
  ul([
    "<strong>Python 3.11</strong> — the app and engine environments are built against it.",
    "<strong>Node 18+</strong> — to build the frontend from source.",
    "<strong>ffmpeg</strong> — for audio assembly and format conversion."]),
  note("If you install with Pinokio, it sets up most of this for you."),
  h2("Hardware"),
  p("<strong>A CUDA-capable GPU makes local synthesis much faster</strong>, but isn't strictly required to try the app. More VRAM lets heavier engines run comfortably. See " + L("../operations/performance.html", "Performance &amp; GPU Tuning") + "."),
  h2("Disk space"),
  p("Leave room for engine model downloads (fetched on first use) plus your projects and rendered audio."))

page("getting-started/installation",
  "Installation Paths",
  "Pick the install path that matches your comfort level — Pinokio for most people, or from source for developers.",
  "There's more than one way to install Studio. Pick the one that matches how hands-on you want to be.",
  glance([
    "<strong>Pinokio</strong> — easiest, recommended for most people.",
    "<strong>From source</strong> — for developers who want direct control.",
    "A one-command launcher provisions everything.",
    "An optional demo library lets you explore immediately."]),
  h2("Pinokio (easiest)"),
  p("<strong>Pinokio handles the local setup for you.</strong> It installs the app and its environment and can optionally add a demo library with sample voices so you can try the workflow right away. Best for most people."),
  h2("From source (developers)"),
  p("<strong>Clone the repository and run the launcher.</strong> This gives you direct control over files, scripts, and the dev workflow. The launchers provision a virtual environment, the engine environment, and build the frontend — see " + L("launchers.html", "Launcher Scripts") + "."),
  h2("Demo library option"),
  p("Either path can install a " + L("demo-library.html", "demo library") + " — a small sample project and voices — so the app isn't empty on first launch."),
  tip("Not sure? Start with Pinokio. You can always switch to a source install later."))

page("getting-started/launchers",
  "Launcher Scripts",
  "What the one-command launchers (run.sh / run.ps1) do and the flags they accept.",
  "The launchers are the one command that gets Studio running. They provision everything the first time, then start the app.",
  glance([
    "<code>run.sh</code> (macOS/Linux) and <code>run.ps1</code> (Windows).",
    "First run provisions the app venv, the engine environment, and the frontend build.",
    "Flags control setup-only, reload, and the port."]),
  h2("What they do"),
  p("<strong>On first run, the launcher provisions everything.</strong> It creates the app's virtual environment, sets up the separate engine environment, and builds the frontend. On later runs it just starts the server."),
  h2("Common flags"),
  ul([
    "<code>--setup-only</code> — provision dependencies without starting the server.",
    "<code>--no-reload</code> — run without the auto-reload dev watcher.",
    "<code>--port &lt;n&gt;</code> — serve on a different port (default 8123)."]),
  p("On Windows, <code>run.ps1</code> exposes the same options. See " + L("../operations/launcher-options.html", "Launcher Options") + " for the full list."),
  note("The two environments are separate on purpose — see " + L("environments.html", "The Two Environments") + "."))

page("getting-started/environments",
  "The Two Environments",
  "Why the local engine lives in a separate Python environment from the web app.",
  "Studio uses two Python environments. Keeping them apart prevents the app and the heavy engine dependencies from fighting each other.",
  glance([
    "<code>./venv</code> — the web app and orchestrator.",
    "<code>~/xtts-env</code> — the heavier local-engine dependencies.",
    "Separation avoids dependency conflicts."]),
  h2("Why two?"),
  p("<strong>The app and the local engine have very different dependencies.</strong> The local cloning engine pulls in large machine-learning packages that can conflict with the app's lighter stack. Isolating them keeps both stable."),
  h2("What lives where"),
  ul([
    "<strong><code>./venv</code></strong> — the FastAPI app, orchestrator, and tooling.",
    "<strong><code>~/xtts-env</code></strong> — the local engine and its model dependencies."]),
  p("The TTS Server (which hosts engines) runs against the engine environment, while the app runs in its own. See " + L("../architecture/tts-server.html", "TTS Server &amp; Watchdog") + "."),
  tip("If engine dependencies ever get into a bad state, you can recreate <code>~/xtts-env</code> without touching the app — see " + L("../operations/xtts-env.html", "The XTTS Environment") + "."))

page("getting-started/first-run",
  "First Run",
  "Starting the server and opening the app on port 8123, plus what happens the first time.",
  "Once installed, starting Studio is a single command. The first launch does a little extra setup, then opens in your browser.",
  glance([
    "Start with the launcher; the app serves on <strong>port 8123</strong>.",
    "First run downloads engine models and creates working folders.",
    "Open <code>http://127.0.0.1:8123</code> in your browser."]),
  h2("Start the server"),
  p("<strong>Run the launcher and wait for it to come up.</strong> Under the hood it starts the app (<code>uvicorn run:app</code>) and the managed TTS Server. When it's ready, open <code>http://127.0.0.1:8123</code>."),
  h2("What happens on first run"),
  ul([
    "<strong>Model downloads.</strong> The local engine fetches its model the first time it's needed; this can take a while.",
    "<strong>Folders are created.</strong> Studio sets up its projects, voices, and working directories.",
    "<strong>Plugins are discovered.</strong> Installed engines are registered with the TTS Server."]),
  note("First-run model downloads can look like a long pause. Progress is surfaced in the terminal so you can see it's working, not stuck."),
  h2("Next"),
  p("Take the " + L("quick-tour.html", "5-Minute Workflow Tour") + " to make your first audio."))

page("getting-started/demo-library",
  "Demo Library",
  "The optional sample project and voices that let you explore the workflow immediately.",
  "The demo library is an optional bundle of a sample project and voices, so the app has something to explore the moment you open it.",
  glance([
    "Optional — install it during setup or skip it.",
    "Includes a sample project and ready-made voices.",
    "Safe to remove later."]),
  h2("What it includes"),
  p("<strong>A small, finished-style project plus sample voices.</strong> It's the fastest way to see how chapters, voices, generation, and playback fit together without building anything first."),
  h2("Installing it"),
  p("Pinokio can install the demo library as part of setup; from source you can add it during the guided setup. Either way it's optional."),
  h2("Removing it"),
  p("Delete the demo project and voices like any other — nothing else depends on them."),
  tip("New to Studio? Install the demo library, then follow the " + L("quick-tour.html", "5-Minute Workflow Tour") + " using it."))

page("getting-started/quick-tour",
  "5-Minute Workflow Tour",
  "End to end: project to chapters to voices to generate to assemble.",
  "Here's the whole workflow in one short pass — from an empty project to a finished chapter.",
  glance([
    "Create a project and add a chapter.",
    "Build or pick a voice and assign it.",
    "Generate, review, and fix any lines.",
    "Assemble into an audiobook file."]),
  demo("quick-tour"),
  h2("1. Create a project &amp; add a chapter"),
  p("<strong>Start with a project</strong> (title, author), then add a chapter by pasting text or uploading a <code>.txt</code> file."),
  h2("2. Build or assign a voice"),
  p("<strong>Pick a voice for the narrator.</strong> Use a demo voice, or build one in the " + L("../user-guide/voice-lab.html", "Voice Lab") + ". Assign characters their own voices if the chapter has dialogue."),
  h2("3. Generate &amp; review"),
  p("<strong>Generate the chapter and listen back.</strong> Watch progress in the " + L("../user-guide/processing-queue.html", "queue") + ". If a line needs work, edit it and regenerate just that segment."),
  h2("4. Assemble the audiobook"),
  p("<strong>Assemble finished chapters into an M4B (or MP3).</strong> See " + L("../user-guide/assemblies-tab.html", "Assemblies &amp; Export") + "."),
  tip("Using the demo library? Every step above works on the sample project right away."))

page("getting-started/platform-validation",
  "Platform Support &amp; Validation",
  "Per-platform install and launch notes, plus the first-run smoke-test checklist.",
  "Studio targets macOS, Windows, and Linux. This page lists the per-platform notes and a quick smoke test to confirm a healthy install.",
  glance([
    "Install &amp; launch on macOS, Windows, and Linux.",
    "Pinokio install &amp; launch flow.",
    "First-run smoke test to confirm everything works."]),
  h2("Per-platform install &amp; launch"),
  p("<strong>All three desktop platforms are supported.</strong> The launcher provides the equivalent flow on each (<code>run.sh</code> on macOS/Linux, <code>run.ps1</code> on Windows). Pinokio offers a guided install on each as well."),
  h2("First-run smoke test"),
  ol([
    "App starts and loads at <code>http://127.0.0.1:8123</code>.",
    "The TTS Server starts and the default engine reports ready.",
    "Create the sample project, build/pick a test voice, and synthesize a short line.",
    "Relaunch the app and confirm your work is still there."]),
  warn("If first-run model downloads stall, check your network and disk space — large models take time on the first run."),
  h2("Platform notes"),
  p("Platform-specific prerequisites (e.g. build tools, GPU drivers) and any known limitations are tracked alongside the install instructions in the repository."))

# ============================ CORE CONCEPTS ====================================
page("concepts/content-hierarchy",
  "Content Hierarchy",
  "How content nests in Studio: Library to Project to Chapter to Block/Segment to Chunk.",
  "Everything in Studio fits into a simple hierarchy. Knowing the levels makes the rest of the app click.",
  glance([
    "<strong>Library → Project → Chapter → Segment → Chunk.</strong>",
    "Segments are lines/blocks; chunks are what the engine actually speaks.",
    "Each level owns different settings."]),
  h2("The levels"),
  ul([
    "<strong>Library</strong> — all your projects in one place.",
    "<strong>Project</strong> — one book: chapters, characters, defaults, and output.",
    "<strong>Chapter</strong> — a unit of text you narrate and assemble.",
    "<strong>Segment / block</strong> — a line or passage, assigned to a voice.",
    "<strong>Chunk</strong> — the actual piece of text sent to the engine."]),
  h2("Why chunks exist"),
  p("<strong>Engines work best on bounded pieces of text.</strong> Studio splits long segments into chunks under a character limit, synthesizes each, and stitches them back together. This keeps quality consistent and makes targeted re-generation cheap."),
  note("You mostly work at the project, chapter, and segment levels. Chunking happens automatically."),
  h2("What each level owns"),
  p("Projects hold defaults (like the narrator and output preset); chapters hold their text and assignments; segments hold per-line voice choices. See " + L("../user-guide/project-workspace.html", "Project Workspace") + "."))

page("concepts/characters-narrators",
  "Characters &amp; Narrators",
  "Assigning distinct voices to narration and dialogue.",
  "A project has one narrator by default, plus any characters you define — each mapped to a voice so dialogue sounds distinct.",
  glance([
    "Every project has a <strong>default narrator</strong>.",
    "Define <strong>characters</strong> and give each a voice and color.",
    "Assignment drives how each line is read."]),
  h2("The default narrator"),
  p("<strong>Narration uses the project's default narrator voice.</strong> It's the fallback for any line not assigned to a specific character."),
  h2("Characters"),
  p("<strong>Define a character, give it a voice and a color, and assign its lines.</strong> Colors make it easy to see who speaks what at a glance in the editor. See " + L("../user-guide/characters-tab.html", "Characters") + "."),
  h2("How assignment drives rendering"),
  p("<strong>Each line is rendered in its assigned voice.</strong> Change an assignment and only the affected lines need regenerating. You can assign one line, one character, or all unassigned narration at once."),
  future("AI voice casting can suggest a fitting voice for each character from your library, with a reason for every pick — you stay in control."))

page("concepts/voices",
  "Voices, Variants &amp; Samples",
  "The Voice Lab model: a Voice has Variants, built from Samples, bound to an Engine.",
  "A voice in Studio is a small hierarchy of its own. Understanding it makes the Voice Lab straightforward.",
  glance([
    "A <strong>Voice</strong> is a reusable identity.",
    "A <strong>Variant</strong> is a tuned version of that voice for an engine.",
    "<strong>Samples</strong> are the audio a variant is built from.",
    "Voice identity is kept separate from engine assets."]),
  h2("Voice vs variant"),
  p("<strong>A voice is the identity; a variant is a usable build of it.</strong> One voice can have several variants — for different engines, speeds, or styles."),
  h2("Samples &amp; rebuilds"),
  p("<strong>Variants are built from sample audio.</strong> Add or replace samples and rebuild to improve a clone. Quality depends a lot on the samples — see " + L("../engines/voice-quality.html", "Voice Cloning Quality") + "."),
  h2("Engine-per-voice &amp; portability"),
  p("<strong>A voice's identity (name, image, tags) is separate from its engine-specific assets.</strong> That's what lets a voice move between engines, and what makes voices portable as shareable bundles."),
  future("voices become shareable bundles with an icon, a playable sample, and rich tags, published to a Hugging Face library. See " + L("../user-guide/voice-tags-icons.html", "Voice Icons &amp; Tags") + "."))

page("concepts/engines-overview",
  "Engines Overview",
  "Local vs cloud engines, and how Studio routes to them.",
  "Studio can route synthesis to more than one engine. They split into local and cloud, with one local engine installed by default.",
  glance([
    "<strong>Local engines</strong> run on your machine — XTTS is the only default install.",
    "<strong>Cloud engines</strong> are optional and need an API key (e.g. Voxtral).",
    "<strong>Composite</strong> synthesis mixes engines within a chapter.",
    "More engines can be added as plugins."]),
  h2("Local engines"),
  p("<strong>The default engine is local and private.</strong> XTTS is the one engine installed out of the box; it runs on your machine with no account. See " + L("../engines/xtts.html", "Local Engine (XTTS Default)") + "."),
  h2("Cloud engines"),
  p("<strong>Cloud engines are optional and opt-in.</strong> You enable one with an API key; none ship by default. Voxtral is one example. See " + L("../engines/voxtral.html", "Cloud Engines") + "."),
  h2("Composite synthesis"),
  p("<strong>A chapter can mix engines.</strong> Composite synthesis stitches output from multiple engines/voices into one chapter. See " + L("../engines/composite.html", "Composite Synthesis") + "."),
  h2("Plugins add more"),
  p("<strong>Engines are installable.</strong> Beyond the default, you can add engines as plugins from GitHub. See the " + L("../plugin-sdk/overview.html", "Plugin SDK") + "."))

page("concepts/production-pipeline",
  "The Production Pipeline",
  "The stages a chapter passes through to become audio.",
  "Turning a chapter into audio is a pipeline of clear stages. Each one has a job, and progress comes from the stages reporting in.",
  glance([
    "<strong>Analysis → Queue → Synthesis → Bake → Assembly.</strong>",
    "Each stage has a defined job.",
    "Progress is reported centrally, not guessed."]),
  h2("The stages"),
  ol([
    "<strong>Analysis</strong> — the chapter is split into segments and chunks.",
    "<strong>Queue</strong> — work is scheduled by the orchestrator.",
    "<strong>Synthesis</strong> — the engine generates audio for each chunk.",
    "<strong>Bake</strong> — chunks are validated and combined into segment/chapter audio.",
    "<strong>Assembly</strong> — chapters are combined into the final audiobook."]),
  h2("Where progress comes from"),
  p("<strong>Progress is centralized, not improvised per screen.</strong> Stages report into the progress service, which broadcasts a single, consistent view with an ETA. See " + L("../architecture/progress.html", "Progress Services") + "."))

page("concepts/artifacts-recovery",
  "Artifacts, Reuse &amp; Recovery",
  "Why completion is decided by validated artifact metadata, not raw files.",
  "Studio decides what's done by looking at validated artifacts, not by whether a file happens to exist. That's what makes reuse and recovery reliable.",
  glance([
    "Completion = a <strong>validated artifact</strong>, not a file on disk.",
    "Unchanged audio is <strong>reused</strong>, not re-rendered.",
    "Work <strong>recovers</strong> after a restart.",
    "Finished audio lives in an immutable cache."]),
  h2("Validated artifacts vs file existence"),
  p("<strong>A stray file doesn't mean a segment is done.</strong> Studio records validated artifact metadata (duration, format, the request it satisfies) and treats that as the source of truth — so a half-written or stale file is never mistaken for finished work."),
  h2("Reuse of unchanged audio"),
  p("<strong>If a segment hasn't changed, its audio is reused.</strong> Editing one line doesn't re-render the rest of the chapter, which is what makes iteration fast and free."),
  h2("Restart recovery &amp; reconciliation"),
  p("<strong>Studio reconciles state on startup.</strong> After a crash or restart, it checks artifacts against expected work and picks up where it left off. See " + L("../operations/backups-recovery.html", "Backups &amp; Recovery") + "."))

# ============================ ENGINES ==========================================
page("engines/xtts",
  "Local Engine (XTTS Default)",
  "The private, local cloning engine — the only engine installed by default.",
  "XTTS is the default local engine: a private, on-machine voice-cloning engine that needs no account. It's the bundled example of a local engine.",
  glance([
    "The <strong>only engine installed by default</strong>.",
    "Runs locally — private and free to run.",
    "Clones a voice from samples into a reusable profile.",
    "A GPU makes it much faster."]),
  h2("Why a local engine is the default"),
  p("<strong>Local-first means your audio never has to leave the machine.</strong> XTTS ships as the default so you can produce a full audiobook with no account, no API key, and no per-word cost."),
  h2("What XTTS is &amp; GPU needs"),
  p("<strong>XTTS is a neural voice-cloning engine.</strong> It runs on CPU but is dramatically faster on a CUDA GPU. Its model is downloaded on first use; see " + L("../getting-started/first-run.html", "First Run") + "."),
  h2("Latents &amp; the voice profile"),
  p("<strong>A clone is captured as a compact voice profile.</strong> XTTS turns your samples into latents that represent the voice; that profile is what gets reused for synthesis. Profiles are kept separate from a voice's identity so the same voice can carry assets for more than one engine."),
  h2("Strengths &amp; tuning"),
  p("<strong>Quality depends most on your samples.</strong> Clean, consistent recordings clone best. See " + L("voice-quality.html", "Voice Cloning Quality") + " for heuristics, and " + L("engine-settings.html", "Engine Settings &amp; Verification") + " to configure and test it."))

page("engines/voxtral",
  "Cloud Engines (e.g. Voxtral)",
  "Optional, opt-in cloud engines enabled with an API key — none are installed by default.",
  "Cloud engines are optional. You enable one with an API key; none ship or run by default. Voxtral (Mistral-hosted) is one example.",
  glance([
    "<strong>Optional and opt-in</strong> — off until you enable one.",
    "Enabled with an <strong>API key</strong>.",
    "Some data leaves your machine when used.",
    "Voxtral is one example of this kind of engine."]),
  h2("Why cloud engines are optional"),
  p("<strong>Studio is local-first.</strong> Cloud engines exist for people who want a specific hosted voice or model, but they are never required and never on by default."),
  h2("Enabling a cloud engine with an API key"),
  p("<strong>Add the provider's API key in Settings to enable it.</strong> Until a key is present, the engine stays hidden. Voxtral, for example, is enabled with a Mistral API key."),
  h2("What data leaves your machine"),
  p("<strong>Using a cloud engine sends the text to be spoken (and any required reference audio) to the provider.</strong> Studio discloses this clearly. See " + L("../overview/privacy-model.html", "Local-First &amp; Privacy") + "."),
  warn("a cloud engine means data leaves your device. Review the provider's terms; Studio shows facts, it doesn't act as a legal gate."),
  h2("When to use one"),
  p("Reach for a cloud engine when you specifically want a voice or model it offers. For most local audiobook production, the default local engine is enough."))

page("engines/composite",
  "Composite Synthesis",
  "Combining multiple engines or voices within a single chapter.",
  "Composite synthesis lets one chapter use more than one engine or voice, stitched into a single, seamless result.",
  glance([
    "Mix engines/voices within one chapter.",
    "Studio stitches the output together.",
    "Formerly called “mixed” synthesis."]),
  h2("When chapters mix engines"),
  p("<strong>Sometimes the best cast spans engines.</strong> A narrator on the local engine and a specific character on another, for instance. Composite synthesis handles that within a single chapter."),
  h2("How composite rendering stitches output"),
  p("<strong>Each segment is rendered by its assigned engine/voice, then combined in order.</strong> Because completion is tracked per validated artifact, segments from different engines assemble cleanly into one chapter."),
  note("Composite was previously called “mixed” synthesis; you may still see that term in older material."))

page("engines/engine-settings",
  "Engine Settings &amp; Verification",
  "Per-engine configuration and the verification/self-test flow.",
  "Each engine carries its own settings and a self-test, so you can configure it and confirm it actually works before relying on it.",
  glance([
    "Settings are <strong>schema-driven</strong> — the form comes from the engine.",
    "<strong>Verify</strong> runs a real test synthesis.",
    "Engines report a clear status."]),
  h2("Schema-driven engine settings"),
  p("<strong>Each engine declares its own settings.</strong> Studio renders the form from that schema, so an engine's options (models, keys, tuning) appear without hard-coding anything in the UI."),
  h2("Verification &amp; test runs"),
  p("<strong>Verify runs a quick synthesis to prove the engine is working.</strong> Use it after setup or after changing a setting, and read the diagnostics if it fails."),
  h2("Enable / disable &amp; status"),
  p("<strong>Engines show a clear status</strong> — ready, needs setup, or unavailable — so you know what will happen before you queue a job. Manage all of this in " + L("../user-guide/settings.html", "Settings") + "."))

page("engines/voice-quality",
  "Voice Cloning Quality",
  "Why quality varies and how to get the best clone.",
  "Cloning quality comes mostly from your samples. A few habits make a big difference.",
  glance([
    "<strong>Sample quality matters most.</strong>",
    "Clean, consistent recordings clone best.",
    "Use variants to find the best result."]),
  h2("Sample selection heuristics"),
  ul([
    "Use clear speech with little background noise.",
    "Keep tone and pace consistent across samples.",
    "Prefer a handful of good samples over many noisy ones."]),
  h2("Recording quality factors"),
  p("<strong>Room noise, clipping, and inconsistent levels hurt clones.</strong> A quiet space and a steady level go a long way. See the recording guidance in the " + L("../user-guide/voice-lab.html", "Voice Lab") + "."),
  h2("Variant strategies"),
  p("<strong>Build variants and compare.</strong> Different sample sets or settings can produce noticeably different results; keep the variant that sounds best for your project."))

# ============================ WHAT'S NEW =======================================
page("whats-new/at-a-glance",
  "1.x → 2.0 at a Glance",
  "The short version of what changed in 2.0 and why it matters.",
  "Here's the short version of what changed from 1.x to 2.0 — what you feel day to day, and what developers gain.",
  glance([
    "Synthesis moved to a <strong>managed TTS Server</strong>.",
    "A real <strong>orchestrator</strong> runs the queue and recovery.",
    "Engines and voices are <strong>installable bundles</strong>.",
    "A plugin SDK and external API open Studio up."]),
  h2("Headline changes"),
  ul([
    "A managed, crash-isolated TTS Server hosts engines.",
    "A task orchestrator replaces the old worker loop.",
    "Engine behavior is driven by plugin manifests, not engine-ID branches.",
    "Completion is decided by validated artifacts, not loose files."]),
  h2("What users feel day-to-day"),
  p("<strong>More reliability and less lost work.</strong> Crashes are contained, progress is steadier, and restarts recover. Voices get icons and tags; playback and the editor are smoother."),
  h2("What developers gain"),
  p("<strong>Clean extension points.</strong> A five-method plugin SDK, installable engines from GitHub, shareable voices on Hugging Face, and a documented gateway API. See " + L("at-a-glance.html", "this section") + "'s other pages for detail."))

page("whats-new/architectural-shifts",
  "Architectural Shifts",
  "The structural changes under the hood in 2.0.",
  "The big 2.0 changes are structural. Here's what moved and why each shift matters.",
  glance([
    "One-shot subprocess → managed TTS Server.",
    "Worker loop → orchestrator.",
    "Engine-ID branches → plugin manifests.",
    "Raw-file checks → validated artifacts."]),
  h2("From one-shot subprocess to a managed TTS Server"),
  p("<strong>Synthesis runs in a long-lived, supervised process</strong> with a watchdog, instead of being spun up ad hoc. Engines can crash and restart without losing app state."),
  h2("From a worker loop to an orchestrator"),
  p("<strong>Scheduling, progress, and recovery are centralized.</strong> The orchestrator owns the queue and reconciliation rather than a single loop doing everything."),
  h2("From engine-ID branches to plugin manifests"),
  p("<strong>Behavior is declared, not hard-coded.</strong> What an engine supports comes from its manifest, so adding an engine doesn't mean adding special cases across the app."),
  h2("From raw-file checks to validated artifacts"),
  p("<strong>Completion is judged by validated artifact metadata.</strong> A file existing is no longer mistaken for finished work. See " + L("../concepts/artifacts-recovery.html", "Artifacts, Reuse &amp; Recovery") + "."))

page("whats-new/new-capabilities",
  "New Capabilities",
  "Features that didn't exist in 1.x.",
  "Beyond the rearchitecture, 2.0 adds capabilities that weren't possible before.",
  glance([
    "Plugin SDK &amp; external TTS API.",
    "Composite engine and project backups.",
    "Predictive progress and VCR playback.",
    "Voice tags &amp; icons."]),
  h2("Extensibility"),
  p("<strong>A plugin SDK and an external TTS API.</strong> Wrap engines and drive Studio from your own tools. See " + L("../plugin-sdk/overview.html", "Plugin SDK") + " and " + L("../api/overview.html", "TTS Gateway API") + "."),
  h2("Production features"),
  ul([
    "<strong>Composite synthesis</strong> across engines in one chapter.",
    "<strong>Project backups</strong> and disk-based recovery.",
    "<strong>Predictive progress</strong> with ETAs, and <strong>VCR-style playback</strong> in the editor."]),
  h2("Voice library"),
  p("<strong>Voices gain icons and tags</strong>, making a real, searchable library. See " + L("../user-guide/voice-tags-icons.html", "Voice Icons &amp; Tags") + "."),
  future("installable engines from GitHub, the Hugging Face voice library, and AI voice casting land as part of the 2.0 rollout."))

page("whats-new/migration",
  "Migration Notes",
  "What changes for existing 1.x workspaces.",
  "Upgrading from 1.x? Here's what carries over and what changes.",
  glance([
    "Live state moves toward a database.",
    "Folder layout is tidied.",
    "Your projects and voices carry over."]),
  h2("State: toward SQLite"),
  p("<strong>Durable data lives in SQLite, with live runtime state in state.json.</strong> Existing data is migrated forward. See " + L("../architecture/state.html", "State: state.json + SQLite") + "."),
  h2("Folders &amp; compatibility"),
  p("<strong>Storage is normalized</strong> into clear per-project folders. Compatibility shims keep older layouts working during the transition."),
  h2("What carries over"),
  p("<strong>Your projects, chapters, and voices come with you.</strong> The workflow is unchanged; the machinery underneath is what moved."),
  soon("exact migration steps are finalized as 2.0 lands; this page will get the concrete checklist."))

page("whats-new/pr-talking-points",
  "PR Talking Points",
  "Benefit-framed messaging for announcements and marketing.",
  "Need to describe 2.0 to others? These are the benefit-framed talking points.",
  glance([
    "Reliability &amp; recovery story.",
    "Extensibility story (plugins + API).",
    "Polish story (playback, progress, voices)."]),
  h2("Reliability &amp; recovery"),
  p("<strong>“It doesn't lose your work.”</strong> Crash-isolated synthesis, a real queue, and restart recovery mean long jobs survive the bumps."),
  h2("Extensibility"),
  p("<strong>“Make it yours.”</strong> Install engines like Stable Diffusion, publish voices like a library, and drive Studio from your own scripts via the API."),
  h2("Polish"),
  p("<strong>“It feels finished.”</strong> Predictive progress, VCR-style playback, and a real voice library with icons and tags."),
  tip("For audience-tailored versions, see the site's For Developers and For Everyone pages."))

page("whats-new/changelog",
  "Changelog",
  "Dated record of shipped behavior changes.",
  "A running record of shipped changes. The 2.0 line is summarized here; the full history lives with the project.",
  glance([
    "2.0 highlights collected here.",
    "Patch lines noted as they ship.",
    "Full history in the repository."]),
  h2("2.0 highlights"),
  ul([
    "Managed TTS Server + watchdog.",
    "Task orchestrator, predictive progress, recovery.",
    "Plugin SDK, external TTS API, composite synthesis.",
    "Voice tags &amp; icons; clearer first-run model-download progress."]),
  h2("Recent patch lines"),
  p("Patch-level changes are recorded as they ship."),
  note("The authoritative, dated changelog is maintained in the repository and release notes."))

# ============================ REFERENCE ========================================
page("reference/glossary",
  "Glossary",
  "Definitions for the terms used throughout the handbook.",
  "Short definitions for the terms you'll see across the handbook.",
  glance(["Content terms: project, chapter, segment, chunk.",
          "Voice terms: voice, variant, sample, engine.",
          "Pipeline terms: task, job, artifact."]),
  h2("Content"),
  ul([
    "<strong>Project</strong> — one book and its settings.",
    "<strong>Chapter</strong> — a unit of text you narrate and assemble.",
    "<strong>Segment / block</strong> — a line or passage assigned to a voice.",
    "<strong>Chunk</strong> — the bounded piece of text actually sent to an engine."]),
  h2("Voices"),
  ul([
    "<strong>Voice</strong> — a reusable voice identity.",
    "<strong>Variant</strong> — a tuned build of a voice for an engine.",
    "<strong>Sample</strong> — audio a variant is built from.",
    "<strong>Engine</strong> — the component that turns text into speech."]),
  h2("Pipeline"),
  ul([
    "<strong>Task</strong> — a unit of work the orchestrator schedules.",
    "<strong>Job</strong> — a queued instance of a task.",
    "<strong>Artifact</strong> — validated output (with metadata) that defines completion."]))

page("reference/file-formats",
  "File Formats",
  "Supported input and output formats in one place.",
  "A quick reference for the formats Studio reads and writes.",
  glance(["Text in: plain text.",
          "Audio in: common sample formats.",
          "Audio out: WAV, MP3, M4B."]),
  h2("Text inputs"),
  p("<strong>Chapters accept plain text</strong> — paste it or upload a <code>.txt</code> file."),
  h2("Audio inputs (samples)"),
  p("<strong>Voice samples use common audio formats.</strong> Clean recordings clone best — see " + L("../engines/voice-quality.html", "Voice Cloning Quality") + "."),
  h2("Outputs"),
  p("<strong>Studio renders to WAV internally and exports MP3 or M4B.</strong> M4B is the standard audiobook container with chapters. See " + L("../user-guide/audio-formats.html", "Audio Guidance &amp; Formats") + "."))

page("reference/ui-cheat-sheet",
  "UI Cheat Sheet",
  "Quick reference for navigation and common actions.",
  "A fast reference for getting around Studio.",
  glance(["Main navigation map.",
          "Common actions.",
          "Where key features live."]),
  h2("Navigation map"),
  ul([
    "<strong>Library</strong> → your projects.",
    "<strong>Project</strong> → Chapters, Characters, Assemblies, Backups.",
    "<strong>Voice Lab</strong> → build and manage voices.",
    "<strong>Queue</strong> → monitor jobs.",
    "<strong>Settings</strong> → defaults, engines, API."]),
  h2("Common actions"),
  ul([
    "Create a project; add a chapter (paste or upload).",
    "Build/assign a voice; generate; review and fix lines.",
    "Assemble to M4B/MP3."]),
  note("Detailed walkthroughs live in the " + L("../user-guide/project-workspace.html", "User Guide") + "."))

# ============================ USER GUIDE =======================================
page("user-guide/project-library",
  "Project Library",
  "Browse, create, and manage your audiobook projects.",
  "The Library is your home base — every project lives here, ready to open or create.",
  soon("the Library is being refreshed as part of Phase 12; the shape below is the near-term target."),
  glance(["Grid &amp; list views with sorting.",
          "Create a project with title, author, series, and cover.",
          "Open or delete projects."]),
  h2("Browsing"),
  p("<strong>See all your projects at a glance.</strong> Switch between grid and list views and sort to find what you need."),
  h2("Creating a project"),
  p("<strong>Create a project with its title, author, optional series, and a cover.</strong> These double as audiobook metadata at export time."),
  h2("Opening &amp; deleting"),
  p("<strong>Open a project to enter its workspace</strong> (" + L("project-workspace.html", "Project Workspace") + "), or delete ones you no longer need."))

page("user-guide/project-workspace",
  "Project Workspace",
  "The project view, its header, and sub-navigation tabs.",
  "Open a project and you land in its workspace — the header for metadata, and tabs for everything inside.",
  glance(["Edit project metadata and cover.",
          "Sub-nav: Chapters, Characters, Assemblies, Backups.",
          "Set project defaults like the narrator and output preset."]),
  h2("The header"),
  p("<strong>Edit the project's metadata and cover from the header.</strong> Title, author, series, and cover travel through to the finished audiobook."),
  h2("Sub-navigation"),
  ul([
    "<strong>" + L("chapters-tab.html", "Chapters") + "</strong> — add and manage chapters.",
    "<strong>" + L("characters-tab.html", "Characters") + "</strong> — define characters and assign voices.",
    "<strong>" + L("assemblies-tab.html", "Assemblies") + "</strong> — combine chapters into output.",
    "<strong>" + L("backups-tab.html", "Backups") + "</strong> — snapshot and restore."]),
  h2("Project defaults"),
  p("<strong>Projects hold defaults</strong> like the default narrator and output preset, which apply unless a chapter or line overrides them."))

page("user-guide/chapters-tab",
  "Chapters",
  "Add and manage the chapters in a project.",
  "Chapters are the units you narrate and assemble. Add them by pasting text or uploading files.",
  glance(["Add a chapter by upload or paste.",
          "See status and stats per chapter.",
          "Reorder and delete."]),
  h2("Adding a chapter"),
  p("<strong>Paste text or upload a <code>.txt</code> file.</strong> Each chapter becomes its own unit of work."),
  h2("Status &amp; stats"),
  p("<strong>Each chapter shows its status and basic stats</strong> so you can see what's drafted, generated, or ready to assemble."),
  h2("Reorder &amp; delete"),
  p("<strong>Reorder chapters to match your book</strong> and remove any you don't need. Order carries through to assembly."))

page("user-guide/characters-tab",
  "Characters",
  "Define project characters and assign each a voice and color.",
  "Characters let dialogue sound distinct. Define them once, give each a voice and color, and assignment does the rest.",
  glance(["Create a character.",
          "Assign a voice profile/variant.",
          "Use color coding to scan who speaks."]),
  h2("Create a character"),
  p("<strong>Add the characters that appear in your book.</strong> The narrator exists by default; characters cover everyone else."),
  h2("Assign a voice"),
  p("<strong>Give each character a voice (and variant).</strong> Their assigned lines render in that voice. See " + L("../concepts/characters-narrators.html", "Characters &amp; Narrators") + "."),
  h2("Color coding"),
  p("<strong>Each character gets a color</strong> so you can scan a chapter and see who speaks which lines at a glance."),
  future("AI voice casting can suggest a fitting voice per character from your library, with a reason — you confirm the picks."))

page("user-guide/assemblies-tab",
  "Assemblies &amp; Export",
  "Combine rendered chapters into finished audiobook files.",
  "Assembly is the finish line: turn your rendered chapters into a real audiobook file.",
  glance(["Assemble a project into one file.",
          "Download M4B and manage outputs.",
          "Edit descriptions and see stats."]),
  h2("Assemble a project"),
  p("<strong>Combine finished chapters in order into a single audiobook.</strong> Chapter order and titles come from your project."),
  h2("Download &amp; manage outputs"),
  p("<strong>Download the M4B (or MP3) and manage past outputs.</strong> M4B is the standard chaptered audiobook container."),
  h2("Descriptions &amp; stats"),
  p("<strong>Edit the description and review stats</strong> like total duration before you publish or share."))

page("user-guide/backups-tab",
  "Backups",
  "Snapshot a project (optionally with audio) and restore later.",
  "Backups let you snapshot a project and roll back if something goes wrong.",
  glance(["Create a backup with a comment.",
          "Optionally include audio samples.",
          "Download, restore, or delete snapshots."]),
  h2("Create a backup"),
  p("<strong>Snapshot the project, with an optional comment</strong> to remember why. Toggle whether to include audio samples (bigger, but complete)."),
  h2("Restore &amp; manage"),
  p("<strong>Download, restore, or delete snapshots.</strong> Restoring rolls the project back to that point. See " + L("../operations/backups-recovery.html", "Backups &amp; Recovery") + " for the bigger picture."))

page("user-guide/chapter-editor",
  "Chapter Editor",
  "Edit, assign, generate, and review a chapter — centered on the Script tab.",
  "The editor is where a chapter comes together: assign voices, generate, and listen back, all in one place.",
  soon("the editor is consolidating around a single Script tab in Phase 12; the description below reflects that target."),
  glance(["Script tab: assign, batch-assign, generate, watch progress.",
          "VCR playback: play / pause / stop / next / previous.",
          "Edit tab: raw text with resync preview."]),
  demo("chapter-editor"),
  h2("The Script tab"),
  p("<strong>Assign voices and generate from one place.</strong> Assign a line, a character, or all unassigned narration at once, then generate and watch progress inline."),
  h2("VCR playback"),
  p("<strong>Review like a tape deck.</strong> Play, pause, stop, and jump to the next or previous line to audition your chapter quickly."),
  h2("The Edit tab"),
  p("<strong>Edit the raw text and resync.</strong> Fix wording, then preview how it re-splits before regenerating affected segments."),
  note("Older Production/Performance/Preview tabs are folding into the Script tab."))

page("user-guide/voice-lab",
  "Voice Lab",
  "Create, configure, sample, test, and share voices.",
  "The Voice Lab is where voices are born: create them, add samples, test, and prepare them to share.",
  glance(["Create a voice and pick an engine.",
          "Manage variants and samples.",
          "Test, preview, and import/export voices."]),
  demo("voice-lab"),
  h2("Create a voice &amp; pick an engine"),
  p("<strong>Start a voice and choose the engine it builds for.</strong> The default local engine works out of the box."),
  h2("Variants &amp; samples"),
  ul([
    "<strong>Variants</strong> — add, rename, move, set speed, and give test text.",
    "<strong>Samples</strong> — upload, manage, and rebuild to improve the clone."]),
  p("Quality depends on samples — see " + L("../engines/voice-quality.html", "Voice Cloning Quality") + " and the built-in Recording Guide prompts."),
  h2("Test, preview &amp; share"),
  p("<strong>Test a voice with quick previews, then import or export voice bundles.</strong> See " + L("voice-tags-icons.html", "Voice Icons &amp; Tags") + " for identifying voices."),
  future("export a voice as a shareable bundle and publish it to a Hugging Face voice library."))

page("user-guide/voice-tags-icons",
  "Voice Icons &amp; Tags",
  "Identify and search voices with images and category tags.",
  "Icons and tags turn a pile of voices into a real, searchable library.",
  soon("the voice library (icons, tags, search) is part of the Phase 12 / 2.0 rollout."),
  glance(["Upload a 1:1 icon per voice.",
          "Tag voices (gender, age, accent, character, …).",
          "Search and filter by tag.",
          "Per-voice plugin settings."]),
  h2("Voice icons"),
  p("<strong>Give each voice a square (1:1) icon.</strong> It shows on cards and pickers so voices are easy to recognize."),
  h2("Tags"),
  p("<strong>Tag voices by their qualities</strong> — class, gender, age, accent, tone, and free-form labels — so you can find the right one fast. The tag set is organized into simple sections."),
  h2("Searching &amp; filtering"),
  p("<strong>Search and filter the library by tag.</strong> Rich, structured tags also power AI voice casting."),
  future("voices published to Hugging Face carry the same icon, sample, and tags, and are discoverable by the <code>audiobook-studio-voice</code> tag."))

page("user-guide/processing-queue",
  "Processing Queue",
  "Monitor and control all background rendering and assembly jobs.",
  "The queue is mission control for background work — see what's running, what's next, and how long it'll take.",
  soon("the queue UI is being refined in Phase 12; behavior below is the target."),
  glance(["Queue stats and ETA.",
          "Per-job output metadata (duration).",
          "Reorder, pause/resume, and clear.",
          "Live updates over WebSocket."]),
  demo("processing-queue"),
  h2("Watching progress"),
  p("<strong>See live stats and ETAs as jobs run.</strong> Progress comes from a central service, so the numbers are consistent across the app. See " + L("../architecture/progress.html", "Progress Services") + "."),
  h2("Controlling jobs"),
  p("<strong>Reorder, pause/resume, and clear jobs.</strong> Job history stays available for reference."),
  h2("Live updates"),
  p("<strong>The queue updates in real time over WebSocket</strong> — no refreshing to see the latest state."))

page("user-guide/settings",
  "Settings",
  "Configure defaults, engines, the external API, and view diagnostics.",
  "Settings is where you configure Studio: general defaults, engines, the external API, and diagnostics.",
  glance(["General: safe mode, default engine/speaker.",
          "Engines: enable, configure, install/update, delete.",
          "API panel; About/diagnostics."]),
  h2("General"),
  p("<strong>Set project-wide defaults</strong> like safe mode and the default engine/speaker."),
  h2("Engines"),
  p("<strong>Enable, configure, install, update, and delete engines.</strong> Updates surface here as a notify-only alert with per-engine and Update-all actions. See " + L("../engines/engine-settings.html", "Engine Settings &amp; Verification") + " and " + L("../plugin-sdk/install-import.html", "Installing &amp; Updating Engines") + "."),
  h2("API panel"),
  p("<strong>Enable and manage the TTS Gateway API.</strong> See " + L("../api/overview.html", "Gateway Overview") + "."),
  h2("About / diagnostics"),
  p("<strong>Check versions and diagnostics</strong> when you need to confirm what's installed or troubleshoot."))

page("user-guide/audio-formats",
  "Audio Guidance &amp; Formats",
  "Supported inputs/outputs and quality guidance.",
  "What goes in, what comes out, and how to keep quality high.",
  glance(["Text and audio inputs.",
          "Internal vs output formats.",
          "Bitrate, normalization, and length tips."]),
  h2("Inputs"),
  p("<strong>Text chapters are plain text; voice samples are common audio formats.</strong> See " + L("../reference/file-formats.html", "File Formats") + "."),
  h2("Internal vs output formats"),
  p("<strong>Studio renders to WAV internally, then exports MP3 or M4B.</strong> Working in WAV keeps quality high until the final export."),
  h2("Quality tips"),
  ul([
    "Pick a sensible export bitrate for spoken word.",
    "Let Studio normalize levels for consistent loudness.",
    "Keep per-segment text within the engine's chunk limit."]))

page("user-guide/troubleshooting",
  "Troubleshooting &amp; FAQ",
  "Common issues and how to resolve them.",
  "Stuck? Start here. These are the issues people hit most and how to clear them.",
  glance(["Failed jobs &amp; retries.",
          "Voice quality problems.",
          "Enabling an optional cloud engine.",
          "Long-sentence warnings."]),
  h2("Failed jobs &amp; retries"),
  p("<strong>Open the job in the " + L("processing-queue.html", "queue") + " and read its reason.</strong> Most failures are setup-related (engine not ready, missing dependency) and clear after a retry."),
  h2("Voice quality"),
  p("<strong>Poor clones usually trace back to samples.</strong> See " + L("../engines/voice-quality.html", "Voice Cloning Quality") + "."),
  h2("Enabling an optional cloud engine"),
  p("<strong>Add the provider's API key in Settings.</strong> Cloud engines stay hidden until a key is present. See " + L("../engines/voxtral.html", "Cloud Engines") + "."),
  h2("Long-sentence warnings"),
  p("<strong>Very long sentences may be split for the engine.</strong> If you see a warning, shortening or re-punctuating the sentence usually helps."))

# ============================ PLUGIN SDK =======================================
page("plugin-sdk/overview",
  "Plugin Architecture",
  "How engines plug into Studio through the managed TTS Server.",
  "Engines are plugins. They run inside the managed TTS Server, behind one small contract, so Studio never has to know an engine's internals.",
  glance([
    "Engines are discovered as folder plugins.",
    "They run in the <strong>TTS Server</strong>, isolated from the app.",
    "Behavior is <strong>declared</strong>, not hard-coded into Studio.",
    "Built-in and community engines use the same path."]),
  h2("Folder plugins &amp; discovery"),
  p("<strong>An engine is a self-contained folder.</strong> Studio discovers engines in the engines directory, validates each manifest, and registers it. Built-in engines go through the exact same discovery as community ones."),
  h2("Studio-owns vs plugin-owns"),
  p("<strong>Studio owns persistence and orchestration; the plugin owns synthesis.</strong> A plugin must not import app internals or write outside its folder and the requested output path. This keeps engines portable and safe."),
  h2("The declared-hook model"),
  p("<strong>What an engine can do is declared in its manifest.</strong> Chunk limits, progress parsing, resources, and settings come from metadata, so adding an engine never means adding engine-ID branches across the app. See " + L("manifest.html", "manifest.json Reference") + " and " + L("engine-contract.html", "Engine Contract &amp; Hooks") + "."))

page("plugin-sdk/anatomy",
  "Anatomy of a Plugin",
  "The files that make up a self-contained plugin mini-repo.",
  "A plugin is a small repo with a predictable layout. Here's what each part does.",
  glance([
    "<code>manifest.json</code> + the engine entry class.",
    "<code>settings_schema.json</code> for the settings UI.",
    "<code>requirements.txt</code> for dependencies.",
    "<code>tests/</code> travels with the plugin."]),
  h2("Layout"),
  pre("tts_<engine_id>/\n"
      "  manifest.json        # discovery + capabilities + distribution\n"
      "  engine.py            # the StudioTTSEngine implementation\n"
      "  settings_schema.json # JSON Schema -> settings form\n"
      "  requirements.txt     # runtime dependencies\n"
      "  README.md  icon.png  # shown in the engine browser\n"
      "  tests/               # plugin-local tests + fixtures"),
  h2("Why self-contained"),
  p("<strong>Everything an engine needs lives in its folder</strong> so it can be published as its own GitHub repo and installed with a clone. See " + L("../api/overview.html", "the API") + " for driving Studio, and " + L("template.html", "Using the Template") + " to start."),
  note("Heavy model weights are not committed to the repo — they download on first use, keeping the bundle small."))

page("plugin-sdk/manifest",
  "manifest.json Reference",
  "Every manifest field and what it controls.",
  "The manifest is the engine's contract with Studio. These fields drive discovery, capabilities, behavior, and distribution.",
  glance([
    "Identity: <code>engine_id</code>, <code>entry_class</code>, versions.",
    "Capabilities, languages, and resource profile.",
    "Behavior metadata (chunk limit, progress).",
    "A <code>distribution</code> block for install/update."]),
  h2("Core fields"),
  table(["Field", "Purpose"], [
    ["<code>engine_id</code>", "Stable id; also the <code>tts_&lt;id&gt;</code> folder name."],
    ["<code>display_name</code>", "Shown in the UI and engine browser."],
    ["<code>engine_version</code> / <code>min_app_version</code>", "Semver; gates updates."],
    ["<code>entry_class</code>", "Path to the engine implementation."],
    ["<code>resource_profile</code>", "GPU/VRAM/CPU needs for scheduling."],
    ["<code>supported_languages</code> / <code>supported_voice_asset_types</code>", "What it can do."],
    ["<code>requires_network</code>", "Cloud engines disclose off-machine calls."]]),
  h2("Distribution block"),
  p("<strong>Engines install from GitHub by git clone and update by git pull.</strong> The <code>distribution</code> block carries the <code>git_url</code>, <code>project</code>, discovery <code>topic</code>, and an optional <code>pin_ref</code>. See " + L("install-import.html", "Installing &amp; Updating Engines") + "."),
  h2("Behavior metadata"),
  p("Behavior fields (chunk limits, progress patterns, per-voice settings) let core behavior come from data — see " + L("behavior-metadata.html", "Behavior Metadata") + "."))

page("plugin-sdk/engine-contract",
  "Engine Contract &amp; Hooks",
  "The callables Studio expects an engine to implement.",
  "An engine implements a small, published contract — five required methods, two optional.",
  glance([
    "<code>info / check_env / check_request / synthesize / settings_schema</code>.",
    "Optional: <code>preview</code>, <code>shutdown</code>.",
    "Same contract for built-in and community engines."]),
  h2("The five required methods"),
  pre("def info(self): ...            # metadata for the registry\n"
      "def check_env(self): ...       # can this engine run here?\n"
      "def check_request(self, r): ...# pre-flight validation\n"
      "def synthesize(self, r): ...   # write audio to r['output_path']\n"
      "def settings_schema(self): ... # JSON Schema for the settings UI"),
  h2("Optional overrides"),
  ul([
    "<code>preview(r)</code> — lightweight preview (defaults to synthesize).",
    "<code>shutdown()</code> — cleanup on unload (defaults to no-op)."]),
  h2("Rules"),
  p("<strong>Engines run in the TTS Server, not the app.</strong> Don't import app modules, start background threads, or write outside the plugin folder and the requested output path. Voice-asset building goes through the same contract."))

page("plugin-sdk/behavior-metadata",
  "Behavior Metadata",
  "Driving core behavior from manifest metadata instead of engine-ID branches.",
  "Instead of special-casing engines in Studio's code, engines declare their behavior as metadata. Studio reads it and adapts.",
  glance([
    "Chunk limit and split target come from the manifest.",
    "Progress is parsed from a declared pattern.",
    "Settings render from a JSON Schema with UI hints.",
    "Per-voice settings are declared, not hard-coded."]),
  h2("Text chunking"),
  p("<strong>Each engine declares its text chunk limit.</strong> Studio splits long segments accordingly, so chunking adapts per engine without code changes."),
  h2("Progress parsing"),
  p("<strong>Progress comes from a declared pattern.</strong> Studio turns engine output into normalized progress events using metadata, not engine-specific parsing scattered through the app."),
  h2("Schema-driven settings"),
  p("<strong>Settings forms are generated from <code>settings_schema.json</code></strong>, with optional UI hints. Engines can also declare per-voice settings. See " + L("manifest.html", "manifest.json Reference") + "."))

page("plugin-sdk/compatibility",
  "Compatibility &amp; Versioning",
  "Verifying a plugin matches the Studio plugin contract before use.",
  "Studio checks that a plugin matches the contract version it expects before trusting it.",
  soon("contract-version checks are being finalized in Phase 12."),
  glance([
    "A contract version (v1) defines the expected surface.",
    "Expected callables and signatures are verified.",
    "Checks run at load, before synthesis."]),
  h2("Contract version"),
  p("<strong>The plugin contract is versioned.</strong> Studio knows which contract version it supports and validates plugins against it."),
  h2("What's checked"),
  p("<strong>Required callables must exist with the expected signatures.</strong> Validation happens at load, so an incompatible plugin fails fast with a clear reason instead of mid-job."))

page("plugin-sdk/plugin-context",
  "Plugin Context Contract",
  "How plugins reach Studio services without importing app persistence.",
  "Plugins get what they need through a context object — never by importing Studio's internals.",
  soon("the context contract is being finalized in Phase 12."),
  glance([
    "<code>plugin/core</code> stays portable (no app imports).",
    "A context is passed into Studio-facing adapters.",
    "Persistence stays Studio-owned."]),
  h2("Why portability matters"),
  p("<strong>The engine core must run without Studio.</strong> Keeping it free of app imports is what lets engines be extracted and run standalone — see " + L("standalone-repos.html", "Portable Core &amp; Standalone Repos") + "."),
  h2("The context"),
  p("<strong>Studio passes a context into the plugin's adapter layer</strong> for the services it's allowed to use. Studio still owns persistence and state."))

page("plugin-sdk/standalone-repos",
  "Portable Core &amp; Standalone Repos",
  "First-party engines as standalone repos that also run from a CLI.",
  "Engines are built to live as their own repos and even run outside Studio from a CLI.",
  soon("the standalone harness is firming up in Phase 12."),
  glance([
    "Engine repo layout (XTTS as the example).",
    "A CLI entry point and dependency path.",
    "A standalone builder harness."]),
  h2("Repo layout"),
  p("<strong>Each engine is a self-contained repo</strong> (XTTS is the worked example) that Studio installs via git. The same folder runs in Studio and on its own."),
  h2("CLI &amp; harness"),
  p("<strong>A CLI entry point lets an engine run without the app</strong>, which is handy for development and testing. A builder harness helps package and verify a standalone engine."))

page("plugin-sdk/dev-mode",
  "Studio Dev Mode Preview",
  "The authoritative UI preview path for plugin development.",
  "Dev Mode is how you preview a plugin's UI and behavior inside Studio while you build it.",
  soon("Dev Mode is being finalized in Phase 12."),
  glance([
    "Preview the plugin's UI in Studio.",
    "Drive it with scenario fixtures from the plugin.",
    "Use it as you build."]),
  h2("What it previews"),
  p("<strong>Dev Mode renders your plugin's settings and flows</strong> the way users will see them, so you can iterate without a full release loop."),
  h2("Scenario fixtures"),
  p("<strong>Plugins ship fixtures that drive the preview</strong>, giving deterministic scenarios to check against while developing."))

page("plugin-sdk/install-import",
  "Installing &amp; Updating Engines",
  "Installing engines from GitHub, importing by zip, and keeping them updated.",
  "Engines install like Stable Diffusion extensions: browse, clone, and update with a click. You can also import a zip directly.",
  soon("the in-app engine browser is part of the 2.0 rollout."),
  glance([
    "Browse the GitHub topic <code>audiobook-studio-tts</code>, or paste a repo URL.",
    "Install = git clone; update = git pull.",
    "Updates show as a notify-only alert in Settings → TTS Engines.",
    "Import a zip or delete an engine from the UI."]),
  h2("Install"),
  p("<strong>Find an engine and clone it down.</strong> Studio validates the manifest and folder name before any code loads, then registers it. Heavy weights download on first use."),
  h2("Update"),
  p("<strong>Updates are notify-only.</strong> Settings → TTS Engines lists available updates with per-engine <em>Update</em> and <em>Update all</em>; Studio never updates without your click."),
  h2("Import &amp; delete"),
  p("<strong>You can also import an engine from a zip</strong> (for offline or private engines) and delete engines with a confirmation. Dependency installs show clear feedback."),
  warn("third-party engines run code in the TTS Server. Studio shows a trust prompt naming the source before installing a community engine."))

page("plugin-sdk/template",
  "Using the Template",
  "Start from the bundled engine template.",
  "Don't start from scratch — copy the template and fill in the blanks.",
  glance([
    "Copy the engine bundle template.",
    "Update the manifest and settings schema.",
    "Implement the five contract methods."]),
  h2("Steps"),
  ol([
    "Copy the engine bundle template into a new <code>tts_&lt;id&gt;</code> repo.",
    "Edit <code>manifest.json</code> (id, entry class, capabilities, distribution).",
    "Describe options in <code>settings_schema.json</code> and deps in <code>requirements.txt</code>.",
    "Implement <code>info / check_env / check_request / synthesize / settings_schema</code>.",
    "Add the GitHub topic <code>audiobook-studio-tts</code> so Studio's browser finds it."]),
  p("See " + L("engine-contract.html", "Engine Contract &amp; Hooks") + " and " + L("testing.html", "Testing Your Plugin") + "."))

page("plugin-sdk/testing",
  "Testing Your Plugin",
  "Keeping tests and fixtures inside the plugin folder.",
  "Tests travel with the plugin, so an engine repo proves itself wherever it lives.",
  glance([
    "Plugin-local <code>tests/</code> are collected by pytest.",
    "A contract test checks the required surface.",
    "Fixtures and generated outputs live with the plugin."]),
  h2("Plugin-local tests"),
  p("<strong>Keep tests inside the plugin folder.</strong> They're collected alongside the app's tests, so the engine is verified in place."),
  h2("The contract test"),
  p("<strong>A contract test confirms the engine implements the required methods</strong> with the expected behavior — the fastest way to catch a broken plugin."),
  h2("Fixtures"),
  p("<strong>Ship fixtures (and any generated outputs) with the plugin</strong> so tests are deterministic and self-contained."))

page("plugin-sdk/submission",
  "Submission Guidelines",
  "What a plugin needs to be accepted.",
  "Sharing an engine for others? Here's the bar it should meet.",
  glance([
    "Passes a security &amp; safety review.",
    "Is stable and performs reasonably.",
    "Is self-contained and properly licensed."]),
  h2("Security &amp; safety"),
  p("<strong>Engines run code, so safety comes first.</strong> Respect the boundaries (no app imports, only write to allowed paths), and disclose any network use."),
  h2("Stability &amp; performance"),
  p("<strong>It should work reliably and not hog resources.</strong> Declare an honest resource profile so scheduling can do its job."),
  h2("Self-contained &amp; licensed"),
  p("<strong>Everything in the repo, with a clear license.</strong> Tests included, weights downloaded on first use, license stated in the manifest."))

# ============================ TTS GATEWAY API ==================================
page("api/overview",
  "Gateway Overview &amp; Enabling",
  "Use Studio as an external TTS backend over HTTP.",
  "The gateway turns Studio into a local text-to-speech backend your own tools can call over HTTP, using the engines you've installed.",
  glance([
    "A local HTTP API for synthesis.",
    "Enable it in Settings.",
    "OpenAPI docs at <code>/api/v1/tts/docs</code>."]),
  h2("What the gateway is"),
  p("<strong>It exposes synthesis over HTTP</strong> so scripts and apps can generate speech through Studio's installed engines — no cloud account needed."),
  h2("Enabling it"),
  p("<strong>Turn the gateway on in " + L("../user-guide/settings.html", "Settings") + ".</strong> It's off by default. Once enabled, the interactive OpenAPI docs are served at <code>/api/v1/tts/docs</code>."),
  note("This is for an AI/automation audience — the endpoint pages are precise enough to hand to your own assistant to integrate."))

page("api/auth",
  "Authentication &amp; Rate Limiting",
  "Securing the gateway for LAN or shared use.",
  "Before exposing the gateway beyond localhost, lock it down with a key and rate limits.",
  glance([
    "Bearer API-key auth.",
    "Consider LAN binding carefully.",
    "Per-IP rate limiting."]),
  h2("API key (Bearer)"),
  p("<strong>Authenticate requests with a Bearer token.</strong> Send <code>Authorization: Bearer &lt;key&gt;</code> on each call."),
  pre("curl -H \"Authorization: Bearer $STUDIO_API_KEY\" \\\n     http://127.0.0.1:8123/api/v1/tts/engines"),
  h2("LAN binding &amp; rate limits"),
  p("<strong>Binding to a LAN address exposes the gateway to your network.</strong> Use the API key, apply per-IP rate limiting, and consider a reverse proxy. See " + L("../operations/headless-lan.html", "Headless &amp; LAN Exposure") + "."))

page("api/endpoints",
  "Endpoints Reference",
  "The routes exposed under /api/v1/tts.",
  "The gateway's surface is small. Here are the routes you'll use.",
  glance([
    "Discover engines.",
    "Synthesize and preview.",
    "Fetch job status and audio."]),
  h2("Routes"),
  table(["Method &amp; path", "Purpose"], [
    ["<code>GET /api/v1/tts/engines</code>", "List installed engines."],
    ["<code>GET /api/v1/tts/engines/{id}</code>", "Details for one engine."],
    ["<code>POST /api/v1/tts/synthesize</code>", "Synthesize text (inline or queued)."],
    ["<code>POST /api/v1/tts/preview</code>", "Quick preview synthesis."],
    ["<code>GET /api/v1/tts/jobs/{id}</code>", "Poll a queued job's status."],
    ["<code>GET /api/v1/tts/jobs/{id}/audio</code>", "Download a finished job's audio."]]),
  p("See " + L("sync-vs-queued.html", "Inline vs Queued + Polling") + " for how short and long text differ, and " + L("examples.html", "Examples") + " for copy-paste calls."))

page("api/sync-vs-queued",
  "Inline vs Queued + Polling",
  "Short text returns inline; long text queues a job you poll.",
  "How a request behaves depends on length: short text comes back immediately; long text becomes a job you poll.",
  glance([
    "Short text → inline audio in the response.",
    "Long text → a job id + poll URL.",
    "Poll until complete, then fetch the audio."]),
  h2("Inline"),
  p("<strong>Below the inline threshold, synthesis returns audio directly.</strong> One request, one response — simplest for short snippets."),
  h2("Queued + polling"),
  p("<strong>Above the threshold, you get a job id and a poll URL.</strong> Poll <code>GET /api/v1/tts/jobs/{id}</code> until it's done, then download from <code>/jobs/{id}/audio</code>."),
  pre("POST /api/v1/tts/synthesize  -> { \"job_id\": \"...\", \"poll\": \"/api/v1/tts/jobs/...\" }\nGET  /api/v1/tts/jobs/{id}    -> { \"status\": \"running\" | \"done\" | \"failed\" }\nGET  /api/v1/tts/jobs/{id}/audio -> the audio file"))

page("api/priority",
  "Priority Policies",
  "How API jobs are scheduled relative to Studio's own work.",
  "When the gateway and the app both want the engine, a priority policy decides who goes first.",
  glance([
    "<code>TTS_API_PRIORITY</code> sets the mode.",
    "Modes: studio_first, equal, api_first.",
    "Designed to avoid starvation."]),
  h2("The modes"),
  table(["Mode", "Behavior"], [
    ["<code>studio_first</code>", "Studio's own jobs take precedence over API jobs."],
    ["<code>equal</code>", "API and Studio jobs share the queue fairly."],
    ["<code>api_first</code>", "API jobs take precedence (for backend-style use)."]]),
  h2("Avoiding starvation"),
  p("<strong>Whichever mode you pick, scheduling avoids starving the other side.</strong> Set the mode via the <code>TTS_API_PRIORITY</code> environment variable — see " + L("../operations/env-vars.html", "Environment Variables") + "."))

page("api/examples",
  "Examples",
  "Copy-paste curl and automation snippets.",
  "Concrete calls you can copy, paste, and hand to your own AI to wire up an integration.",
  glance([
    "Discover engines.",
    "Synthesize inline and queued.",
    "Poll and download audio."]),
  h2("Discover engines"),
  pre("curl -H \"Authorization: Bearer $KEY\" \\\n     http://127.0.0.1:8123/api/v1/tts/engines"),
  h2("Synthesize"),
  pre("curl -X POST http://127.0.0.1:8123/api/v1/tts/synthesize \\\n  -H \"Authorization: Bearer $KEY\" -H \"Content-Type: application/json\" \\\n  -d '{\"text\": \"Chapter one.\", \"voice\": \"gravel-road\"}'"),
  h2("Poll &amp; download (long text)"),
  pre("# returns {\"job_id\":\"abc\",\"poll\":\"/api/v1/tts/jobs/abc\"}\ncurl -H \"Authorization: Bearer $KEY\" http://127.0.0.1:8123/api/v1/tts/jobs/abc\ncurl -H \"Authorization: Bearer $KEY\" -o out.wav \\\n     http://127.0.0.1:8123/api/v1/tts/jobs/abc/audio"))

page("api/llm-controllers",
  "LLM / Controller Readiness",
  "Forward-looking: the API surface for future LLM/controller plugins.",
  "Looking ahead: what an LLM or external controller would need to drive Studio, and where the gaps are.",
  future("this is planning only — not built yet. It captures the direction so the API can grow toward it."),
  glance([
    "What a controller would need from the API.",
    "Gaps currently being verified.",
    "Direction, not a shipped feature."]),
  h2("What a controller would need"),
  p("<strong>A controller needs to discover capabilities, submit work, and observe results</strong> — list engines/voices, synthesize, and poll jobs, all of which the gateway already covers in basic form."),
  h2("Current gaps"),
  p("<strong>Richer capability description and status detail are being verified</strong> as candidates for the controller surface. Nothing here is committed yet."))

# ============================ ARCHITECTURE =====================================
page("architecture/overview",
  "Architecture Overview",
  "The big-picture map of Studio 2.0 subsystems and ownership.",
  "A map of the 2.0 subsystems and who owns what, plus how a request flows end to end.",
  glance([
    "Clear ownership: orchestrator, watchdog, voice bridge.",
    "A request flows app → bridge → TTS Server → engine.",
    "No import-time side effects."]),
  h2("Ownership split"),
  ul([
    "<strong>Orchestrator</strong> — schedules and recovers work.",
    "<strong>Watchdog</strong> — supervises the TTS Server process.",
    "<strong>Voice bridge</strong> — the only route from a request to an engine."]),
  h2("Request flow"),
  p("<strong>A synthesis request travels app → voice bridge → TTS Server → engine, and results come back as normalized artifacts and progress.</strong> See " + L("voice-bridge.html", "VoiceBridge") + " and " + L("tts-server.html", "TTS Server &amp; Watchdog") + "."),
  h2("No import-time side effects"),
  p("<strong>Importing a module must not start servers, load models, or touch the filesystem.</strong> Startup happens in one explicit place — see " + L("boot.html", "Boot Sequence") + "."))

page("architecture/tts-server",
  "TTS Server &amp; Watchdog",
  "The long-lived TTS Server subprocess and its supervisor.",
  "Synthesis runs in a separate, supervised process. If it dies, the watchdog brings it back.",
  glance([
    "A long-lived subprocess hosts engines.",
    "A READY signal marks it up.",
    "A watchdog spawns, health-checks, and restarts it.",
    "A circuit breaker prevents crash loops."]),
  h2("The server process"),
  p("<strong>The TTS Server hosts all engines and manages GPU memory.</strong> It signals readiness once up, and Studio talks to it over HTTP via the bridge."),
  h2("The watchdog"),
  p("<strong>Studio spawns and supervises the server.</strong> It polls health, restarts on failure, and uses a circuit breaker so a persistently broken engine doesn't spin in a restart loop."))

page("architecture/voice-bridge",
  "VoiceBridge",
  "The single routing point from a voice request to an engine.",
  "Every synthesis request goes through one place: the VoiceBridge. That's what keeps engine details out of the rest of the app.",
  glance([
    "Routes requests to engines over HTTP.",
    "A remote bridge + client talk to the TTS Server.",
    "Honors engine enablement and readiness."]),
  h2("Routing"),
  p("<strong>The bridge resolves the voice, validates readiness, builds the engine request, and normalizes the result.</strong> Nothing else calls engines directly."),
  h2("Remote client"),
  p("<strong>A bridge client speaks to the TTS Server over HTTP.</strong> Studio caches engine info from the server rather than importing engine code. See " + L("../plugin-sdk/overview.html", "Plugin Architecture") + "."))

page("architecture/orchestration",
  "Task Orchestration",
  "How background work is scheduled and executed.",
  "The orchestrator owns background work: it submits, schedules, cancels, and recovers tasks.",
  glance([
    "A <code>StudioTask</code> abstraction with task types.",
    "Submit / cancel / recover operations.",
    "Policies, resources, and recovery rules.",
    "A job-handler registry."]),
  h2("Tasks &amp; jobs"),
  p("<strong>Work is modeled as tasks with explicit types.</strong> The orchestrator turns them into queued jobs and runs them under scheduling policies that respect engine resources."),
  h2("Recovery"),
  p("<strong>Recovery is built in.</strong> After a restart, the orchestrator reconciles what's done against what's expected and resumes. A job-handler registry maps job kinds to their handlers. See " + L("progress.html", "Progress Services") + " and " + L("../concepts/artifacts-recovery.html", "Artifacts, Reuse &amp; Recovery") + "."))

page("architecture/progress",
  "Progress Services",
  "Centralized progress math, ETA, reconciliation, and broadcasting.",
  "Progress is computed in one place and broadcast, so every screen shows the same numbers.",
  glance([
    "One source for progress math.",
    "Rounded sensibly; broadcast on meaningful change.",
    "ETA estimation and reconciliation as truth."]),
  h2("Centralized math"),
  p("<strong>Progress is calculated centrally and rounded</strong> (broadcasting only on meaningful change) to avoid noisy, inconsistent updates across screens."),
  h2("ETA &amp; reconciliation"),
  p("<strong>ETAs come from observed throughput; reconciliation is the source of truth.</strong> What actually exists as validated artifacts wins over optimistic in-memory state."))

page("architecture/boot",
  "Boot Sequence",
  "The one explicit place startup side effects are allowed.",
  "Startup is deliberate and idempotent — and it's the only place side effects live.",
  glance([
    "<code>boot_studio()</code> and <code>boot_tts_server()</code>.",
    "Migrations run, then the watchdog starts.",
    "Idempotent and off the request path."]),
  h2("Explicit startup"),
  p("<strong>Boot functions own all startup side effects.</strong> Migrations run first, then the watchdog brings up the TTS Server. Importing modules never triggers this."),
  h2("Idempotent"),
  p("<strong>Boot can run safely more than once</strong> and never happens as a side effect of handling a request — keeping requests fast and predictable."))

page("architecture/state",
  "State: state.json + SQLite",
  "The live state store and the persistent database.",
  "Studio keeps fast-changing runtime state in a JSON file and durable data in SQLite.",
  glance([
    "<code>state.json</code> — live jobs and settings.",
    "SQLite — projects, chapters, segments, queue history.",
    "Moving toward a StorageManager."]),
  h2("Live vs durable"),
  p("<strong><code>state.json</code> holds live runtime state</strong> (in-flight jobs, settings), while <strong>SQLite holds durable data</strong> (projects, chapters, segments, queue history)."),
  h2("Direction"),
  p("<strong>Storage access is consolidating behind a StorageManager</strong> so route handlers and tasks don't reach into paths directly. See " + L("../operations/storage-layout.html", "Storage Layout") + "."))

page("architecture/web-api",
  "Web &amp; API Layer",
  "The FastAPI app, routers, WebSocket, and the gateway sub-app.",
  "The web layer is a FastAPI app: domain routers for the UI, a WebSocket for live updates, and the gateway mounted as a sub-app.",
  glance([
    "<code>web.py</code> mounts and lifecycle.",
    "Domain routers behind the UI.",
    "<code>ws.py</code> broadcasts live updates.",
    "Jobs moving from REST polling to WebSocket."]),
  h2("App &amp; routers"),
  p("<strong>FastAPI hosts domain routers</strong> (projects, chapters, voices, queue, and more) plus the external gateway as a mounted sub-app. See " + L("internal-api.html", "Internal HTTP API Reference") + " and " + L("../api/overview.html", "TTS Gateway API") + "."),
  h2("Live updates"),
  p("<strong>A WebSocket broadcasts progress and state</strong> so the UI updates without polling; queue updates are migrating from REST polling to the WebSocket."))

page("architecture/paths-security",
  "Paths &amp; Security",
  "Treating filesystem paths as an untrusted security surface.",
  "User-influenced paths are treated as hostile input. Studio contains them with dedicated helpers.",
  glance([
    "<code>safe_join</code> / <code>secure_join_flat</code> / <code>find_secure_file</code>.",
    "A containment pattern for all path building.",
    "Aligned with static analysis (CodeQL)."]),
  h2("Containment"),
  p("<strong>Never join user input into a path directly.</strong> The secure-join helpers keep resolved paths inside their intended root, blocking traversal."),
  h2("Why it matters"),
  p("<strong>Paths are an untrusted surface.</strong> Treating them consistently — and keeping aligned with CodeQL findings — prevents a whole class of vulnerabilities."))

page("architecture/frontend",
  "Frontend Architecture",
  "How the React app is organized.",
  "The UI is a React app with a clear split between canonical data and live overlays.",
  glance([
    "pages / components / hooks / store / theme.",
    "Canonical data vs live overlays.",
    "Tests under frontend/tests."]),
  h2("Organization"),
  p("<strong>The app is organized into pages, components, hooks, a store, and theme.</strong> The store holds UI state; it is not a second source of truth for canonical data."),
  h2("Canonical vs live"),
  p("<strong>Canonical data comes from the backend; live overlays show in-flight progress.</strong> Keeping them distinct avoids the frontend drifting from server truth. Tests live under <code>frontend/tests</code>."))

page("architecture/internal-api",
  "Internal HTTP API Reference",
  "The internal domain route groups behind the UI.",
  "The UI is backed by internal domain routes. These are grouped by area.",
  glance([
    "projects / chapters / voices / queue.",
    "generation / jobs / settings / system.",
    "analysis / migration / engines."]),
  h2("Route groups"),
  ul([
    "<strong>Content</strong> — projects, chapters, voices.",
    "<strong>Work</strong> — generation, jobs, queue.",
    "<strong>System</strong> — settings, system, engines, analysis, migration."]),
  note("These are internal routes for the UI. For the external, documented surface see the " + L("../api/overview.html", "TTS Gateway API") + "."))

# ============================ OPERATIONS =======================================
page("operations/launcher-options",
  "Launcher Options",
  "Running the app for different scenarios.",
  "The launchers cover everyday running and a few special cases via flags.",
  glance([
    "<code>run.sh</code> / <code>run.ps1</code> flags.",
    "A generic plugin setup loop.",
    "Port and reload control."]),
  h2("Flags"),
  ul([
    "<code>--setup-only</code> — provision without starting.",
    "<code>--no-reload</code> — disable the dev auto-reload.",
    "<code>--port &lt;n&gt;</code> — change the port (default 8123)."]),
  h2("Setup loop"),
  p("<strong>The launcher provisions the app and engine environments and installs plugin dependencies</strong> the first time. See " + L("../getting-started/launchers.html", "Launcher Scripts") + "."))

page("operations/env-vars",
  "Environment Variables",
  "Configurable environment variables resolved in app config.",
  "Studio reads a handful of environment variables for storage roots, plugin locations, and behavior.",
  glance([
    "Storage roots and base directory.",
    "Plugin and plugin-data locations.",
    "Engine env, ports, and test-mode flags."]),
  h2("Common variables"),
  table(["Variable", "Purpose"], [
    ["<code>AUDIOBOOK_BASE_DIR</code>", "Base directory for storage roots."],
    ["<code>PLUGINS_DIR</code> / <code>PLUGIN_DATA_DIR</code>", "Where engines and their data live."],
    ["<code>XTTS_ENV_DIR</code>", "Location of the engine environment."],
    ["<code>TTS_API_PRIORITY</code>", "Gateway vs Studio scheduling mode."]]),
  note("Ports and test-mode flags are also configurable; see the app config for the full list."))

page("operations/storage-layout",
  "Storage Layout",
  "Where Studio keeps projects, voices, uploads, and transient data.",
  "Everything Studio writes has a place. Here's the layout.",
  glance([
    "Per-project folders for audio, text, output, and trash.",
    "Voices and plugin data have their own roots.",
    "Transient and trash areas are separate."]),
  h2("Per-project"),
  pre("projects/<id>/\n  audio/   text/   m4b/   cover/   trash/"),
  h2("Shared roots"),
  p("<strong>Voices and per-engine plugin data live in their own roots</strong>, with transient and trash areas kept apart from durable content. See " + L("../architecture/state.html", "State: state.json + SQLite") + "."))

page("operations/xtts-env",
  "The XTTS Environment",
  "Maintaining the separate engine install.",
  "The local engine lives in its own environment. Occasionally you'll update or rebuild it.",
  glance([
    "What lives in the engine environment.",
    "An update script keeps it current.",
    "Recreate it if dependencies go stale."]),
  h2("What lives there"),
  p("<strong>The local engine and its heavy dependencies</strong> live separately from the app to avoid conflicts. See " + L("../getting-started/environments.html", "The Two Environments") + "."),
  h2("Updating &amp; recreating"),
  p("<strong>An update script refreshes the engine environment.</strong> If dependencies get into a bad state, recreate it without touching the app."))

page("operations/scripts",
  "Maintenance Scripts",
  "The helper scripts in scripts/.",
  "A few scripts help with stats, recovery, and development.",
  glance([
    "Backfill stats and sync durations.",
    "Recover projects from disk.",
    "Install hooks and a dev helper."]),
  h2("Data maintenance"),
  ul([
    "<strong>Backfill / sync</strong> — recompute stats and durations.",
    "<strong>Recover</strong> — rebuild project state from files on disk."]),
  h2("Development"),
  p("<strong>Hook installers and a dev helper</strong> streamline local development. See " + L("../contributing/testing-verification.html", "Testing &amp; Verification") + "."))

page("operations/backups-recovery",
  "Backups &amp; Recovery",
  "Protecting and restoring project data.",
  "Two layers protect your work: project backups you take, and automatic reconciliation on startup.",
  glance([
    "Project backups (optionally with audio).",
    "Disk-based project recovery.",
    "Startup reconciliation."]),
  h2("Backups"),
  p("<strong>Snapshot a project and restore it later.</strong> See " + L("../user-guide/backups-tab.html", "Backups") + " for the in-app flow."),
  h2("Recovery &amp; reconciliation"),
  p("<strong>Studio can rebuild project state from disk</strong> and reconciles state on startup so a crash doesn't lose validated work. See " + L("../concepts/artifacts-recovery.html", "Artifacts, Reuse &amp; Recovery") + "."))

page("operations/headless-lan",
  "Headless &amp; LAN Exposure",
  "Running without the UI in focus and exposing on a network.",
  "You can run Studio on a machine and reach it from elsewhere — just secure it first.",
  glance([
    "Serve on a LAN address.",
    "Secure the gateway with a key + rate limits.",
    "Reverse-proxy notes."]),
  h2("Serving on a LAN"),
  p("<strong>Bind to a network address to reach Studio from other devices.</strong> Doing so exposes it beyond localhost, so treat security as mandatory."),
  h2("Securing it"),
  p("<strong>Require the API key, apply per-IP rate limits, and consider a reverse proxy with TLS.</strong> See " + L("../api/auth.html", "Authentication &amp; Rate Limiting") + "."))

page("operations/performance",
  "Performance &amp; GPU Tuning",
  "Getting the most throughput from local synthesis.",
  "A few levers make local synthesis faster and steadier.",
  glance([
    "GPU/VRAM considerations.",
    "CPS auto-tuning and ETA.",
    "Large-book load performance."]),
  h2("GPU &amp; VRAM"),
  p("<strong>A CUDA GPU dramatically speeds local synthesis.</strong> More VRAM lets heavier engines and longer chunks run comfortably."),
  h2("Throughput &amp; scale"),
  p("<strong>Studio auto-tunes characters-per-second estimates for accurate ETAs</strong> and is built to keep large books responsive. Declare honest engine resource profiles so scheduling avoids collisions."))

# ============================ CONTRIBUTING =====================================
page("contributing/workflow",
  "Contribution Workflow",
  "How to propose changes to the project.",
  "Contributions follow a simple fork-and-PR flow with focused, reviewed changes.",
  glance([
    "Fork &amp; pull-request workflow.",
    "Squash-merge, focused PRs.",
    "Review expectations."]),
  h2("The flow"),
  p("<strong>Fork, branch, and open a pull request.</strong> Keep PRs focused on one change; they're squash-merged to keep history clean."),
  h2("Review"),
  p("<strong>Expect review on correctness, scope, and tests.</strong> See " + L("testing-verification.html", "Testing &amp; Verification") + " and " + L("agent-rules.html", "Engineering Rules") + "."))

page("contributing/agent-rules",
  "Engineering Rules",
  "The design-docs/engineering-rules router and what each rule set covers.",
  "The repo encodes its conventions as engineering rules, so every contributor follows the same constraints.",
  glance([
    "A rules router maps tasks to rule sets.",
    "Key constraints like modular architecture.",
    "Verification before calling work “done.”"]),
  h2("The router"),
  p("<strong>A rules file routes a task to the relevant rule sets</strong> (backend boundaries, frontend, paths, workflow, and more)."),
  h2("Key constraints"),
  p("<strong>Modular architecture and clear boundaries are enforced</strong>, and changes aren't “done” until verified. See " + L("testing-verification.html", "Testing &amp; Verification") + "."))

page("contributing/testing-verification",
  "Testing &amp; Verification",
  "How to verify a change end to end.",
  "Before a change is done, it's verified — backend, lint, and frontend.",
  glance([
    "pytest across <code>tests/</code> and plugins.",
    "ruff for linting.",
    "Frontend vitest / build.",
    "Tests expected with changes."]),
  h2("What to run"),
  ul([
    "<strong>pytest</strong> — backend and plugin-local tests.",
    "<strong>ruff</strong> — Python linting.",
    "<strong>vitest / build</strong> — frontend tests and build."]),
  h2("Expectation"),
  p("<strong>Changes ship with tests and a clean verification run.</strong> Plugin tests live with their plugin — see " + L("../plugin-sdk/testing.html", "Testing Your Plugin") + "."))

page("contributing/security",
  "Security Policy",
  "Supported versions and how to report vulnerabilities.",
  "Found a security issue? Report it privately. Here's how, and what to expect.",
  glance([
    "Supported versions.",
    "Private reporting.",
    "Response expectations."]),
  h2("Reporting"),
  p("<strong>Report vulnerabilities privately</strong> rather than in public issues, so they can be fixed before disclosure."),
  h2("Scope &amp; response"),
  p("<strong>Supported versions receive fixes</strong>, and reports get an acknowledgement and a path to resolution. Path handling is treated as a security surface — see " + L("../architecture/paths-security.html", "Paths &amp; Security") + "."))

page("contributing/license",
  "License",
  "How the project is licensed.",
  "Audiobook Studio is open source under a permissive license; engines and models carry their own terms.",
  glance([
    "MIT-licensed project code.",
    "Third-party and engine licenses apply separately."]),
  h2("Project license"),
  p("<strong>The project code is MIT-licensed.</strong>"),
  h2("Third-party &amp; engines"),
  p("<strong>Engines, models, and voices carry their own licenses.</strong> When you install an engine or import a voice, its license applies — Studio surfaces those terms but doesn't override them."))

# ---- render: emit unstyled content JSON; the SPA shell + CSS own all design ----
def resolve(section, target):
    """Turn an in-handbook relative link into a #route the SPA router uses."""
    t = target[:-5] if target.endswith(".html") else target
    t = t[3:] if t.startswith("../") else f"{section}/{t}"  # ../sec/slug | same-section
    return "#" + t

def render():
    def strip(s):
        s = re.sub(r"<[^>]+>", " ", s)
        return re.sub(r"\s+", " ", html.unescape(s)).strip()
    n = 0
    index = []
    for key, (title, desc, lede, body) in C.items():
        section, slug = key.split("/", 1)
        sub = lambda s: re.sub(r"@@(.*?)@@", lambda m: resolve(section, m.group(1)), s)
        led, bod = sub(lede), sub(body)
        obj = {"title": title, "desc": desc, "lede": led, "body": bod}
        out = ROOT / "content" / section / f"{slug}.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
        index.append({"r": f"{section}/{slug}", "t": strip(title), "d": strip(led), "x": strip(bod)})
        n += 1
    (ROOT / "content" / "search-index.json").write_text(
        json.dumps(index, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {n} content JSON files + search index.")

if __name__ == "__main__":
    render()
