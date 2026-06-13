# Voice Bundle & Voice Directory Contract

```
spec_version: 1.1.0
status: active
sources:
  - app/domain/voices/manifest.py
  - app/domain/voices/migration.py
  - app/domain/voices/bundles.py
  - app/db/speakers.py
  - app/api/routers/voices_metadata.py
  - docs/specs/voice.schema.json
  - docs/specs/voice-taxonomy.json
  - docs/specs/engine-bundle-template
  - docs/specs/voice-bundle-template
  - plans/final_release/04
  - plans/site_experience_north_star.md
  - plans/site_redesign_rollout/07_phase_r5_platform.md
```

> **TL;DR:** Voice assets live in a versioned two-level directory (`{VoiceName}/{VariantName}/`); portable bundles are zips with the same layout; all preview audio is MP3, reference samples are WAV, render output is WAV.

## Changelog

| Version | Date       | Change                  |
|---------|------------|-------------------------|
| 1.1.0   | 2026-06-13 | Added §11 "Voice catalog & Voice Lab UI" — presentation contract for the catalog card content set and the Voice Lab page (TARGET); cross-refs design-system.md for pill tints and §8 for taxonomy values |
| 1.0.0   | 2026-06-10 | Initial canonical spec  |

---

## 1. Purpose

This spec is the binding reference for:

- The on-disk directory layout for voices (V2 nested format).
- JSON schema shapes for `voice.json` and `profile.json`.
- The portable voice bundle (zip) format.
- Audio format rules for every voice-related asset type.
- Voice resolution logic (how a name/variant string maps to a directory).
- Speaker vs. voice profile semantics.
- Attribute taxonomy, tagging requirements, and casting card contracts.

Code that disagrees with this spec is a bug in one or the other.

---

## 2. Audio Format Rules (Owner Directive — Binding)

| Asset type                        | Format | Notes                                      |
|-----------------------------------|--------|--------------------------------------------|
| Reference audio samples (in-dir)  | WAV    | Numbered: `1.wav`, `2.wav`, … up to 5      |
| UI preview / sample audio         | MP3    | `sample.mp3` or `samples/preview.mp3`      |
| Portable bundle preview           | MP3    | `sample.mp3` inside the bundle zip         |
| Chapter / book render output      | WAV    | Produced by synthesis; never MP3           |
| Portable voice bundle container   | ZIP    | Contains WAV references + MP3 preview      |

**MUST NOT** store render output as MP3.
**MUST NOT** store reference samples as MP3 inside the live voices directory.
**MUST** include `sample.mp3` in every bundle exported for distribution.

---

## 3. On-Disk Directory Layout (V2 Nested)

```
voices/
  {VoiceName}/
    voice.json              # V2 root metadata
    {VariantName}/
      profile.json          # Variant metadata
      1.wav                 # Reference audio (numbered, 1–5)
      2.wav
      sample.mp3            # Preview audio shown in UI
      latent.pth            # Engine-specific cached state (optional, engine-owned)
```

- `{VoiceName}` is the display name used in URLs and casting.
- `{VariantName}` is typically `Default` for single-variant voices; additional variants hold engine-specific or stylistic alternatives.
- Numbered WAV files (`1.wav` … `5.wav`) are preferred over `sample.wav`. `get_profile_wavs()` returns comma-separated paths to numbered files first.
- `latent.pth` is engine-specific cached synthesis state; it MUST be treated as opaque by all code outside the owning engine plugin.

**MUST** maintain the two-level `{VoiceName}/{VariantName}/` hierarchy for all V2 voices.
**MUST NOT** place `profile.json` directly under `{VoiceName}/` (that would be the legacy flat layout).

---

## 4. JSON Schemas

