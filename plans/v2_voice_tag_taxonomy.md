# Spec: Voice Tag Taxonomy (Audiobook Studio)

> **Status: FINAL DRAFT.** The single source of truth for how voices are described and
> tagged. Consumed by: the `voice.json` schema, the HF bundle spec
> (`plans/v2_huggingface_voice_repo_spec.md`), the export/upload generator, the AI casting
> engine (`plans/v2_voice_metadata_and_casting.md`), and the Voice Lab UI. If a value
> isn't here, it isn't a controlled tag — it goes in **Free tags** or the description.

## 1. Design principles

- **Sections, each with one simple rule.** A person tagging a voice answers a short,
  guided form. No free-for-all.
- **Controlled where it helps machines, free where it helps humans.** Structured sections
  drive filtering and AI casting; free tags and the description capture nuance.
- **Human-first values, machine-clean ids.** Each value has a display label and a stable
  `id` (lowercase, hyphenated). The `id` is what's stored and tagged.
- **Non-human voices are first-class.** Robots, monsters, and characters are supported via
  a dedicated **Class** section, so "gender" stays meaningful.
- **Versioned.** This taxonomy carries `taxonomy_version` (currently **1.0**). New values
  or sections are additive minor bumps; removing/renaming is a major bump.

### Cardinality rules

| Rule | Meaning |
| --- | --- |
| **one (required)** | Exactly one value must be chosen. |
| **one (optional)** | Zero or one value. |
| **many (required)** | At least one value. |
| **many (optional)** | Zero or more values. |

### HF tag mapping

Each controlled value maps to a Hugging Face tag, namespaced `as-<section>-<id>` (e.g.
`as-gender-feminine`) so our tags never collide with HF's and are easy to filter. The
precise, authoritative values always live in `voice.json`; HF tags exist for browsing and
rough filtering. Anchors are always present: `audiobook-studio-voice` and
`audiobook-studio-spec-v1`.

---

## 2. Sections

### 2.1 Class — *what kind of voice is this?* · `class` · **one (required)**

The nature of the speaker. Picked first; it changes which other sections matter.

| id | Label | Notes |
| --- | --- | --- |
| `human` | Human | Default. Real or human-like narration/dialogue. |
| `synthetic` | Synthetic / AI | Robot, computer, assistant, android. |
| `creature` | Creature / Monster | Beasts, monsters, aliens, demons. |
| `character` | Stylized Character | Cartoon/anthropomorphic/exaggerated persona. |
| `deity` | Mythic / Narrator-God | Omniscient, ethereal, larger-than-life. |

> When `class` is not `human`, **Gender** and **Age** may be `not-applicable` /
> `ageless`, and **Accent** is often `none`.

### 2.2 Gender — *gender presentation* · `gender` · **one (required)**

How the voice reads, not the speaker's identity.

| id | Label |
| --- | --- |
| `feminine` | Feminine |
| `masculine` | Masculine |
| `neutral` | Neutral / Androgynous |
| `ambiguous` | Ambiguous |
| `not-applicable` | Not applicable (non-human) |

### 2.3 Age — *perceived age* · `age` · **one (required)**

| id | Label |
| --- | --- |
| `child` | Child |
| `teen` | Teen |
| `young-adult` | Young adult |
| `adult` | Adult |
| `middle-aged` | Middle-aged |
| `senior` | Senior / Elderly |
| `ageless` | Ageless / Timeless |

### 2.4 Language — *spoken languages* · `language` · **many (required)**

