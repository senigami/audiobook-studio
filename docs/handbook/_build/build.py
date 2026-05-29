#!/usr/bin/env python3
"""Build the docs handbook pages from one content source.

Emits LEAN page shells: head + article content + placeholders + 3 script lines.
The shared chrome (top nav, sidebar, breadcrumb, prev/next, footer) is injected
at runtime by assets/hb-nav.js from assets/nav-data.js — it is NOT baked per page.
So this script handles only per-page content; navigation lives in one place.

Run:  python3 docs/handbook/_build/build.py
"""
from __future__ import annotations
import html
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
def L(href, text): return f'<a href="{href}">{text}</a>'  # in-handbook relative link

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
    "Engines install from GitLab; voices come from a Hugging Face library."]),
  h2("A managed TTS Server"),
  p("<strong>Synthesis no longer runs inside the app.</strong> A dedicated TTS Server process hosts the voice engines, manages GPU memory, and exposes a clean internal API. Studio supervises it with a watchdog and restarts it if it stops responding. An engine can crash without taking down the app or losing your work."),
  h2("A task orchestrator"),
  p("<strong>Work is scheduled, not improvised.</strong> Instead of one worker loop juggling everything, 2.0 uses an orchestrator that queues jobs, tracks progress centrally, and recovers cleanly after a restart. Completion is decided by validated artifacts, not loose files."),
  h2("Engine registry &amp; voice bridge"),
  p("<strong>One boundary routes every synthesis request.</strong> The registry knows what engines are installed and what they can do; the voice bridge is the only path that hands a request to an engine. Because a voice's identity is kept separate from any engine's assets, the same voice can move between engines without being rebuilt."),
  tip("You can add, update, or swap engines without rewrites rippling into the queue, the editor, or your projects."),
  h2("Installable engines &amp; a voice library"),
  p("<strong>Engines and voices are bundles you can install and share.</strong> Engines are GitLab repos you install like Stable Diffusion extensions (clone to install, pull to update). Voices come from a Hugging Face library with icons, playable samples, and rich tags."),
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
  future("installable engines from GitLab, a Hugging Face voice library, and AI voice casting. See " + L("../plugin-sdk/overview.html", "Plugin SDK") + "."),
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
  p("<strong>Engines are installable.</strong> Beyond the default, you can add engines as plugins from GitLab. See the " + L("../plugin-sdk/overview.html", "Plugin SDK") + "."))

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

# ---- render -------------------------------------------------------------------
def render():
    n = 0
    for key, (title, desc, lede, body) in C.items():
        section, slug = key.split("/", 1)
        out = ROOT / section / f"{slug}.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(SHELL.format(
            title=esc(title.replace("&amp;", "&")), desc=esc(desc),
            h1=title, lede=lede, body=body, section=section, slug=slug), encoding="utf-8")
        n += 1
    print(f"Generated {n} handbook pages.")

if __name__ == "__main__":
    render()