> **Two distinct `voice.json` shapes.** The runtime nested-directory `voice.json`
> documented in §4.1 is what the live app reads/writes (`app/domain/voices/manifest.py`,
> `migration.py`): an integer `version: 2` plus `name`/`id`/`default_variant`. The
> separate `docs/specs/voice.schema.json` describes the **canonical engine-agnostic
> distribution bundle** format (`spec`, string `spec_version`, `samples`, `attributes`,
> …) used for the HuggingFace voice repo — it does **not** validate the runtime
> §4.1 shape. Do not conflate the two. The distribution-bundle format is **post-v1**
> for the import/export path; the runtime shape below is current.

### 4.1 `voice.json` (runtime root metadata, version 2)

```json
{
  "version": 2,
  "name": "Voice Name",
  "id": "uuid-v4",
  "default_variant": "Default"
}
```

| Field             | Type    | Required | Description                                    |
|-------------------|---------|----------|------------------------------------------------|
| `version`         | integer | Yes      | Schema version; MUST be `2` for V2 voices      |
| `name`            | string  | Yes      | Display name; matches the directory name       |
| `id`              | string  | Yes      | UUID v4; stable across renames                 |
| `default_variant` | string  | Yes      | Name of the variant used when none is specified|

**MUST** include `"version": 2` in all V2 voice metadata.
**MUST NOT** omit `default_variant`; resolution falls back to `"Default"` only when the field is absent and a `Default/` subdirectory exists.

### 4.2 `profile.json` (variant metadata)

```json
{
  "variant_name": "Default",
  "engine": "engine_id",
  "speaker_id": "uuid"
}
```

| Field          | Type   | Required | Description                                          |
|----------------|--------|----------|------------------------------------------------------|
| `variant_name` | string | Yes      | Must match the parent directory name                 |
| `engine`       | string | Yes      | Engine plugin ID that owns this variant              |
| `speaker_id`   | string | Yes      | Stable UUID linking variant to a Speaker DB record   |

**MUST NOT** branch on `engine` value in core queue/route/UI code; engine-specific behavior belongs in the engine plugin.

---

## 5. Voice Resolution Logic

Given a voice string, the backend resolves it to a variant directory in this order:

1. **Explicit variant** — string is `"Voice Name - Variant"`:
   - Look up `voices/Voice Name/Variant/profile.json`.
2. **Name only** — string is `"Voice Name"`:
   - Read `voices/Voice Name/voice.json` → use `default_variant`.
   - Look up `voices/Voice Name/{default_variant}/profile.json`.
3. **Legacy fallback** — no `voice.json` present:
   - Fall back to `voices/{name}/` flat layout (V1 compatibility path).

`get_profile_wavs(variant_dir)` returns a comma-separated string of absolute paths for numbered WAV files found in `variant_dir`, in ascending numeric order. Files matching `[0-9]+.wav` are preferred; `sample.wav` is the fallback if no numbered files exist.

**MUST** resolve through `voice.json` for all V2 voices; never hard-code variant names in callers.
**MUST NOT** use raw filesystem existence checks as a proxy for voice validity; check `voice.json` schema version.

---

## 6. Portable Voice Bundle (Zip)

A voice bundle is a self-contained zip distributed or imported as a unit.

### 6.1 Required contents

```
VoiceName.zip
  voice.json
  Default/
    profile.json
    1.wav          # At least one numbered reference sample
    sample.mp3     # Preview audio (MP3)
```

### 6.2 Optional contents

```
  Default/
    2.wav … 5.wav  # Additional reference samples
    latent.pth     # Engine latent cache (engine MUST regenerate if absent)
```

### 6.3 Bundle invariants

**MUST** include `voice.json` at the zip root.
**MUST** include at least one numbered `.wav` reference sample per variant.
**MUST** include `sample.mp3` per variant for UI preview.
**MUST NOT** include render output (chapter/book WAV files) in the bundle.
**MUST NOT** require `latent.pth`; engines regenerate it from reference samples if missing.
**MUST** validate `voice.json` `"version": 2` on import before writing to disk.

### 6.4 Import and export

- Export: produced by the voices API; strips any engine-specific files the user opts out of.
- Import: schema-validated before extraction; path traversal in zip entries MUST be rejected (no `../` components).

---

## 7. Speaker vs. Voice Profile