BCP-47 codes (e.g. `en-US`, `en-GB`, `es-ES`, `fr-FR`). The first is **primary**. Maps to
HF `language:` frontmatter (ISO 639-1) and `as-lang-<code>` tags. Drives a hard filter in
casting (a voice must support the project's language).

### 2.5 Accent — *accent / regional flavor* · `accent` · **one (optional)**

Within the primary language. English-first controlled list below; other languages extend
the list over time. Use `other` + a Free tag when nothing fits, and `none` for neutral.

| id | Label | | id | Label |
| --- | --- | --- | --- | --- |
| `none` | Neutral / None | | `irish` | Irish |
| `us-general` | American (General) | | `welsh` | Welsh |
| `us-southern` | American (Southern) | | `australian` | Australian |
| `us-nyc` | American (New York) | | `new-zealand` | New Zealand |
| `us-midwest` | American (Midwest) | | `canadian` | Canadian |
| `us-african-american` | American (AAVE) | | `south-african` | South African |
| `british-rp` | British (RP) | | `indian` | Indian |
| `british-cockney` | British (Cockney) | | `caribbean` | Caribbean |
| `british-northern` | British (Northern) | | `european` | Continental European |
| `scottish` | Scottish | | `other` | Other (+ Free tag) |

### 2.6 Tone — *personality & mood* · `tone` · **many (optional)**

The character/feeling. Multi-select.

`warm`, `friendly`, `calm`, `soothing`, `cheerful`, `upbeat`, `energetic`, `confident`,
`authoritative`, `professional`, `serious`, `somber`, `dramatic`, `intense`, `epic`,
`mysterious`, `menacing`, `sinister`, `playful`, `quirky`, `sarcastic`, `deadpan`,
`gentle`, `wise`, `sensual`, `melancholic`, `heroic`, `villainous`.

### 2.7 Timbre — *sound & texture* · `timbre` · **many (optional)**

The physical sound of the voice. Multi-select.

`deep`, `low`, `high-pitched`, `bright`, `rich`, `resonant`, `booming`, `smooth`,
`velvety`, `silky`, `clear`, `crisp`, `soft`, `breathy`, `husky`, `raspy`, `gravelly`,
`gritty`, `rough`, `nasal`, `thin`, `light`, `robotic`, `distorted`.

### 2.8 Pace — *default delivery speed* · `pace` · **one (optional)**

| id | Label |
| --- | --- |
| `slow` | Slow |
| `measured` | Measured |
| `moderate` | Moderate |
| `brisk` | Brisk |
| `fast` | Fast |
| `variable` | Variable / Expressive |

### 2.9 Use case — *what it's best for* · `use_case` · **many (optional)**

`audiobook`, `narration`, `character-dialogue`, `storytelling`, `documentary`,
`e-learning`, `meditation`, `news`, `podcast`, `advertising`, `gaming`, `animation`,
`assistant`, `ivr`.

### 2.10 Quality / technical — *production notes* · `quality` · **many (optional)**

`studio-quality`, `clean`, `denoised`, `hi-fi`, `phone-quality`, `vintage`,
`multilingual`, `expressive`, `fast-inference`.

### 2.11 Free tags — *anything else* · `tags` · **many (optional)**

Lowercase, hyphenated, freeform. For personas and specifics the controlled sections can't
hold: `cowboy`, `wizard`, `pirate`, `villain`, `grandmother`, `drill-sergeant`,
`film-trailer`, `santa`. These power search and give AI casting extra signal.

---

## 3. How the sections combine

A complete voice always has: **Class, Gender, Age, Language** (required), plus any of the
optional sections. Example, fully tagged:

```
class: creature · gender: masculine · age: ageless · language: [en-US]
accent: none · tone: [menacing, intense] · timbre: [deep, gravelly, distorted]
pace: slow · use_case: [character-dialogue, gaming] · quality: [studio-quality]
tags: [dragon, fantasy, boss-villain]
```

## 4. Where each section is used

| Section | voice.json field | HF tags | AI casting role |
| --- | --- | --- | --- |
| Class | `attributes.class` | `as-class-*` | Hard filter (match character type) |
| Gender | `attributes.gender` | `as-gender-*` | Strong score |
| Age | `attributes.age` | `as-age-*` | Strong score |
| Language | `languages` | `language:`, `as-lang-*` | Hard filter |
| Accent | `attributes.accent` | `as-accent-*` | Medium score |
| Tone | `attributes.tone[]` | `as-tone-*` | Medium score (vs character mood) |
| Timbre | `attributes.timbre[]` | `as-timbre-*` | Medium score |
| Pace | `attributes.pace` | `as-pace-*` | Light score |
| Use case | `attributes.use_case[]` | `as-use-*` | Light score |
| Quality | `attributes.quality[]` | `as-quality-*` | Tie-breaker |
| Free tags | `tags[]` | plain tags | Semantic signal |

## 5. Versioning

- `taxonomy_version` (now **1.0**) ships in every `voice.json`.
- Adding values or optional sections → **minor** bump; bundles stay valid.
- Renaming/removing values or changing a section's rule → **major** bump.
- Studio reading an unknown value keeps it as a Free tag rather than dropping it, so newer
  bundles degrade gracefully on older app versions.

## 6. References

- ElevenLabs voice labels (baseline) — https://elevenlabs.io/docs/eleven-creative/voices/voice-library
- Sibling specs: `plans/v2_huggingface_voice_repo_spec.md`,
  `plans/v2_voice_metadata_and_casting.md`.
