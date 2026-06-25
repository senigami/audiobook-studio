# DB Schema Changes

Maps the current schema to what is needed to support the performance script model.

## Current state (as of 2026-06-25)

### `chapter_segments` (sentence-level)
```
id                    TEXT  PK
chapter_id            TEXT  FK
segment_order         INT   position in chapter
text_content          TEXT  full segment text
sanitized_text        TEXT  cleaned text for TTS
character_id          TEXT  FK → characters (nullable)
speaker_profile_name  TEXT  direct voice ref (nullable)
audio_file_path       TEXT
audio_status          TEXT
audio_generated_at    REAL
```

**Gap:** sentence-level only, no sub-sentence splits, no performance metadata.

### `characters` (book-scoped)
```
id                    TEXT  PK
project_id            TEXT  FK
name                  TEXT
chapter_id            TEXT  nullable — temp chapter-scoped chars
speaker_profile_name  TEXT  voice assignment
default_emotion       TEXT  single string, e.g. "Neutral"
color                 TEXT  UI paint color
```

**Gap:** no aliases, no inferred profile, no voice guidance, no review state, no confidence.

---

## Target state

### `chapter_segments` → **spans** (sub-sentence capable)

New columns needed:

| Column | Type | Purpose |
|---|---|---|
| `span_start` | INT | Byte/char offset within chapter text (replaces sentence-level position as ownership unit) |
| `span_end` | INT | Byte/char offset end |
| `sentence_index` | INT | Presentation hint — which sentence this span falls in (nullable, derived) |
| `performance_data` | JSON | Sparse performance metadata (see §01); null on most spans |
| `speaker_confidence` | REAL | 0.0–1.0; null = human-assigned (always 1.0 implicit) |
| `speaker_basis` | TEXT | `explicit_source`, `inferred_from_context`, `studio_override`, etc. |
| `speaker_evidence` | JSON | Array of evidence quotes (from AI extraction) |
| `needs_review` | INT | Boolean flag — span needs human review |
| `review_reasons` | JSON | Array of reason strings |
| `locked` | INT | Boolean — human has confirmed, AI must not overwrite |
| `ai_suggested` | INT | Boolean — span was AI-seeded, not yet confirmed |

The existing `segment_order` stays but becomes secondary to `span_start/span_end` for
ownership. The v1→v2 migration: every existing sentence-segment gets `span_start/span_end`
derived from its position in the chapter text. Lossless.

### `characters` → **rich profiles**

New columns needed:

| Column | Type | Purpose |
|---|---|---|
| `display_name` | TEXT | Short display name (vs full `name`) |
| `role` | TEXT | `narrator`, `major_character`, `minor_character`, `background_character`, `group`, `unknown` |
| `character_type` | TEXT | `fictional_person`, `group`, `narrator`, `unknown` |
| `aliases` | JSON | Array of `{value, type, confidence}` — names, pronouns, descriptions the AI found |
| `source_presence` | JSON | `{first_seen: {paragraph_index, sentence_index}, speaking_count, mentioned_count}` |
| `source_profile` | JSON | Inferred traits: age, gender, accent, speech_style, personality_traits, physical_description, social_role — each with basis, confidence, evidence |
| `voice_guidance` | JSON | `{casting_notes, default_delivery, accent, avoid[]}` |
| `needs_review` | INT | Boolean |
| `review_reasons` | JSON | Array of reason strings |
| `locked` | INT | Boolean |
| `ai_suggested` | INT | Boolean — AI-seeded, not yet confirmed |

The existing `default_emotion` string becomes `voice_guidance.default_delivery.emotion`
(or is kept for legacy UI and deprecated in P2). The existing `color` column stays as the
UI paint color.

### No new tables needed for MVP

The `speakers` table (voice profiles metadata) stays as-is. Character→voice linking stays
via `speaker_profile_name`. A future pass can normalize this into a proper FK but it is
out of scope here.

---

## Migration notes

- **v1→v2 spans migration:** straightforward — copy each row, set `span_start/span_end`
  from the sentence's character offsets in `text_content`. Set `speaker_confidence = null`
  (human-assigned). Set `ai_suggested = 0`, `locked = 0`.
- **Characters migration:** add all new JSON columns as nullable. Existing rows keep their
  `default_emotion` and `color`; new columns are null until the AI extraction pass runs or
  human edits them.
- The `sub_sentence_speaker_assignment` plan describes the span-split endpoint and
  interaction with the render pipeline — that work consumes this schema.

---

## Invariants

- `locked = 1` spans/characters must never be overwritten by an AI pass, only by explicit
  human action.
- `ai_suggested = 1` entries are visually distinct in the UI (dashed underline, reduced
  opacity) until confirmed.
- Splitting a span is lossless: concatenating all spans in `span_start` order must
  reproduce the original `text_content` exactly.
- `performance_data` is null on most rows — the sparse model means unannotated spans
  render using the character's `voice_guidance.default_delivery` and engine defaults.
