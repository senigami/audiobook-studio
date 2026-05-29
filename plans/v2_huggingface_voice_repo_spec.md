# Spec: Audiobook Studio Voice Bundle — Hugging Face Repo Shape

> **Status: DRAFT for review, research-backed.** Defines the standardized shape a voice
> takes on the Hugging Face Hub so it (a) renders well on the HF page — icon, playable
> sample, description, ElevenLabs-style tags — and (b) is read **natively** by Audiobook
> Studio after download. Supersedes the sourcing sketch in
> `plans/v2_huggingface_voice_interface.md` §4 with a concrete file/metadata contract.
> Research sources are listed at the bottom; assumptions are flagged _Assumption_.

## 1. Goal

Anyone should be able to publish a voice to Hugging Face in a fixed shape such that:

- A visitor to the repo page sees **a representative image, a play button for a voice
  sample, a description, and tags** (male/female, age, gritty, English accent, …) — the
  ElevenLabs experience, on HF.
- The same repo, downloaded and dropped into Audiobook Studio, is recognized
  **automatically**: Studio reads one canonical spec file and registers the voice with no
  manual setup.
- The voice is **discoverable** by querying HF for a known tag (e.g.
  `audiobook-studio-voice`).

We ship a **template + generator** so voices "assume this shape automatically."

## 2. Why a model repo (not a dataset repo)

HF has three repo types (model / dataset / space). We standardize on a **model repo**
because:

- The **`widget` metadata field supports an `output: url:` pointing at an audio file in
  the repo, which makes the HF page show a playable sample with no live inference.** This
  is the cleanest way to get "listen right there on the page." (Confirmed in HF widget
  docs — see Sources.)
- `pipeline_tag: text-to-speech` slots voices into the right HF category and widget type.
- Model repos render `README.md` as a card and support raw `<img>` HTML for the icon.
- A dataset repo would auto-play audio via the Dataset Viewer, but it frames a voice as a
  "dataset," misuses the type, and complicates native reading. _Assumption: model repo is
  the right call; revisit if HF changes widget behavior._

## 3. Repo file layout

```
<namespace>/<voice-name>/
├── README.md            # HF card: YAML frontmatter (below) + human body. GENERATED.
├── voice.json           # CANONICAL spec Studio reads natively. Source of truth.
├── icon.png             # 1:1 voice image (recommend 512x512). Referenced by both.
├── samples/
│   ├── preview.wav       # Primary sample used by the HF widget + Studio preview.
│   └── preview-*.wav      # Optional extra samples (emotions, languages).
├── assets/              # Optional engine-specific voice assets (see §6).
│   └── <engine_id>/...
└── LICENSE              # Optional explicit license text.
```

`voice.json` is authoritative. `README.md` is **generated from `voice.json`** so the HF
presentation and the machine spec can never drift.

## 4. `voice.json` — the canonical, Studio-native spec

Mirrors `plans/v2_voice_metadata_and_casting.md` (same attribute vocabulary), plus the
bundle/provenance fields. Proposed v1:

```json
{
  "spec": "audiobook-studio-voice",
  "spec_version": "1.0",
  "id": "gravel-road",
  "name": "Gravel Road",
  "description": "A weathered, low Southern drawl. Reads like an old ranch hand telling a hard story.",
  "image": "icon.png",
  "samples": [
    { "path": "samples/preview.wav", "text": "The sun went down slow over the dry creek.", "primary": true }
  ],
  "languages": { "primary": "en-US", "supported": ["en-US"] },
  "attributes": {
    "gender": "masculine",
    "age_band": "mature",
    "accent": "southern_us",
    "timbre": ["deep", "gravelly"],
    "tone": ["authoritative", "somber"],
    "pace": "measured",
    "use_case": ["narration", "character", "audiobook"]
  },
  "tags": ["weathered", "cowboy", "narrator"],
  "engines": [
    {
      "engine_id": "xtts",
      "asset_type": "xtts_latents",
      "path": "assets/xtts/",
      "min_engine_version": "2.0.0"
    }
  ],
  "provenance": {
    "source": "recorded",
    "author": "namespace",
    "consent_ack": true,
    "created_at": "2026-05-29T00:00:00Z"
  },
  "license": "cc-by-4.0",
  "attributes_schema_version": "1.0"
}
```

