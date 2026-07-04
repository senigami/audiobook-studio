# Sub-Sentence Speaker Assignment (v2.0 feature)

Status: **design draft** — owner-requested 2026-06-11, targeted for the v2.0 release so the
segment data model ships in its final shape and never needs legacy-format support.

## Problem

Speaker assignment today operates at sentence granularity (text split on terminal
punctuation). That fails on the most common dialogue pattern in real manuscripts:

> "I can't believe you did that," said Marcus, shaking his head.

One sentence, two voices — the quoted dialogue belongs to Marcus, the attribution tail
belongs to the narrator. Today both are forced onto whichever single speaker owns the
sentence. Services like ElevenLabs can assign a different speaker to an arbitrary text
range, down to a single word.

## Goal / UX

- The user **highlights any text range** in the script view and assigns a speaker to it,
  exactly like assigning a speaker to a sentence today.
- The system splits the containing sentence at the selection boundaries; each resulting
  piece is independently speaker-ownable.
- Everything downstream (render-group packing, queue, progress, baked audio) works on the
  resulting pieces with no special cases.

## Design direction: spans, not words

Pre-tokenizing every word (the "each word is a unit" idea) is rejected: it explodes the
data model and the DOM for no benefit. Instead:

- The atomic unit becomes a **span**: a contiguous text range with one speaker.
- A sentence starts life as a single span owned by its (or the default) speaker.
- Assigning a speaker to a highlighted range **splits the containing span(s)** at the
  selection boundaries: `[before][selected][after]` (empty pieces are dropped). This is
  the "group, and re-split on assignment" model the owner described.
- Adjacent spans with the same speaker MAY be merged back (normalization pass) so the
  model never fragments beyond what assignments require.
- Sentences remain a *display/selection convenience* (click a sentence = select its
  range); they are no longer the unit of speaker ownership.

### Snapping & hygiene

- Selection boundaries snap to word boundaries (never split inside a word).
- Leading/trailing whitespace and straddled punctuation are resolved deterministically
  (punctuation adheres to the preceding word's span).
- Splitting must be lossless: concatenating a sentence's spans in order reproduces the
  source text exactly.

## Interaction with render-group packing

This feature is **why spans must land before the safe-text packing work is finalized**.
The packing pipeline becomes:

1. **Spans** (speaker-ownership units, user-controlled) →
2. **Chunks**: consecutive same-speaker spans are packed together up to the active
   plugin's `text_chunk_limit` (e.g. XTTS 500 chars). A speaker change always forces a
   chunk boundary, because one synthesis call has one voice.
3. Chunks are the **render groups** — the things the canonical render-group computation
   (PR #124, Script View & Segment Display section) counts, the numbers toggle numbers,
   and the renderer receives.

A mid-sentence speaker change therefore yields ≥ 2 render groups for that sentence —
this is inherent (two voices can't share a synthesis call), not a regression.
Engines without a chunk limit (e.g. Voxtral whole-body input) still split at speaker
boundaries: number of render groups = number of speaker runs.

## Data model sketch

- `segments` (or successor table) rows represent spans: `(chapter_id, position,
  text, speaker_id | null, …)` where `null` speaker = default/narrator.
- A `sentence_index` (or equivalent derivable mapping) is kept only if the UI needs
  fast sentence-level selection; it is presentation metadata, not ownership.
- v1→v2 migration: every existing sentence-segment becomes one span. Trivial and
  lossless — this is the payoff for doing it now.

## Open questions (resolve before implementation)

1. Does the existing `segments` table become the span table, or do spans nest under it?
   (Depends on how much of queue/progress references segment ids — audit first.)
2. Where does span-splitting live — backend endpoint that returns the re-split chapter,
   or frontend-local edit committed through the existing chapter-save path? (Must respect
   `frontend-state.md`: drafts must not blindly overwrite canonical server state.)
3. How do existing per-sentence features (failed-span badges, resync preview, character
   auto-detection) map onto spans? See `research_speaker_assignment_prior_art.md` —
   VoxNovel/Alexandria both treat auto-detection as one more producer into the same
   editable attribution artifact users can review before synthesis; worth modeling
   auto-detection as a span producer rather than a special case.
4. Undo story for an accidental assignment (pairs with doc 10 U1 undo-toast work). See
   `research_speaker_assignment_prior_art.md` — explicit manual tags (TTS-Story,
   abogen-with-voicemarkers) are trivially undoable vs. reversing an automatic
   multi-span split; may inform the undo affordance.

## Prior art

See `design-docs/plans/proposals/research_speaker_assignment_prior_art.md` for a survey
of how open-source audiobook projects (VoxNovel/BookNLP, Alexandria-Audiobook, VibeVoice,
TTS-Story, abogen-with-voicemarkers, AutoAudiobook) solve character-to-voice attribution.
None solve our specific chunk-packing constraint, but the "attribution as a distinct,
editable, pre-synthesis artifact" pattern is common and validates the span approach.

See also `design-docs/plans/proposals/research_word_level_voice_assignment_academic.md`
for the deeper academic-literature follow-up (BookNLP internals, ACL/NAACL quotation-
attribution papers, LLM chain-of-thought attribution, Dia's turn-level speaker tags,
Deep Dubbing's LLM-generated timbre casting). Headline finding: **nobody in the
literature attributes or assigns voices per word** — every approach found (classical
NLP, BERT-embedding scoring, extractive QA, LLM reasoning) operates at the
quotation-span/dialogue-segment level, which is strong external validation of this
doc's "spans, not words" direction. It also flags LLM chain-of-thought-over-chapter
attribution as the strongest current method for the no-attribution-tail case (Open
Question 3) once auto-suggestion is built.

## Sequencing

After the Queue & Event-Stream Contract section of PR #124 (row identity must be stable
first), and **jointly with** the canonical render-group computation item — that
computation should be written span-aware from day one even while every span is still a
whole sentence.