| Concept          | Definition                                                                 |
|------------------|----------------------------------------------------------------------------|
| **Speaker**      | Named entity (person or character); stored in the `speakers` DB table      |
| **SpeakerProfile** | A variant used for synthesis; maps to one `{VariantName}/profile.json`   |

One Speaker can have multiple SpeakerProfiles (e.g., one per engine, or stylistic variants). The `speaker_id` in `profile.json` is the foreign key linking back to the Speaker row.

**MUST NOT** conflate a Speaker with a single profile; casting logic selects a profile from among a speaker's available profiles.

---

## 8. Attribute Taxonomy

Voices are tagged using the attribute vocabulary defined in `docs/specs/voice-taxonomy.json`.

| Attribute       | Values (examples)                              | Required for export |
|-----------------|------------------------------------------------|---------------------|
| `gender`        | `male`, `female`, `neutral`                    | Recommended         |
| `age_range`     | `child`, `young_adult`, `adult`, `senior`      | Recommended         |
| `tone`          | `warm`, `neutral`, `authoritative`, `playful`  | Recommended         |
| `accent`        | BCP-47 locale tag or free text                 | Recommended         |
| `style`         | `narrative`, `conversational`, `dramatic`      | Recommended         |
| `emotion_range` | `narrow`, `moderate`, `expressive`             | Recommended         |

- **Untagged voices MUST NOT produce an error.** Show a warning icon in the UI; do not block synthesis.
- Tags become required only when the user edits and saves a voice (required-on-edit).
- Casting card recommendations use these attributes to score voice-to-character fit (see `plans/final_release/04`).

---

## 9. Casting Card Contract

A casting card is the recommendation payload returned by the casting API for matching a voice variant to a character.

| Field             | Type    | Description                                              |
|-------------------|---------|----------------------------------------------------------|
| `voice_id`        | string  | UUID from `voice.json`                                   |
| `variant_name`    | string  | Matched variant                                          |
| `score`           | float   | Fit score 0.0–1.0                                        |
| `attribute_match` | object  | Per-attribute match detail                               |
| `reason`          | string  | Human-readable justification (optional)                  |

**MUST NOT** hard-code engine IDs in casting logic; scoring is attribute-based.

---

## 10. Legacy (V1) Compatibility

The flat V1 layout (`voices/{name}/sample.wav`, `voices/{name}/config.json`) is supported only by the read path for migration. The migration path converts V1 voices to V2 on first access or via explicit migration API.

**MUST NOT** write new voices in V1 format.
**MUST NOT** delete V1 voices without migrating them first.

---

## 11. Voice Catalog & Voice Lab UI

This section owns the **presentation** of the voice data defined above (§3–§9). It does
not redefine any data shape: attribute values come from the taxonomy in §8, the casting
card payload is §9, and the bundle/export contract is §6. Where this section needs a
visual rule (pill tints, category colours) it **cross-references**
`docs/specs/design-system.md` rather than restating it.

> **Status — TARGET.** The full Voice Lab page described in §11.2 is **mock-only today**:
> the reference implementation lives in
> `frontend/src/demo/stages/siteMockup/panes/voices.tsx`. The catalog **page** itself
> (`frontend/src/pages/Voices/`) already exists; the production Voice Lab page
> (`frontend/src/pages/VoiceLab/`) is the build target tracked by
> `plans/site_redesign_rollout/07_phase_r5_platform.md` (R5-T5…R5-T8). The icon-upload
> **backend already exists** — `POST /api/voices/{id}/icon`
> (`app/api/routers/voices_metadata.py`, multipart image, 1:1 aspect enforced); the UI
> work is wiring, not a new endpoint.
>
> Canonical design sources: `plans/site_experience_north_star.md` §5 + decision Q4 (U8
> card content set) and `plans/site_redesign_rollout/07_phase_r5_platform.md`.

### 11.1 Catalog card content set

Each voice in the catalog (`frontend/src/pages/Voices/`) is presented as a card. The
content set is:

