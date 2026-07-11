# Voice Bundle & Voice Directory Contract

```
spec_version: 1.5.1
status: active
sources:
  - app/domain/voices/manifest.py
  - app/domain/voices/migration.py
  - app/domain/voices/bundles.py
  - app/db/speakers.py
  - app/api/routers/voices_metadata.py
  - design-docs/specs/voice.schema.json
  - design-docs/specs/voice-taxonomy.json
  - design-docs/specs/engine-bundle-template
  - design-docs/specs/voice-bundle-template
  - design-docs/plans/active/final_release/04
  - design-docs/plans/reference/site_experience_north_star.md
  - design-docs/plans/reference/site_redesign_rollout/07_phase_r5_platform.md
```

> **TL;DR:** Voice assets live in a versioned two-level directory (`{VoiceName}/{VariantName}/`); portable bundles are zips with the same layout; all preview audio is MP3, reference samples are WAV, render output is WAV.

## Changelog

| Version | Date       | Change                  |
|---------|------------|-------------------------|
| 1.5.1   | 2026-07-03 | Hardening for the HF import download path (`HFHubClient.download_files` in `app/domain/voices/huggingface.py`): filenames from `list_repo_files` are now independently validated with `safe_basename` (rejects path-traversal/absolute-path filenames) before reaching `hf_hub_download`, rather than relying solely on the installed `huggingface_hub` library's own sanitization. Filenames are also pre-filtered to an allowlist (`.wav`/`.mp3`/`.flac`/`.ogg`/`.json`, matching the router's existing audio filter + the `voice.json` manifest) and capped at 20 files per repo before any download call is made, so an oversized or malicious repo listing can't trigger unbounded synchronous downloads. Not covered: no per-file or total byte-size cap — a single oversized file that still matches the extension allowlist can still be downloaded in full (accepted gap, follow-up work). |
| 1.5.0   | 2026-07-03 | §8.1 `provenance` now has a real, live populator: `POST /api/voices/huggingface/import` (`app/api/routers/voices_huggingface.py`, backed by `app/domain/voices/huggingface.py`'s live `HFHubClient`) writes `{"source": "imported", "author": <hub author or org>, "consent_ack": true, "created_at": <iso timestamp>}` through the existing `PATCH /api/voices/{id}/metadata` path after a Hugging Face voice download completes — `source` is `"imported"`, never `"huggingface"` (not a valid enum value). No schema/validator change; this only retires the "no populator yet" note from 1.3.0. |
| 1.4.0   | 2026-07-03 | Phase G (taxonomy v2.0): §8 taxonomy table gains `language` (many-optional, spoken/deliverable languages — distinct from the top-level BCP-47 `languages[]` hard-filter) and `style` (many-optional, delivery style e.g. conversational/narration/characters). Both are additive-only free-multi-value facets wired through the same `validate_and_degrade_attributes`/`validate_attributes_strict` path as `tone`/`timbre`; unknown values degrade to free tags on lenient load and reject with 422+valid-values on strict PATCH. `voice-taxonomy.json` bumped to `taxonomy_version: "2.0"`; `voice.schema.json` `attributes` gains optional `language`/`style` array properties (no `additionalProperties` change; existing `attributes` blocks without these fields remain valid). HF README generator (`app/domain/voices/bundles.py`) emits `as-language-*`/`as-style-*` tags when present. Voice Lab Edit Metadata modal and catalog pill rendering are unaffected code-wise — pills already walk `attributes` generically (`voicePillsFromMetadata`), so the new fields render as `extended`-hue pills with no component changes. |
| 1.3.0   | 2026-07-03 | §8 documents `provenance` (voice.schema.json §provenance) as genuinely read/write through the live metadata endpoints: `GET /api/voices`, `GET /api/voices/{id}`, and `GET /api/voices/search` return it verbatim when present (no fabricated default when absent); `PATCH /api/voices/{id}/metadata` accepts and strictly validates it (`validate_provenance_strict` in `app/domain/voices/taxonomy.py` — unknown fields/values → 422, mirroring `validate_attributes_strict`; free-form string fields capped at 512 chars). No shape change to `voice.schema.json` (the field's shape was already declared there); this only wires the previously-unwired write path. Write is whole-block replace, not merge; no tamper-evidence on `source`/`consent_ack` (acceptable for the current single-user threat model). Population (e.g. by a future HuggingFace import module) is explicitly out of scope and decoupled from this change. |
| 1.2.0   | 2026-06-16 | §8 taxonomy table replaced with actual facets/vocabularies from voice-taxonomy.json (added class/timbre/pace/use_case/quality; replaced age_range→age, corrected gender values, dropped style/emotion_range); §6.3 import validation restated to match code (validates against voice.schema.json, not integer version:2); §6.1/§6.3 WAV samples marked as opt-in (include_source_wavs), MP3 preview is the required per-variant audio asset; §6.1 bundle root contents updated (added bundle.json, README.md; noted .voice.zip extension); §5 get_profile_wavs signature and sort-order corrected (profile_name_or_id arg, lexicographic order); §11 Voice Lab status updated (page and all sections exist, TARGET label removed) |
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
| Portable voice bundle container   | ZIP    | Always contains MP3 preview; WAV references are opt-in (`include_source_wavs=True`) |

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
> separate `design-docs/specs/voice.schema.json` describes the **canonical engine-agnostic
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

`get_profile_wavs(profile_name_or_id)` (`app/db/speakers.py`) resolves the profile directory from a profile name or speaker ID, then returns a comma-separated string of absolute paths for all `.wav` files in that directory (excluding `sample.wav`), sorted in **lexicographic** order. If no numbered WAVs are present, `sample.wav` is returned as the fallback; returns `None` if the profile cannot be resolved.

**MUST** resolve through `voice.json` for all V2 voices; never hard-code variant names in callers.
**MUST NOT** use raw filesystem existence checks as a proxy for voice validity; check `voice.json` schema version.

---

## 6. Portable Voice Bundle (Zip)

A voice bundle is a self-contained zip distributed or imported as a unit.

### 6.1 Required contents

Exported bundles use the `.voice.zip` extension (e.g. `VoiceName.voice.zip`).

```
VoiceName.voice.zip
  voice.json       # Distribution manifest (voice.schema.json format — no integer version field)
  bundle.json      # Export manifest (schema_version, created_at, variants, included_asset_classes)
  README.md        # Generated HuggingFace-compatible README (auto-generated from voice.json)
  Default/
    profile.json
    sample.mp3     # Preview audio (MP3) — required per-variant audio asset
```

### 6.2 Optional contents

```
  Default/
    1.wav … 5.wav  # Numbered source WAV reference samples (opt-in: include_source_wavs=True)
    latent.pth     # Engine latent cache (engine MUST regenerate if absent)
```

Numbered WAV reference samples are included only when the export API is called with `include_source_wavs=True` (default: `False`). The default export ships only the MP3 preview (plus latent cache if present).

### 6.3 Bundle invariants

**MUST** include `voice.json` at the zip root.
**MUST** include at least one `profile.json` (i.e. at least one variant) in the bundle.
**MUST** include `sample.mp3` per variant for UI preview (the required per-variant audio asset).
**MAY** include numbered `.wav` reference samples per variant when exported with `include_source_wavs=True`; these are not required for a valid bundle.
**MUST NOT** include render output (chapter/book WAV files) in the bundle.
**MUST NOT** require `latent.pth`; engines regenerate it from reference samples if missing.
**MUST** validate `voice.json` against `design-docs/specs/voice.schema.json` on import (requires `spec`, `spec_version`, `id`, `name`, `image`, `samples`, `languages`, `attributes` fields; `"version"` is a runtime-only field that is stripped from exports and never present in bundle `voice.json`).

### 6.4 Import and export

- Export: `export_voice_bundle()` strips runtime-only fields (`version`, `default_variant`, `_untagged`, `_taxonomy_version`) from `voice.json` before writing, so the exported manifest conforms to `voice.schema.json`. Numbered WAV sources are included only when `include_source_wavs=True`.
- Import: `import_voice_bundle()` validates zip structure and path safety before extraction; path traversal in zip entries MUST be rejected (no `../` components). The `voice.json` in a bundle uses the distribution schema shape, not the runtime `"version": 2` integer shape.

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

Voices are tagged using the attribute vocabulary defined in `design-docs/specs/voice-taxonomy.json`. The table below reflects the exact facets and value vocabularies in that file. The JSON Schema for the distribution bundle (`design-docs/specs/voice.schema.json`) enforces the same vocabulary and marks `class`, `gender`, and `age` as required fields inside `attributes`.

| Attribute    | Cardinality    | Required | Value vocabulary (from voice-taxonomy.json)                                                                             |
|--------------|----------------|----------|-------------------------------------------------------------------------------------------------------------------------|
| `class`      | one-required   | **Yes**  | `human`, `synthetic`, `creature`, `character`, `deity`                                                                  |
| `gender`     | one-required   | **Yes**  | `feminine`, `masculine`, `neutral`, `ambiguous`, `not-applicable`                                                       |
| `age`        | one-required   | **Yes**  | `child`, `teen`, `young-adult`, `adult`, `middle-aged`, `senior`, `ageless`                                             |
| `accent`     | one-optional   | No       | `none`, `us-general`, `us-southern`, `us-nyc`, `us-midwest`, `us-african-american`, `british-rp`, `british-cockney`, `british-northern`, `scottish`, `irish`, `welsh`, `australian`, `new-zealand`, `canadian`, `south-african`, `indian`, `caribbean`, `european`, `other` |
| `language`   | many-optional  | No       | `english`, `spanish`, `french`, `german`, `italian`, `portuguese`, `polish`, `turkish`, `russian`, `dutch`, `czech`, `arabic`, `chinese`, `japanese`, `korean`, `hindi`, `hungarian`, `other` |
| `style`      | many-optional  | No       | `conversational`, `narration`, `characters`, `social-media`, `educational`, `advertisement`, `entertainment`            |
| `tone`       | many-optional  | No       | `warm`, `friendly`, `calm`, `soothing`, `cheerful`, `upbeat`, `energetic`, `confident`, `authoritative`, `professional`, `serious`, `somber`, `dramatic`, `intense`, `epic`, `mysterious`, `menacing`, `sinister`, `playful`, `quirky`, `sarcastic`, `deadpan`, `gentle`, `wise`, `sensual`, `melancholic`, `heroic`, `villainous` |
| `timbre`     | many-optional  | No       | `deep`, `low`, `high-pitched`, `bright`, `rich`, `resonant`, `booming`, `smooth`, `velvety`, `silky`, `clear`, `crisp`, `soft`, `breathy`, `husky`, `raspy`, `gravelly`, `gritty`, `rough`, `nasal`, `thin`, `light`, `robotic`, `distorted` |
| `pace`       | one-optional   | No       | `slow`, `measured`, `moderate`, `brisk`, `fast`, `variable`                                                             |
| `use_case`   | many-optional  | No       | `audiobook`, `narration`, `character-dialogue`, `storytelling`, `documentary`, `e-learning`, `meditation`, `news`, `podcast`, `advertising`, `gaming`, `animation`, `assistant`, `ivr` |
| `quality`    | many-optional  | No       | `studio-quality`, `clean`, `denoised`, `hi-fi`, `phone-quality`, `vintage`, `multilingual`, `expressive`, `fast-inference` |

`language` (v2.0) is distinct from the top-level BCP-47 `languages[]` array documented in §4.1 —
`languages[]` drives the casting hard-filter (§9), while attribute `language` is a taxonomy-facet
tag for catalog search/filtering (e.g. "voices that can do a Spanish accent/delivery" independent
of the primary spoken language used for casting). A `tags` free-text array (pattern
`^[a-z0-9][a-z0-9-]*$`) is also available for anything the controlled sections cannot hold.

- **Untagged voices MUST NOT produce an error.** Show a warning icon in the UI; do not block synthesis.
- `class`, `gender`, and `age` become required when the user edits and saves a voice (required-on-edit), and are required for a valid distribution bundle (enforced by `voice.schema.json`).
- Casting card recommendations use these attributes to score voice-to-character fit (see `design-docs/plans/active/final_release/04`).

### 8.1 `provenance`

`provenance` (`voice.schema.json` §provenance: `source`, `author`, `consent_ack`, `created_at`) records where a voice came from. It is read/write through the same live metadata endpoints as `attributes`/`tags`/`description`:

- `GET /api/voices`, `GET /api/voices/{id}`, `GET /api/voices/search` return `provenance` verbatim when present; a voice with no `provenance` block omits the key rather than fabricating a default.
- `PATCH /api/voices/{id}/metadata` accepts a `provenance` object and strictly validates it (`validate_provenance_strict` in `app/domain/voices/taxonomy.py`): `source` MUST be one of `recorded`/`cloned`/`imported`/`designed`; unknown fields or wrong types → 422, mirroring the `attributes` strict-validation pattern (§C2). Free-form string fields (`author`, `created_at`) are capped at 512 characters.
- **The write is whole-block REPLACE, not merge.** `PATCH {"provenance": {"source": "recorded"}}` fully replaces any existing `provenance` block — a partial object silently drops fields not included in the request. Callers that want to update one field must resend the full block.
- **This endpoint only persists what it is given — it does not populate `provenance` itself.** Population is owned by whichever caller sets it. As of 1.5.0, `POST /api/voices/huggingface/import` (`app/api/routers/voices_huggingface.py`) is a live, wired populator: it writes through this same `PATCH` path after a Hugging Face download, decoupled from the field definition/validation here. There is no tamper-evidence on `source`/`consent_ack` today — any client with PATCH access can assert an arbitrary provenance claim (e.g. mark a cloned voice `source: "recorded"`). Acceptable for the current single-user local-first threat model; revisit if `provenance` becomes load-bearing for a trust decision.

---

## 9. Casting Card Contract

A casting card is the recommendation payload returned by the casting API for matching a voice variant to a character.

> Related research: `design-docs/plans/proposals/research_character_brief_extraction_and_persona_casting.md`
> surveys persona-to-voice-casting prior art for the upstream stage that would produce
> the `character` brief this contract's caller (`cast_voices()`) scores against — no
> change to this contract's shape.

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
`design-docs/specs/design-system.md` rather than restating it.

> **Status — shipped.** The Voice Lab page (`frontend/src/pages/VoiceLab/VoiceLabPage.tsx`)
> exists as a routed production page at `/voices/:id`. It includes the full header (back
> link, avatar, name, pill row, description, "Edit metadata" button), a `PhaseStepper`
> driven by `getVoicePhase`, and lazy-loaded body sections:
> `SamplesSection`, `VariantsSection`, `TestSection`, and `VoiceIconControls` — all
> implemented under `frontend/src/pages/VoiceLab/components/`.
>
> The icon-upload backend also exists — `POST /api/voices/{id}/icon`
> (`app/api/routers/voices_metadata.py`, multipart image, 1:1 aspect enforced) — and is
> wired to `VoiceIconControls`.
>
> Canonical design sources: `design-docs/plans/reference/site_experience_north_star.md` §5 + decision Q4 (U8
> card content set) and `design-docs/plans/reference/site_redesign_rollout/07_phase_r5_platform.md`.

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

- **Pill tints** are a presentation concern owned by `design-docs/specs/design-system.md`
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

### 11.2 Voice Lab (full page)

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
- **Export** is the same bundle contract as §6 — the `.voice.zip` MUST satisfy the §6.3
  invariants (root `voice.json` + `bundle.json` + `README.md`, `sample.mp3` per variant,
  no render output, schema-validated against `voice.schema.json`). Numbered WAV sources
  are included only with `include_source_wavs=True`. HF publish ships the same bundle layout.
- Per-variant engine settings and the default-variant star map to the variant /
  `profile.json` semantics in §4.2 and §7; the Voice Lab is the editing surface, not a
  new data model.

**MUST** treat the Voice Lab as a routed page (`/voices/:id`), not a modal over the
catalog.
**MUST** route export through the §6 bundle contract; the page MUST NOT emit a bundle
shape that diverges from §6.
**MUST NOT** branch on engine ID in the Voice Lab's core layout/behaviour; engine
specifics live behind the variant's engine settings (§4.2).
