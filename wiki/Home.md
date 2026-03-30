# Audiobook Studio Wiki

Welcome to the Audiobook Studio documentation.

This wiki is meant to help both new users and contributors understand how the app works, how to get started, and what has changed across release lines.

## Recommended Starting Point

For brand-new users, the current `1.8.x` release line is the best place to begin. That release family is the first one intended to feel smooth across local XTTS production and optional Voxtral support:

- first-run setup
- launcher scripts
- voice portability
- engine-per-voice assignment
- chapter generation
- rebuild and queue UX
- audiobook download flow

## Quick Links

- [[Getting Started]] - Recommended setup and first run
- [[Changelog]] - Release history and major changes
- [[Concepts]] - Core architecture and terminology
- [[Library and Projects]] - Managing books and assemblies
- [[Voices and Voice Profiles]] - AI Voice Lab guide
- [[Queue and Jobs]] - Monitoring generation and repair work
- [[Comparison and Cost]] - Honest comparison with hosted TTS pricing
- [[Recording Guide]] - Best practices for clean voice samples
- [[Troubleshooting and FAQ]] - Solutions to common issues

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
