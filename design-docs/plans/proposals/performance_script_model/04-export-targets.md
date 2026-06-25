# Export Targets

The internal canonical JSON is translated to engine-specific formats at export time.
This document maps internal fields to what each major engine supports.

## Why not store SSML directly

SSML (W3C SSML 1.1) is the closest delivery standard for TTS, but:
- Engines support different subsets — what Polly honors, ElevenLabs ignores
- Azure extends SSML with proprietary tags (`<mstts:express-as>`) that break other parsers
- ElevenLabs doesn't use SSML at all — it uses plain text + API settings + emotional prompting
- Storing engine-specific markup couples the literary record to a single provider

**Decision:** internal format = provider-neutral JSON. Export = generated at render time
by the engine's plugin, reading the manifest's declared capabilities.

---

## Supported Export Targets

### 1. W3C SSML 1.1 (baseline)

The lowest-common-denominator SSML. Used as the foundation for all SSML-based engines.

Supported controls: `<prosody>`, `<break>`, `<emphasis>`, `<phoneme>`, `<voice>`,
`<say-as>`, `<speak>`.

### 2. Amazon Polly SSML

Extends W3C SSML with:
- `<amazon:breath>` / `<amazon:auto-breaths>` — adds breath sounds
- `<amazon:effect name="whispered">` — whispered voice
- `<amazon:domain name="news|conversational">` — register switch for Neural voices
- `<amazon:emotion name="excited|disappointed" intensity="low|medium|high">` — Neural voices only

Note: many `<prosody>` attributes have reduced support on Neural/long-form voices.

### 3. Azure Cognitive Services SSML

Extends W3C SSML with:
- `<mstts:express-as style="" styledegree="0.0–2.0" role="">` — pre-defined neural styles
  (e.g. style="cheerful", "sad", "angry", "excited", "terrified", "unfriendly", "whispering")
- `<mstts:silence type="sentenceboundary|Leading|Tailing" value="200ms">` — precise pause control
- `<mstts:viseme>` — lip-sync data (out of scope for audio-only)
- Multilingual inline: `<lang xml:lang="fr-FR">` within the same synthesis call

Azure styles are the richest current support for emotion → delivery mapping.

### 4. ElevenLabs

Does **not** use SSML. Uses:
- **Plain text** sent to the Multilingual v2 / Turbo v2.5 model
- **API voice settings:** `stability` (0.0–1.0), `similarity_boost` (0.0–1.0),
  `style` (0.0–1.0, amplifies style), `use_speaker_boost` (boolean)
- **Emotional prompting:** emotional intent embedded as text cues, e.g. prefixing the line
  with an acting note or stage direction that the model reads as context
- **Projects API** (v2): richer scene/chapter-level control with voice assignments per
  speaker; the closest ElevenLabs equivalent to our span model
- Breaks: `<break time="500ms"/>` is partially supported in some contexts

Emotion → ElevenLabs mapping: primary emotion + intensity maps to `style` slider value
and/or a prefixed acting note. The exporter should emit the acting note as a parenthetical
before the line when `performance.acting_note` is set.

### 5. Google Cloud TTS

Supports W3C SSML. WaveNet and Neural2 voices:
- Standard `<prosody>` support
- `<google:style-degree>` on some voices for style control
- Custom voice models via Voice Cloning API (separate from SSML)

---

## Field Mapping Table

