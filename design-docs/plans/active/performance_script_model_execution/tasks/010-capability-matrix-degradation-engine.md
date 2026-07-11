# Task 010 — Capability matrix + degradation-rules engine

Status: pending

Risk: none — this is internal design/matrix work; nothing it produces is called by a live render
path yet (that only happens once task 011's exporters exist), so a mistake here is cheap to correct.

## Goal

Define, in one place, (a) the per-export-target capability matrix — which of the 5 targets (W3C
SSML, Amazon Polly, Azure, ElevenLabs, Google Cloud TTS) support which performance-directive
features — and (b) a generic degradation-rules engine that, given a feature a target doesn't
support, decides what to do instead of erroring or silently corrupting the render. Every exporter
in task 011 must consume this matrix and this engine rather than re-deriving its own ad hoc
support logic — that's the whole point of building it as a shared layer (R-D in `01-map.md`).

## Why this matters

`01-map.md`'s R-D says it plainly: "the degradation-rules engine (D) needs a clear per-target
capability matrix before implementation, not discovered ad hoc per exporter." Without this task,
each of task 011's 5 exporters would independently reinvent "what do I do when X isn't supported,"
producing 5 slightly different degradation behaviors for the same feature — a duplication of
exactly the kind `INV-2` ("one canonical format, many renderers") is meant to prevent one layer up.
`INV-4` ("engines that can't consume a directive ignore it silently, mirroring the sibling plan's
INV-2") is the umbrella invariant this task's degrade-vs-drop logic must satisfy.

## Input dependency

Task 003 (rendering-mode-translation layer — file `003-rendering-mode-translation.md`, being
drafted in parallel and not yet written) is this task's direct upstream input: 003 turns the
canonical `performance_data` JSON into the 5 rendering modes × 8 rendering values referenced in
`00-overview.md` (Part B, area 2). This task's matrix and rule engine operate on **003's output
shape**, not on raw `performance_data`. Read `003-rendering-mode-translation.md` before
implementing 010 — if its rendering-mode/value vocabulary differs from the feature list below
(drawn directly from proposal doc 04's field-mapping table), reconcile the naming rather than
inventing a second vocabulary.

## Source material (read fully before implementing)

`design-docs/plans/proposals/performance_script_model/04-export-targets.md` — this task must not
invent generic "some engines support X" placeholders; every row below is transcribed from that
doc's actual content.

## Capability matrix (per doc 04's Field Mapping Table, lines 76–92, plus prose §1–§5)

| Feature | W3C SSML | Azure | Amazon Polly | ElevenLabs | Google Cloud TTS |
|---|---|---|---|---|---|
| `delivery.pace` (rate) | `<prosody rate="">` | `<prosody rate="">` | `<prosody rate="">` | `style` slider + prompting only (no direct rate control) | `<prosody rate="">` (standard support, WaveNet/Neural2) |
| `delivery.volume` | `<prosody volume="">` | `<prosody volume="">` | `<prosody volume="">` | `stability` + prompting only | `<prosody volume="">` |
| `delivery.pitch` | `<prosody pitch="">` | `<prosody pitch="">` | `<prosody pitch="">`, **reduced on Neural/long-form voices** | limited, via prompting only | `<prosody pitch="">` |
| `delivery.pause_before_ms` / `pause_after_ms` | `<break time="">` | `<mstts:silence type="..." value="200ms">` (more precise than `<break>`) | `<break time="">` | `<break time="">`, **partial support in some contexts only** | `<break time="">` (W3C SSML baseline) |
| `delivery.emphasis[]` | `<emphasis level="">` | `<emphasis level="">` | `<emphasis level="">` | no markup — approximated as ALL-CAPS or bold text | `<emphasis level="">` (W3C SSML baseline) |
| `performance.emotion.primary` | **not supported** | `<mstts:express-as style="">` — richest current emotion→delivery mapping | `<amazon:emotion name="excited\|disappointed">`, **Neural voices only, only 2 emotion values** | acting-note prefix + `style` slider (no native emotion enum) | `google:style-degree` on **some voices only**; no dedicated emotion tag |
| `performance.emotion.intensity` | **not supported** | `styledegree=""` (continuous 0.0–2.0) | `intensity="low\|medium\|high"` (3-step, Neural only) | `style` slider (continuous 0.0–1.0) | tied to `google:style-degree` where available, else unsupported |
| `performance.acting_note` | **not supported** | **not supported** (style tag replaces it) | **not supported** | **native concept** — prepended as parenthetical text, this is ElevenLabs's primary emotion-delivery mechanism | **not supported** |
| `kind = vocalization` (e.g. sigh, laugh) | not supported — falls back to spoken text | `<mstts:express-as>` + style (approximate) | `<amazon:breath>` / `<amazon:auto-breaths>` / `<amazon:effect name="whispered">` | acting-note prompt only (model-dependent) | not supported per doc (no vocalization tag documented) |
| `kind = silence` | `<break time="">` | `<mstts:silence>` | `<break time="">` | `<break time="">`, partial | `<break time="">` |
| `kind = attribution` (e.g. "she said") | spoken as-is OR omit (author/exporter choice) | spoken OR omit | spoken OR omit | spoken OR omit | spoken OR omit (same policy applies uniformly — doc treats this as engine-agnostic) |
| `speaker.character_id` (per-span voice) | `<voice name="">` | `<voice name="">` | `<voice name="">` | API `voice_id` per span; **Projects API v2** is the closest ElevenLabs equivalent to the span model (scene/chapter-level, per-speaker voice assignment) | `<voice name="">` (custom voice models available separately via the Voice Cloning API, not through SSML) |
| `delivery.range = dramatic` | no direct mapping | `styledegree="2.0"` | **not supported** | `style=1.0` | not documented — treat as unsupported until doc 04 says otherwise |
| `delivery.range = flat` | `<prosody pitch="+0%">` (approximate, not a real "flat register" concept) | `styledegree="0.0"` | **not supported** | `stability=1.0` | not documented — treat as unsupported |

**Known gap in the source doc — carry this forward, don't paper over it:** doc 04's actual
Field Mapping Table (lines 76–92) has only 4 target columns — W3C SSML, Azure, ElevenLabs, Polly.
Google Cloud TTS is described only in prose (§5, lines 65–70) and is **absent from the table**.
The Google column above is reconstructed from that prose plus the general "Google supports W3C
SSML" statement — it is not doc 04's own transcription and is a genuine judgment call (e.g.
whether Google supports `<emphasis>`/`<break>` the same as W3C baseline is inferred, not stated
outright). Flag this explicitly wherever the matrix data lands (code comment + a note in whatever
spec doc this becomes) so a future reader doesn't mistake the Google row for as-verified as the
other four. If the owner or a later research pass gets a authoritative Google Cloud TTS SSML
reference, replace the inferred cells first.

## Degradation rules (verbatim from doc 04, lines 96–101)

The degradation-rules engine implements exactly these four rules — do not add unstated ones:

1. **Prosody unsupported** → convert `pace`/`pitch`/`volume` to a short acting note prepended to
   the text (this is how ElevenLabs, which has no `<prosody>` equivalent, receives rate/volume/
   pitch intent at all).
2. **Emotion unsupported** → include `performance.acting_note` as a parenthetical if the source
   segment has one set; otherwise discard the emotion data entirely (no synthetic acting note
   invented from the emotion enum alone — that would be fabricating text the author never wrote).
3. **Vocalization unsupported** → convert to the nearest spoken-text equivalent, or omit the
   segment's vocalization content with a review flag (this is the one rule that produces a
   human-visible signal — wire it to the same `needs_review` review-state machinery Part A/E use,
   not a separate silent flag).
4. **Per-span voice unsupported** → pack consecutive same-speaker spans together and assign the
   whole block a single voice (this is a batching transform, not a per-field substitution — it
   changes the unit the exporter emits, not just a value).

### How the four rules compose

These rules are not mutually exclusive lookups per feature — the engine must check support in a
defined order per span, because a single span can trigger more than one rule (e.g. an ElevenLabs
span with both `delivery.pace` set and `performance.emotion.primary` set hits rule 1 for pace
*and* rule 2 (fall through to acting-note) for emotion — and both outcomes want to write into the
same "acting note" text slot, so the engine needs a single accumulation point for "things that
become a prepended note" rather than two independent string-concatenation call sites). Design the
engine's decision function so degraded-to-acting-note outputs from different rules merge into one
note (comma-joined or similarly deterministic), not one note per rule silently overwriting the
last.

## Steps

1. Read `003-rendering-mode-translation.md` in full once it exists; confirm its rendering-mode
   value vocabulary lines up with the feature list in the matrix above (reconcile naming, don't
   duplicate a second vocabulary).
2. Encode the capability matrix as data, not scattered `if target == "azure"` branches in
   exporter code — e.g. a small structured table (dict-of-dicts or a dataclass per target) that
   task 011's exporters and any future 6th target both read. Per `modular_architecture.md`'s
   engine-registry precedent (queue/routes/UI must not branch on engine IDs for core behavior),
   this capability data belongs behind a lookup, not inline conditionals in call sites.
3. Implement the degradation-rules engine as a pure function/small module:
   `decide(feature, value, target_capabilities) -> DegradedOutcome` (keep-as-is / convert-to-note /
   omit-with-review-flag / batch-transform), covering the four rules above and their composition
   behavior (note-merging) from the "How the four rules compose" section.
4. Note in the module (or a short adjoining doc) the Google-row provenance gap called out above —
   this must not be silently forgotten once the code exists.
5. Add unit coverage per target × feature combination in the matrix — at minimum, one test per
   degradation rule proving the *actual* degraded output (not a re-implementation of the same
   lookup table asserted against itself — per testing-standards.md, assert the observable decision,
   e.g. "ElevenLabs + pitch input → acting-note text produced," not "matrix[elevenlabs][pitch] ==
   matrix[elevenlabs][pitch]").
6. Bump/create the matching spec doc entry (this is new contract-shaped behavior — canonical
   format → target capability decisions — so per this repo's binding directive it needs a spec
   home with a version, likely alongside wherever 002/003's canonical-format spec lands) and add a
   changelog row.

## Acceptance criteria

- [ ] Capability matrix exists as structured data covering all 5 targets × all features listed in
      doc 04's field-mapping table (plus the reconstructed Google row, explicitly marked as
      inferred/provenance-flagged).
- [ ] Degradation engine implements exactly the 4 rules from doc 04 lines 96–101 — no invented
      5th rule, no silent divergence from the doc's text.
- [ ] Note-merging behavior (multiple degraded-to-acting-note outcomes on one span) is
      deterministic and tested.
- [ ] Vocalization-omitted-with-review-flag path (rule 3) hooks into the existing `needs_review`
      review-state mechanism from Part A rather than introducing a second, parallel flag.
- [ ] No exporter-specific branching logic lives outside the matrix/engine — task 011's exporters
      only call into this task's lookup + decision function.
- [ ] Matrix and engine both covered by tests asserting observable decisions, not
      self-referential lookups.
- [ ] Spec doc updated with version bump + changelog row per this repo's binding directive.

## Map links

Part D in `01-map.md` ("Multi-target export layer"); `01-map.md`'s R-D (the risk this task
directly resolves); `INV-2` (one canonical format, many renderers) and `INV-4` (silent-ignore on
unsupported directives) are the invariants this task's output must satisfy. Roadmap: Workload 5,
task 010, depends on 003.

## Dependencies

Depends on task 003 (`003-rendering-mode-translation.md`, drafted in parallel — read its final
shape before implementing, not just this file's assumptions about it). Task 011 (five exporters)
depends on this task's output plus task 004 (`004-ssml-capability-manifest-field.md`, also
drafted in parallel).

## Out of scope

Do not build any of the 5 exporters here (that's task 011) — this task only produces the shared
matrix + decision engine they call into. Do not implement the plugin-manifest `behavior` field
itself (that's task 004's job — this task only consumes whatever shape 004 defines). Do not
attempt to fill in the Google row with certainty beyond what doc 04's prose actually supports —
flag the gap, don't resolve it by guessing further.
