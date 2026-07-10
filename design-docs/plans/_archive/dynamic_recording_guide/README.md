# Dynamic Recording Guide — taxonomy-driven recording-prompt suggestions

Adds a "Suggest from voice qualities" action to the voice-profile Script Editor: given the voice's selected taxonomy tags (Class/Gender/Age/Tone/Timbre/Pace), suggest a recording prompt that captures the intended vocal nuance — matching one of 39 curated archetypes when the selection is close, or composing a fallback from a new tone/timbre phrase-fragment dictionary otherwise. The user can still edit the suggestion before saving; this augments `test_text`, it does not replace the free-text field.

## Why this plan exists

The owner's stated end goal (from the original voice-archetype spreadsheet request): *"my ultimate goal is to make a recording guide so that when the user selects the voice qualities it can dynamically adapt the recording prompts to capture the nuances of speech."* `design-docs/reference/voice-archetypes/` (39 rows, CSV+JSON) is the curated half of that; this plan is the dynamic half.

## Key findings from research (use directly, don't re-derive)

- `test_text` is **not a SQL column** — it's a key in a per-profile `profile.json`, read/written via `app/db/speakers.py`'s `get_speaker_settings()`/`update_speaker_settings()`. No backend schema change is needed for this feature.
- It is used **purely for audio preview generation** (`POST /api/speaker-profiles/{name}/test` → `SampleTestTask` → `bridge.synthesize`) — never as voice-clone training data. Low risk to suggest/overwrite via a UI action; nothing downstream depends on its exact history.
- The taxonomy attributes (`class`/`gender`/`age`/`tone[]`/`timbre[]`/`pace`) live on a **separate entity**, `VoiceMetadata` (`frontend/src/types/index.ts:303-320`, keyed by `id`), edited via a metadata modal and fetched from `GET /api/voices/`. `SpeakerProfile` (`test_text`'s owner, keyed by `name`) has **no `attributes` field**.
- **The join between them already exists** — `frontend/src/pages/Voices/VoicesPage.tsx:81-83` builds `voiceMetadataMap: Map<string, VoiceMetadata>` from `voiceMetadataList`, with an id-first/name-fallback lookup pattern already in use at lines 118-119. This plan's wiring task threads that existing map down to where `test_text` is edited — it does not invent a new linkage.
- `test_text`'s edit surface is `frontend/src/pages/Voices/components/ScriptEditor.tsx` (a "PREVIEW TEXT SCRIPT" textarea, already has a "Reset to Default" button) — mounted from `frontend/src/components/VoicesModals.tsx:163`, itself rendered from `frontend/src/pages/Voices/VoicesPage.tsx:225`. **`voiceMetadataMap` is not currently passed to `VoicesModals`** (confirmed by reading its full prop list) — this is real, net-new prop-threading, not a trivial pass-through.
- The established pattern for combining taxonomy tags into generated text already exists: `frontend/src/pages/VoiceLab/iconPrompt.ts`'s `buildIconPrompt()` (pure function, fixed-order core attrs + alphabetical extended attrs + tags, joined with `', '`). This plan's suggestion function follows the same shape (pure, client-only, no API call).

## Scope

**In scope:** a new pure suggestion function, a new small content-authoring task (tone/timbre phrase fragments), wiring a "Suggest" button into `ScriptEditor.tsx`, threading `VoiceMetadata` into the modal chain that currently lacks it.

**Out of scope:** any backend/schema change (none needed), replacing/removing the free-text `test_text` field, changing the archetype-matching logic used elsewhere (there is none — this is new), the VoiceLab `TestSection.tsx` ephemeral test-text input (lower value, a possible follow-on, not required for the core feature).

## How to read this folder

| File | Purpose |
|---|---|
| `00-overview.md` | Task, scope, success criteria |
| `01-map.md` | Parts, connections, contracts, invariants |
| `02-roadmap.md` | Ordered tasks, dependency graph |
| `tasks/NNN-*.md` | Self-contained task files |

## Status protocol

Whoever executes a task updates its `Status:` line and ticks its checkboxes in the same change as the work. When all tasks are complete, move this folder to `design-docs/plans/_archive/dynamic_recording_guide/` and update `design-docs/plans/TASKS.md`.
