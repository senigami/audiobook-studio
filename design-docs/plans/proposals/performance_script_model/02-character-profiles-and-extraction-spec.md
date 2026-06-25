# Audiobook Studio Character + Segment Extraction Specification

## 1. Purpose

Build an AI-assisted extraction pipeline for an audiobook studio.

The system should take book, chapter, play, or script text and produce structured JSON that can be stored in a database and later used to generate synthesis-engine input.

The extraction should identify characters, character aliases, character profiles, voice-relevant traits, narration and dialogue segments, speaker attribution, optional performance direction, vocalizations, sound effects, silence, stage directions, evidence, confidence, and human review flags.

The system must avoid inventing unsupported details. If a fact is not supported by the source text, it should be omitted or set to `null`.

## 2. Recommended Processing Order

Use a multi-pass pipeline:

```text
1. Character discovery
2. Character profile creation/update
3. Text segmentation
4. Speaker attribution
5. Sparse performance annotation
6. Reconciliation
```

Character profiles should be created first, but they should remain living records. Speaker attribution can reveal new information that updates profiles.

Recommended architecture:

```text
Chapter text
→ character discovery
→ character registry update
→ segment extraction
→ speaker attribution
→ sparse performance annotation
→ character profile update
→ human review
→ database encoding
→ synthesis export
```

## 3. Output Envelope

The AI extractor should return one JSON object with this top-level shape:

```json
{
  "schema": "audiobook_analysis_result",
  "schema_version": "0.1.0",
  "document": {},
  "characters": [],
  "character_relationships": [],
  "segments": [],
  "warnings": [],
  "review_queue": []
}
```

## 4. Character Profile Format

Each character should use this structure:

```json
{
  "id": "char_elena_marrow",
  "name": "Elena Marrow",
  "display_name": "Elena",
  "role": "major_character",
  "character_type": "fictional_person",
  "aliases": [
    {
      "value": "Elena",
      "type": "name",
      "confidence": 1.0
    },
    {
      "value": "the girl",
      "type": "description",
      "confidence": 0.72
    },
    {
      "value": "she",
      "type": "pronoun",
      "confidence": 0.95
    }
  ],
  "source_presence": {
    "first_seen": {
      "paragraph_index": 4,
      "sentence_index": 2
    },
    "speaking_segment_count": 0,
    "mentioned_segment_count": 0
  },
  "source_profile": {
    "age": {
      "value": null,
      "range": "late teens",
      "basis": "inferred_from_context",
      "confidence": 0.72,
      "evidence": [
        {
          "quote": "She had not yet reached her twentieth summer.",
          "paragraph_index": 8,
          "sentence_index": 1
        }
      ]
    },
    "gender": {
      "value": "female",
      "basis": "pronoun_usage",
      "confidence": 0.98,
      "evidence": [
        {
          "quote": "She folded her arms.",
          "paragraph_index": 4,
          "sentence_index": 3
        }
      ]
    },
    "accent_or_dialect": {
      "value": null,
      "basis": "not_stated",
      "confidence": 0.0,
      "evidence": []
    },
    "speech_style": {
      "summary": "Careful, guarded, and emotionally restrained.",
      "basis": "inferred_from_context",
      "confidence": 0.76,
      "evidence": [
        {
          "quote": "Her answer came slowly, each word chosen like a blade.",
          "paragraph_index": 21,
          "sentence_index": 4
        }
      ]
    },
    "personality_traits": [
      {
        "label": "guarded",
        "basis": "inferred_from_context",
        "confidence": 0.81,
        "evidence": [
          {
            "quote": "She said nothing at first.",
            "paragraph_index": 21,
            "sentence_index": 2
          }
        ]
      }
    ],
    "physical_description": [],
    "social_role": {
      "value": null,
      "basis": "not_stated",
      "confidence": 0.0,
      "evidence": []
    }
  },
  "voice_guidance": {
    "casting_notes": "Young adult female voice. Controlled and thoughtful. Avoid making her sound childlike.",
    "default_delivery": {
      "pace": "medium",
      "volume": "medium",
      "pitch": "medium_high",
      "range": "restrained"
    },
    "accent": null,
    "avoid": [
      "childlike tone",
      "overly dramatic delivery"
    ]
  },
  "voice_casting": {
    "voice_profile_id": null,
    "casting_status": "unassigned",
    "reviewed": false
  },
  "review": {
    "needs_review": true,
    "review_reasons": [
      "age is inferred",
      "speech style is inferred"
    ],
    "locked": false
  }
}
```

