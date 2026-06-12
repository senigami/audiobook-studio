# Plan 04 — Voice Metadata & Tagging

> **Status: READY FOR IMPLEMENTATION.**
> Supersedes the draft in `plans/v2_voice_metadata_and_casting.md` (which remains as
> background reading). Taxonomy source of truth: `plans/v2_voice_tag_taxonomy.md` v1.0.
> Schema source of truth: `docs/specs/voice.schema.json`. HF bundle shape:
> `plans/v2_huggingface_voice_repo_spec.md`.

Voices in the app today carry only operational fields (`name`, `id`, `engine`, `speaker_id`,
`speed`, etc.) — no structured attributes, no icon, no description, no tags. This plan adds
the full v1.0 metadata taxonomy to every voice so that (a) the Voice Lab looks and searches
like a real voice catalog, and (b) an AI or the in-app casting engine can read a character
brief and rank voices with defensible reasons without ever auto-assigning one.

---

## 1. Target schema

### 1.1 Extended `voice.json`

The canonical per-voice file (`voices/<Name>/voice.json`) grows from its current minimal
shape to the full bundle spec already defined in `docs/specs/voice.schema.json`. Nothing in
that schema is new; this plan makes existing profile data migrate into it.

**Full example** (the `gravel-road` demo voice from `docs/specs/voice-bundle-template/`):

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
    {
      "path": "samples/preview.mp3",
      "text": "The sun went down slow over the dry creek.",
      "primary": true
    }
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
    {
      "engine_id": "xtts",
      "asset_type": "xtts_latents",
      "path": "assets/xtts/",
      "min_engine_version": "2.0.0"
    }
  ],
  "provenance": {
    "source": "recorded",
    "author": "your-namespace",
    "consent_ack": true,
    "created_at": "2026-05-29T00:00:00Z"
  },
  "license": "cc-by-4.0"
}
```

### 1.2 `attributes` controlled vocabularies (v1.0 taxonomy)

The `attributes` object inside `voice.json` maps exactly to `plans/v2_voice_tag_taxonomy.md`.
Cardinality and valid values are enforced by `docs/specs/voice.schema.json`.

| Field | Cardinality | Valid values |
|---|---|---|
| `class` | one, **required** | `human` `synthetic` `creature` `character` `deity` |
| `gender` | one, **required** | `feminine` `masculine` `neutral` `ambiguous` `not-applicable` |
| `age` | one, **required** | `child` `teen` `young-adult` `adult` `middle-aged` `senior` `ageless` |
| `accent` | one, optional | `none` `us-general` `us-southern` `us-nyc` `us-midwest` `us-african-american` `british-rp` `british-cockney` `british-northern` `scottish` `irish` `welsh` `australian` `new-zealand` `canadian` `south-african` `indian` `caribbean` `european` `other` |
| `tone[]` | many, optional | `warm` `friendly` `calm` `soothing` `cheerful` `upbeat` `energetic` `confident` `authoritative` `professional` `serious` `somber` `dramatic` `intense` `epic` `mysterious` `menacing` `sinister` `playful` `quirky` `sarcastic` `deadpan` `gentle` `wise` `sensual` `melancholic` `heroic` `villainous` |
| `timbre[]` | many, optional | `deep` `low` `high-pitched` `bright` `rich` `resonant` `booming` `smooth` `velvety` `silky` `clear` `crisp` `soft` `breathy` `husky` `raspy` `gravelly` `gritty` `rough` `nasal` `thin` `light` `robotic` `distorted` |
| `pace` | one, optional | `slow` `measured` `moderate` `brisk` `fast` `variable` |
| `use_case[]` | many, optional | `audiobook` `narration` `character-dialogue` `storytelling` `documentary` `e-learning` `meditation` `news` `podcast` `advertising` `gaming` `animation` `assistant` `ivr` |
| `quality[]` | many, optional | `studio-quality` `clean` `denoised` `hi-fi` `phone-quality` `vintage` `multilingual` `expressive` `fast-inference` |

Top-level `tags[]` (free tags, taxonomy §2.11): lowercase-hyphenated freeform strings, e.g.
`cowboy`, `wizard`, `grandmother`. Unknown controlled-vocabulary values found during import
degrade to free tags rather than being dropped (taxonomy §5).

### 1.3 Fields not in today's files

| New field | Location | Notes |
|---|---|---|
| `spec`, `spec_version`, `taxonomy_version` | `voice.json` | Identity/version markers |
| `description` | `voice.json` | 1–3 sentence free text; primary AI casting signal |
| `image` | `voice.json` | Relative path to 1:1 icon (e.g. `icon.png`); uploaded via Voice Lab |
| `samples[]` | `voice.json` | Replaces `preview_audio`/`preview_text` in variant `profile.json` |
| `languages[]` | `voice.json` | BCP-47; first is primary; was previously absent at bundle level |
| `attributes` | `voice.json` | Full controlled-vocabulary block (all empty on migration) |
| `tags[]` | `voice.json` | Free tags; absorbs legacy `labels` field if present |
| `provenance` | `voice.json` | Source, author, consent flag |
| `license` | `voice.json` | SPDX string |

Operational per-variant fields (`engine`, `speaker_id`, `speed`, `reference_sample`,
`model`, `test_text`) remain in `voices/<Name>/<Variant>/profile.json` unchanged. Only
presentation/metadata moves to `voice.json`.

---

## 2. AI casting contract

### 2.1 The casting card (machine-readable voice serialization)

When the casting endpoint reads the catalog it serializes each voice to a compact
**casting card**. This is the exact JSON an AI sees to pick voices; it is also the
documented handoff format so a human can paste it into any LLM prompt.

Every casting card carries an explicit `card_version` (validated on read) so future card
formats can coexist with v1 readers post-release. v1 cards declare `"card_version": "1.0"`;
a reader that sees an unknown major version refuses to parse rather than guessing.

```json
{
  "card_version": "1.0",
  "voice_id": "gravel-road",
  "name": "Gravel Road",
  "languages": ["en-US"],
  "class": "human",
  "gender": "masculine",
  "age": "senior",
  "accent": "us-southern",
  "tone": ["authoritative", "somber"],
  "timbre": ["deep", "gravelly"],
  "pace": "measured",
  "use_case": ["audiobook", "narration", "character-dialogue"],
  "quality": ["studio-quality"],
  "tags": ["cowboy", "weathered", "rancher"],
  "description": "A weathered, low Southern drawl. Reads like an old ranch hand telling a hard story."
}
```

Fields that are absent or empty in a voice's `voice.json` are omitted from the card.
A voice with no attributes at all still participates in casting at lower confidence
(description-only matching).

### 2.2 Casting recommendation API

**Input** — a casting brief for one character:

```json
{
  "contract_version": "1.0",
  "character": {
    "name": "Sheriff Boone",
    "role": "protagonist",
    "description": "An aging frontier lawman, world-weary, speaks with authority.",
    "inferred_gender": "masculine",
    "inferred_age": "senior",
    "notes": "Southern USA setting"
  },
  "project_language": "en-US",
  "catalog": [ /* array of casting cards */ ],
  "limit": 5
}
```

**Output** — a ranked recommendation list, never a silent auto-apply:

```json
{
  "contract_version": "1.0",
  "character": "Sheriff Boone",
  "recommendations": [
    {
      "voice_id": "gravel-road",
      "score": 0.91,
      "reason": "Mature masculine Southern drawl matches an aging frontier lawman; authoritative tone fits the role."
    },
    {
      "voice_id": "vp_77c1",
      "score": 0.64,
      "reason": "Right age and gender but accent is UK RP, inconsistent with the Southern setting."
    }
  ],
  "needs_input": false
}
```

`needs_input: true` is returned when fewer than 2 voices pass the hard language filter,
signalling that the user must provide more voices before casting is meaningful.

### 2.3 Scoring rules

1. **Hard filters** (eliminate before scoring): `languages` must include `project_language`.
   Any explicit user-set "never use" constraints are also hard filters.
   > Note: `plans/v2_voice_tag_taxonomy.md` §4 labels `class` a "Hard filter (match character
   > type)". This plan deliberately treats `class` as a **strong score signal, not a hard
   > filter**, so a `human` voice can still be suggested for a stylized character at lower
   > rank. **RESOLVED — owner decision 2026-06-10: strong score, not hard filter.** Update
   > `plans/v2_voice_tag_taxonomy.md` §4 to match when executing this doc.
2. **Strong score**: `class`, `gender`, `age` match.
3. **Medium score**: `accent`, `tone[]`, `timbre[]` alignment with character description.
4. **Light score**: `pace`, `use_case[]`.
5. **Tie-breaker**: `quality[]`.
6. **Semantic fallback**: voices missing structured attributes are scored only on
   `description` text similarity (lower confidence ceiling of 0.5).

The casting output is a **suggestion only**. The UI presents ranked cards with reasons; the
user explicitly confirms a choice. Auto-assignment never occurs (mirrors "no silent
fallback" principle in `plans/v2_voice_system_interface.md` §8).

### 2.4 Decisions made

The items below resolve the open assumptions in `plans/v2_voice_metadata_and_casting.md`.
Each is a decision the owner can veto — flag any objections before implementation begins.

| # | Decision | Rationale |
|---|---|---|
| D1 | **`voice.json` is the metadata home; `profile.json` keeps only operational fields.** | Clean separation: bundle identity vs. engine config. No duplication. |
| D2 | **`languages[]` at the `voice.json` level drives hard filtering; variants inherit it.** Variants may add per-variant language overrides in future but do not do so at v1. | Avoids per-variant language proliferation at release. Revisit for multilingual voices post-release. |
| D3 | **One language per project for v1 casting.** The `project_language` field is a single BCP-47 string. Multi-language project support is post-release. | Keeps casting scope tractable for release. |
| D4 | **In-app "Suggest voices" casting ships at release as a best-effort feature.** The contract (cards + recommendation JSON) ships regardless. If the in-app endpoint is blocked by time, the contract still enables AI-handoff mode (user pastes cards into ChatGPT). | Owner wanted the contract regardless; in-app is high-value and not architecturally complex. |
| D5 | **`score` is a normalized float 0–1, not a percentage.** Avoids false precision in the UI. | Simpler and consistent with other ranking UIs. |
| D6 | **Legacy `labels` field is migrated into `tags[]` during the migration step.** `labels` is dropped from the schema. | `tags[]` is the going-forward field per the taxonomy. |
| D8 | **The on-disk `voices/<Name>/voice.json` and the exportable bundle `voice.json` are the SAME file and SAME schema.** Operational fields that exist today but are not in the schema (`version`, `default_variant`) are either dropped (`version`) or moved out of `voice.json` (`default_variant` → wherever variant selection is persisted, e.g. a sibling operational file or the variant `profile.json`). The schema's `additionalProperties: false` forbids keeping them in `voice.json`. | Keeps one source of truth and lets local voices export without transformation. **RESOLVED — owner deferred to plan judgment (2026-06-10): proceed as written.** Concrete placement: move `default_variant` into a sibling operational file `voices/<Name>/state.json` (Studio-managed, never exported, not schema-validated) rather than into per-variant `profile.json` — a "which variant is default" pointer is voice-level state, not variant config, and a sibling file keeps `voice.json` byte-identical between disk and bundle. Drop `version` (superseded by `spec_version`). |
| D7 | **Migration omits the `attributes` block entirely** (does not write `class`/`gender`/`age`), and marks the voice `untagged` in the UI until a human tags it. The strict schema makes `attributes` (and `class`/`gender`/`age` within it) **required**, so a migrated file does **not** pass strict validation — see the validation-mode note in §3 Phase B. No `"unknown"` placeholder is written, because the taxonomy has no `unknown` value and inventing one would pollute the controlled vocabulary. | Forcing `class: "human"` would be wrong for non-human voices; guessing gender/age is worse. Letting users tag at their own pace is safer. **RESOLVED — owner decision 2026-06-10: omit (null/absent), no `"unknown"` placeholder.** Consequences the implementation MUST honor: (a) untagged voices cannot influence attribute filtering/scoring until tagged — they fall to the semantic-fallback path (rule 6) only; (b) the voice card shows a **warning icon** indicating missing required fields; (c) the voice **edit form requires** the schema-required attribute fields (`class`, `gender`, `age`) before save — saving an edit is the moment a voice becomes strict-valid. |

---

## 3. Implementation steps

### Phase A — Schema & validation

- [ ] **A1. Confirm `docs/specs/voice.schema.json` is current.**
  The file already reflects the full spec. Verify `"required": ["spec","spec_version","id","name","image","samples","languages","attributes"]` and the `attributes` block matches taxonomy v1.0 exactly.
  _Acceptance: `python -m jsonschema --instance docs/specs/voice-bundle-template/voice.json --schema docs/specs/voice.schema.json` exits 0._

- [ ] **A2. Add schema validation to the backend voice loader.**
  On load of any `voice.json`, validate against `docs/specs/voice.schema.json`. **The loader
  must NOT hard-fail on schema errors** — the canonical schema is strict
  (`additionalProperties: false`, enum-constrained, `attributes`/`class`/`gender`/`age`
  required), so migrated and partially-tagged voices will not pass it. The loader validates,
  logs warnings, and degrades: unknown enum values for controlled attribute fields are
  dropped from `attributes` and re-added to `tags[]` (taxonomy §5); a missing `attributes`
  block marks the voice `untagged`. Strict validation (exit-0 required) is reserved for the
  **export/bundle** path (Phase E), where a complete voice is the contract.
  _Acceptance: loading a `voice.json` with `"class": "alien"` (invalid) logs a warning, the
  voice still loads, and `"alien"` appears as a free tag rather than a `class` value._

- [ ] **A3. Add `taxonomy_version` reader.**
  Backend stores `taxonomy_version` alongside the voice record. Unknown taxonomy versions (> 1.x) are accepted with a warning banner in Voice Lab settings.
  _Acceptance: voice with `taxonomy_version: "2.0"` loads, all attributes present in v1.0 are recognized, any new ones are surfaced as free tags._

### Phase B — Migration of existing voices

- [ ] **B1. Write migration script `scripts/migrate_voices_to_v1_schema.py`.**
  For each `voices/<Name>/voice.json`:
  - Add `"spec": "audiobook-studio-voice"`, `"spec_version": "1.0"`, `"taxonomy_version": "1.0"`.
  - The current files carry an integer `"version": 2` (the v1→v2 data-format marker). This is
    NOT the bundle `spec_version`. Drop the integer `version` field after migration — the
    bundle schema does not define it (`additionalProperties: false` would reject it) and
    `spec_version` is the going-forward version marker. Keep the v1→v2 data migration that
    produced `version: 2` separate from this bundle migration.
  - Preserve existing `name`, `id` (today's `id` is a UUID, which still matches the schema
    `id` pattern `^[a-z0-9][a-z0-9-]*$`).
  - Preserve `default_variant`? No — it is operational; ensure it remains tracked wherever
    variant selection lives. It is not part of the bundle `voice.json` schema. Confirm the
    variant-selection code does not solely depend on a field the schema would strip.
  - Copy `preview_audio` from any variant `profile.json` into `samples[]` (mark `primary: true` for the default variant's sample).
  - Migrate `labels[]` → `tags[]`, drop `labels`.
  - Leave `attributes` absent (voice shows as "untagged" in Voice Lab).
  - Leave `image` absent (voice shows placeholder icon).
  > Migrated files intentionally omit the schema-required `attributes` and `image`, so they
  > do **not** pass strict `voice.schema.json` validation. The backend loader (A2) accepts
  > them via lenient/degrading validation; strict validation only gates the export path (E1).
  > The real on-disk shape today is minimal — `voice.json` has `{version, name, id,
  > default_variant}` and per-variant `profile.json` has `{variant_name, engine, speaker_id}`
  > — so there is no `preview_audio`/`labels` to migrate on current voices; treat those
  > copy/migrate steps as conditional (only act if the field is present).
  _Acceptance: script runs without error on all voices in `voices/`; each output loads in the
  Voice Lab via the lenient loader and shows the "untagged" badge. (Strict
  `python -m jsonschema` is expected to FAIL on migrated files until a human tags them — that
  is by design, not a regression.)_

- [ ] **B2. Add "untagged" badge to Voice Lab cards.**
  Voices where `attributes` is absent show a subtle "Not tagged" chip. The chip links to the tag editor.
  _Acceptance: migrated voice shows chip; fully tagged voice does not._

### Phase C — Backend endpoints

- [ ] **C1. `GET /api/voices` — return full metadata including `attributes` and `tags`.**
  _Acceptance: response includes `attributes`, `tags`, `description`, `languages`, `image` fields for each voice._

- [ ] **C2. `PATCH /api/voices/{id}/metadata` — update `description`, `image` path, `attributes`, `tags`.**
  Validate `attributes` values against the controlled vocabulary. Unknown values rejected with 422 + field-level error.
  _Acceptance: PATCH with `{"attributes": {"class": "alien"}}` returns 422; PATCH with `{"attributes": {"class": "creature"}}` returns 200 and persists._

- [ ] **C3. `GET /api/voices/search?q=…&class=…&gender=…&age=…&accent=…&tone=…&timbre=…&use_case=…&tag=…` — filter by any combination of attributes and free tags.**
  `q` is a free-text search over `name`, `description`, and `tags[]`. Other params are exact-match filters. Multiple values for array fields are OR-within-field, AND-across-fields.
  _Acceptance: `?class=creature&tone=menacing` returns only voices that have `class=creature` AND `tone` array includes `menacing`._

- [ ] **C4. `POST /api/voices/cast` — casting recommendation endpoint.**
  Input: casting brief (§2.2), which declares `contract_version`. Output: ranked
  recommendation list (§2.2) echoing `contract_version`. Validate `contract_version` on
  receipt: reject an unknown major version with 422 rather than mis-parsing. Cards in
  `catalog[]` declare `card_version`; reject unknown card major versions. Engine-blind:
  operates only on `voice.json` metadata.
  _Acceptance: brief for "elderly southern male lawman" returns Gravel Road as rank 1 when the test catalog contains the demo voice and at least one mismatched voice._

- [ ] **C5. `POST /api/voices/{id}/icon` — icon upload.**
  Accepts multipart image, enforces 1:1 aspect ratio (crop or reject), saves as `voices/<Name>/icon.png`, updates `image` field in `voice.json`.
  _Acceptance: upload a 512×512 PNG → file saved, `voice.json` updated, `GET /api/voices/{id}` returns `image: "icon.png"`._

- [ ] **C6 (owner direction, 2026-06-12). Copyable icon image prompt.** Beside the icon upload, generate a copy-to-clipboard image-generation prompt from the voice's attributes + description (e.g. "Portrait icon, 1:1, soft studio lighting: an elderly female character voice — warm, measured narrator with a slight rasp…"), with a fixed style preamble so user-generated icons stay relatively uniform across the catalog. Pure frontend string templating — no API call, no image generation in Studio. Mocked conceptually in styleguide U8.

### Phase D — Frontend (AI Voice Lab)

These items are the open Phase 12 items for voice tags/icons. Implement after Phase C.

- [ ] **D1. Tag editor panel in Voice Lab voice detail view.**
  Attribute selectors (dropdowns for one-required fields, multi-chip selects for many-optional fields). Free-tag input with autocomplete from existing tags in the catalog.
  _Acceptance: user can set `class`, `gender`, `age`, and at least one `tone` tag on a voice and save; changes persist in `voice.json` and are immediately reflected in search._

- [ ] **D2. Icon upload in Voice Lab.**
  1:1 image upload with crop UI (or error if non-square). Shows placeholder avatar when absent.
  _Acceptance: upload a landscape image → user sees crop UI; accept crop → `icon.png` saved and displayed on the voice card._

- [ ] **D3. Searchable tag chips in Voice Lab voice list.**
  Search bar filters by `name`, `description`, and `tags[]`. Attribute filter pills (class, gender, age, use_case) above or beside the voice list.
  _Acceptance: typing "cowboy" into the search bar shows only voices with that free tag or the word in description/name._

- [ ] **D4. "Suggest voices for this character" action in chapter editor.**
  In the character assignment panel, a "Suggest voices" button calls `POST /api/voices/cast` with the character's inferred attributes and shows ranked cards with reasons. User clicks a card to confirm. No auto-assignment.
  _Acceptance: clicking "Suggest voices" for a character shows at least one ranked result with a one-line reason; confirming a selection assigns the voice to the character._

### Phase E — HF bundle alignment

- [ ] **E1. Ensure `Export voice bundle` produces a `voice.json` that passes schema validation.**
  The export generator already targets the bundle spec. Confirm it writes `spec`, `spec_version`, `taxonomy_version`, and all attribute fields correctly.
  _Acceptance: export a tagged voice → unzip → `python -m jsonschema` on the `voice.json` exits 0._

- [ ] **E2. HF README generator writes `as-*` tags.**
  The HF card generator reads `attributes` and emits the namespaced HF tags (`as-class-human`, `as-gender-masculine`, etc.) per taxonomy §HF tag mapping.
  _Acceptance: exported README.md YAML frontmatter includes `tags: [audiobook-studio-voice, as-class-human, as-gender-masculine, …]` for a tagged voice._

- [ ] **E3. Import from HF (`voice.json` import) validates and stores attributes.**
  Importing a bundle from HF or from a `.asvoice.zip` runs the same schema validation as local load. Attributes stored as-is.
  _Acceptance: import the demo `gravel-road` bundle → voice appears in Voice Lab with all attributes pre-populated._

### Phase F — Docs

- [x] **F1. Update `docs/user-guide/voice-tags-icons.md` (Phase 12 stub) with the tag taxonomy table, icon requirements, and a walkthrough of the tag editor.**
  _Done 2026-06-12. Created `docs/user-guide/voice-tags-icons.md` with the full taxonomy table (from `docs/specs/voice-taxonomy.json`), icon upload requirements (1:1, PNG-normalized, 422 on non-square), and a step-by-step walkthrough of the NarratorCard "Not tagged" badge, Edit Metadata modal, attribute selects, free tags, and icon crop flow._

- [x] **F2. Update `docs/specs/voice.schema.json` docstring/description fields if any cardinalities were clarified during implementation.**
  _Done 2026-06-12. Reviewed all `description` fields in `voice.schema.json`. No stale descriptions found. D8 (default_variant lives in state.json, not voice.json) is already reflected by the schema having `additionalProperties: false` and no `default_variant` property. The use_case HF alias (as-use-*) is an exporter concern, not a schema description concern. No changes needed._

- [x] **F3. Update `Memory/state.json` Phase 12 open items to mark voice tags, icon upload, and searchable tags as complete when each Phase D step is done.**
  _N/A 2026-06-12. `Memory/` is gitignored and absent in this working tree (see CLAUDE.md: "Don't assume it exists"). Cannot update a file that does not exist in the repo._

### Phase G — Taxonomy v2 (RE-OPENED into 2.0 scope — owner, 2026-06-12)

*The owner's original ask included these categories; they were missed in the v1.0 taxonomy. This re-opens the voice schema for 2.0 and RE-BLOCKS Pinokio PK7 (demo bundle) until it lands. Additive only: v1.0 voices stay valid; new fields optional in the lenient path, with the same strict-on-edit rule as D7.*

- [ ] **G1. Taxonomy v2 vocabularies** in `docs/specs/voice-taxonomy.json` (version bump + changelog):
  - `language` — multi-value (bilingual voices), BCP-47-ish friendly names (start: english, spanish, french, german, …; extensible).
  - `accent` — single-value (british, american, australian, irish, scottish, southern-us, …).
  - `style` — **multi-value**: conversational, narration, characters, social media, educational, advertisement, entertainment.
- [ ] **G2. Schema + validation**: `voice.schema.json` gains the three optional attribute fields (multi = arrays); `validate_and_degrade_attributes` handles them (invalid values → tags, per D7); migration untouched (fields optional).
- [ ] **G3. API + casting**: metadata PATCH accepts them with strict 422s + valid-values payload; search/cast filtering extends to the new fields (multi-value = any-match); casting card serializes them.
- [ ] **G4. UI**: Edit Metadata modal gains the three fields (style/language as multi-select chips); catalog cards render category-tinted pills in fixed order (class · gender · age · extended · tags) with the +N tap-to-expand overflow — visual spec mocked + approved in styleguide U8 (2026-06-12). Pill tints: class/gender/age distinct hues; extended shares one hue; free tags neutral ghost.
  - Pill color decision (owner, 2026-06-12): Apple-style muted tinted fills + same-hue text/low-alpha border — NOT colored outlines on neutral fill; no leading icons.
- [ ] **G5. HF bundles**: README generator emits `as-language-*`, `as-accent-*`, `as-style-*` tags; export gate accepts v2 fields.
- [ ] **G6. Docs**: taxonomy table in `docs/user-guide/voice-tags-icons.md` + wiki updated; spec changelog rows.

---

## 4. References

- `plans/v2_voice_tag_taxonomy.md` — taxonomy v1.0 (source of truth)
- `plans/v2_voice_metadata_and_casting.md` — original draft (background reading)
- `docs/specs/voice.schema.json` — schema (source of truth)
- `docs/specs/voice-bundle-template/voice.json` — canonical example
- `plans/v2_huggingface_voice_repo_spec.md` — HF bundle shape
- `plans/v2_voice_system_interface.md` — "no silent fallback" principle
