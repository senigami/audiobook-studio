# Voices and Voice Profiles

The **Voice Library** is where you manage your narrator library. Reach it from the left rail under **CREATE > Voices**. It uses a unified **Voice** and **Variant** model to keep your workspace organized and efficient.

## Core Concepts

- **Voice**: A high-level narrator identity (e.g., "Narrator", "Dracula").
- **Variants**: Stylistic or emotional variations of that same voice (e.g., "Normal", "Angry", "Whisper").
- **Samples**: The reference audio files used to "clone" the voice.
- **Engine**: Each profile stores its own synthesis engine, usually `XTTS (Local)` or `Voxtral (Cloud)`.

Each **Voice** always has at least one variant (usually the "Default" variant). You can add as many variants as you need to capture different performances.

## Voices Catalog

The Voices page (`/voices`) shows all your voices as cards in a catalog grid. Each card displays:

- The voice name and cover image.
- Engine and attribute pills (class, gender, age, etc.) with category-tinted colors.
- A star badge for the default narrator voice.
- A "Not tagged" warning badge for voices missing required attributes.

Use the filter chips and toolbar to search, filter by attribute, or sort by name or creation date.

## Voice Lab

Clicking a voice card (or navigating to `/voices/:id`) opens the **Voice Lab** — a full-page editor for that voice. Here you can:

- Edit the voice name and icon.
- Manage variants via the stepper.
- Add, remove, or reorder audio samples.
- Build or rebuild the XTTS speaker profile (latent).
- Generate and audition voice previews.
- Configure per-voice engine settings.
- Export a portable voice bundle.

### Creating and Managing Voices

1. **New Voice**: Click **+ New Voice** from the Voices catalog. Give it a name like "Victor the Vampire".
2. **Add Samples**: Drop 3–5 high-quality `.wav` files into the **Samples** section of the Voice Lab.
   - _Note_: For new variants with no samples, this section is shown prominently so you can get to work immediately.
3. **Build / Generate**: XTTS profiles use the familiar build flow. Voxtral profiles use reference audio or a saved `voice_id` and generate previews without creating a local `latent.pth`.
4. **Add Variants**: Use the **+ Variant** button inside the Voice Lab to create a new stylistic companion for that voice.

### Voice Lab Navigation


- **Stepper**: Steps through the variant list.
- **Samples List**: The audio files used for cloning, with drag-to-reorder and hover-to-delete.
- **Variants Row**: Shows all variants for the voice; select one to edit it.
- **Test Strip**: Generate a preview clip for the selected variant.
- **Export Row**: Export the voice as a portable bundle.

## Narrator Default in Casting

The narrator default — the fallback voice for any unassigned line — is set per-book in the **Casting** stage (the pinned first row). There is no global "default narrator" in the Voice Library itself; the default flows from Casting into each book's production context.

## Performance Tuning

- **Playback Speed**: Adjust the default speaking rate (0.5x to 2.0x) using the pill-style popover.
- **Edit Script**: Customize the preview text. Testing a voice generates a private preview clip for that specific variant.
- **Build Progress**: XTTS profiles build local speaker state. Voxtral profiles regenerate preview audio from reference samples or a saved `voice_id`.
- **Contextual Management**: In the samples list, the **Delete (X)** button is hidden by default and only appears when hovering over a specific row to keep the interface clean.
- **Portable Latent Cache**: Each voice profile keeps its own `latent.pth` alongside `profile.json` and `sample.mp3`, which makes renaming, moving, and sharing a voice bundle much safer.
- **Per-Voice Plugin Settings**: Engines can expose selected settings for individual voices. Common overrides such as speed and model can travel with the voice profile, while plugin-specific controls appear only when the plugin declares them.
- **Sample Styling Tip**: The first sample tends to anchor the voice most strongly, while later samples add nuance. Mixing clean examples with different delivery styles can help shape a more interesting profile.

## Per-Voice Plugin Settings

Engines can declare per-voice overrides in their plugin manifest. When overrides are declared, the Voice Lab shows a settings group for that engine's per-voice controls (for example, a speed multiplier or a model variant selector).

To configure per-voice settings:

