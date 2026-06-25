# Proposal: Rich Voice Metadata & AI-Assisted Casting (Studio 2.0)

> **Status: DRAFT for review.** No spec for this existed in `design-docs/plans/` before now. This
> document proposes the data model and behavior; it makes assumptions (flagged with
> _Assumption_) that need Steven's sign-off before any implementation. Doc-only.

The goal is to make a Studio voice feel like an ElevenLabs-style library entry — an icon,
a human-readable description, and structured attributes — and to make that metadata
**rich and structured enough that an AI can read a character and pick the right voice for
it automatically.**

## 1. Objectives

- Give every voice profile presentation metadata (icon, short blurb, tags) so the Voice
  Lab and pickers look and search like a real voice catalog.
- Add **structured, machine-readable attributes** (gender, age band, accent, timbre,
  use-case, language) alongside a **free-text description**.
- Define a **casting contract**: given a character description, an assistant can score and
  recommend voices from the catalog with a defensible reason.
- Keep all of this **engine-agnostic** — metadata lives on the canonical `VoiceProfile`,
  never on engine-specific `VoiceAsset`s.

## 2. Relationship to existing plans

- Extends the `VoiceProfile` entity in `design-docs/plans/implementation/domain_data_model.md`
  (today: `id, name, default_engine_id, capabilities, labels, …`).
- Feeds the handbook's planned `user-guide/voice-tags-icons` page (1:1 icon, tags,
  search/filter) — currently a Phase-12 stub with no backing spec.
- Consumes character assignment from `design-docs/plans/v2_chapter_editor_workflow.md`
  ("Character assignment", "character-level mappings", suggestion-first detection). AI
  casting is the natural extension of that suggestion flow.
- Metadata must survive `Issue #38/#39` portable voice bundles — it is part of the
  exported voice identity, not an engine asset.

## 3. Data model

### 3.1 `VoiceProfile` additions

Extend the canonical profile (all optional except where noted; absence is allowed and
must degrade gracefully):

| Field | Type | Notes |
| --- | --- | --- |
| `icon_path` | str? | 1:1 image stored as a library asset; thumbnailed for cards. |
| `description` | str? | Free-text, 1–3 sentences. The primary input for AI casting. |
| `attributes` | `VoiceAttributes` | Structured, controlled-vocabulary fields (below). |
| `tags` | str[] | Free folksonomy tags for search/filter (supersedes raw `labels`). |
| `sample_text` | str? | Default preview text for this voice. |
| `preview_asset_ref` | str? | A cached representative preview clip (engine-neutral pointer). |
| `provenance` | `VoiceProvenance` | Where it came from (recorded / cloned / imported — see HF doc). |
| `language_primary` | str | BCP-47, e.g. `en-US`. Required for casting/filtering. |
| `languages_supported` | str[] | Additional languages this voice handles. |
| `visibility` | enum | `library` \| `project` \| `archived`. |

### 3.2 `VoiceAttributes` (controlled vocabularies)

**The controlled vocabulary is owned by `design-docs/plans/v2_voice_tag_taxonomy.md`** — that spec is
the single source of truth for every section, value, and cardinality rule. `VoiceAttributes`
is its structured form:

- `class` (one, required) — human / synthetic / creature / character / deity
- `gender` (one, required) — feminine / masculine / neutral / ambiguous / not-applicable
- `age` (one, required) — child / teen / young-adult / adult / middle-aged / senior / ageless
- `accent` (one, optional) — controlled list (see taxonomy §2.5)
- `tone` (many, optional), `timbre` (many, optional), `pace` (one, optional),
  `use_case` (many, optional), `quality` (many, optional)

Languages live in `languages` (BCP-47); free nuance goes in `description`/`tags`. The
vocabulary is versioned via `taxonomy_version`; unknown values degrade to free tags.

## 4. The casting contract

This is the part that must be "thorough enough that an AI could read the descriptions and
determine which voice is appropriate for a character."

### 4.1 Inputs

- **Character profile** — from the editor's character detection / a character sheet:
  `{ name, role (narrator|protagonist|…), description, inferred_gender?, inferred_age?,
  notes }`.
- **Voice catalog** — the project-visible voices, each serialized to a compact
  **casting card**: `name + attributes + tags + description + language`.

### 4.2 The casting card (machine-readable serialization)

A deterministic, token-frugal representation the assistant reads. Example:

```json
{
  "voice_id": "vp_0d3a",
  "name": "Gravel Road",
  "language": "en-US",
  "class": "human",
  "gender": "masculine",
  "age": "senior",
  "accent": "us-southern",
  "timbre": ["deep", "gravelly"],
  "tone": ["authoritative", "somber"],
  "use_case": ["audiobook", "narration", "character-dialogue"],
  "tags": ["weathered", "cowboy", "rancher"],
  "description": "A weathered, low Southern drawl. Reads like an old ranch hand telling a hard story."
}
```

### 4.3 Output

A ranked recommendation, never a silent auto-apply:

```json
{
  "character": "Sheriff Boone",
  "recommendations": [
    { "voice_id": "vp_0d3a", "score": 0.91,
      "reason": "Mature masculine Southern drawl matches an aging frontier lawman; authoritative tone fits the role." },
    { "voice_id": "vp_77c1", "score": 0.64, "reason": "Right age and gender but accent is UK RP." }
  ],
  "needs_input": false
}
```

### 4.4 Rules

- **Recommend, don't auto-cast.** Output is a suggestion the user accepts, consistent with
  the editor's suggestion-first character detection. (Mirrors the "no silent fallback"
  principle in `v2_voice_system_interface.md` §8.)
- **Explain every pick.** Each recommendation carries a one-line `reason` so the choice is
  auditable.
- **Hard filters before soft scoring.** Language compatibility and explicit user
  constraints are filters; everything else is weighted scoring.
- **Degrade gracefully.** Voices missing structured attributes fall back to
  description-only matching, with a lower confidence.
- **Engine-blind.** Casting operates on `VoiceProfile` metadata only; asset/engine
  resolution happens afterward through the existing Voice Bridge.

## 5. UX surface (Voice Lab)

- Voice cards show icon, name, a few attribute chips, and tags (the `voice-tags-icons`
  handbook page documents this).
- Search/filter by attribute and tag.
- An edit panel for icon upload (1:1 enforced/cropped), description, and attribute
  selectors.
- A "Suggest voices for this character" action in the editor that calls the casting
  contract and shows ranked cards with reasons.

## 6. Decisions & remaining questions

Decided:
- **Casting is both handoff and in-app.** The casting-card + recommendation JSON is a
  documented, AI-handoff-ready contract (per the handbook style guide); Studio also offers
  an in-app "Suggest voices" convenience that uses it.
- **Vocabulary** is owned and versioned by `design-docs/plans/v2_voice_tag_taxonomy.md` (locked v1.0,
  extensible via minor bumps).
- **`tags`** (the taxonomy's Free tags) is the going-forward field; the legacy `labels`
  field is migrated into it.

Still open (minor):
1. Per-character multi-language handling, or one language per project for v1?
2. Whether in-app casting ships at release or follows as a fast-follow (the contract ships
   regardless).

## 7. References

- `design-docs/plans/v2_voice_tag_taxonomy.md` (attribute/tag source of truth)
- `design-docs/plans/v2_huggingface_voice_repo_spec.md` (bundle shape)
- `design-docs/plans/v2_voice_system_interface.md`
- `design-docs/plans/implementation/domain_data_model.md`
- `design-docs/plans/v2_chapter_editor_workflow.md`
- `design-docs/plans/v2_huggingface_voice_interface.md` (sibling proposal — voice sourcing)
