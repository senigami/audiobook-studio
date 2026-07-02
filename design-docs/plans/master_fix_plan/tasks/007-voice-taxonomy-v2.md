# 007 — Voice taxonomy v2 (Phase G) (W6)

**Status: NOT STARTED**

*(SCOPE NARROWED 2026-07-01: `accent` (single, one-optional, 20 values incl. "none") already exists
in voice-taxonomy.json/voice.schema.json at version 1.0. Remaining: `language` (controlled
multi-select — distinct from the existing top-level BCP-47 `languages` array) + `style` (multi).
Note `VoiceProfileModel` (`app/domain/voices/models.py:22-26`) has NONE of the G1-G3 fields —
taxonomy lives in the JSON bundle layer.)*

**Goal:** extend the voice taxonomy with v2 attributes and the matching UI; it re-blocks the demo
bundle refresh.
**Authoritative source:** [`final_release/04_voice_metadata_and_tagging.md`](../../active/final_release/04_voice_metadata_and_tagging.md)
Phase G (also tracked in `phase_12_polish_and_cleanup.md` 06-15 and `master_agnostic_tasks.md`).

**Open items (Phase G):**
- New attributes: **language** (multi-select), **accent** (single), **style** (multi).
- UI: category-**tinted pills + "+N" overflow** (this is `final_release/10` **U8** — do it here).
- HF tag mappings (`as-<section>-<id>`) for the new attributes.
- Bump `voice-taxonomy.json` + `voice.schema.json` (`taxonomy_version`); unknown values degrade to
  free tags.

**Map links:** W6. **Unblocks** W12 PK7 (demo bundle 2.0 refresh) → release. Absorbs U8 from W7.
Honors INV-1 (`voice-bundles.md` §8 + `voice-taxonomy.json`), INV-7 (pill tints are tokens).
**Dependencies:** none hard; should precede 011 PK7.
**Acceptance:** taxonomy validates; pills render in both themes; export/import round-trips new tags;
`voice-bundles.md` + `voice.schema.json` + `voice-taxonomy.json` bumped with changelog.
**Out of scope:** in-app HF browse/upload UI and AI casting suggestions (those are `v2_huggingface_voice_interface`
/ `v2_voice_metadata_and_casting` unconfirmed items — track as post-v2 backlog in 012).
