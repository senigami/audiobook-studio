# Voice, Casting, And Profile Workflows

Source: voice pages, Voice Lab, metadata editor, per-voice settings, and casting code.

## 1. Voice catalog browsing and card actions

- Approx clicks: 4-9
- Complexity: medium
- Path: open Voices, switch tabs, filter, then use card actions or expanded variants
- Pain points:
  - Actions are split across header controls, card menus, and expanded variant rows.
  - Primary and secondary actions are mixed together.
  - There is no single dominant "manage voice" path.

## 2. Voice Lab detail workflow

- Approx clicks: 5-10
- Complexity: high
- Path: open a voice detail page, edit metadata, manage samples and variants, run a test, export
- Pain points:
  - Common tasks are spread vertically, so scrolling cost is high.
  - Header, body, and footer all contain management actions.
  - The page still carries planned or placeholder affordances.

## 3. Voice metadata and profile editor

- Approx clicks: 3-6
- Complexity: medium
- Path: open Edit metadata, change icon/tags/attributes, save or cancel
- Pain points:
  - The editor is a separate modal from both catalog and Voice Lab.
  - Required-field gating adds friction for partially tagged voices.
  - Metadata editing is duplicated in multiple places.

## 4. Per-voice settings and preview script

- Approx clicks: 5-9
- Complexity: high
- Path: expand a voice variant, open the settings drawer, edit engine/plugin fields, save or preview
- Pain points:
  - The path is nested: card expansion, then drawer, then form.
  - Engine-specific fields change the form shape.
  - Saving can trigger side effects like variant rename.

## 5. Casting in Studio

- Approx clicks: 4-11
- Complexity: high
- Path: open Studio, pick a chapter, switch view modes, assign cast members, resolve conflicts
- Pain points:
  - Narrator override, character selection, and variant choice are split apart.
  - The palette requires understanding chapter-local, book-wide, and global cast states.
  - Full casting is only complete after switching into Script view.

## Recommendation

- Collapse the catalog, expanded editor, Voice Lab, and metadata modal into one clearer voice-management path.
- Pull the common actions out of overflow menus.
- Keep per-voice settings grouped by purpose and engine capability.
- Surface active casting choices closer to the cast row.

