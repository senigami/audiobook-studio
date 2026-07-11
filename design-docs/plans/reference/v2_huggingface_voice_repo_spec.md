# Spec: Audiobook Studio Voice Bundle — Hugging Face Repo Shape

> **Status: FINAL DRAFT for review, research-backed.** Defines the standardized shape a
> voice takes on the **Hugging Face Hub** (the voice host) so it (a) renders well on the HF
> page — icon, playable sample, description, full tag set — and (b) is read **natively** by
> Audiobook Studio after download. Tag values come from
> `design-docs/plans/v2_voice_tag_taxonomy.md`. Engines are hosted separately on GitHub — see
> `design-docs/plans/v2_engine_bundle_github_distribution.md`. Research sources at the bottom.
> For the implementation-level "how" of pushing this layout to the Hub (concrete
> `huggingface_hub` API calls, LFS/Xet gotchas, auth UX, and whether `upload_folder` can point
> straight at the local bundle dir), see
> `design-docs/plans/reference/v2_huggingface_upload_implementation.md`. The active plan closing
> the gap between this spec and the shipped code is
> `design-docs/plans/active/huggingface_voice_upload/`.

## 1. Goal

Anyone can publish a voice to Hugging Face in a fixed shape such that:

- A visitor sees **an image, a play button for a voice sample, a description, and tags**
  (male/female, age, gritty, English accent, monster, …) — an ElevenLabs-style card on HF.
- The same voice, downloaded into Audiobook Studio, is recognized **automatically** from a
  single canonical file, with no manual setup.
- The voice is **discoverable** by querying HF for the tag `audiobook-studio-voice`.

We ship a **template + generator** so voices assume this shape automatically.

## 2. Host & repo type decision

- **Host: Hugging Face Hub.** (Engines live on GitHub; voices live on HF.)
- **Repo type: model repo.** Chosen because the **`widget` field with `output: url:` makes
  the HF page show a playable sample with no live inference** — the cleanest way to "listen
  right there on the page." `pipeline_tag: text-to-speech` categorizes it; cards render
  `<img>` for the icon; tags are free-form for discovery. (All confirmed in HF docs — see
  Sources.) A dataset repo would also auto-play audio via the Dataset Viewer but misframes
  a voice as a dataset; we don't use it.

## 3. Delivery formats

Two shapes of the **same logical bundle**:

