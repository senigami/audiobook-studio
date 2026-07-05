# Research: Character-Brief Extraction API Mechanics + Persona-to-Voice-Casting Prior Art

Status: **research note** — 2026-07-05, gathered to inform the (unimplemented) AI-extraction
pipeline in `design-docs/plans/proposals/performance_script_model/` (specifically
`02-character-profiles-and-extraction-spec.md`'s character-brief schema and
`05-ai-extraction-agent-prompt.md`'s prompt) and the live, rules-based
`cast_voices()` scorer in `app/domain/voices/metadata.py:332`. Not a design doc; a
narrower, implementation-focused follow-up to the two prior research notes already in
this folder (`research_speaker_assignment_prior_art.md`,
`research_word_level_voice_assignment_academic.md`), which cover dialogue/speaker
*attribution* (who said it). This note deliberately does not re-cover that ground — it
asks the next question: once a character exists, how do you reliably get an LLM to
produce a structured brief (age/gender/personality/speech-style/casting-notes) via an
API call, at book scale, and how does that brief become a voice-casting decision.

## Why this matters here

`cast_voices()` already scores/ranks existing voice catalog cards against a character
brief — but nothing in the codebase produces that brief from book text. The
`performance_script_model` proposal designs the schema and prompt for exactly that, but
was written without researching the underlying API mechanics: which structured-output
method is actually reliable for a deeply nested schema with evidence/confidence fields,
whether its proposed chapter-by-chapter rolling-registry chunking strategy is validated
practice, what this costs at novel scale, and — the owner's own observation prompting
this pass — whether "character brief" is usefully treated as a **persona** definition,
borrowing from persona-to-voice-casting patterns built elsewhere (games, virtual agents,
commercial TTS persona features) rather than reinventing that mapping from scratch.

## Executive summary

Provider-native structured-output enforcement (confirmed for OpenAI specifically: schema
enforced server-side via constrained decoding, ~100% adherence vs. under 40% for
unconstrained "return JSON" prompting) is the reliable choice for a nested schema like
this repo's target character-brief shape — plain JSON-prompting without that enforcement
is documented as fragile. The proposal's rolling-character-registry chunking strategy is
**neither validated nor invalidated** by what survived adversarial verification in this
pass: real systems either use classical NLP with a human-in-the-loop merge step
(Portrayal) or hierarchical multi-agent LLM pipelines (NexusSum), not a pure automatic
rolling registry, and a study that appeared to directly rank single-pass vs.
rolling/hierarchical approaches for character-profile quality did not survive
verification in either direction — so neither "single large-context pass" nor "rolling
registry" can be cited as *the* validated approach today. One solid, directly useful
finding independent of the chunking question: LLMs are measurably better at extracting
**personality/trait** information than **event/plot-continuity** information from
fiction — a concrete prior for where to expect extraction noise in a character brief.
Anthropic prompt caching is a confirmed, quantified cost lever for a growing
chapter-registry context, with a documented minimum-token gotcha to design around. On the
persona-casting question: the analogy holds structurally — one academic TTS system and
one commercial product (ElevenLabs Voice Design) both treat "persona description → voice
attributes → voice" as a **distinct, decoupled stage** from synthesis itself, which is a
useful architectural validation for keeping casting logic separate from the TTS engine
(already this repo's own rule, per `voice-bundles.md` §9's "MUST NOT hard-code engine IDs
in casting logic") — but no reusable persona *schema* or matching *algorithm* beyond
those two examples was confirmed.

## Findings

### 1. Provider-native structured output is confirmed reliable for OpenAI specifically; Anthropic/Gemini mechanism claims did not survive verification in either direction

OpenAI's Structured Outputs enforces the JSON schema server-side via constrained decoding
(token masking against a schema-derived grammar), reporting ~100% schema adherence in
OpenAI's own evals on `gpt-4o-2024-08-06`, versus under 40% compliance for unconstrained
prompting on the same model. Independent secondary sources report 8–15% malformed/schema
mismatch rates for unconstrained JSON prompting generally, vs. well under 1% for
provider-native structured-output modes. Plain "return JSON" prompting (the approach in
the existing, unimplemented `05-ai-extraction-agent-prompt.md`) is documented as fragile:
hallucination, format breaks, and inconsistency are the named failure modes.

**Caveat, important for this repo's own implementation choice**: claims submitted in
*both* directions about Anthropic's and Gemini's specific structured-output mechanisms
(e.g. "Claude has no native JSON mode, only forced tool-calling" and its opposite, "Gemini
has an equivalently strong native schema toggle") were each **refuted on verification**
(0-3 both ways) — meaning this research pass could not substantiate either provider's
mechanism specifics against its cited sources as worded. Confidence: **high** for the
OpenAI-specific finding and the general "native enforcement beats plain prompting"
conclusion; **do not** extrapolate the Anthropic/Gemini mechanism details from this note —
verify those directly against current Anthropic/Google docs before choosing an
implementation path, since this repo would most naturally call Anthropic's API.

### 2. The proposal's rolling-registry chunking strategy is unvalidated either way; real systems use human-in-the-loop merging or hierarchical multi-agent pipelines instead

The proposal's recommended workflow — analyze chapter 1, build a character registry,
analyze chapter 2 with the registry as context, repeat chapter by chapter, then a
book-level reconciliation pass — lives in `02-character-profiles-and-extraction-spec.md`
§10 ("Recommended Agent Workflow"); the prompt in `05-ai-extraction-agent-prompt.md`
carries the matching registry-as-context input slot ("Existing character registry, if
any"). It resembles a "rolling context" pattern, but no research surfaced here validates
that exact shape as best practice:

- **Portrayal** (arXiv 2308.04056, DIS'23) processes book text chapter-by-chapter
  (coreference resolution per chapter, for tractability) but merges character identities
  **across chapters via a human-in-the-loop interface** — a user validates/names/merges
  clustered mentions (e.g. two per-chapter "Sir Walter Elliott" clusters get manually
  merged) — not an automatic rolling registry. Portrayal's pipeline is also classical NLP
  throughout (AllenNLP coreference, Open IE for actions, rule-based dependency parsing for
  speech attribution, pretrained sentiment/emotion classifiers), not an LLM prompted for
  structured JSON.
- **NexusSum** (arXiv 2505.24575, ACL 2025) uses a **hierarchical multi-agent LLM
  pipeline** with sequential, structured chunk-processing stages for book/movie/TV-length
  narratives — explicitly not a single large-context pass and not a flat rolling context
  either.
- A claim that a study (arXiv 2404.12726) directly compared hierarchical merging,
  incremental/rolling updating, and single-pass summarization and found single-pass best
  overall (with rolling winning specifically on the "events" dimension) was **submitted
  and refuted on verification in both directions** (0-3 each) — the comparative ranking
  could not be substantiated against the primary source as worded. Treat this as an open
  question requiring a direct read of that paper's relevant table, not a settled fact
  either way.
- Claims that naive hierarchical merge-then-summarize is "the standard approach" for
  over-context-limit documents and that it structurally amplifies hallucination (motivating
  a grounding-augmented fix from arXiv 2502.00977) were also refuted on verification (1-2).

Confidence: **medium**. Net effect: the rolling-registry design in the existing proposal
is not contradicted by confirmed evidence, but it is also not endorsed by it — the honest
state is "no confirmed prior art for this specific chunking shape," not "validated" or
"debunked."

### 3. LLMs are measurably better at extracting personality/traits than plot/event continuity from fiction — a concrete prior for where to expect noise

arXiv 2404.12726 defines character profiles along four dimensions — attributes (gender,
skills, talents, objectives, background), relationships, events (chronologically
reordered), and personality — and found LLMs "typically achieve higher consistency scores
in capturing personality but are less effective at summarizing event-related
information," corroborated quantitatively (personality scores exceed event scores in
nearly every model/method combination) and by an ablation showing that omitting the
events dimension causes the largest accuracy drop (−9.21%) of any dimension. Directly
relevant to this repo's target schema: the `personality_traits`/`speech_style` fields in
`02-character-profiles-and-extraction-spec.md`'s character format are likely to extract
more reliably than fields depending on event/plot continuity (e.g. `source_presence`,
multi-chapter arc tracking) — and, per the research pass's own reading, than fine-grained
evidence-quote fields (the schema's per-claim `evidence` arrays), which are
event/source-derived — a useful prior for calibrating which fields deserve tighter
human-review gating. Confidence: **high** (single primary source, but a direct,
quantified, unambiguous finding).

### 4. Anthropic prompt caching is a confirmed, quantified cost lever for a growing chapter-registry context — with a minimum-size gotcha

Cached-prefix writes cost more than base input (1.25× for a 5-minute TTL, 2× for a
1-hour TTL), but cache-hit reads cost roughly 10% of base input price — meaning a growing,
byte-identical registry prefix reused across many per-chapter analysis calls becomes far
cheaper on repeat hits than full reprocessing, with break-even at one hit (5-min TTL) or
two hits (1-hour TTL). **Gotcha**: cached prompts must exceed a minimum token threshold
(roughly 1,024–4,096 tokens depending on model; some newer models as low as 512) — below
this, the request silently proceeds without caching and without an error. A registry that
starts small (early chapters, few characters) won't benefit from caching until it crosses
that threshold, and an implementation must check the usage/cache-hit fields in the API
response to confirm caching actually triggered rather than assuming it did from prompt
size alone. Confidence: **high** (primary Anthropic docs). No concrete dollar-per-book or
latency benchmark for a full novel-length multi-pass extraction was found or survived
verification in this pass — that remains an open question (see below).

### 5. Persona-to-voice-casting: the analogy holds structurally in two concrete examples, but no reusable schema was confirmed

Two independent sources support treating "persona → voice attributes → voice selection"
as a **decoupled stage**, distinct from both literary-character-extraction and from the
TTS engine itself:

- An academic system (Interspeech 2024, arXiv 2406.08812) implements prompt-to-speaker
  mapping as its own module: a LoRA-adapted language model extracts speaker-related
  traits from a free-text prompt description, feeding a hybrid discriminative +
  flow-matching method that produces a speaker embedding — explicitly decoupled from the
  underlying multi-speaker TTS engine "for flexibility." This is directly analogous to a
  `casting_notes`-to-voice-selection stage sitting apart from the TTS engine in this
  repo's own architecture (which already forbids engine-ID branching in casting logic —
  `voice-bundles.md` §9).
- **ElevenLabs Voice Design** generates new voice candidates directly from a
  natural-language persona description (age, gender, accent, tone, pacing, emotion)
  rather than selecting from a fixed library, returning three candidate voices per
  generation for the user to audition and pick — a live commercial example of
  description-to-voice-*generation*, distinct from this repo's description-to-library-
  *lookup* matching model (`cast_voices()` scores an existing catalog rather than
  generating new voices).

**Refuted**: a claim that ElevenLabs packs these persona attributes into a specific,
compact schema-like prompt template directly analogous to a character brief was submitted
and refuted on verification (0-3) — so there is no confirmed reusable schema format to
borrow from that product, only the general architecture pattern (decoupled
trait-extraction stage; generate-or-match from a description). Confidence: **medium** —
the architectural pattern is solid, the "reusable schema" half of the question is not
answered.

### 6. Azure Custom Neural Voice's persona documentation, checked directly, is a consent/legal workflow — not a persona-to-casting guide

The Azure URL that appeared to promise a persona-attribute-to-voice-casting guide
redirects to Microsoft's "Add voice talent consent to the professional voice project"
page — a legal/consent workflow (recording and uploading a voice talent's verbal consent,
matching names, a REST API for consent records), with no persona-attribute-to-casting
content beyond a single tip linking elsewhere. This closes off that specific avenue as a
source for a reusable persona-to-voice schema; Azure's actual Custom Neural Voice persona-
preset mechanism, if one exists, would need to be chased down at a different URL.
Confidence: **high** (direct primary-source fetch).

## Direct recommendations for this repo

1. **Use Anthropic's native structured-output/tool-use mechanism for the extraction
   call**, not plain "return JSON" prompting as `05-ai-extraction-agent-prompt.md`
   currently specifies — but verify Anthropic's exact current mechanism directly (finding
   1's caveat) rather than assuming OpenAI's specifics transfer.
2. **Do not treat the existing rolling-registry chunking design as either validated or in
   need of replacement based on this research** (finding 2) — it is a reasonable design
   choice that simply has no confirmed prior art either way. If chunking strategy becomes
   a real implementation blocker, the next step is a direct read of arXiv 2404.12726's
   relevant table (see open questions) before choosing, not a design change based on this
   note alone.
3. **Weight human-review gating by field, using finding 3**: personality/speech-style
   fields are the more reliable extraction target; event/plot-continuity fields,
   multi-chapter presence tracking, and fine-grained evidence-quote (`evidence` array)
   fields deserve tighter review-flag defaults.
4. **Design the registry-context prompt to cross Anthropic's prompt-caching minimum-token
   threshold deliberately** (finding 4) — e.g. front-load a stable system/schema prefix
   so caching activates even in early chapters when the character registry itself is
   still small, and check the API response's cache-hit fields rather than assuming
   caching worked from prompt size alone.
5. **Model the casting step as a decoupled stage, consistent with finding 5 and this
   repo's own existing rule** (`voice-bundles.md` §9's engine-ID-branching prohibition) —
   `cast_voices()` already does this structurally (scores a catalog against a brief); the
   character-brief-to-`voice_guidance`/`casting_notes` mapping, once built, should stay a
   separate stage feeding that scorer, not be folded into extraction or into the TTS
   engine layer.
6. **Do not adopt a specific "persona schema" from ElevenLabs or Azure** — neither
   survived verification as a reusable format (findings 5–6). The character-brief schema
   already designed in `02-character-profiles-and-extraction-spec.md` remains the best
   available shape for this repo; treat the "character profile ≈ persona" observation as
   an architectural framing (casting is a distinct stage) rather than a schema borrow.

## Caveats

- Several higher-value claims that would have most directly answered this note's
  questions were refuted on verification, and their absence is itself informative: no
  confirmed evidence on single-pass-vs-chunked chunking superiority either way; no
  confirmed evidence on whether naive hierarchical merging amplifies hallucination or
  whether grounding-augmented merging fixes it; no confirmed claims about Anthropic's or
  Gemini's structured-output mechanisms specifically (only OpenAI's is confirmed); no
  confirmed reusable persona schema/matching algorithm beyond the two architectural
  analogies in finding 5.
- **No sources were found addressing cost/latency at book scale** (dollar cost or wall-
  clock time for several LLM calls per chapter across a full novel) beyond the prompt-
  caching cost-ratio mechanism itself — no concrete per-book estimate survived
  verification.
- **No sources addressed BookNLP's specific chunking approach**, embedding-based
  cross-chapter coreference merging as an alternative to registry-carryover, a
  cheaper-model-for-discovery-vs-stronger-model-for-reconciliation pattern, or batching
  APIs — these sub-questions remain open (see below).
- Time-sensitivity: pricing/caching figures (Anthropic) and OpenAI's structured-outputs
  feature are current as of the 2026 fetch dates in the sources list but are the kind of
  provider-terms detail that can change without notice.

## Open questions

1. What does BookNLP, or any comparable open-source book-analysis tool, actually do for
   chapter chunking and cross-chapter character-identity merging? No source on this
   surfaced or was verified in this pass — worth a targeted follow-up if the chunking
   question becomes a real blocker.
2. What are realistic dollar-cost and latency benchmarks for running several LLM calls
   per chapter across a full novel-length manuscript (e.g. 100–400 pages) with a growing
   registry context? No concrete estimate was found or verified — likely needs a small
   empirical test against this repo's actual chapter lengths rather than further
   literature search.
3. Does a cheaper-model-first-pass-plus-stronger-model-reconciliation pattern (matching
   `02-character-profiles-and-extraction-spec.md` §10's own "book-level reconciliation
   pass" step to a stronger model, and per-chapter discovery to a cheaper one), or request batching,
   measurably reduce cost for this pipeline? Not addressed by any surviving claim.
4. Given that the single-pass-vs-rolling-registry comparison from arXiv 2404.12726 failed
   adversarial verification in both directions, is the paper's underlying data simply
   mixed/ambiguous, or was the claim framing the problem? Worth a direct read of the
   paper's relevant table/section before treating either chunking approach as settled.
5. Should `cast_voices()`'s existing scoring model (matching a brief against a fixed
   catalog) stay lookup-only, or is ElevenLabs Voice Design's generate-from-description
   model (finding 5) worth a future look for engines capable of true voice *design* rather
   than voice *selection*? Out of scope for the current casting card contract
   (`voice-bundles.md` §9), flagged for later.

## Sources

- Structured-output provider comparison (Medium, Rost Glukhov) — https://medium.com/@rosgluk/structured-output-comparison-across-popular-llm-providers-openai-gemini-anthropic-mistral-and-1a5d42fa612a
- Structured-output provider comparison (glukhov.org) — https://www.glukhov.org/post/2025/10/structured-output-comparison-popular-llm-providers
- Structured-output provider comparison (dev.to mirror) — https://dev.to/rosgluk/structured-output-comparison-across-popular-llm-providers-openai-gemini-anthropic-mistral-and-k26
- The guide to structured outputs and function calling with LLMs (Agenta) — https://agenta.ai/blog/the-guide-to-structured-outputs-and-function-calling-with-llms
- OpenAI API vs Anthropic API vs Gemini API (eesel.ai) — https://www.eesel.ai/blog/openai-api-vs-anthropic-api-vs-gemini-api
- Beyond JSON Mode: reliable structured outputs in production (tianpan.co) — https://tianpan.co/blog/2025-10-29-structured-outputs-llm-production
- Structured output in production (collinwilkins.com) — https://collinwilkins.com/articles/structured-output
- Evaluating LLM structured-output modes 2026 (FutureAGI) — https://futureagi.com/blog/evaluating-llm-structured-output-modes-2026/
- Evaluating Character Understanding of LLMs via Character Profiling from Fictional Works — https://arxiv.org/pdf/2404.12726
- NexusSum: hierarchical multi-agent LLM summarization — https://arxiv.org/abs/2505.24575
- Long-context vs. chunked summarization discussion (Hacker News) — https://news.ycombinator.com/item?id=42946317
- Grounded long-document summarization (extract/retrieve/cite) — https://arxiv.org/pdf/2502.00977
- An Extraction and Representation Pipeline for Literary Characters (Wellesley) — https://repository.wellesley.edu/_flysystem/fedora/2023-11/WCTC_2022_YangFuning_AnExtraction.pdf
- Portrayal (DIS'23) — https://arxiv.org/pdf/2308.04056
- Anthropic prompt caching docs — https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Prompt caching deep dive 2026 (agentbrisk.com) — https://agentbrisk.com/blog/prompt-caching-deep-dive-2026/
- How we cut LLM cost with prompt caching (Project Discovery) — https://projectdiscovery.io/blog/how-we-cut-llm-cost-with-prompt-caching
- Azure Custom Neural Voice talent consent — https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-custom-voice-talent
- Prompt-to-speaker mapping module (Interspeech 2024) — https://arxiv.org/pdf/2406.08812
- ElevenLabs Voice Design docs — https://elevenlabs.io/docs/eleven-creative/voices/voice-design

## Cross-links

- `design-docs/plans/proposals/performance_script_model/00-overview.md` and `README.md` —
  the design draft this research feeds: the character-brief schema
  (`02-character-profiles-and-extraction-spec.md`) and extraction prompt
  (`05-ai-extraction-agent-prompt.md`) this note evaluates for API-mechanics fitness.
- `design-docs/plans/proposals/sub_sentence_speaker_assignment.md` — Open Question 3's
  character-auto-detection gap; this note's findings inform how that future work would
  actually call an LLM once built.
- `design-docs/specs/voice-bundles.md` §9 (Casting Card Contract) — the live,
  rules-based `cast_voices()` scorer this research's persona-casting findings (5–6) feed
  into as a future upstream stage; no change to the contract itself.
- `design-docs/plans/proposals/research_speaker_assignment_prior_art.md` and
  `research_word_level_voice_assignment_academic.md` — the prior, broader research this
  note deliberately narrows past (dialogue attribution vs. this note's character-brief
  API mechanics and casting).
