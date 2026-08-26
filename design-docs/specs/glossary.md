# SP18 — Terminology Glossary

```
spec_version: 1.1.0
status: active
updated: 2026-08-26
created: 2026-08-26
sources:
  - design-docs/specs/text-processing.md
  - design-docs/specs/progress-presentation.md
  - design-docs/plans/active/parallel-segment-rendering/00-overview.md
  - app/domain/chunk_groups.py
  - frontend/src/pages/ChapterEditor/components/ScriptView.tsx
  - frontend/src/demo/stages/siteMockup/panes/studio.tsx
```

> **TL;DR:** "segment" is used in this codebase for two different things at two different
> layers, and that collision is the root cause of at least one shipped display bug (issue:
> chapter progress showing raw sentence counts instead of real render-batch counts). This
> document is the canonical name for each concept. Where code, other specs, or UI copy
> disagree with this table, that is drift to fix, not a second valid meaning.

## Changelog

| Version | Date       | Summary |
|---------|------------|---------|
| 1.1.0   | 2026-08-26 | **Owner ruling, authoritative.** "Segment" is decided: it means the render block (what code currently calls "render group"/"chunk group"/"batch" — those three were the owner's own workaround words, adopted specifically because every time he said "segment" out loud, the system kept interpreting it as "sentence"). Separately, a new concept is named: **span** — a selection (start/end) assigned to a speaker. A span is sentence-granularity today, but is explicitly designed to become word-level later; it is not a synonym for "sentence," it is the casting/assignment unit, which currently happens to align to sentence boundaries. This supersedes 1.0.0's "not yet decided" framing below — the rename direction is now decided; execution is not yet scoped (see note at the bottom). |
| 1.0.0   | 2026-08-26 | Initial glossary. Written after a live investigation traced a progress-display bug back to exactly this naming collision — the fix (real batch counts, not sentence-row counts) is issue-tracked separately; this doc exists so the next confusion doesn't have to be independently re-discovered. |

---

## The core collision — RESOLVED, owner ruling 2026-08-26

| Term as used | Meaning | Where |
|---|---|---|
| **"segment"** (current code/spec, per `text-processing.md` Stage 5 — WRONG, to be renamed) | One sentence. A single row in `chapter_segments`. | `app/db/segments.py`, `chapter_segments` table, `SegmentSynthesisTask`, most of `app/orchestration/` |
| **"segment"** (owner's ruling — CANONICAL going forward) | **The render block.** The unit that actually produces one audio file: several consecutive same-speaker spans merged together. Has a real start time and a real stop time. Currently implemented in code as "render group" / "chunk group" / "batch" — those three words are the owner's own workaround terminology, adopted specifically because every time he said "segment" out loud, the system kept hearing "sentence." | `app/domain/chunk_groups.py` (currently named `build_chunk_groups`), `text-processing.md` Stage 6, the `/render_groups` API |

**Not new confusion.** `design-docs/plans/active/parallel-segment-rendering/00-overview.md` itself calls render groups "segments" in its own prose, in the same sentence it also uses "segment" for the sentence-level unit — the planning doc that built render batching already blurred the two, and code inherited that.

**Execution status:** the rename DIRECTION is decided (above). Actually renaming `chapter_segments`, `segment_id`, `SegmentSynthesisTask`, `build_chunk_groups`, and every spec currently using "segment" in the Stage-5 sense is real, cross-cutting work — a DB-column-and-table rename plus an API contract change plus every spec that cites the old name — and is **not scoped or scheduled yet**. Until it lands, **the codebase's own identifiers still mean the OLD thing** (sentence-level) even though the WORD "segment," spoken or written in conversation or in new docs, now means the render block. Say which one you mean explicitly when precision matters, and expect existing code comments/specs to still read the old way until the rename work happens.

---

## Canonical terms (owner ruling, 2026-08-26)

| Term | Definition | Currently implemented as |
|---|---|---|
| **Word** | The smallest selectable unit — a single token. Prototyped in the demo mock (`frontend/src/demo/stages/siteMockup/panes/studio.tsx`, `ClickableWords`, keyed `${chunkId}:${wordIndex}`) for click-to-edit pronunciation overrides. **Not yet wired into the production data model** — no backend support for word-level selection/assignment today. |
| **Sentence** | A grammatical unit made of words. Not itself a selection or an assignment target — a span (below) is what gets cast to a speaker, and a span currently happens to align 1:1 with a sentence. |
| **Span** | **A selection: a start and an end, assigned to a speaker.** Today, spans are sentence-granularity (one span = one sentence) — that's a current limitation, not the definition. The design intent is for a span to become word-level: "it defines the start and end of a selection that can then be [assigned] to a speaker." This is what `chapter_segments` rows, `segment_id`, and `SegmentSynthesisTask` are actually modeling today, under the old name. | `chapter_segments` table (to be renamed), `ScriptView.tsx`'s existing `spanIds`/`onPlaySpan` (already uses the right word) |
| **Paragraph** | A manuscript structural unit (blank-line-separated). Distinct from a segment: a segment can span multiple paragraphs (same speaker across a paragraph break) and a paragraph can contain multiple segments (a speaker change within it). Segment and paragraph boundaries are unrelated. | `normalize_newlines` (Stage 1) |
| **Segment** (see ruling above) | The render block: several consecutive same-speaker spans merged into one synthesis call, producing one audio file with a real start and stop time. Never crosses a speaker change. "Batch" and "group" are the owner's own synonyms for this same concept, adopted as workarounds — not three different things. | `app/domain/chunk_groups.py` (`build_chunk_groups`, to be renamed), `text-processing.md` Stage 6, the `/render_groups` API |
| **Chunk** | Informal, used in two different senses today: the demo mock's `chunkId` (≈ segment, per the ruling above) and `get_text_chunk_limit` (a legitimate, distinct use — the character-size budget a segment must stay under). Worth reconciling once the main rename happens, not urgent on its own. |

---

## What this glossary does not resolve

- **The rename execution is not scoped.** The direction is decided (segment = render block; span = the sentence-today/word-later selection-to-speaker unit); actually renaming `chapter_segments`, `segment_id`, `SegmentSynthesisTask`, `build_chunk_groups`, every API field, and every spec that currently uses "segment" the old way is real, cross-cutting work this glossary does not schedule or plan. Treat it as a real follow-up to be scoped deliberately, not something to sweep mechanically — a rename this size will hit sentences that compare the old and new meanings, which a find-and-replace cannot get right.
- **Word-level spans are a stated direction, not built.** Proven out in the demo mock's click-to-edit interaction, but there is no production plan, no backend support, and no data-model support for a span narrower than a full sentence today. If this becomes real work, it needs its own spec.
