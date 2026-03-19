![Listen to the Audiobook Studio overview](assets/Promo.png)

## Hear It In Action

Listen to the overview demo, explore the interface, and get a better feel for how Audiobook Studio sounds in practice.

[Open the Live Showcase](https://senigami.github.io/audiobook-studio/)

# Audiobook Studio

### Local AI audiobook production with voice cloning, chapter repair, and long-form workflow control

[![Build Status](https://github.com/senigami/audiobook-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/senigami/audiobook-studio/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org/)

**Audiobook Studio** is a local-first production app for turning manuscripts into polished audiobooks with AI voices you control.

It is built for real long-form work, not just one-click text-to-speech. You can assign voices to characters, repair individual segments, requeue partial chapters, build portable voice profiles, and assemble finished books without sending your manuscript or cloned voices to a paid cloud service.

## Why People Use It

- **Produce full audiobooks locally** with XTTS-based voice cloning and chapter assembly.
- **Fix only what changed** instead of regenerating an entire book every time one sentence sounds wrong.
- **Assign different voices to dialogue and narration** inside the same chapter.
- **Keep your data private** because manuscripts, voice samples, and outputs stay on your machine.
- **Avoid recurring usage costs** while still getting a workflow closer to professional narration tools.

## What Makes It Different

Most TTS tools stop at "paste text and generate audio."

Audiobook Studio is built around the messy reality of audiobook production:

- pronunciations need hand-tuning
- dialogue needs different voices
- chapters need partial rebuilds
- queueing and progress need to stay understandable
- finished books need real assembly and export

This project gives you a production surface for that work, not just a synthesis endpoint.

## Core Features

| Feature | What it enables |
| --- | --- |
| **Multi-voice production** | Assign speaker voices to characters, narration, or paragraph groups. |
| **Segment-level repair** | Regenerate only the lines that changed instead of redoing a whole chapter. |
| **Portable voice profiles** | Keep previews, latent cache, and voice profile assets together. |
| **Voice variants** | Build multiple styles of the same voice, such as `Default`, `Angry`, or `Calm`. |
| **Production queue** | Queue chapters, watch progress live, and recover cleanly from interruptions. |
| **Audiobook assembly** | Export finished chapter audio into long-form outputs with ffmpeg-based tooling. |
| **Local-first privacy** | No manuscript or cloned voice needs to leave your computer. |

## What The Workflow Looks Like

1. Import or create a project.
2. Split the manuscript into chapters.
3. Build or import voice profiles.
4. Assign voices to narration and characters.
5. Generate chapters, inspect the performance view, and repair only the lines that need work.
6. Assemble the finished project into audiobook outputs.

## Screenshots

| Project Workflow | Voice Lab |
| --- | --- |
| ![Project view](wiki/images/project-view.jpg) | ![Voice lab](wiki/images/voice-lab-list.jpg) |

| Chapter Production | Queue and Progress |
| --- | --- |
| ![Chapter editor](wiki/images/chapter-editor.jpg) | ![Queue sidebar](wiki/images/queue-sidebar.jpg) |

## Quick Start

### Requirements

- macOS, Linux, or Windows
- Python `3.11+`
- Node.js `18+`
- `ffmpeg`
- NVIDIA GPU recommended for faster local synthesis

### Install

```bash
git clone https://github.com/senigami/audiobook-studio.git
cd audiobook-studio

python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

python3.11 -m venv ~/xtts-env
source ~/xtts-env/bin/activate
pip install -r requirements-xtts.txt
```

### Run

```bash
source venv/bin/activate
uvicorn run:app --port 8123
```

Then open [http://127.0.0.1:8123](http://127.0.0.1:8123).

## Voice Profiles

Audiobook Studio supports local voice cloning and reusable voice variants.

- Add raw `.wav` samples to a voice profile
- Build a preview voice
- Create variants for different delivery styles
- Rebuild only when samples change
- Keep the voice profile and latent cache together for portability

The app now treats voice profiles as production assets, not throwaway cache entries.

## Long-Form Editing and Repair

This is where the app really shines.

- Edit chapter text and invalidate only the audio that should change
- Watch progress in the chapter view instead of getting thrown into a separate queue screen
- Resume partially-rendered work instead of starting from zero
- Rebuild completed chapters intentionally with confirmation
- Review paragraph groupings, playback, and character assignments inside the production workflow

## Privacy

Audiobook Studio is designed for **local-first production**.

Your manuscript, chapter text, voice samples, latent files, and rendered audio stay under your control on your own machine.

## Documentation

If you want the deeper walkthroughs, they are here:

- [Getting Started](https://github.com/senigami/audiobook-studio/wiki/Getting-Started)
- [Library and Projects](https://github.com/senigami/audiobook-studio/wiki/Library-and-Projects)
- [Voices and Voice Profiles](https://github.com/senigami/audiobook-studio/wiki/Voices-and-Voice-Profiles)
- [Queue and Jobs](https://github.com/senigami/audiobook-studio/wiki/Queue-and-Jobs)
- [Recording Guide](https://github.com/senigami/audiobook-studio/wiki/Recording-Guide)
- [Troubleshooting and FAQ](https://github.com/senigami/audiobook-studio/wiki/Troubleshooting-and-FAQ)
- [Full Wiki](https://github.com/senigami/audiobook-studio/wiki)

## Showcase

If you want a quick visual walkthrough before installing:

- [Live Showcase](https://senigami.github.io/audiobook-studio/)

## Development

```bash
./venv/bin/python -m pytest -q
npm -C frontend run lint -- --ext .tsx,.ts
npm -C frontend run build
```

## License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

---

<p align="center">
  <strong>Build audiobooks locally. Repair them like a studio. Keep your voices and manuscript under your control.</strong>
</p>