- **Loose files** — the canonical on-Hub layout (§4). Used when Studio's Voices tab
  **uploads directly to Hugging Face** (it pushes loose files via the user's token).
- **Zip** — produced by **Export** in the Voices tab (`<voice-id>.asvoice.zip`, a normal
  zip containing exactly the loose layout). Used for sharing, backup, and manual upload.

**Manual upload (documented in the handbook):** unzip the `.asvoice.zip`, create a new HF
**model** repo, and push the unzipped files at the repo root (so `README.md`, `voice.json`,
`icon.png`, and `samples/` sit at top level). The handbook page gives exact `git`/web-UI
steps and notes that the zip must be extracted first (HF doesn't unpack zips).

Studio **imports either**: a downloaded HF repo (loose) or a `.asvoice.zip` dropped into
the app (auto-extracted).

## 4. Canonical repo file layout (loose form)

```
<namespace>/<voice-name>/
├── README.md            # HF card: YAML frontmatter + human body. GENERATED from voice.json.
├── voice.json           # CANONICAL spec Studio reads natively. Source of truth.
├── icon.png             # 1:1 voice image (512x512 recommended, 256 min).
├── samples/
│   ├── preview.mp3       # Primary sample: HF widget player + Studio preview.
│   └── preview-*.mp3      # Optional extra samples (emotions/languages).
├── assets/              # Optional precomputed engine assets (§6).
│   └── <engine_id>/...
└── LICENSE              # Optional explicit license text.
```

`voice.json` is authoritative; `README.md` is **generated from it** so the HF page and the
machine spec can never drift.

## 5. `voice.json` — canonical, Studio-native spec (v1.0)

Attribute values are governed by `design-docs/plans/v2_voice_tag_taxonomy.md`.

```json
{
  "spec": "audiobook-studio-voice",
  "spec_version": "1.0",
  "taxonomy_version": "1.0",
  "id": "gravel-road",
  "name": "Gravel Road",
  "description": "A weathered, low Southern drawl. Reads like an old ranch hand telling a hard story.",
  "image": "icon.png",
  "samples": [
    { "path": "samples/preview.mp3", "text": "The sun went down slow over the dry creek.", "primary": true }
  ],
  "languages": ["en-US"],
  "attributes": {
    "class": "human",
    "gender": "masculine",
    "age": "senior",
    "accent": "us-southern",
    "tone": ["authoritative", "somber"],
    "timbre": ["deep", "gravelly"],
    "pace": "measured",
    "use_case": ["audiobook", "narration", "character-dialogue"],
    "quality": ["studio-quality"]
  },
  "tags": ["cowboy", "weathered", "rancher"],
  "engines": [
    { "engine_id": "xtts", "asset_type": "xtts_latents", "path": "assets/xtts/", "min_engine_version": "2.0.0" }
  ],
  "provenance": {
    "source": "recorded",
    "author": "namespace",
    "consent_ack": true,
    "created_at": "2026-05-29T00:00:00Z"
  },
  "license": "cc-by-4.0"
}
```

Rules:
- `id` is the voice/profile id and must match the bundle directory name on import.
- `languages[0]` is primary. `attributes` follows the taxonomy cardinality (Class, Gender,
  Age required; rest optional).
- `engines[]` is **optional**. With present assets → instant use; absent → Studio clones
  locally from `samples/` via `build_voice_asset(...)`.
- Unknown attribute values are preserved as free tags (forward-compat — see §9).

## 6. Engine assets (optional, for instant use)

Precomputed engine assets live under `assets/<engine_id>/`, declared in
`voice.json.engines[]`, and map to `VoiceAsset`s on import
(`design-docs/plans/v2_voice_system_interface.md`). Engine assets never carry descriptive metadata —
that stays in `voice.json`. Asset types must match what the engine declares it accepts
(`supported_voice_asset_types` in the engine manifest).

## 7. `README.md` — HF presentation + discovery (generated)

```yaml
---
license: cc-by-4.0
language:
  - en
pipeline_tag: text-to-speech
library_name: audiobook-studio
tags:
  - audiobook-studio-voice          # discovery anchor
  - audiobook-studio-spec-v1        # spec generation
  - text-to-speech
  - as-class-human
  - as-gender-masculine
  - as-age-senior
  - as-accent-us-southern
  - as-tone-authoritative
  - as-timbre-gravelly
  - as-use-audiobook
  - cowboy                          # free tags pass through
widget:
  - text: "The sun went down slow over the dry creek."
    example_title: "Gravel Road — preview"
    output:
      url: samples/preview.mp3       # << playable sample on the HF page
---

<img src="icon.png" alt="Gravel Road" width="256" height="256" />

**Gravel Road** — a weathered, low Southern drawl...

| Attribute | Value |
| --- | --- |
| Class | Human |
| Gender | Masculine |
| Age | Senior |
| Accent | American (Southern) |
| Tone | Authoritative, somber |
| Timbre | Deep, gravelly |
| Best for | Audiobook, narration, character dialogue |

_Follows the Audiobook Studio voice spec v1. Download and drop it into `tts_voices/`, or
import the `.asvoice.zip` from the Voices tab._
```

Confirmed HF mechanics: `widget … output.url` → playable sample; `<img>` HTML supported;
free-form custom tags allowed and become filter facets.

## 8. Native read on import

1. User imports a HF repo (loose) or `.asvoice.zip` (auto-extracted) into `tts_voices/<id>/`
   (per the namespace rename in `design-docs/plans/master_agnostic_tasks.md`).
2. Studio's voice scanner finds `voice.json` and validates `spec`/`spec_version`/schema.
3. Creates/updates a `VoiceProfile` from name, description, image, attributes, tags,
   languages, provenance, license.
4. For each `engines[]` with present assets → registers a `VoiceAsset`; otherwise marks
   "needs build" and offers one-click local clone from `samples/`.
5. Voice appears in Voice Lab with the same icon, sample, description, and tags as the HF
   page. No manual configuration.

## 9. Spec governance & versioning (the "how do we not break things" rule)

- **One published JSON Schema** (`voice.schema.json`) defines `voice.json`. It lives in the
  Studio repo at a stable path and is published so anyone can validate before uploading.
- **`spec_version`** is semver-ish `MAJOR.MINOR`:
  - Adding **optional** fields → **minor** bump. Old Studio reads new bundles fine
    (ignores unknown optional fields); new Studio reads old bundles fine (defaults).
  - Renaming/removing/retyping a **required** field → **major** bump. Studio refuses a
    higher major than it knows, with a friendly "update Audiobook Studio to use this voice"
    message instead of a crash.
- **`taxonomy_version`** tracks the tag vocabulary independently (see taxonomy spec §5);
  unknown attribute values are demoted to free tags rather than dropped.
- The generator always stamps the current `spec_version` and `taxonomy_version`.

This keeps every published voice readable far into the future and lets us extend safely
before and after release.

## 10. Template & generator

- Ship `voice.schema.json` + a template skeleton.
- The Voices tab **Export** and **Upload to Hugging Face** actions both run the generator:
  given a Studio voice, it writes `voice.json`, `icon.png` (auto-cropped 1:1),
  `samples/preview.mp3`, and a `README.md` rendered from `voice.json`. Export zips it;
  Upload pushes loose files via the user's HF token.
- **Validation** before export/upload: required attributes present and within the taxonomy,
  `id` matches folder, image is 1:1, ≥1 sample, widget `output.url` resolves, schema
  passes.

## 11. Future: browse / search from the Voices tab

ComfyUI-Manager / Civitai-style, but on HF:
- **Browse/search**: query the anchor tag —
  `HfApi().list_models(filter="audiobook-studio-voice")` or
  `GET https://huggingface.co/api/models?filter=audiobook-studio-voice` — then refine by
  `as-*` tags or free text. Show result cards (icon, playable sample, tags).
- **Install**: download + extract into `tts_voices/`, auto-register (§8).
- **Upload**: generator → push loose files with the user's token; tags set automatically.
- **Token/consent/license/privacy** per `design-docs/plans/v2_huggingface_voice_interface.md` §7.

## 12. Sources

- Model card metadata — https://huggingface.co/docs/hub/en/model-cards
- Model card metadata spec (raw) — https://github.com/huggingface/hub-docs/blob/main/modelcard.md
- Widgets & audio output (`widget … output.url`) — https://huggingface.co/docs/hub/models-widgets
- Widget examples — https://huggingface.co/docs/hub/models-widgets-examples
- Searching the Hub by tag/filter — https://huggingface.co/docs/huggingface_hub/guides/search
- Audio datasets / viewer (alternative) — https://huggingface.co/docs/hub/datasets-audio