Notes:
- `attributes` uses the controlled vocabularies defined in the metadata/casting proposal,
  so AI casting works on bundles too.
- `engines[]` is **optional**. A bundle may ship only samples (Studio clones locally on
  import) or precomputed engine assets under `assets/<engine_id>/` for instant use.
- `id` is the folder/profile id; must match the bundle directory name on import.

## 5. `README.md` frontmatter — HF presentation + discovery

Generated from `voice.json`. Maps our rich model onto HF's flat tag system and widget:

```yaml
---
license: cc-by-4.0
language:
  - en
pipeline_tag: text-to-speech
library_name: audiobook-studio
tags:
  - audiobook-studio-voice          # discovery anchor (see §7)
  - audiobook-studio-spec-v1        # spec version for forward-compat queries
  - voice
  - gender:masculine                # flattened attributes for HF filtering
  - age:mature
  - accent:southern_us
  - timbre:gravelly
  - use-case:narration
widget:
  - text: "The sun went down slow over the dry creek."
    example_title: "Gravel Road — preview"
    output:
      url: samples/preview.wav       # << playable sample on the HF page
---

<img src="icon.png" alt="Gravel Road" width="256" height="256" />

**Gravel Road** — a weathered, low Southern drawl...

| Attribute | Value |
| --- | --- |
| Gender | Masculine |
| Age | Mature |
| Accent | Southern US |
| Timbre | Deep, gravelly |
| Use case | Narration, character, audiobook |

_This voice follows the Audiobook Studio voice spec v1. Download and drop it into
`tts_voices/` to use it._
```

Key mechanics (all confirmed against HF docs):
- **`widget … output.url`** → playable audio sample on the page without inference.
- **`<img>`** raw HTML is supported in cards → renders the icon.
- **`tags`** are free-form strings; arbitrary custom tags (incl. `gender:masculine`) are
  allowed and become filter facets.

## 6. Engine assets (optional, for instant use)

If a publisher precomputes engine-specific assets, they live under
`assets/<engine_id>/` and are declared in `voice.json.engines[]`. On import Studio maps
each to a `VoiceAsset` (per `plans/v2_voice_system_interface.md`). If absent, Studio
imports `samples/` and builds an asset locally via `build_voice_asset(...)`. Engine assets
must never carry metadata that belongs on the profile — attributes stay in `voice.json`.

## 7. Discovery tag convention

To make "search HF for our voices" work:

- Every bundle carries the tag **`audiobook-studio-voice`** (the anchor) plus
  **`audiobook-studio-spec-v1`** (spec generation).
- Search via the Hub API: `HfApi().list_models(filter="audiobook-studio-voice")` or the
  HTTP equivalent `GET https://huggingface.co/api/models?filter=audiobook-studio-voice`.
- Secondary filtering by flattened attribute tags (`accent:southern_us`, etc.) or by
  free-text search. _Assumption: flattened `key:value` tags are acceptable; if HF ever
  restricts tag characters we fall back to plain tags + `voice.json` filtering._

## 8. How Studio reads a bundle natively

1. User downloads/extracts a bundle into the voices namespace (`tts_voices/<id>/`, per the
   deferred namespace rename in `plans/master_agnostic_tasks.md`).
2. Studio's voice scanner finds `voice.json`, validates `spec`/`spec_version`.
3. Creates/updates a `VoiceProfile` from `name`, `description`, `image`, `attributes`,
   `tags`, `languages`, `provenance`, `license`.
