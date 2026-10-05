# Getting Started

This guide covers the current recommended first-run path for **Audiobook Studio**.

## Best Starting Point

If you are new to the project, start with the current Studio 2.0 release line or the latest `main` after that release. Studio 2.0 is the plugin-based release family for local XTTS production, optional Voxtral support, mixed rendering, schema-driven engine settings, and the redesigned Studio 2.0 UI.

## Requirements

- **Python 3.11+**
- **Node.js 18+**
- **FFmpeg**
- macOS, Linux, or Windows
- NVIDIA GPU recommended for faster local synthesis

## Recommended Setup

### macOS / Linux

```bash
git clone https://github.com/senigami/audiobook-studio.git
cd audiobook-studio
./run.sh
```

### Windows PowerShell

```powershell
git clone https://github.com/senigami/audiobook-studio.git
cd audiobook-studio
powershell -ExecutionPolicy Bypass -File .\run.ps1
```

The launcher scripts will:

- create or update the main `venv`
- create or update the engine environments (default: `~/xtts-env`)
- automatically repair stale environments if legacy package conflicts are detected
- install frontend dependencies if needed
- build the frontend if needed
- start the app on `http://127.0.0.1:8123`

Useful options:

### macOS / Linux

```bash
./run.sh --setup-only
./run.sh --no-reload
./run.sh --port 9000
```

### Windows PowerShell

```powershell
powershell -ExecutionPolicy Bypass -File .\run.ps1 -SetupOnly
powershell -ExecutionPolicy Bypass -File .\run.ps1 -NoReload
powershell -ExecutionPolicy Bypass -File .\run.ps1 -Port 9000
```

## First Run

1. Launch the app with `./run.sh` or `run.ps1`.
2. Open `http://127.0.0.1:8123`.
3. Create a book from the Library (the rail on the left: **CREATE > Library**, then click **+ New Book**).
4. Open the book — it opens to the **Manuscript** stage. Add or import chapter text here.
5. Build or import a voice profile under **CREATE > Voices** in the left rail.
6. Switch to the **Casting** stage to assign narration and dialogue voices.
7. If you want cloud synthesis, add your own Mistral API key under **PLATFORM > Engines** to unlock `Voxtral (Cloud)`.
8. In the **Studio** stage, queue a chapter or generate individual segments.
9. Use the **Review** stage to listen through and annotate sections.
10. Assemble the finished audiobook from the **Publish** stage once chapter audio is ready.

## The Left Rail

The persistent left rail is your main navigation:

| Group | Destinations |
|-------|-------------|
| **CREATE** | Library (your books), Voices |
| **MONITOR** | Activity (queue depth, history, stats) |
| **PLATFORM** | Engines, Integrations |
| **MANAGE** | Settings |

The rail collapses to icons. While you are inside a book, it also shows a contextual block with stage links and the chapter list.

## Exploring the Demo Library

On any fresh install where `projects/` and `voices/` are both empty, the launcher (`run.sh` / `run.ps1`) automatically restores demo content from `demo/demo.zip`. This happens regardless of how you installed Studio — via Pinokio, the launcher scripts, or a manual setup. The path to the zip is overridable via the `AUDIOBOOK_STUDIO_DEMO_ZIP` environment variable if you want to supply your own demo package.

**1. The Demo Project**  
After a fresh install, the Demo Project appears in the Library, giving you a working layout to explore immediately.

**2. Inside the Book Pipeline**  
Click into the demo project. The book opens to the **Manuscript** stage — click through the stage tabs (Manuscript, Casting, Studio, Review, Publish) to see the pipeline in action.

**3. Included Voice Profiles**  
Under **CREATE > Voices** you will find the bundled voices included with the demo project. These are pre-configured and can be used in any other project you create.

## Starter Voices

Audiobook Studio supports lightweight starter voice bundles.

A practical starter voice folder can contain:

- `profile.json`
- `latent.pth`
- optional `sample.mp3`

This allows a voice to remain usable for preview and generation without shipping every original source WAV in the repository.

## XTTS And Voxtral

- `XTTS (Local)` is still the default local-first workflow.
- `Voxtral (Cloud)` stays hidden unless you add your own Mistral API key under **PLATFORM > Engines**.
- Voices store their engine per profile, so one chapter can mix XTTS narration and Voxtral character voices when needed.

## Manual Install

If you need a manual path instead of the launcher script, follow the root `README.md`. The launcher scripts are now the preferred onboarding flow and should be considered the default setup path for new users.

---

[[Home]] | [[Concepts]] | [[Library and Projects]]
