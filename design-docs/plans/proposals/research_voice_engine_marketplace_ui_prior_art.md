# Research: Browsable Marketplace UI Patterns for Approved Voice Engine Modules

Status: **research note** — 2026-07-04, gathered to inform the engine browser/registry
work in `design-docs/plans/active/final_release/05_standalone_plugin_repos.md` (official
registry + install-from-URL) and the plugin manifest contract in
`design-docs/specs/engines-and-plugins.md`. Not a design doc itself; a survey of how
existing GitHub/hub-style marketplaces structure catalog metadata, render inline media
previews, and gate install actions, so we can decide what to reuse for a "browse and
install approved voice engine modules" UI on top of our existing `manifest.json` +
official-registry-JSON stack.

## Why this matters here

Doc 05 already ships part of this problem: an owner-controlled registry with entries of
(`id`, `name`, `summary`, `trust_level`, `repo_url`, `homepage`, `docs_url`, `icon`,
`tags`, `min_studio`, `compatibility`, `requirements`) — currently a hardcoded in-tree
catalog (`app/engines/official_registry.py`, served by the engines `/registry` route,
intended to become a remote JSON document later) — and a working
`OfficialRegistryPanel.tsx` + install-from-URL flow. The `distribution` block for
`manifest.json` is **specified but not yet built**: doc 05 §1.2 defines it, but no
in-tree manifest carries it (steps X5/2.5/3.5 are unchecked) and
`plugin_loader._validate_manifest` ignores it (doc 05 item 1.3). The
open surface is (a) how much richer the catalog card/detail view should get — README
rendering, inline audio sample preview, filter/facet browsing — and (b) whether the voice
bundle side (Hugging-Face-hosted, MP3 samples) should borrow the same card/preview
pattern doc 04 (`04_voice_metadata_and_tagging.md`) is defining for voice metadata. This
note surveys Hugging Face Hub, VS Code Marketplace, ComfyUI-Manager/Civitai-gallery
integrations, and Ollama's registry format for directly reusable structural patterns.

## Executive summary

Every mature "browse and install" catalog studied here separates three concerns that map
cleanly onto what this repo already has: (1) a small **machine-readable manifest**
(identity, version, compatibility, capability tags) that drives filtering and the
install action, (2) a **human-readable README/model-card** rendered as the detail view's
prose, and (3) a **declarative preview block** (YAML or JSON) that names media files or
generation prompts without embedding them, so the catalog can render previews lazily. Hugging
Face's model-card widget system is the closest analog for TTS specifically: it uses a
single `pipeline_tag` field to pick which preview widget renders (a `text`-driven
generate-on-demand player for TTS vs. a `src`-driven playback widget for ASR/audio
classification) and gates the interactive widget on a live inference backend, with a
static fallback (`output.url` pointing at a repo-relative audio file) for models with no
backend available — the fallback is the directly reusable piece for a fully local app
with no serverless inference tier. VS Code Marketplace and ComfyUI-Manager both show that
a curated/approved-only registry is best modeled as a small flat catalog (JSON list or
README-embedded table) with a separate, stricter trust/verification layer (automated
scanning, domain-verified publishers, or freshness-mode toggles) rather than baking
approval into the manifest schema itself. No dedicated TTS-voice marketplace with a
mature browsing UI was found as prior art beyond Hugging Face's own generic model-card
mechanism — this space is comparatively unbuilt-out, which is itself a finding.

## Findings

### 1. Hugging Face model cards: manifest + README as one file, filtering driven entirely by declared metadata

A Hugging Face model card is structurally just the repo's `README.md`, rendered on the
model page, with a YAML front-matter block at the top (machine-readable metadata) and
free-form Markdown below it (human-readable description) —
https://huggingface.co/docs/hub/en/model-cards. This two-part structure is exactly what
our `manifest.json` + `README.md` split already does; the reusable idea is that HF treats
them as **one logical artifact** for card-rendering purposes (parse the YAML, render the
rest as prose), rather than a separate "summary" field duplicated across two files.