1. Open the Voice Lab for the voice (`/voices/:id`).
2. Select the variant you want to adjust.
3. If the assigned engine declares per-voice overrides, a settings panel appears below the sample list.
4. Change the values and save. The overrides are stored in Studio-managed plugin data alongside the voice profile and travel with the voice when you export a bundle.

Per-project or per-chapter voice selection does not affect these stored overrides — they are part of the voice profile itself.

## Engine Per Voice

- XTTS and Voxtral voices appear together in the same Voices catalog.
- The engine is assigned per voice profile, not per project.
- Mixed-engine chapters are supported, so one section can use XTTS while another uses Voxtral if the assigned profiles differ.
- Voxtral is hidden entirely unless the user enables it under **PLATFORM > Engines**.

## Voice Bundles

Voice bundles are the portable package format for moving a voice between Studio installs or preparing a voice for external distribution.

The canonical bundle layout (see `design-docs/specs/voice-bundle-template/`) is:

```
<voice-id>/
├── voice.json          # required — machine spec validated against voice.schema.json
├── icon.png            # required — 1:1 aspect-ratio cover image
├── samples/
│   ├── preview.mp3     # required — primary preview clip (Studio + Hugging Face widget)
│   └── preview-*.mp3   # optional — extra samples for different emotions or languages
├── assets/             # optional — engine-specific model files, e.g. assets/xtts/
└── README.md           # optional — HF-compatible page (generated from voice.json by the exporter)
```

`voice.json` is validated against `design-docs/specs/voice.schema.json`. Key top-level fields include `spec`, `spec_version`, `id` (must match the bundle folder name), `name`, `image`, `samples`, `languages`, `attributes`, `engines`, and `provenance`.

The bundle format supports both local Studio imports and Hugging Face-compatible distribution. On Hugging Face, the `README.md` YAML front-matter wires the `widget … output.url` to `samples/preview.mp3`, making the sample playable directly on the repo page without live inference.

When sharing a bundle, keep engine compatibility in mind. A voice built for `XTTS (Local)` will include assets under `assets/xtts/`, while a cloud or remote engine may rely on provider-specific IDs or reference samples instead.

## Variant Version History and A/B Playback

Rebuilding a variant used to overwrite its samples and speaker profile with no way back. It no longer does.

- Every rebuild snapshots the variant's prior state before replacing it, and again once the new build finishes.
- Use the **A/B playback panel** in the Voice Lab to audition an older version side-by-side with the current one.
- **Promote** an older version back to active with one click — it's a fast file copy, not a re-synthesis.
- History starts from your first rebuild after this feature shipped; there's nothing to restore from before that.

## Variant Tags and the Variant Switcher

Variants carry their own **performance tags** — tone/pace descriptors like "breathless" or "slow-burn" — separate from the voice-level Class/Gender/Age attributes described below. Use the autocomplete input to add tags and the filter bar to narrow a long variant list by them.

The variant list itself is a **switcher**: a simple tab strip when a voice has only a few variants, or a filterable rail once it has many — both share the same detail editor below. Each voice can mark one variant as its **default** with a star, and secondary variant actions (rename, delete, regenerate icon prompt) live in a single overflow menu on the card.

## Tags, Attributes and Icons

Every voice can carry structured metadata that powers catalog search and the casting assistant. Attributes come from a fixed taxonomy with nine fields. Three of them (`class`, `gender`, `age`) are required for full casting participation; the rest are optional. A voice that is missing any required attribute shows a **"Not tagged"** chip on its card in the catalog.

To tag a voice, open the Voice Lab and use the **Edit Metadata** option from the voice menu. The modal presents dropdowns for single-value fields (class, gender, age, accent, pace) and multi-chip selectors for array fields (tone, timbre, use case, quality). There is also a free-tag input for open-ended descriptors like `cowboy` or `grandmother`, and an icon upload slot that requires a square image (the UI offers a crop step if the image is not already 1:1). Saving writes the data to `voice.json` on disk.

Once a voice is tagged, it appears in attribute-filtered searches and receives scored recommendations in the Casting stage's voice suggestion panel. Voices with no attributes still appear in unfiltered views but are scored on description text only, so tagging is worth doing before casting a project.

---

[[Home]] | [[Recording Guide]] | [[Concepts]]