## 5. Segment Format

Each segment represents one ordered unit in the audiobook performance stream.

Minimum segment:

```json
{
  "id": "seg_000001",
  "sequence": 1,
  "kind": "narration",
  "text": "The room fell silent as Elena stepped toward the door.",
  "speaker": {
    "character_id": "char_narrator",
    "confidence": 1.0,
    "basis": "default_narrator",
    "evidence": []
  },
  "performance": null,
  "rendering": {
    "standard_audiobook": "spoken",
    "enhanced_audiobook": "spoken",
    "audio_drama": "spoken"
  },
  "source_trace": {
    "paragraph_index": 1,
    "sentence_index": 1,
    "chapter_offset_start": null,
    "chapter_offset_end": null
  },
  "review": {
    "speaker_reviewed": false,
    "performance_reviewed": false,
    "needs_human_review": false,
    "review_reasons": [],
    "locked": false
  }
}
```

Dialogue segment with inferred speaker:

```json
{
  "id": "seg_000002",
  "sequence": 2,
  "kind": "dialogue",
  "text": "Don't open it.",
  "speaker": {
    "character_id": "char_marcus",
    "confidence": 0.86,
    "basis": "inferred_from_context",
    "evidence": [
      {
        "quote": "Marcus moved between her and the door.",
        "paragraph_index": 2,
        "sentence_index": 1
      }
    ]
  },
  "dialogue_attribution": {
    "explicit": false,
    "attribution_text": null,
    "inferred_from_context": true
  },
  "performance": {
    "emotion": {
      "primary": "fear",
      "secondary": ["urgency", "protectiveness"],
      "intensity": 0.76,
      "valence": -0.7,
      "arousal": 0.82,
      "confidence": 0.8,
      "basis": "inferred_from_context"
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
  },
  "rendering": {
    "standard_audiobook": "spoken",
    "enhanced_audiobook": "spoken",
    "audio_drama": "spoken"
  },
  "source_trace": {
    "paragraph_index": 2,
    "sentence_index": 2,
    "chapter_offset_start": null,
    "chapter_offset_end": null
  },
  "review": {
    "speaker_reviewed": false,
    "performance_reviewed": false,
    "needs_human_review": false,
    "review_reasons": [],
    "locked": false
  }
}
```

## 6. Controlled Values

### Segment Kinds

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

### Character Roles

```text
narrator
major_character
minor_character
background_character
group
unknown
```

### Basis Values

```text
explicit_source
inferred_from_context
pronoun_usage
dialogue_pattern
narrator_description
other_character_description
default_narrator
not_stated
studio_override
unknown
```

### Delivery Values

Pace: very_slow, slow, medium, fast, very_fast.

Volume: silent, whispered, hushed, soft, medium, loud, shouting, screaming.

Pitch: very_low, low, medium_low, medium, medium_high, high, very_high.

Range: flat, restrained, natural, animated, dramatic.

Vocalization types: laugh, chuckle, sob, cry, scream, gasp, sigh, grunt, groan, moan, whimper, cough, breath, pant, snarl, whisper_nonverbal, other.

Rendering values: spoken, spoken_by_narrator, omit, pause, convert_to_vocalization, convert_to_sfx, use_as_context_only, visible, hidden.

## 7. Database Encoding Recommendation

The output JSON can be mapped into relational tables with JSONB columns.

Recommended tables:

```text
books
chapters
characters
character_relationships
voice_profiles
character_voice_casting
segments
synthesis_exports
```

### characters table

