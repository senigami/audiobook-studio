# Audiobook Studio Wiki

Welcome to the Audiobook Studio documentation.

This wiki is meant to help both new users and contributors understand how the app works, how to get started, and what has changed across release lines.

## Recommended Starting Point

Choose the setup path that matches your comfort level:

### Easiest install for most people

**[Use Audiobook Studio on Pinokio](https://beta.pinokio.co/apps/github-com-senigami-audiobook-studio-pinokio)**  
Pinokio handles setup and launch for you, and can optionally install demo content for a faster first look.

### Want to preview before installing?

**[Open the Live Demo / Showcase](https://senigami.github.io/audiobook-studio/)**  
Hear samples, review features, and see how the workflow works before installing anything.

### Want the full repo and scripts?

**[Use the Main GitHub Project](https://github.com/senigami/audiobook-studio)**  
Best for developers and advanced users who want direct control over setup and files.

If you are new to GitHub or terminal setup, start with **Pinokio**.

![Visual Flow](images/demoproject.png)

## Release Information

For brand-new users, the current `1.8.x` release line is the best place to begin. That release family is the first one intended to feel smooth across local XTTS production and optional Voxtral support:

- first-run setup
- launcher scripts
- voice portability
- engine-per-voice assignment
- chapter generation
- rebuild and queue UX
- audiobook download flow

## Quick Links

- **[Pinokio Install](https://beta.pinokio.co/apps/github-com-senigami-audiobook-studio-pinokio)** - Easiest install path
- **[Live Demo / Showcase](https://senigami.github.io/audiobook-studio/)** - Hear examples and preview the app
- **[Getting Started](https://github.com/senigami/audiobook-studio/wiki/Getting-Started)** - Recommended setup and first run
- **[Concepts](https://github.com/senigami/audiobook-studio/wiki/Concepts)** - Core architecture and terminology
- **[Library and Projects](https://github.com/senigami/audiobook-studio/wiki/Library-and-Projects)** - Managing books and assemblies
- **[Voices and Voice Profiles](https://github.com/senigami/audiobook-studio/wiki/Voices-and-Voice-Profiles)** - AI Voice Lab guide
- **[Queue and Jobs](https://github.com/senigami/audiobook-studio/wiki/Queue-and-Jobs)** - Monitoring generation and repair work
- **[Comparison and Cost](https://github.com/senigami/audiobook-studio/wiki/Comparison-and-Cost)** - Hosted vs local tradeoffs
- **[Recording Guide](https://github.com/senigami/audiobook-studio/wiki/Recording-Guide)** - Best practices for clean voice samples
- **[Troubleshooting and FAQ](https://github.com/senigami/audiobook-studio/wiki/Troubleshooting-and-FAQ)** - Help when something acts possessed

## 5-Minute Quick Start

1. Run `./run.sh` on macOS/Linux or `run.ps1` on Windows.
2. Open `http://127.0.0.1:8123`.
3. Create a project from the Library.
4. Add a chapter and paste or import text.
5. Build or import a voice profile.
6. Assign narration and character voices.
7. Generate chapter audio and assemble the audiobook.

## Suggested First Demo

If you want a simple onboarding project, create a short 2-3 chapter sample and assign:

- one narrator voice
- one younger dialogue voice
- one older or contrasting dialogue voice

That gives you the clearest first impression of:

- chapter editing
- segment repair
- multi-voice assignment
- final audiobook export

## Local Preview

To preview these docs locally before pushing to GitHub:

1. Open this folder in VS Code.
2. Open `Home.md`.
3. Press `Cmd+Shift+V` on Mac or `Ctrl+Shift+V` on Windows to open Markdown Preview.

---

[[Concepts]] | [[Getting Started]] | [[Voices and Voice Profiles]]
