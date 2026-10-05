# Audiobook Studio: Sparse Performance Annotation Model

## 1. Goal

Build an internal data model and processing pipeline for an audiobook studio that can take chapter text, segment it, identify speakers, assign voices, infer optional performance direction, and export the result into whatever format a target speech synthesis engine supports.

The system should not store engine-specific markup, such as SSML, as the canonical format. Instead, it should store a provider-neutral internal representation that can be exported to SSML, provider-specific JSON, prompt-enhanced text, or other engine formats.

Core principle: store meaning and performance intent internally. Generate engine-specific synthesis instructions only at export time.

## 2. Primary Use Case

Given chapter text from a book, play, or script, the system should:

1. Break the text into ordered segments.
2. Identify whether each segment is narration, dialogue, attribution, stage direction, action context, vocalization, sound effect, silence, music, ambience, or production note.
3. Identify the speaker or actor responsible for each spoken or vocalized segment.
4. Assign a voice profile to the speaker.
5. Infer optional performance metadata only when useful.
6. Store speaker confidence, evidence, and review state.
7. Allow human review and overrides.
8. Export the annotated chapter into the format required by a selected synthesis engine.

## 3. Core Design Principle

Use a sparse annotation model.

Most lines should not have explicit emotion or delivery direction. Normal speech should be left unannotated and rendered using the character’s default voice and the scene/book defaults.

Only include performance metadata when the line needs extra direction.

Minimal dialogue segment:

```json
{
  "kind": "dialogue",
  "text": "I thought you were gone.",
  "speaker": {
    "character_id": "char_elena"
  }
}
```

Annotated segment only when needed:

```json
{
  "kind": "dialogue",
  "text": "I thought you were gone.",
  "speaker": {
    "character_id": "char_elena"
  },
  "performance": {
    "emotion": {
      "primary": "shock",
      "intensity": 0.68
    },
    "delivery": {
      "volume": "soft",
      "pace": "slow"
    },
    "acting_note": "Stunned, almost unable to believe it."
  }
}
```

## 4. Canonical Internal Format

The canonical format should be custom JSON stored in the database. It should be provider-neutral and expressive enough to export into multiple synthesis targets.

Recommended canonical name: Audiobook Performance Script JSON.

The canonical model should represent the chapter as an ordered stream of performance segments.

## 5. Segment Types

Supported segment kinds should include:

```text
narration
dialogue
attribution
stage_direction
action_context
vocalization
sfx
music
ambience
silence
chapter_marker
scene_marker
production_note
```

### 5.1 Narration

Narration spoken by the narrator.

```json
{
  "id": "seg_0010",
  "sequence": 10,
  "kind": "narration",
  "text": "The room fell silent as Elena stepped toward the door.",
  "speaker": {
    "character_id": "char_narrator"
  }
}
```

### 5.2 Dialogue

A spoken line from a character.

```json
{
  "id": "seg_0011",
  "sequence": 11,
  "kind": "dialogue",
  "text": "Don't open it.",
  "speaker": {
    "character_id": "char_marcus",
    "confidence": 0.86,
    "evidence": "Previous paragraph places Marcus beside Elena."
  }
}
```

### 5.3 Attribution

Text such as “Marcus whispered” or “Elena said.” This may be spoken in standard audiobook mode but omitted in dramatized mode.

```json
{
  "id": "seg_0012",
  "sequence": 12,
  "kind": "attribution",
  "text": "Marcus whispered.",
  "speaker": {
    "character_id": "char_narrator"
  },
  "rendering": {
    "standard_audiobook": "spoken",
    "enhanced_audiobook": "spoken",
    "audio_drama": "omit"
  }
}
```

### 5.4 Action Context

Action text that may be narrated or used as context for nearby dialogue.

```json
{
  "id": "seg_0013",
  "sequence": 13,
  "kind": "action_context",
  "text": "Elena backed away, shaking her head.",
  "speaker": {
    "character_id": "char_narrator"
  },
  "affects_next_segments": ["seg_0014"],
  "inferred_state": {
    "target_character_id": "char_elena",
    "emotion": "fearful refusal"
  },
  "rendering": {
    "standard_audiobook": "spoken",
    "enhanced_audiobook": "spoken",
    "audio_drama": "convert_or_omit"
  }
}
```

### 5.5 Vocalization

Nonverbal human vocal sounds such as laughter, sobbing, grunts, screams, gasps, sighs, breaths, coughing, choking, or whispers without words.

```json
{
  "id": "seg_0015",
  "sequence": 15,
  "kind": "vocalization",
  "vocalization_type": "laugh",
  "speaker": {
    "character_id": "char_elena",
    "voice_profile_id": "voice_elena"
  },
  "performance": {
    "emotion": {
      "primary": "nervousness",
      "intensity": 0.55
    },
    "delivery": {
      "volume": "quiet",
      "duration": "short"
    }
  },
  "rendering": {
    "spoken_text": null,
    "export_strategy": "engine_vocalization_or_prompt"
  }
}
```

### 5.6 Sound Effect

Sound effects such as door creaks, footsteps, glass breaking, thunder, impacts, weapons, machinery, ambience changes, etc.

```json
{
  "id": "seg_0016",
  "sequence": 16,
  "kind": "sfx",
  "sfx_type": "door_creak",
  "description": "A slow wooden door creak.",
  "rendering": {
    "enabled": true,
    "placement": "after_previous",
    "duration_ms": 1200
  }
}
```

### 5.7 Silence

