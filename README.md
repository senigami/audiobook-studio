![Listen to the Audiobook Studio overview](assets/Promo.png)

## Hear It In Action

Listen to the overview demo, explore the interface, and get a better feel for how Audiobook Studio sounds in practice.

[Open the Live Showcase](https://senigami.github.io/audiobook-studio/)

The live showcase also includes the fuller feature and cost comparison with ElevenLabs.

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

## Audiobook Studio vs. ElevenLabs

ElevenLabs is a strong product. It has polished voices, a fast cloud workflow, and useful Studio tools for multi-voice generation and paragraph-level regeneration.

Audiobook Studio is strongest in different places:

- **No recurring generation subscription**
- **Private, local-first workflow**
- **You own the manuscript, voices, and output**
- **Corrections do not keep charging you**

If you are building a real audiobook instead of a few test clips, those differences matter a lot.

| Category | Audiobook Studio | ElevenLabs Studio |
| --- | --- | --- |
| Cost over time | Free to run after setup, local hardware cost only | Subscription and credit based |
| Privacy | Local-first, files stay on your machine | Cloud workflow |
| Ownership | Local project files and local voice assets | Platform account workflow |
| Voice assignment | Character and segment based editing inside your project | Section, paragraph, and character assignment in Studio |
| Repair workflow | Local segment repair, partial chapter requeue, and production review | Paragraph or word regeneration in the cloud |
| Setup | More involved | Easier to start |
| Baseline polish | Good with careful samples and tuning | Usually stronger out of the box |

## Cost Comparison

Hosted voice generation can get expensive fast for full-length books, especially when you factor in corrections and custom voices.

Using ElevenLabs public pricing and credit rules as of **March 24, 2026**:

- **Starter**: `$5/month` for `30k` credits
- **Creator**: `$22/month` for `100k` credits
- **Pro**: `$99/month` for `500k` credits
- **Scale**: `$330/month` for `2M` credits
- **Flash/Turbo models**: `1 text character = 0.5 credits`
- **Other models**: `1 text character = 1 credit`

For a fair comparison, this table uses a **600,000 character book** as a full-length example.

| Production type | Minimum realistic plan | Credit rule | Effective cost per 1,000 chars | Clean 600k-char pass | 600k chars with moderate corrections (1.5x) |
| --- | --- | --- | ---: | ---: | ---: |
| Standard single voice | Starter | `0.5 credits/char` | about `$0.08` | about `$50` in effective usage | about `$75` in effective usage |
| Custom cloned voice | Creator | `0.5 credits/char` | about `$0.11` | about `$66` in effective usage | about `$99` in effective usage |
| Higher-cost models | Creator | `1 credit/char` | about `$0.22` | about `$132` in effective usage | about `$198` in effective usage |

And this is what the **real-world monthly spend** often looks like when you actually need enough credits to finish the book in a normal production cycle:

| Scenario | Credits needed | Likely plan needed in practice | Monthly spend |
| --- | ---: | --- | ---: |
| 600k chars, Flash/Turbo clean pass | `300k` | Pro | `$99` |
| 600k chars, Flash/Turbo with moderate corrections | `450k` | Pro | `$99` |
| 600k chars, Flash/Turbo with heavy iteration | `600k` | Scale or multiple months | `$330` or multiple months |
| 600k chars, higher-cost model clean pass | `600k` | Scale or multiple months | `$330` or multiple months |
| 600k chars, higher-cost model with corrections | `900k` | Scale | `$330` |

That is where Audiobook Studio becomes especially compelling:

- you do not hesitate to fix a pronunciation
- you do not pay extra to test another take
- you can iterate freely without watching credits

If you want the longer written breakdown, see the wiki page: [Comparison and Cost](https://github.com/senigami/audiobook-studio/wiki/Comparison-and-Cost). If you want the more visual version, open the [Live Showcase](https://senigami.github.io/audiobook-studio/).

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

1. **Clone and Backend Setup**  
   Create the primary environment for the web server and project management.
   ```bash
   git clone https://github.com/senigami/audiobook-studio.git
   cd audiobook-studio

   python3.11 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. **XTTS Inference Setup**  
   XTTS requires a separate environment to avoid dependency conflicts. The app expects this at `~/xtts-env` by default (configurable in `app/config.py`).
   ```bash
   python3.11 -m venv ~/xtts-env
   source ~/xtts-env/bin/activate
   pip install -r requirements-xtts.txt
   ```

3. **Frontend Build**  
   The UI must be built before it can be served by the backend.
   ```bash
   cd frontend
   npm install
   npm run build
   cd ..
   ```

### Run

You only need to activate the primary `venv` to start the server. The XTTS environment is managed automatically as a subprocess.

```bash
source venv/bin/activate
uvicorn run:app --port 8123
```

Then open [http://127.0.0.1:8123](http://127.0.0.1:8123).

> [!NOTE]
> On first run, the application will automatically create required data directories (like `xtts_audio/`, `projects/`, etc.) in the root folder.

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
- [Comparison and Cost](https://github.com/senigami/audiobook-studio/wiki/Comparison-and-Cost)
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
