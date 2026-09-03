# Audiobook Studio Wiki

Welcome to the Audiobook Studio documentation.

This wiki is meant to help both new users and contributors understand how the app works, how to get started, and what has changed across release lines.

## Recommended Starting Point

Choose the setup path that matches your comfort level:

### Easiest install for most people

**[Use Audiobook Studio on Pinokio](https://beta.pinokio.co/apps/github-com-senigami-audiobook-studio-pinokio)**  
Pinokio handles setup and launch for you, and can optionally install demo content for a faster first look.

### Want to preview before installing?

**[Try the Interactive Demo](https://senigami.github.io/audiobook-studio/demo/)**  
The real production UI (queue, progress bars, status transitions) running live in your browser against a scripted render session. No backend, no install required. See [[Live-Demos]] for stage deep-links and technical notes.

**[Open the Showcase Page](https://senigami.github.io/audiobook-studio/)**  
Hear audio samples, review features, and see how the workflow works before installing anything.

### Want the full repo and scripts?

**[Use the Main GitHub Project](https://github.com/senigami/audiobook-studio)**  
Best for developers and advanced users who want direct control over setup and files.

If you are new to GitHub or terminal setup, start with **Pinokio**.

![Visual Flow](images/demoproject.png)

## Release Information

The current Studio 2.0 release line is the best place to begin. It carries forward the stable local XTTS workflow, adds the plugin-based engine system, and ships the Studio 2.0 UI redesign:

- left-rail grouped navigation (CREATE / MONITOR / PLATFORM / MANAGE)
- five-stage book pipeline (Manuscript, Casting, Studio, Review, Publish)
- global bottom player bar
- Activity page for queue monitoring
- Voice Lab page (`/voices/:id`) for per-voice editing
- Engines and Integrations as dedicated pages
- plugin-based engine management
- engine-per-voice assignment
- voice portability and bundles
- audiobook download flow

## Quick Links

- **[Pinokio Install](https://beta.pinokio.co/apps/github-com-senigami-audiobook-studio-pinokio)** - Easiest install path
- **[Interactive Demo](https://senigami.github.io/audiobook-studio/demo/)** - Live UI components running against a scripted session (no install)
- **[Live Demo / Showcase](https://senigami.github.io/audiobook-studio/)** - Hear audio samples and review features
- **[Live Demos](https://github.com/senigami/audiobook-studio/wiki/Live-Demos)** - Stage deep-links and demo technical notes
- **[Getting Started](https://github.com/senigami/audiobook-studio/wiki/Getting-Started)** - Recommended setup and first run
- **[Concepts](https://github.com/senigami/audiobook-studio/wiki/Concepts)** - Core architecture and terminology
- **[Library and Projects](https://github.com/senigami/audiobook-studio/wiki/Library-and-Projects)** - Managing books and the book pipeline
- **[Voices and Voice Profiles](https://github.com/senigami/audiobook-studio/wiki/Voices-and-Voice-Profiles)** - AI Voice Lab guide
- **[Queue and Jobs](https://github.com/senigami/audiobook-studio/wiki/Queue-and-Jobs)** - Monitoring generation and repair work
- **[Comparison and Cost](https://github.com/senigami/audiobook-studio/wiki/Comparison-and-Cost)** - Hosted vs local tradeoffs
- **[Recording Guide](https://github.com/senigami/audiobook-studio/wiki/Recording-Guide)** - Best practices for clean voice samples
- **[Troubleshooting and FAQ](https://github.com/senigami/audiobook-studio/wiki/Troubleshooting-and-FAQ)** - Help when something acts possessed

## 5-Minute Quick Start

1. Run `./run.sh` on macOS/Linux or `run.ps1` on Windows.
2. Open `http://127.0.0.1:8123`.
3. Create a project from the Library (CREATE > Library in the left rail).
4. Open the book and add a chapter in the Manuscript stage.
5. Build or import a voice profile (CREATE > Voices).
6. Assign narration and character voices in the Casting stage.
7. Generate chapter audio in the Studio stage.
8. Listen and annotate in the Review stage.
9. Assemble the audiobook in the Publish stage.

## Suggested First Demo

If you want a simple onboarding project, create a short 2-3 chapter sample and assign:

- one narrator voice
- one younger dialogue voice
- one older or contrasting dialogue voice

That gives you the clearest first impression of:

- chapter editing in the Manuscript stage
- casting voices in the Casting stage
- segment repair in the Studio stage
- follow-along playback in the Review stage
- final audiobook export from the Publish stage

## Local Preview

To preview these docs locally before pushing to GitHub:

1. Open this folder in VS Code.
2. Open `Home.md`.
3. Press `Cmd+Shift+V` on Mac or `Ctrl+Shift+V` on Windows to open Markdown Preview.

---

[[Concepts]] | [[Getting Started]] | [[Voices and Voice Profiles]]
