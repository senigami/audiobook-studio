# Prior Art: Character/Speaker Voice Assignment in Open-Source Audiobook Projects

Status: **research note** — 2026-07-04, gathered to inform
`sub_sentence_speaker_assignment.md` (span-level speaker ownership) and the broader
character-detection/casting workflow. Not a design doc itself; a survey to pull ideas
from before finalizing the span/chunk model.

## Why this matters here

Our open design questions (see `sub_sentence_speaker_assignment.md` Open Questions 3–4)
overlap directly with problems these projects have already shipped solutions for:
automatic speaker attribution, a review/correction UI for wrong attributions, and how
granular the "ownership unit" is (sentence vs. quote-span vs. word).

## Findings

### 1. VoxNovel (DrewThomasson) — https://github.com/DrewThomasson/VoxNovel
The closest architectural analog. Uses **BookNLP** (Stanford's NLP pipeline for
long-form fiction) to do coreference resolution and quote attribution — it identifies
which character said which quoted span, not just sentence-level tagging. Attribution
output is written to an editable `book.csv` with columns for text, speaker, and
line-level metadata, which the user can **visually inspect and correct before
synthesis**. This is the most relevant prior art for our Open Question 3 (how failed-span
badges / resync preview map onto spans): VoxNovel treats the CSV as the same kind of
correction surface we're proposing for spans, and gates synthesis on it being reviewed.
Voices are cast onto detected character names, then Coqui TTS renders per row.

Relevant to: span-level attribution granularity, pre-synthesis review/correction UX,
using an NLP coreference pass instead of pure regex/heuristic quote detection.

### 2. Alexandria-Audiobook (Finrandojin) — https://github.com/Finrandojin/alexandria-audiobook
Uses an LLM (not a classical NLP pipeline) to convert the manuscript into a structured
JSON script: each line tagged with speaker (`NARRATOR` vs. character name), plus
per-line style/delivery control. Ships a **review script** step specifically to detect
and auto-fix common annotation errors (e.g. misattributed quotes, missed attribution
tails) before handing off to synthesis. Exports to MP3, chaptered M4B, or multi-track
Audacity project (i.e., keeps per-speaker tracks separable downstream).

Relevant to: LLM-based attribution as an alternative/complement to regex quote-splitting;
the "review pass that catches common annotation errors" is directly applicable to our
Open Question 3; multi-track export as a possible future casting-card/QA feature.

### 3. VibeVoice (vorojar) — https://github.com/vorojar/VibeVoice
"LLM smart character analysis" (Qwen3-4B) does one-click automatic character + emotion
identification, then per-sentence voice **and emotion** control, with mixed-voice
generation in a single pass. Notably operates at per-sentence granularity by default
(same level we have today) but layers emotion tagging onto the same unit — worth noting
as a possible extension once spans land (a span could carry an emotion tag alongside a
speaker id).

Relevant to: emotion as a first-class per-unit attribute alongside speaker; validates
that per-sentence is a common industry default, reinforcing that sub-sentence spans are
a genuine differentiator, not table stakes.

### 4. TTS-Story (Xerophayze) — https://github.com/Xerophayze/TTS-Story
Web-based studio built around **tagged scripts** (explicit `[CharacterName]` markup in
source text) rather than automatic detection. Auto-detects the set of unique speaker
tags present in a document and prompts the user to assign a voice to each, then supports
chunk-level review/regeneration and a job queue. The tagging syntax is manual/explicit
rather than inferred, which sidesteps attribution-accuracy problems entirely at the cost
of requiring pre-marked-up input.

Relevant to: a fallback/manual-override path — explicit inline tags as an escape hatch
when automatic attribution is wrong, conceptually similar to a user manually
highlighting and re-assigning a span (our core UX), just authored up front instead of
interactively.

### 5. abogen-with-voicemarkers (olandir, fork of denizsafak/abogen) —
https://github.com/olandir/abogen-with-voicemarkers
Adds "Voice Tagging" to the base `abogen` EPUB/PDF-to-audiobook tool: inline markers in
the source text automate voice switching at the marker point. Same manual-marker
philosophy as TTS-Story but retrofit onto an existing single-voice pipeline, showing this
pattern is common enough to be worth bolting onto tools that didn't originally support
multi-voice.

Relevant to: shows the marker/tag approach as a widely-reinvented pattern, and that it's
often added as a fork/plugin rather than built into the original tool — i.e., low
architectural coupling is achievable.

### 6. AutoAudiobook (catid) — https://github.com/catid/AutoAudiobook
Generates a JSON file with all dialogue pre-assigned to speakers before synthesis, and
supports per-character voice generation from that JSON. Simpler/older project but
confirms the "resolve attribution to a static intermediate file, then synthesize from
that" pattern that both VoxNovel and Alexandria also use — i.e., attribution and
synthesis are commonly treated as two decoupled phases with an inspectable/editable
artifact between them.

Relevant to: reinforces treating the post-attribution, pre-synthesis representation
(our "spans") as a first-class, user-editable artifact rather than an internal
implementation detail — which is already the direction of the sub-sentence plan.

## Patterns worth pulling into our design

1. **Attribution as a distinct, inspectable phase.** Every serious project (VoxNovel,
   Alexandria, AutoAudiobook) separates "detect/attribute" from "synthesize" via an
   editable intermediate (CSV or JSON). Our span model already does this implicitly;
   worth being explicit that span data should be exportable/inspectable independent of
   the render pipeline, which helps Open Question 3 (mapping character auto-detection
   onto spans) — treat auto-detection as one more producer of spans, not a special case.
2. **Two attribution strategies exist in the wild: NLP coreference (BookNLP) vs. LLM
   prompting.** Worth deciding explicitly which we use for auto-suggesting speakers on
   ungrouped text, since it affects accuracy and cost tradeoffs. Not in scope for the
   span-splitting UX itself, but adjacent and likely the next proposal after spans land.
3. **A manual-tag escape hatch (TTS-Story, abogen fork) is cheap insurance** against
   attribution errors and could inform the "undo an accidental assignment" story (Open
   Question 4) — an explicit tag/marker is trivially undoable compared to reversing an
   automatic multi-span split.
4. **Emotion-per-unit (VibeVoice) is a natural adjacent axis** once the span data model
   exists — a span already carries `speaker_id`; an `emotion` field would slot in
   without changing the packing/chunking logic described in
   `sub_sentence_speaker_assignment.md`.

## Not directly reusable

None of these projects solve our specific hard constraint — packing spans into
plugin-aware `text_chunk_limit`-bound synthesis chunks while preserving lossless
reconstruction of source text. That packing/chunking logic (Section "Interaction with
render-group packing" in the sub-sentence plan) appears to be bespoke to our
render-group/queue architecture and isn't something to borrow from these repos.

## Links

- Parent plan: `design-docs/plans/proposals/sub_sentence_speaker_assignment.md`
  (Open Questions 3 and 4 are where these findings are most actionable)
- Sibling deep-research doc:
  `design-docs/plans/proposals/research_word_level_voice_assignment_academic.md` —
  goes past this OSS-tool survey into the academic literature (BookNLP internals,
  quotation-attribution papers, LLM chain-of-thought attribution, Dia/Deep Dubbing).
  Confirms from the research side what this doc found empirically from shipped tools:
  attribution and voice assignment are universally span/segment-level, never per-word.