| Element                | Source                                                      | Notes                                                                 |
|------------------------|-------------------------------------------------------------|-----------------------------------------------------------------------|
| Voice icon             | Uploaded image (`POST /api/voices/{id}/icon`)               | 1:1; falls back to a generated initial/placeholder when none uploaded |
| Attribute pills        | Taxonomy values from §8 (e.g. class/gender/age)             | Category-tinted — tint presentation rules live in `design-system.md`  |
| One-line description   | Voice metadata `description`                                | Single line; truncates with ellipsis                                  |
| ▶ Preview              | `sample.mp3` / `samples/preview.mp3` (§2)                   | Inline play; never the WAV references                                 |
| Primary CTA            | One **phase-appropriate** action                            | The single CTA for the voice's current phase (Samples→Build→Test→Ready) |
| Overflow menu (⋯)      | Secondary actions (rename, delete, edit metadata, move, …)  | Everything not the primary CTA                                        |

- **Pill tints** are a presentation concern owned by `docs/specs/design-system.md`
  (category → tint mapping); this spec only states that the pill **values** are the §8
  taxonomy attributes. Untagged voices still render (warning affordance per §8), they
  MUST NOT error.
- **Copy icon prompt (doc 04 C6).** Beside the icon, the UI exposes a copyable
  image-generation prompt built by **frontend string templating** from the voice's
  attributes (§8) + description, with a fixed style preamble so user-generated icons stay
  visually uniform across the catalog. This is pure client-side templating —
  **no image generation and no API call happen inside Studio.** The same builder is used
  in the Voice Lab header (§11.2).

**MUST** drive the catalog card's preview from MP3 preview audio, never the WAV
reference samples (§2).
**MUST NOT** hard-code pill colours in the card; consume the category tint rules from
`design-system.md`.

### 11.2 Voice Lab (full page) — TARGET

The Voice Lab is a **full page workspace**, not a modal or an expanding card (north-star
decision Q4: "it's a workspace — build/test cycles — not a quick edit"). It lives at
route **`/voices/:id`** (where `:id` is the speaker/voice-group id used by the catalog
card CTA).

Page composition:

| Region              | Content                                                                                          |
|---------------------|--------------------------------------------------------------------------------------------------|
| Header              | ← Voices back link, voice icon, name, full pill row (§8), description, "Edit metadata" affordance |
| Phase stepper       | Four steps **Samples → Build → Test → Ready**; past = done, active = filled, future = muted      |
| Sample manager      | List / play / delete / drop-zone upload of reference samples                                     |
| Variants            | One row per variant (§3/§4.2); **per-variant engine settings**; the **default variant is starred** |
| Engine settings     | Engine-owned settings for the selected variant (never engine-ID branching in core UI per §4.2)   |
| Test strip          | Synthesize-and-listen against the current variant/settings                                       |
| Export              | Portable bundle `.zip` (§6) **or** HuggingFace publish                                            |
| Icon controls       | Icon upload (`POST /api/voices/{id}/icon`) + "📋 Copy icon prompt" (the §11.1 builder)            |

- The phase shown by the stepper and the catalog card's primary CTA derive from the same
  voice-phase computation (Samples→Build→Test→Ready); they MUST agree.
- **Export** is the same bundle contract as §6 — the `.zip` path MUST satisfy the §6.3
  invariants (root `voice.json`, ≥1 numbered WAV per variant, `sample.mp3` per variant,
  no render output, validated `"version": 2`). HF publish ships the same bundle layout.
- Per-variant engine settings and the default-variant star map to the variant /
  `profile.json` semantics in §4.2 and §7; the Voice Lab is the editing surface, not a
  new data model.

**MUST** treat the Voice Lab as a routed page (`/voices/:id`), not a modal over the
catalog.
**MUST** route export through the §6 bundle contract; the page MUST NOT emit a bundle
shape that diverges from §6.
**MUST NOT** branch on engine ID in the Voice Lab's core layout/behaviour; engine
specifics live behind the variant's engine settings (§4.2).
