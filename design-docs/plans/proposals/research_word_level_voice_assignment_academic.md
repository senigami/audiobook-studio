# Research: Word/Span-Level Voice Assignment — Academic & Adjacent-Tool Survey

Status: **research note** — 2026-07-04, deep-research follow-up to
`research_speaker_assignment_prior_art.md` (which surveyed GitHub OSS audiobook
projects). This doc goes one layer deeper: the NLP/ML research literature behind
quotation attribution, plus a couple of TTS-side projects that handle multi-speaker
input at word/turn granularity rather than the OSS-audiobook-tool granularity. Feeds
the same target as its sibling: `sub_sentence_speaker_assignment.md` Open Questions 3–4
and the general "how granular should the ownership unit be, and how is it detected"
question.

Produced via the `deep-research` skill (fan-out search + 3-vote adversarial
verification). 16 claims survived verification; 9 were checked and refuted (listed at
the bottom for transparency — mostly over-precise claims about paper internals that
didn't hold up on a second read).

## Executive summary

Across both the classical-NLP and LLM literature, nobody actually assigns voices
**per word**. Every system we found — BookNLP, the ACL/NAACL quotation-attribution
papers, and the newer LLM-based approaches — attributes at the **quotation-span or
dialogue-segment level**: find the boundaries of a quote or line, then decide who
said it, then (separately, downstream) pick a voice/timbre for that whole
span. The "granularity" question the field has actually been iterating on is not
span-vs-word, it's **how the speaker of a span is inferred** (rule/heuristic →
BERT-embedding span-scoring → LLM chain-of-thought reasoning over a whole chapter),
and separately **how much human correction is expected** in the loop. This directly
validates our span model in `sub_sentence_speaker_assignment.md`: spans (not words)
are the right ownership unit, and it's consistent with how the state of the art
frames the problem. The one genuinely word/turn-adjacent mechanism we found in the
wild (Dia's `[S1]`/`[S2]` tags) still operates at the turn level, not per-word.

## Findings

### 1. BookNLP and the academic literature attribute at the quotation-span level, never per-word or per-token
This is the load-bearing finding for our "spans, not words" decision. BookNLP (used by
VoxNovel, see the sibling doc) identifies quotation spans and attributes each as a
whole unit to a speaker — the `.quotes` output records start/end token IDs for the
*span*, plus one attributed mention and one coreference speaker ID per quotation, not
per-token labels. The "Evaluating LLMs for Quotation Attribution" survey paper
(arXiv:2307.03734) independently confirms the field's standard task decomposition —
character identification, coreference resolution, quotation identification, speaker
attribution — is defined entirely in terms of spans, not tokens. Both a BERT-based
scorer (BookNLP's own model: scores a BERT embedding of the quote span against
candidate mention-span embeddings in a 50-word window, highest score wins) and the
LLM-based approaches described below operate at this same span granularity.

Confidence: **high** (multiple independent primary sources — the BookNLP repo itself
plus two peer-reviewed papers — unanimous 3-0 votes).

Sources: https://github.com/booknlp/booknlp, https://arxiv.org/html/2307.03734

### 2. VoxNovel confirms BookNLP-based attribution needs a human correction pass before synthesis — automated attribution is not trusted blind
VoxNovel uses BookNLP for character ID + quote attribution, then requires the user to
run a manual-correction GUI ("visually inspect and modify speaker assignments...
before being passed to the next TTS step") because BookNLP sometimes misattributes
quotes. This is independent confirmation (beyond the OSS survey doc) that even the
most NLP-sophisticated open pipeline in this space treats automated attribution as a
*draft*, not a final answer — reinforcing the "attribution as a distinct, inspectable,
correctable phase" pattern already noted in the sibling research doc, and directly
relevant to our span-review/resync-preview UX questions.

Confidence: **high** (primary source, unanimous vote).

Sources: https://github.com/DrewThomasson/VoxNovel

### 3. Fictional-character embeddings can be injected into BookNLP's existing span-scoring formula to improve attribution of implicit/anaphoric quotes, without changing the granularity
A 2024 paper (arXiv:2406.11368) augments BookNLP's quote-mention scoring function with
a *global* per-character embedding (trained via a "Character Verification" model,
similar to authorship verification) concatenated into the existing span-scoring
equation. They built a new corpus, DramaCV (499 English-language plays), specifically
to train this character-embedding model. The point for us: this is an accuracy
improvement bolted onto the *same* span-level architecture, not a move to finer
granularity — it helps when a quote has no explicit "said Marcus"-style tag nearby
(the anaphoric/implicit case, which is exactly our "attribution tail" problem in the
sub-sentence design doc's motivating example).

Confidence: **high** (primary source read in full, unanimous vote; the DramaCV-size
sub-claim was 2-1 but the core mechanism claim was 3-0).

Sources: https://arxiv.org/html/2406.11368v1

### 4. LLM-based whole-chapter attribution (Llama-3 8B) substantially beats classical pipelines, with the biggest gains precisely on the "who is this unattributed quote from" case
A NAACL 2025 paper (arXiv:2406.11380, Michel et al., Deezer/Loria) shows Llama-3 8B
with zero-shot chain-of-thought prompting, attributing all quotes in a chapter in one
pass, reaches 90.6% accuracy on PDNC1 (22-novel benchmark) vs. 78.5% for BookNLP+ (a
SpanBERT-based baseline) and roughly 71% for ChatGPT (that number borrowed from a
prior paper, not a same-paper apples-to-apples run). The gain is concentrated almost
entirely in **non-explicit** quotes — anaphoric/implicit quotes with no narrator-named
speaker tag — where Llama-3 hits 89.1% vs. BookNLP+'s 68.9%. This is the strongest
signal in the whole survey that an LLM-reasoning approach (vs. classical
NLP/embedding scoring) is where the accuracy headroom is for exactly the hard case our
sub-sentence design doc is motivated by ("said Marcus" attribution tails and cases
with no tail at all).

Confidence: **medium** (primary source confirmed directly, but both sub-claims split
2-1 on vote — mostly over precise wording/provenance of the ChatGPT comparison number,
not the core finding).

Sources: https://arxiv.org/pdf/2406.11380

### 5. A parallel line of work frames speaker/addressee identification as extractive reading comprehension (fine-tuned T5/PromptCLUE), still at the span level
arXiv:2408.09452 fine-tunes T5 (English) and PromptCLUE (Chinese), each with an added
linear layer, to answer "who is speaking" / "who is addressed" as an extractive-QA
task over the surrounding context — i.e., extract a character-name span as the answer,
rather than a token-by-token tagging scheme. This is a third distinct architectural
approach (after BERT-embedding-scoring and LLM-chain-of-thought) that converges on the
same conclusion: nobody tags individual tokens/words with a speaker; everyone
extracts or scores at the span/mention level.

Confidence: **high** (primary source, unanimous vote).

Sources: https://arxiv.org/html/2408.09452v1

### 6. Downstream of attribution, voice/timbre casting is also done at the character or dialogue-segment level, not per-word — and is itself LLM-driven in the newest work
Two separate systems confirm voice *casting* (as opposed to attribution) is likewise
never per-word:
- **Deep Dubbing** (arXiv:2509.15845, Sept 2025): an LLM reads the whole book once,
  identifies every character, and writes a structured natural-language timbre
  description per character (gender/age/personality), which a separate
  Text-to-Timbre model turns into a speaker embedding — one embedding per character,
  reused for all of that character's lines. A second LLM pass generates a per-dialogue-
  segment (not per-word) emotion/scene instruction that rides alongside the fixed
  speaker embedding into synthesis. This is essentially "LLM-based automatic casting
  card generation" — directly relevant if we ever want to auto-suggest a voice
  profile for a newly detected character instead of only auto-suggesting from an
  existing catalog (which is what our current `POST /api/voices/cast` does).
- **Coqui-style "Story-to-Audio"** (arXiv:2309.03926): segments text into
  narration/dialogue, identifies the speaker per dialogue section, then a multi-style
  contextual TTS model assigns distinct voices/emotions to narrator and each character
  — again, casting happens after span-level attribution, not per-word.

Confidence: **high** for the Deep Dubbing per-character-embedding mechanism (unanimous
vote); **medium** for the per-segment emotion-instruction and Coqui-casting sub-claims
(2-1 votes, minor scope-of-generalization concerns raised by the verifier, not factual
disputes).

Sources: https://arxiv.org/pdf/2509.15845, https://ar5iv.labs.arxiv.org/html/2309.03926

### 7. The one real "turn-level" (not word-level) mechanism found in a shipping TTS model: Dia's inline `[S1]`/`[S2]` speaker tags
Nari Labs' Dia model (a from-scratch dialogue TTS model, not an audiobook pipeline)
takes literal alternating `[S1]`/`[S2]` tags inline in the input text as the only
multi-speaker control mechanism — no per-word tagging, no SSML voice-switch markup,
and the tags must strictly alternate. This is the closest thing to "word-adjacent"
voice control we found in a production model, and it's still turn/line-level, gated
by a hard alternation constraint (not free per-span assignment) — a useful negative
data point: even at the raw-model level, nobody exposes finer-than-turn granularity as
an input primitive.

Confidence: **high** (primary source — the model repo's own README — unanimous vote).

Sources: https://github.com/nari-labs/dia

### 8. Attention-based (learned) fine-grained prosody transfer is a known dead end for cross-speaker generalization — a reason to prefer explicit span/alignment-based control over learned per-word attention
An older Interspeech 2019 paper (arXiv:1907.02479) on prosody transfer notes that
attention-based fine-grained (word/phoneme-level) prosody control, trained on a single
speaker, fails to generalize to unseen speakers and to long utterances. This isn't
about speaker *attribution* but is relevant supporting context if we ever consider a
learned/attention-based mechanism for finer-than-span control (e.g., automatic
emphasis or emotion at the word level): the literature's own experience is that
explicit, alignment-based control beats learned attention for this kind of
fine-grained assignment — another vote for spans (explicit, user- or
rule-assigned) over any learned per-word mechanism.

Confidence: **medium** (primary source, but 2-1 vote — the "long utterances" part of
the claim rested on secondary corroboration rather than a directly quoted line).

Sources: https://arxiv.org/pdf/1907.02479

## What this changes / confirms for our design

1. **Confirms the span model.** `sub_sentence_speaker_assignment.md`'s rejection of
   per-word tokenization as the atomic unit is exactly aligned with where the entire
   field has landed, independently, across three different architectural approaches
   (embedding-scoring, extractive QA, LLM chain-of-thought). This is strong external
   validation, not just an internal simplicity argument — worth citing in the design
   doc if the "why not words" rationale is ever challenged.
2. **The real fork in the road is attribution *method*, not granularity.** If/when we
   build automatic speaker-suggestion for spans (Open Question 3 in the sub-sentence
   doc), the field's evidence points at LLM chain-of-thought reasoning over a whole
   chapter (finding 4) as the strongest current method, especially for the
   no-attribution-tail case — stronger than a BookNLP-style embedding-scoring
   approach, and clearly stronger than naive one-quote-at-a-time prompting. This is a
   concrete recommendation for whichever future proposal picks up "auto-suggest
   speaker for an unassigned span."
3. **Casting (voice selection) is a separate, LLM-automatable step from attribution
   (who said it).** Deep Dubbing's "LLM writes a structured timbre description per
   detected character, feeds a Text-to-Timbre model" pattern (finding 6) is a
   plausible future extension of our existing `POST /api/voices/cast` — right now that
   endpoint suggests from an existing voice catalog; an LLM-timbre-description step
   would be the natural next stage if we ever want casting suggestions for characters
   with no close catalog match.
4. **Emotion/delivery instructions are generated per-span by the same LLM pass that
   does attribution**, not by a separate word-level classifier (finding 6). This lines
   up with the sibling doc's Pattern 4 (VibeVoice's per-sentence emotion tagging) and
   reinforces that an `emotion` field on a span is the right level, not per-word.
5. **No project or paper exposes word-level voice-switch as a user-facing or
   model-facing primitive.** Dia's turn-level tags (finding 7) are the finest
   granularity found anywhere in the survey. This closes the "are we missing an
   obvious word-level pattern used elsewhere" question the owner asked — the answer is
   no, nobody does that; span/quote/turn-level is the universal granularity.

## Refuted claims (checked, did not survive verification — kept for transparency)

- A specific GitHub repo (`Priya22/speaker-attribution-acl2023`) was claimed to
  implement a particular ACL 2023 paper's method via a three-stage pipeline — both
  claims about this repo were refuted (0-3); do not cite that repo as an
  implementation reference.
- A claim that arXiv:2408.09452 operates at "character-mention level, not
  word/token level" was refuted (0-3) — likely too fine a distinction from finding 5's
  extractive-QA framing to independently stand up; treat finding 5 as the reliable
  version of this point.
- A detailed claim about the exact chunking strategy (4096-token windows, 1024-token
  stride, numeric quote IDs) for arXiv:2406.11380's whole-chapter LLM prompting was
  refuted (1-2) — the paper's general "whole chapter at once" framing (finding 4)
  holds, but don't cite the specific window/stride numbers.
- A claim that Dia's voice-cloning conditioning works via prepending a reference
  transcript with matching speaker tags (rather than an embedding/ID lookup) was
  refuted (1-2) — don't rely on this mechanism description if voice-cloning-via-Dia
  ever becomes relevant.
- A claim that the Deep Dubbing paper frames manual casting as "the industry
  bottleneck this work replaces" was refuted (1-2) — the paper's framing/motivation
  language shouldn't be over-cited as an industry-wide claim.
- A claim about the 1907.02479 paper's proposed *fix* (precomputed phoneme-level
  forced-alignment aggregation as the alternative to learned attention) was refuted
  (1-2) — finding 8 above sticks to the safer, confirmed half of this paper (the
  failure mode of learned attention), not the proposed remedy's exact mechanism.
- A claim about self-supervised per-segment emotion prediction in the Coqui
  story-to-audio paper was refuted (1-2) — finding 6's Coqui description is scoped to
  what was actually confirmed (segment, then voice/emotion assignment via the TTS
  model itself), not a separate self-supervised emotion classifier.
- A claim that arXiv:2509.17516 uses a discrete upstream "Voice Casting" step decoupled
  from the TTS model was refuted (1-2) — not confirmed; do not cite this paper for that
  architectural claim.

## Caveats

- Several findings (4, 6, 8) had split adversarial votes (2-1) — the core mechanism in
  each survived, but adjacent precision details (exact benchmark provenance, secondary
  corroboration for one sub-claim) are softer. Treat the "What this changes" section's
  recommendations as directional, not as citations to lean on verbatim in a spec.
  Deep Dubbing (Sept 2025), the Llama-3 quotation-attribution paper (Jan 2025), and the
  fictional-character-embeddings paper (2024) are all recent enough that this survey
  should be treated as current for now, but this is a fast-moving research area —
  re-check before citing specific benchmark numbers in anything long-lived.
- The Coqui story-to-audio paper (arXiv:2309.03926, Sept 2023) is the oldest source
  here (~3 years) — frame it as "how this lineage of systems works," not as
  representing the current state of the art.
- No source in this pass addressed cost/latency tradeoffs of LLM-chain-of-thought
  whole-chapter attribution (finding 4) vs. a lighter embedding-scoring pass — this
  matters a lot for whether it's practical to run automatically vs. on-demand in our
  pipeline, and wasn't answered by anything found.

## Open questions

1. If we ever build automatic speaker-suggestion for spans, do we adopt an
   LLM-chain-of-thought-over-chapter approach (finding 4, strongest accuracy) or a
   lighter BookNLP-style embedding-scoring pass (finding 1/3, cheaper, no external LLM
   call)? Cost/latency data wasn't found in this pass.
2. Is there user appetite for an LLM-generated "timbre description → suggested new
   voice" casting flow (Deep Dubbing pattern, finding 6) as a complement to today's
   catalog-based `POST /api/voices/cast`, for characters with no good catalog match?
3. Should span-level `emotion` (noted as a future field in the sub-sentence design doc)
   be generated by the same pass that does speaker attribution (as Deep Dubbing does,
   finding 6), or kept as a fully separate, later feature?
4. Does any of this literature's "implicit/anaphoric quote" handling (finding 4) map
   cleanly onto our specific attribution-tail pattern (`"...," said Marcus, ...`), or
   is that case actually the *easy* (explicit-tag) case in their taxonomy, with our
   harder case being something else (e.g., unattributed dialogue exchanges with no
   tail at all)? Worth a closer read of the PDNC taxonomy before leaning on the 90.6%
   number as directly applicable.

## Links

- Sibling research doc (GitHub OSS survey): `research_speaker_assignment_prior_art.md`
- Parent design doc: `sub_sentence_speaker_assignment.md` (Open Questions 3–4;
  "Design direction: spans, not words" section is directly reinforced by finding 1)
- Tracked in `design-docs/plans/TASKS.md` alongside the sub-sentence speaker
  assignment item