Explicit pause or dramatic silence.

```json
{
  "id": "seg_0017",
  "sequence": 17,
  "kind": "silence",
  "duration_ms": 750,
  "purpose": "dramatic pause"
}
```

## 6. Character, Speaker, and Voice Separation

The system must separate character identity from voice provider details.

A character is a story entity:

```json
{
  "id": "char_marcus",
  "name": "Marcus",
  "role": "character",
  "aliases": ["the captain", "he", "Marcus Vale"]
}
```

A voice profile is a synthesis resource:

```json
{
  "id": "voice_marcus",
  "display_name": "Marcus Voice",
  "provider": "elevenlabs",
  "provider_voice_id": "abc123"
}
```

Voice casting maps characters to voice profiles:

```json
{
  "character_id": "char_marcus",
  "voice_profile_id": "voice_marcus"
}
```

This allows the studio to change providers or voices without changing the literary analysis.

## 7. Performance Metadata

Performance metadata is optional and should only exist when needed.

Recommended structure:

```json
{
  "performance": {
    "emotion": {
      "primary": "fear",
      "secondary": ["urgency", "protectiveness"],
      "intensity": 0.76,
      "valence": -0.7,
      "arousal": 0.82,
      "confidence": 0.8
    },
    "delivery": {
      "pace": "fast",
      "volume": "hushed",
      "pitch": "low",
      "range": "restrained",
      "pause_before_ms": 100,
      "pause_after_ms": 300,
      "emphasis": [
        {
          "text": "Don't",
          "level": "strong"
        }
      ]
    },
    "acting_note": "Urgent warning, controlled but frightened."
  }
}
```

## 8. Rendering Modes

A segment should support different rendering policies depending on the output type.

Recommended rendering modes:

```text
standard_audiobook
enhanced_audiobook
audio_drama
script_view
review_view
```

Possible rendering values:

```text
spoken
spoken_by_narrator
omit
convert_to_vocalization
convert_to_sfx
use_as_context_only
visible
hidden
```

## 9. Annotation Layers and Precedence

Every important annotation should distinguish between:

1. Source fact
2. AI inference
3. Studio override

Export precedence:

```text
studio_override
explicit source fact
AI inference
character default
scene default
chapter default
book default
engine default
```

## 10. Review State

Each segment should support review metadata.

```json
{
  "review": {
    "speaker_reviewed": false,
    "performance_reviewed": false,
    "needs_human_review": false,
    "locked": false,
    "review_notes": null
  }
}
```

Segments should be flagged for review when speaker confidence is low, multiple speakers are possible, the line attribution is ambiguous, the segment has an unknown character, or a vocalization/SFX opportunity is inferred.

## 11. Database Recommendation

Use a hybrid relational and JSONB model.

Recommended tables:

```text
books
chapters
characters
voice_profiles
character_voice_casting
segments
synthesis_exports
```

Recommended columns for segments:

```text
id
chapter_id
sequence
kind
text
character_id
voice_profile_id
speaker_confidence
emotion_primary
emotion_intensity
review_status
data jsonb
created_at
updated_at
```

The `data jsonb` field should contain the full provider-neutral segment object.

## 12. Export Layer

The export layer should translate the internal model into the target synthesis format.

Required exporters:

```text
PlainScriptExporter
SSMLExporter
AzureSSMLExporter
PollySSMLExporter
ElevenLabsPromptExporter
OpenAISpeechExporter
ReviewScriptExporter
```

The exporter should degrade gracefully. If prosody is supported, export pace, pitch, and volume as prosody. If prosody is not supported, convert performance into a short acting note. If vocalization is supported, export as a vocalization event. If not, convert to prompt text or flag for review.

## 13. Processing Pipeline

Recommended pipeline:

```text
1. Ingest chapter text
2. Normalize text
3. Split into paragraphs and sentences
4. Detect dialogue spans
5. Split attribution from dialogue where appropriate
6. Identify speakers
7. Create or match character records
8. Assign voice profiles
9. Infer optional performance metadata
10. Detect vocalizations, stage directions, action context, and SFX opportunities
11. Store canonical segment stream
12. Run review checks
13. Allow human edits and overrides
14. Export to target synthesis engine
15. Store synthesis export result
```

## 14. MVP Scope

The first version should support books, chapters, characters, voice profiles, character voice casting, segments, narration, dialogue, attribution, vocalization, silence, speaker identification, speaker confidence, basic emotion annotation, basic delivery annotation, human override, script view, generic SSML export, and prompt-based export.

Defer music, ambience, advanced sound design, multi-track audio assembly, word-level timing, phoneme-level pronunciation, full audio-drama export, automatic audio stitching, and provider-specific tuning beyond basic profiles.

## 15. MVP Acceptance Criteria

The MVP is acceptable when:

1. A chapter can be imported as plain text.
2. The chapter is converted into ordered segments.
3. Dialogue and narration are separated.
4. Speakers are assigned to dialogue segments when possible.
5. Uncertain speakers are flagged for review.
6. Characters can be assigned voice profiles.
7. Most segments remain unannotated unless performance direction is needed.
8. Performance annotations can be added, edited, or removed.
9. Vocalizations such as laughter, grunts, gasps, screams, and sighs can be represented.
10. Silence/pause segments can be represented.
11. A script view can display the chapter in readable form.
12. A generic SSML export can be generated.
13. A prompt-based export can be generated.
14. Human overrides take precedence over AI inference.
15. Exported output uses the correct voice assignment for each segment.