| Internal field | W3C SSML | Azure | ElevenLabs | Polly |
|---|---|---|---|---|
| `delivery.pace` | `<prosody rate="">` | `<prosody rate="">` | `style` slider + prompting | `<prosody rate="">` |
| `delivery.volume` | `<prosody volume="">` | `<prosody volume="">` | `stability` + prompting | `<prosody volume="">` |
| `delivery.pitch` | `<prosody pitch="">` | `<prosody pitch="">` | (limited, via prompting) | `<prosody pitch="">` (Neural: limited) |
| `delivery.pause_before_ms` | `<break time="">` | `<mstts:silence>` | `<break time="">` (partial) | `<break time="">` |
| `delivery.pause_after_ms` | `<break time="">` | `<mstts:silence>` | `<break time="">` (partial) | `<break time="">` |
| `delivery.emphasis[]` | `<emphasis level="">` | `<emphasis level="">` | ALL-CAPS or bold text | `<emphasis level="">` |
| `performance.emotion.primary` | ✗ not supported | `<mstts:express-as style="">` | acting note prefix + style | `<amazon:emotion>` (Neural) |
| `performance.emotion.intensity` | ✗ | `styledegree=""` (0–2) | `style` slider (0–1) | `intensity="low|medium|high"` |
| `performance.acting_note` | ✗ | ✗ | prepend as parenthetical text | ✗ |
| `kind = vocalization` | ✗ (fallback to spoken text) | `<mstts:express-as>` + style | acting note prompt | `<amazon:breath>` / effect |
| `kind = silence` | `<break time="">` | `<mstts:silence>` | `<break time="">` (partial) | `<break time="">` |
| `kind = attribution` | spoken as-is OR omit | spoken OR omit | spoken OR omit | spoken OR omit |
| `speaker.character_id` | `<voice name="">` | `<voice name="">` | API `voice_id` per span | `<voice name="">` |
| `delivery.range = dramatic` | (no direct mapping) | `styledegree="2.0"` | `style=1.0` | ✗ |
| `delivery.range = flat` | `<prosody pitch="+0%">` | `styledegree="0.0"` | `stability=1.0` | ✗ |

### Degradation rules

When a target engine doesn't support a field, the exporter should degrade gracefully:

1. **Prosody unsupported** → convert `pace/pitch/volume` to a short acting note prepended to the text
2. **Emotion unsupported** → include `acting_note` as a parenthetical if available; otherwise discard
3. **Vocalization unsupported** → convert to nearest spoken text equivalent or omit with a review flag
4. **Per-span voice unsupported** → pack consecutive same-speaker spans together and assign the block voice

---

## Engine Capability Declaration

Exporters read capabilities from the engine's `manifest.json` `behavior` block (not from
a hardcoded list here). The exporter picks the richest supported export path automatically.

Engines should declare in their manifest:
```json
{
  "behavior": {
    "export_format": "ssml_w3c" | "ssml_azure" | "elevenlabs_text" | "ssml_polly" | "plain_text",
    "supports_per_span_voice": true,
    "supports_emotion_style": true,
    "supports_prosody": true,
    "supports_break": true
  }
}
```

This is not yet defined in the plugin contract — adding it is a task for this plan's
implementation phase.

---

## Value Mappings

### pace → SSML rate
| Internal | SSML rate |
|---|---|
| `very_slow` | `x-slow` |
| `slow` | `slow` |
| `medium` | `medium` |
| `fast` | `fast` |
| `very_fast` | `x-fast` |

### volume → SSML volume
| Internal | SSML volume |
|---|---|
| `silent` | `silent` |
| `whispered` | `x-soft` |
| `hushed` | `x-soft` |
| `soft` | `soft` |
| `medium` | `medium` |
| `loud` | `loud` |
| `shouting` | `x-loud` |
| `screaming` | `x-loud` (+ acting note) |

### pitch → SSML pitch
| Internal | SSML pitch |
|---|---|
| `very_low` | `x-low` |
| `low` | `low` |
| `medium_low` | `-10%` |
| `medium` | `medium` |
| `medium_high` | `+10%` |
| `high` | `high` |
| `very_high` | `x-high` |

### emotion.primary → Azure express-as style (approximate)
| Internal emotion | Azure style |
|---|---|
| `fear` | `terrified` |
| `anger` | `angry` |
| `sadness` | `sad` |
| `joy` | `cheerful` |
| `surprise` | `excited` |
| `disgust` | `unfriendly` |
| `urgency` | `newscast-formal` (closest) |
| `tenderness` | `gentle` |
| whisper delivery | `whispering` |
| narrative/story | `narration-professional` |
