# Voice Tags and Icons

Every voice in the AI Voice Lab can carry structured metadata: controlled-vocabulary
attributes, free-form tags, and a square icon image. This metadata powers catalog search,
facet filtering, and the AI casting assistant that suggests voices for characters.

---

## Tag taxonomy

Attributes come from a fixed taxonomy (`design-docs/specs/voice-taxonomy.json`, v1.0). The table
below lists each field, its cardinality, and the accepted values.

| Field | Cardinality | Accepted values |
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

`class`, `gender`, and `age` are required for a voice to be considered fully tagged and
to participate in AI casting with full confidence. A voice that is missing any of these
three shows a **"Not tagged"** badge on its NarratorCard and is excluded from attribute
filtering until it is tagged.

In addition to controlled attributes, `tags[]` holds any number of free-form strings such
as `cowboy`, `wizard`, or `grandmother`. Free tags follow the pattern `^[a-z0-9][a-z0-9-]*$`
(lowercase, hyphen-separated). If a value that belongs to a controlled field (for example
`class`) is not a recognized enum value, the loader demotes it to a free tag rather than
dropping it, so no data is lost on import.

The `use_case` field maps to HF bundle tags with the prefix `as-use-`, for example
`audiobook` becomes `as-use-audiobook` in the exported README YAML front-matter.

---

## Icon requirements

Each voice can have a square cover image stored as `icon.png` in the voice folder. The
server enforces these rules on upload:

- **Format:** PNG (the server normalizes other common formats to PNG on save).
- **Aspect ratio:** exactly 1:1. Uploads that are not square return HTTP 422. The Voice Lab
  upload UI shows a crop step before sending.
- **Recommended size:** 512x512 px minimum; the Voice Lab displays at 64x64 and 128x128.

The `image` field in `voice.json` holds the relative path, typically `"icon.png"`. If the
field is absent or the file is missing, the Voice Lab shows a placeholder avatar.

---

## Tagging a voice: step-by-step walkthrough

### Spotting an untagged voice

When a voice is missing `class`, `gender`, or `age`, its NarratorCard shows a small
**"Not tagged"** chip below the voice name. Clicking the chip opens the Edit Metadata
modal directly.

### Opening the editor

1. Expand the voice card in the AI Voice Lab.
2. Open the kebab menu (three-dot icon, top-right of the card header).
3. Select **Edit Metadata**.

The Edit Metadata modal has three sections: **Description**, **Attributes**, and
**Free tags**.

### Filling in attributes

- **Class, Gender, Age** are dropdown selects. All three are required before you can save.
  The save button stays disabled until all three have a value.
- **Accent, Pace** are single-select dropdowns (optional).
- **Tone, Timbre, Use case, Quality** are multi-chip selects. Click a chip to toggle it on
  or off. You can select as many as apply.

### Adding free tags

The **Free tags** field accepts comma-separated or space-separated lowercase words. Tags
autocomplete from values already used elsewhere in your catalog. Press Enter or comma to
confirm a tag. Tags that contain uppercase letters or spaces are normalized automatically
(converted to lowercase, spaces replaced with hyphens).

### Uploading an icon

1. Click the avatar placeholder or the **Upload icon** button in the modal.
2. If the image is not square, a crop dialog appears. Drag to frame the crop area and click
   **Accept**.
3. Click **Save** to write `icon.png` to the voice folder and update `voice.json`.

### Saving

Click **Save**. The modal closes and the Voice Lab card updates immediately. The "Not
tagged" chip disappears once all three required attributes (`class`, `gender`, `age`) are
set.

---

## Search and filtering

The Voice Lab search bar filters by `name`, `description`, and `tags[]` simultaneously.
Attribute filter pills above the voice list let you narrow by `class`, `gender`, `age`,
and `use_case`. Multiple values within one field are treated as OR; values across different
fields are treated as AND. Voices that have no attributes set still appear in unfiltered
views but are excluded when any attribute filter is active.

---

## AI casting

When you open the character assignment panel in the chapter editor and click **Suggest
voices**, Studio calls the casting endpoint with the character's inferred attributes and
returns a ranked list of voices with one-line reasons. Voices that are fully tagged rank
higher because the scoring engine can match `class`, `gender`, `age`, `accent`, and `tone`
directly. Untagged voices fall back to description-text similarity and have a lower
confidence ceiling. No voice is ever assigned automatically; you click a card to confirm
the choice.