4. For each `engines[]` entry with present assets, registers a `VoiceAsset`; otherwise
   marks the voice "needs build" and offers a one-click local clone from `samples/`.
5. The voice appears in Voice Lab with its icon, sample, description, and tags — same data
   the HF page showed.

No manual configuration: the bundle *is* the spec Studio operates off of.

## 9. Template & generator (so voices auto-assume the shape)

- Ship a **`voice.json` JSON Schema** and a template repo skeleton.
- Provide a generator (CLI / Voice Lab export) that, given a voice in Studio, writes the
  full bundle — `voice.json`, `icon.png`, `samples/preview.wav`, and a `README.md`
  rendered from `voice.json` — ready to push to HF.
- Validation: required fields present, `id` matches folder, image is 1:1, at least one
  sample, attribute values in the controlled vocabulary, widget `output.url` resolves.

## 10. Future: browse / upload from the Voices tab

Parallels Stable Diffusion model managers (ComfyUI Manager / Civitai browsers):

- **Browse**: query `audiobook-studio-voice`, show result cards (icon, sample, tags),
  pick one, download + extract into `tts_voices/`, auto-register (§8).
- **Upload**: from the Voices tab, run the generator (§9) and push to the user's HF repo
  with their token; set the discovery tags automatically.
- **Token/consent/license/privacy** handling per `plans/v2_huggingface_voice_interface.md`
  §7 (optional token, license surfaced, cloning consent recorded, off-machine calls
  disclosed).

## 11. Parallel: engine/plugin bundle distribution

The same browse-by-tag-and-install pattern applies to TTS engine plugins, which are being
renamed `plugins/` → **`tts_engines/`** (with `tts_voices/` for voices and a reserved
`plugins/` for app-behavior extensions — `plans/master_agnostic_tasks.md`, "Deferred
Phase: Namespace Rename"). Engine bundles are meant to become **self-contained,
extractable repos**. Proposed discovery tag: **`audiobook-studio-tts`** (engine) so a
browser can list/pull/install engines the way ComfyUI Manager installs custom nodes and
Civitai serves models. Engine install still goes through the strict plugin SDK validation
(`tts_<name>` folder + `manifest.json`) in `plans/v2_plugin_sdk.md` before any code loads.
_Assumption: host engines on HF too; the user mentioned GitLab — confirm the host (HF Hub
vs GitLab vs both) since it changes the search API._

## 12. Open questions (need Steven's answers)

1. **Engine host:** HF Hub, GitLab, or both for engine bundles? (Voices are clearly HF.)
2. **Bundle delivery:** loose files in the repo (this spec) vs. a single zipped artifact?
   Loose files render better on HF; a zip is tidier to download. (Recommend loose files.)
3. **Discovery tags:** confirm `audiobook-studio-voice` / `audiobook-studio-tts` as the
   anchors, and the `key:value` attribute-tag convention.
4. **Precomputed assets:** do we encourage shipping engine assets (instant use, larger
   repos) or samples-only (smaller, clone-on-import)?
5. **Spec governance:** where does the JSON Schema live and how is `spec_version` bumped?

## Sources

- Model card metadata fields — https://huggingface.co/docs/hub/en/model-cards
- Model card metadata spec (raw) — https://github.com/huggingface/hub-docs/blob/main/modelcard.md
- Widgets & audio output (`widget … output.url`) — https://huggingface.co/docs/hub/models-widgets
- Widget examples — https://huggingface.co/docs/hub/models-widgets-examples
- Searching the Hub by tag/filter — https://huggingface.co/docs/huggingface_hub/guides/search
- Audio datasets / viewer playback (alternative) — https://huggingface.co/docs/hub/datasets-audio
- ElevenLabs voice library labels (taxonomy reference) — https://elevenlabs.io/docs/creative-platform/voices/voice-library
- ComfyUI Manager / Civitai distribution analogy — https://github.com/hayden-fr/ComfyUI-Model-Manager , https://civitai.com/models/71980/comfyui-manager