```text
id
book_id
name
display_name
role
character_type
aliases jsonb
source_presence jsonb
source_profile jsonb
voice_guidance jsonb
voice_casting jsonb
review jsonb
created_at
updated_at
```

### segments table

```text
id
chapter_id
sequence
kind
text
character_id
voice_profile_id
speaker_confidence
speaker_basis
emotion_primary
emotion_intensity
review_status
data jsonb
created_at
updated_at
```

The full original segment object should be stored in `segments.data`.

## 8. Human Review Rules

Flag a character for review when age is inferred, accent is inferred, major voice guidance is inferred, multiple aliases may refer to the same person, or character identity may duplicate another character.

Flag a segment for review when speaker confidence is below 0.85, multiple speakers are possible, speaker is unknown, performance direction is unusually strong, a vocalization or SFX is inferred, or source attribution is ambiguous.

## 9. Extraction Prompt for AI Agent

Use this prompt to produce structured extraction output.

```text
You are an audiobook text analysis engine.

Your job is to analyze the provided source text and return a single valid JSON object that conforms to the Audiobook Analysis Result schema described below.

Primary goals:
1. Extract all characters that appear in the text.
2. Build conservative character profiles from the source text.
3. Identify aliases, pronouns, descriptions, and references for each character.
4. Split the text into ordered performance segments.
5. Identify narration, dialogue, attribution, stage directions, action context, vocalizations, sound effects, silence, and other renderable events.
6. Attribute dialogue and vocalizations to speakers when possible.
7. Add sparse performance direction only when the source text or context clearly supports it.
8. Include evidence and confidence for all important inferred claims.
9. Flag anything ambiguous for human review.

Critical rules:
- Return JSON only.
- Do not include markdown.
- Do not include explanations outside the JSON.
- Do not invent unsupported details.
- If a detail is not stated or cannot be safely inferred, use null or omit the field.
- Do not assign accent, age, gender, ethnicity, nationality, disability, or personality unless supported by the text.
- If a detail is inferred, mark basis as inferred_from_context and include evidence.
- If a detail is explicit in the text, mark basis as explicit_source and include evidence.
- Most dialogue should not have performance metadata.
- Only add performance metadata when the source text or strong context indicates it.
- Treat laughter, sighs, gasps, screams, grunts, crying, sobbing, coughing, choking, and similar nonverbal sounds as vocalization segments when appropriate.
- Treat sounds like doors creaking, footsteps, thunder, explosions, glass breaking, and environmental audio as sfx segments only when useful for enhanced audiobook or audio drama output.
- Keep character identity separate from voice assignment.
- Use stable character IDs.
- If an existing character registry is provided, reuse those character IDs.
- If a character may be new, create a new candidate character ID.
- If two names may refer to the same character, do not merge them unless the text strongly supports it. Instead, flag for review.
- Use the narrator character ID char_narrator for narration.

Recommended processing:
1. First identify character candidates.
2. Build or update character profiles.
3. Segment the text.
4. Attribute speakers using the character profiles.
5. Add sparse performance metadata only where needed.
6. Create review flags.
7. Return the final JSON object.

Top-level output schema:
{
  "schema": "audiobook_analysis_result",
  "schema_version": "0.1.0",
  "document": {
    "book_id": string | null,
    "chapter_id": string | null,
    "title": string | null,
    "source_type": "novel" | "play" | "script" | "short_story" | "unknown",
    "language": string | null,
    "analysis_scope": "chapter" | "scene" | "full_text",
    "source_trace_strategy": string
  },
  "characters": [],
  "character_relationships": [],
  "segments": [],
  "warnings": [],
  "review_queue": []
}

Now analyze the following source text:

[PASTE SOURCE TEXT HERE]
```

## 10. Recommended Agent Workflow

For best results, do not ask one model call to analyze an entire book unless the context window safely supports it.

Recommended workflow:

```text
1. Analyze chapter 1.
2. Create initial character registry.
3. Store profiles and segments.
4. Analyze chapter 2 using the existing character registry as context.
5. Update profiles and add new characters.
6. Continue chapter by chapter.
7. Run a book-level reconciliation pass at the end.
```
