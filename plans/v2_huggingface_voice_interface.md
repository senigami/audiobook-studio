# Proposal: Hugging Face Voice Interface (Studio 2.0)

> **Status: DRAFT for review.** No spec for a Hugging Face *voice-creation* interface
> existed in `plans/` before now. The only prior HF usage in the codebase is XTTS
> downloading its **base model** from Hugging Face during first-run setup — that is
> unrelated to what this document proposes. Assumptions are flagged _Assumption_ and need
> Steven's sign-off. Doc-only.

The goal is to let users **bring a voice in from Hugging Face** — either a hosted
text-to-speech / cloning model, or speaker reference audio from a dataset — and turn it
into a first-class Studio `VoiceProfile` with proper metadata, without coupling Studio to
any one engine.

## 1. What "Hugging Face interface" means here

Two distinct, often-conflated things. This proposal scopes both and recommends a phased
order:

1. **Voice sourcing (Phase A, recommended first).** Browse/search the Hugging Face Hub for
   **speaker reference audio** (from datasets or model cards) and import it as sample audio
   that an existing engine (e.g. XTTS) clones into a `VoiceAsset`. This needs no new
   inference engine — it reuses the current cloning path.
2. **Engine sourcing (Phase B, later).** Discover and install community **TTS engine
   models** hosted on HF as Studio plugins. This is really a special case of the existing
   plugin SDK (`plans/v2_plugin_sdk.md`) and should go through it, not a bespoke path.

> _Assumption:_ the near-term intent is Phase A (get voices in), with Phase B as a
> forward-looking extension. Confirm.

## 2. Objectives

- Add Hugging Face as a **voice source** in the Voice Lab, alongside record/upload.
- Authenticate optionally with a user-supplied HF token; nothing leaves the machine
  without explicit, disclosed consent.
- Map an imported HF artifact onto the canonical voice model (`VoiceProfile` +
  `VoiceAsset`) and the rich metadata schema in
  `plans/v2_voice_metadata_and_casting.md`.
- Surface and respect **licensing and consent** of source material.
- Route any inference strictly through the existing **Voice Bridge / TTS Server**
  boundary — no engine code in the Studio process.

## 3. Relationship to existing plans

- Import produces a `VoiceAsset` via the engine contract's `build_voice_asset(...)` /
  `VoiceAssetBuildRequest` defined in `plans/v2_voice_system_interface.md` §3.
- Phase B installs are plugins under `plugins/tts_*/` with a standard `manifest.json`
  (`plans/v2_plugin_sdk.md`) — the HF browser is just a discovery/install front-end.
- Imported voices get presentation + structured metadata from
  `plans/v2_voice_metadata_and_casting.md`, including `provenance` set to `imported`.
- All network access respects the privacy disclosure rules in
  `v2_voice_system_interface.md` §8 (cloud/off-machine activity must be explicit).

## 4. Phase A — voice sourcing flow

1. **Search.** User searches the HF Hub (filtered to audio datasets / voice model cards).
   _Assumption: query the public HF API; no token needed for public, read-only search._
2. **Inspect.** Show the card: title, author, **license**, languages, sample preview,
   description. License and any consent terms must be visible before download.
3. **Consent gate.** User confirms they have the right to use the voice (cloning consent).
   We record the acknowledgement in `provenance`.
4. **Import.** Download the selected reference audio into the voice's sample set
   (subject to the file-format/quality guidance already in the handbook).
5. **Build.** Run the existing clone path (`build_voice_asset`) on the chosen engine to
   produce a `VoiceAsset`.
6. **Annotate.** Pre-fill metadata (name, language, description) from the HF card; user
   edits attributes/icon per the metadata proposal.

## 5. Provenance record

Every imported voice carries an auditable origin (new `VoiceProvenance` shape, shared with
the metadata proposal):

```json
{
  "source": "huggingface",
  "hub_id": "org/dataset-or-model",
  "revision": "<commit-sha>",
  "license": "cc-by-4.0",
  "imported_at": "2026-05-29T00:00:00Z",
  "consent_ack": true,
  "notes": "Speaker sample from public dataset; license permits derivative audio."
}
```

## 6. Phase B — engine sourcing (later)

- Treat an HF-hosted engine as a plugin: validate `tts_<name>` folder + `manifest.json`,
  then go through the normal Install Plugin / Refresh flow.
- The HF browser only adds a "fetch + stage into `plugins/`" convenience; the SDK contract
  (`info / check_env / check_request / synthesize / settings_schema`) is unchanged.
- Resource profile, network requirements, and health checks come from the manifest, same
  as any other engine.

## 7. Security, licensing, privacy

- **Token handling:** HF token is optional, stored like other secrets (never logged,
  never bundled into exported voices), used only for authenticated Hub calls.
- **License surfacing:** never import without showing the source license; block or warn on
  licenses incompatible with the user's intended use. _Assumption: we display, we don't
  legally adjudicate._
- **Consent:** explicit cloning-consent acknowledgement recorded in `provenance`.
- **Disclosure:** any download or off-machine call is shown in the UI, consistent with the
  cloud-engine disclosure rules.
- **Plugin trust (Phase B):** strict manifest + folder-name validation before any Python
  loads, exactly as `v2_voice_system_interface.md` §4.1 requires for community plugins.

## 8. AI-handoff documentation note

Per the handbook style guide, the eventual API/integration page for this must be precise
enough that a reader can hand it to their AI to implement: exact HF Hub endpoints used,
auth header shape, the download → `build_voice_asset` sequence, the `provenance` record,
and the resulting `VoiceProfile`/`VoiceAsset` JSON. Keep general "import a voice" steps
everyday-simple; keep the integration contract exact.

## 9. Open questions (need Steven's answers)

1. Confirm Phase A (voice sourcing) is the priority and Phase B (engine plugins) is a
   later extension.
2. Which HF content types do we support importing first — dataset speaker clips, model
   card samples, or both?
3. Do we want in-app HF search, or just "paste a Hub ID / URL" for v1?
4. How strict is license enforcement — warn-only, or hard-block on certain licenses?
5. Is the HF token ever required, or strictly optional (public read only) for v1?

## 10. References

- `plans/v2_voice_system_interface.md`
- `plans/v2_plugin_sdk.md`
- `plans/v2_voice_metadata_and_casting.md` (sibling proposal — metadata & casting)
- `plans/implementation/voice_engine_impl.md`