The catalog's filter/browse UI (`huggingface.co/models` facet sidebar: Tasks, Libraries,
Datasets, Languages, Licenses) is driven entirely by declared YAML fields —
`license`, `pipeline_tag`, `tags`, `datasets`, `base_model` — not free-text search of the
README body (https://huggingface.co/docs/hub/en/model-cards). This is a directly
applicable pattern for the engine registry: doc 05's `tags` array (`["local",
"voice-cloning", "gpu"]`) can become real facets (engine capability, GPU requirement,
platform) in the browser UI rather than opaque strings, if the registry JSON schema
formalizes an enum-like vocabulary the frontend can group by. Confidence: **high**
(primary HF docs, unanimous verification).

### 2. `pipeline_tag` as the single field that selects both the filter facet and the preview widget type

The same `pipeline_tag` metadata field does triple duty: it is a Hub filter facet, it
determines which inline widget renders on the model page, and it determines which
inference API is invoked under the hood
(https://huggingface.co/docs/hub/en/model-cards, corroborated by
https://huggingface.co/docs/hub/models-widgets). The Hub deliberately renders **only one
widget per model** for simplicity, inferred automatically from `pipeline_tag` unless
manually overridden. This is a directly reusable pattern for an engine registry:
`manifest.json`'s existing `capabilities`/`behavior` fields (per this repo's engineering rules and
`design-docs/specs/engines-and-plugins.md`) could double as the signal that picks which
preview affordance renders on a catalog card — a "generate and play" widget for
synthesis-capable engines vs. a plain static sample player for voice bundles, without a
second UI-specific taxonomy to keep in sync. Confidence: **high** (two independent
primary HF docs, unanimous/majority verification).

### 3. Declarative preview blocks: generate-on-demand (`text`) vs. play-a-known-sample (`src`), and the local-repo-relative-path escape hatch

HF's widget YAML schema draws a sharp, directly-relevant line for TTS specifically:

- **Text-to-Speech** widgets declare `text` + `example_title` examples — the model
  generates audio on demand from the given text; no pre-supplied audio file is declared
  (https://huggingface.co/docs/hub/models-widgets-examples).
- **ASR / audio-to-audio / audio classification / VAD** widgets declare an array of
  `src` URLs (pointing at hosted audio files) + `example_title` — these play back or
  analyze an existing sample rather than generating one
  (https://huggingface.co/docs/hub/models-widgets-examples).
- Critically, `src` values do **not** need to be absolute URLs: "if the file lives in the
  corresponding model repo, you can just use the filename or file path inside the repo,"
  e.g. `src: sample1.flac` or `src: nested/directory/sample1.flac`
  (https://huggingface.co/docs/hub/models-widgets). This is the single most directly
  reusable mechanism for a **local-first** app: our voice bundles already ship
  `samples/preview.mp3` (per the audio-format convention — voice samples/previews are
  MP3) alongside the manifest; a widget-style YAML/JSON block naming that relative path
  is enough for a catalog UI to know what to play, with zero extra upload/hosting step.
  Note the **voice side already has exactly this block**: `design-docs/specs/voice.schema.json`
  makes `samples[]` (array of `{path, text, primary}`) a *required* field of `voice.json`
  — the gap is only on the engine manifest/registry side, where the closest field is
  `test_sample` (a verification asset like `latent.pth`, not a preview).

However, the interactive widget itself is **not powered by static files alone** — it's
gated on Hugging Face's live "Inference Providers" network actually serving that model;
if no provider is deployed, the widget doesn't render
(https://huggingface.co/docs/hub/models-widgets). HF's own escape hatch for this case is
a manually-authored static `output.url` example pointing at a repo-relative audio file,
explicitly so "the model page can still showcase how the model works" even with no live
backend. **This is the pattern to copy, not the live-widget mechanism** — and the voice
export path has in fact already copied it: `app/domain/voices/bundles.py`
`generate_readme_md` emits a `widget: … output.url` front-matter block pointing at the
bundle's primary sample when `samples[]` is populated. A fully local
app has no equivalent to Inference Providers, so the engine/voice browser should always
use the static-sample-file approach (a real MP3 shipped with the bundle, referenced by
relative path) rather than trying to spin up live inference just to preview a catalog
card. Confidence: **high** (multiple primary HF docs, consistent across widget-schema and
widget-availability pages).

### 4. Injectable card components driven by structured metadata (the `<Gallery />` pattern)

Beyond single-widget audio/text players, HF model cards support richer injectable
components in the Markdown body — e.g. `<Gallery />`, which reads a `widget:` YAML list
of prompt/output pairs and renders a media gallery inline
(https://huggingface.co/docs/hub/en/model-cards-components). The general shape —
metadata block declares a list of (label, media-reference) pairs; a named component in
the rendered body consumes that list — generalizes past audio: a voice engine or voice
bundle card could declare multiple named preview samples (e.g. different emotions or
speaking styles) as a list in the manifest, with the catalog UI rendering a small
multi-sample player strip rather than a single fixed preview. Confidence: **high**
(primary HF docs).

### 5. VS Code Marketplace: strict identity fields, separate presentation fields, README as marketplace copy, and multi-layered trust verification

VS Code's extension manifest (`package.json`) cleanly separates **machine identity**
(`name` — lowercase, no spaces, unique on the Marketplace; `version` — semver;
`engines.vscode` — a compatibility range that explicitly **cannot use wildcards**, e.g.
must be `^0.10.5`) from **marketplace-facing presentation fields** (`displayName`,
`description`, `categories`, `keywords` — up to 30 searchable terms) and **dedicated
visual fields** (`icon` — minimum 128×128px, 256×256 for Retina; `galleryBanner` — a
color + light/dark theme for the catalog card header)
(https://code.visualstudio.com/api/references/extension-manifest). This three-way split
(identity vs. discovery/search vs. visual card styling) is a clean structural model for
formalizing the registry entry schema doc 05 already sketches — right now `name`,
`summary`, `tags`, and `icon` are flat siblings in one object; splitting them
conceptually (even if not physically) clarifies which fields feed the install action vs.
which feed card rendering vs. which feed search. The marketplace page's descriptive copy
is pulled directly from a `README.md` committed at the extension root
(https://code.visualstudio.com/api/working-with-extensions/publishing-extension) — the
same README-as-detail-view pattern as HF model cards, and the same pattern doc 05 already
specifies ("README.md — shown in the engine browser").

For a **curated/approved-only** registry specifically, VS Code layers two independent
trust mechanisms on top of the plain catalog: (a) automated malware scanning with
multiple antivirus engines on every publish and every update, plus dynamic/behavioral
verification in a sandboxed clean-room VM
(https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security),
and (b) a publisher-verification badge requiring proven domain-name ownership plus a
minimum six-month track record of good standing before a publisher is marked
verified/trusted (same source). The structural lesson for our `trust_level: "official" |
"community"` field in doc 05: treat trust as an **orthogonal verification pipeline**
(who signed off, how recently, what was scanned) rather than a manifest self-declaration
— the manifest can *claim* `trust_level`, but the registry publishing/curation process
(owner-controlled JSON, PR-reviewed) is what actually enforces it, matching doc 05's
existing "owner-controlled official registry" decision. Confidence: **high** (multiple
primary Microsoft docs, unanimous verification; note one related claim about
`engines.vscode` sitting alongside `publisher` as "the" versioning pattern was
**refuted** on verification — treat the exact field grouping as illustrative, not a
literal spec to copy field-for-field).

### 6. ComfyUI-Manager: catalog freshness modes as a proxy for offline-first vs. live-registry tension

ComfyUI-Manager (the closest analog to "a plugin index inside a local-first creative
tool") offers three distinct catalog-freshness modes rather than a single hardcoded
fetch policy: a **1-day-cached remote channel** (default — fast list display, refreshed
daily), a **fully local/offline bundled copy** (ships with the Manager itself, no network
needed at all), and a **live remote channel with no caching** (always latest, at the cost
of a network round-trip every time) (https://github.com/Comfy-Org/ComfyUI-Manager).
This is directly relevant to a **local-first** app's registry browser: rather than one
fixed "always fetch the registry JSON live" behavior, offering a bundled-snapshot fallback
means the engine browser still works offline or on first run before any network call
succeeds, with an explicit user-facing toggle for freshness vs. availability. Confidence:
**high** (primary GitHub repo README, unanimous verification across two independent
fetches). Note: two adjacent claims about ComfyUI-Manager's catalog being a flat
PR-reviewed JSON file, and about a four-tier security-policy allowlist gating risky
install operations, were **refuted** on verification (voted down 0-3 and 1-2
respectively) — do not cite ComfyUI-Manager's catalog storage format or security-tiering
scheme as confirmed prior art without re-checking directly against the current repo.

### 7. Civitai-in-ComfyUI gallery: inline masonry browsing with lazy/deferred media loading, without leaving the host app

`ComfyUI_Civitai_Gallery` (https://github.com/Firetheft/ComfyUI_Civitai_Gallery) is a
concrete example of embedding a hub-sourced catalog **inside** a local tool's own UI
rather than sending the user out to a browser tab: a masonry/waterfall gallery with
filters (NSFW level, sort, time period, tags, username) and infinite scroll, rendered
directly inside ComfyUI. Its media-loading behavior is the more load-bearing detail for
our "listen to a preview without downloading the full asset" requirement: images support
zoom/pan and a double-click lightbox; videos show a static play-icon overlay instead of
autoplaying, and — per the tool's own README — "the original image is only downloaded if
its output is connected to another node, saving bandwidth and time," i.e. the full asset
is fetched lazily, on demand, not just to populate the browse grid. Confidence: **high**
for the in-app masonry/filter browsing claim (unanimous verification); **medium** for the
lazy-loading/play-icon claim specifically (split 2-1 vote, but the primary README was
independently re-fetched and confirms it verbatim). Directly applicable to a voice/engine
catalog: render sample-audio cards with a play button, not an autoplaying/eagerly-fetched
`<audio>` element, and only pull the full MP3 when the user actually presses play —
consistent with standard HTTP Range-request partial fetching
(https://web.dev/fast-playback-with-preload/), which lets a client play from the
beginning of a media file without downloading it in full first, the general mechanism
underlying "inline preview without a full download." (Note: a specific claim that
`preload=metadata` under 5MB is *the* practical pattern for this was refuted 0-3 on
verification — don't cite a specific preload-attribute recipe as confirmed; the
Range-request mechanism itself is solid, the specific browser-attribute tactic is not
verified.)

### 8. Ollama registry: content-addressable, typed-layer manifest — a model for structuring voice/engine bundle manifests

Ollama's model registry uses a content-addressable, Docker/OCI-inspired manifest format:
a JSON descriptor referencing an ordered list of `layers`, each identified by a SHA256
digest, plus a separate `config` blob holding model metadata
(https://deepwiki.com/ollama/ollama/4.2-model-registry-and-layers, corroborated directly
against a live registry manifest fetch). Each layer carries a **custom vendor media
type** describing what it is — `application/vnd.ollama.image.model` (weights),
`.template` (prompt template), `.license`, `.params`, and (for multimodal models) a
vision-projector or LoRA-adapter layer type. This vendor-media-type-per-layer pattern is
directly reusable for a voice-bundle or engine-bundle manifest: instead of a flat file
list, a bundle manifest could type each asset (e.g.
`vnd.audiobookstudio.voice.weights`, `.sample`, `.config`) so a future registry or
integrity-check step can validate/verify by type without hardcoding filenames. This is
also a natural fit with the SHA256-per-artifact approach for verifying a downloaded
engine/voice bundle wasn't corrupted or tampered with in transit, complementing (not
replacing) the GitHub-repo-URL + `min_studio`/`compatibility` fields doc 05 already
specifies for install-time compatibility checks. Confidence: **high** (secondary source
corroborated against a live primary-source registry fetch, unanimous verification).

### 9. No mature dedicated TTS-voice-marketplace prior art found beyond Hugging Face's generic mechanism

Across this research pass, no purpose-built "TTS voice marketplace" UI with a mature
browse/preview/install flow distinct from Hugging Face's generic model-card system
surfaced as verifiable prior art. Hugging Face Hub is being used today as a de facto
voice-model marketplace (TTS models with widgets, e.g. community Chatterbox-TTS-style
repos), but it is the same generic pipeline-tag/widget system used for every model type,
not a specialized voice-catalog UI (browsing by voice characteristics — gender, accent,
language, emotional range — is not a documented first-class facet; it would have to be
bolted on via generic `tags`). This is itself a finding: a **purpose-built voice-sample
browsing UI** (grid of voice cards, each with a name, short bio-style description, and an
inline "play a 5-second sample" button, filterable by language/gender/style) is closer to
Civitai's asset-gallery pattern (finding 7) or a custom build than to any existing
TTS-specific hub. Confidence: **medium** — this is an absence-of-evidence finding from a
bounded research pass, not an exhaustive survey of every voice-cloning community tool;
it's plausible narrower tools exist that this pass didn't surface.

## Direct recommendations for this repo

1. **Reuse the README-as-detail-view pattern already specified in doc 05** ("README.md —
   shown in the engine browser") and extend it to voice bundles: render the bundle's
   `README.md` as the catalog detail-view body, with the manifest supplying only
   structured fields (name, tags, compatibility) — mirrors both HF model cards and VS
   Code Marketplace listings.
2. **Add a declarative preview-sample block to the *engine* manifest/registry schema**,
   modeled on HF's `widget: - src: <repo-relative-path>` shape, pointing at the existing
   `samples/preview.mp3` / `sample.mp3` convention. The voice-bundle side already has
   this built (finding 3): `voice.schema.json` requires `samples[]` of
   `{path, text, primary}` and `bundles.py` already emits the HF widget fallback — so
   for voices the work is populating/consuming `samples[]`, not adding a schema field.
   The engine manifest and registry entries have no equivalent (`test_sample` is a
   verification asset, `icon` is the only card media). This lets the catalog UI know
   what to play without a separate lookup or convention-guessing, and keeps the "no live
   inference backend" constraint (finding 3) — always a static shipped file, never a
   generate-on-demand widget, since this is a local-first app.
3. **Let `capabilities`/`tags` double as both filter facets and preview-widget selection**
   (finding 2) rather than inventing a second UI-only taxonomy — one manifest field,
   two consumers (filter sidebar, card preview-affordance chooser).
4. **Treat `trust_level` as backed by the curation pipeline, not a self-declared field**
   (finding 5) — the owner-controlled registry JSON is already the enforcement point per
   doc 05; no additional manifest-side "proof" is needed, but the frontend should visually
   distinguish official vs. community consistently with how VS Code renders its verified
   badge.
5. **Consider an offline/bundled-snapshot fallback for the registry fetch** (finding 6)
   so the engine/voice browser has something to show before first network success —
   relevant given this is a local-first app that must work with no internet on repeat
   launches.
6. **Preview playback should be lazy and on-demand** (findings 3, 7): a play button that
   triggers fetch-and-play of the MP3 sample, not an eagerly loaded/autoplaying element —
   consistent with standard HTTP Range-request partial playback, so a multi-card catalog
   grid doesn't force-download every sample just to render the list.
7. **If a bundle-integrity/verification step is added later**, Ollama's typed-layer +
   per-layer SHA256 pattern (finding 8) is a clean model for extending the existing
   manifest without inventing a new scheme from scratch.

## Caveats

- Several claims in the underlying source material were **refuted** on 3-vote
  verification and are deliberately excluded or flagged above: VS Code's `publisher`
  field as part of "the" versioning pattern; ComfyUI-Manager's catalog being a flat
  PR-reviewed JSON file; ComfyUI-Manager's four-tier security policy as an
  approved/unapproved gate; the specific `preload=metadata` under-5MB recipe as *the*
  inline-preview technique; and the generic claim that the HTML `<audio preload>`
  attribute is *the* mechanism a voice marketplace would use (voted down net negative —
  the safer-verified mechanism is HTTP Range requests plus deferring the fetch until
  playback is requested, not a specific `preload` value).
- Hugging Face's *live interactive* widget mechanism (Inference Providers) has **no
  analog** in a fully local-first app and should not be copied directly — only the
  static-fallback (`output.url` / repo-relative `src`) half of that pattern applies here.
- The DeepWiki source for Ollama's manifest format is secondary (a wiki, not Ollama's own
  docs), though it was independently corroborated against a live fetch of a real registry
  manifest and Ollama's own GitHub `api.md`/source layout during verification.
- No dedicated TTS-voice-marketplace UI prior art was found (finding 9); this is a
  bounded research pass, not an exhaustive survey — treat the absence as suggestive, not
  conclusive.
- Time-sensitivity: Hugging Face's Inference Providers architecture (the live-widget
  gating mechanism) is a relatively recent (2024–2025) rearchitecture of the Hub and could
  continue to evolve; the static-fallback mechanism this note recommends reusing is the
  more stable, longstanding part of the schema.

## Open questions

1. The voice-bundle side already has both halves of the preview mechanism —
   `voice.schema.json` requires a `samples[]` block, and `bundles.py` emits HF's own
   `widget: … output.url` front-matter on export. The residual question for doc 04
   (`04_voice_metadata_and_tagging.md`) is therefore *population and consumption*: should
   the in-app voice catalog UI render previews from `samples[]` directly, and what
   backfills `samples[]` for current voices (today only the v1 migration writes it)?
2. Does the official registry JSON (doc 05 §1.2) need a formal enum vocabulary for `tags`
   now, or is free-text tagging acceptable until the catalog UI actually needs faceted
   filtering (i.e., is finding 1's filter-facet pattern premature for the current
   registry size)?
3. For the "paste-a-GitHub-repo-URL" community install path, should Studio attempt any
   lightweight automated scanning (finding 5) before allowing install, or is the existing
   "community engines show a trust warning" (doc 05 §1.0) considered sufficient given the
   local-first, single-user threat model?
4. Is a bundled-snapshot offline fallback for the registry (finding 6) worth building for
   v2.0, or is "registry browse requires network" an acceptable v2.0 limitation given
   doc 05 already scopes richer update/pull UX as post-v2?

## Sources

- Hugging Face Hub docs: model-widgets — https://huggingface.co/docs/hub/models-widgets
- Hugging Face Hub docs: model-widgets-examples — https://huggingface.co/docs/hub/models-widgets-examples
- Hugging Face Hub docs: model-cards — https://huggingface.co/docs/hub/en/model-cards
- Hugging Face Hub docs: model-cards-components — https://huggingface.co/docs/hub/en/model-cards-components
- VS Code extension manifest reference — https://code.visualstudio.com/api/references/extension-manifest
- VS Code publishing extensions guide — https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- VS Code extension runtime security — https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security
- ComfyUI-Manager (Comfy-Org) — https://github.com/Comfy-Org/ComfyUI-Manager
- ComfyUI_Civitai_Gallery (Firetheft) — https://github.com/Firetheft/ComfyUI_Civitai_Gallery
- web.dev: fast playback with preload / HTTP Range requests — https://web.dev/fast-playback-with-preload/
- Ollama model registry and layers (DeepWiki) — https://deepwiki.com/ollama/ollama/4.2-model-registry-and-layers
- Live Ollama registry manifest fetch (verification) — https://registry.ollama.ai/v2/library/llama3.2/manifests/1b

## Cross-links

- `design-docs/plans/active/final_release/05_standalone_plugin_repos.md` — the
  authoritative, in-progress plan for the official registry + install-from-URL flow this
  research feeds into (§1.2 registry schema, `OfficialRegistryPanel.tsx`).
- `design-docs/plans/active/final_release/04_voice_metadata_and_tagging.md` — voice
  bundle metadata/tagging work; already defines the voice-side `samples[]` preview block
  (via `voice.schema.json`) — open question 1 is about populating and consuming it, not
  adding it (finding 3).
- `design-docs/specs/engines-and-plugins.md` — the current manifest/lifecycle spec;
  any manifest schema change from this research (e.g. a preview-sample block) needs a
  `spec_version` bump and changelog row here per this repo's binding contract rule.
- `design-docs/plans/reference/v2_engine_bundle_github_distribution.md` — the superseded
  predecessor doc 05 replaces; kept for historical reference only.
