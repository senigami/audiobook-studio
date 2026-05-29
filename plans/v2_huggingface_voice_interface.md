# Proposal: Hugging Face Voice Interface (Studio 2.0)

> **Status: FINAL DRAFT for review.** The browse/import/upload flow for voices on the
> **Hugging Face Hub**. The concrete on-Hub shape is `plans/v2_huggingface_voice_repo_spec.md`;
> the metadata/tags come from `plans/v2_voice_tag_taxonomy.md` and
> `plans/v2_voice_metadata_and_casting.md`. **Voices live on Hugging Face; engines live on
> GitLab** (`plans/v2_engine_bundle_gitlab_distribution.md`) — this document is voices only.

The goal is to let users **bring a voice in from Hugging Face** and **publish voices to
it**, mapping each to a first-class Studio `VoiceProfile` with full metadata, without
coupling Studio to any one engine.

## 1. Scope

Hugging Face is the **voice host**. This covers three flows, all voice-only:

1. **Import** a voice from the Hub into Studio (native read when it follows the bundle
   spec; otherwise pull reference audio and clone locally).
2. **Browse/search** the Hub by the `audiobook-studio-voice` tag and install with a card UI.
3. **Upload/export** a Studio voice to the Hub (loose files via token) or as a
   `.asvoice.zip` for manual upload.

Engine plugins are **out of scope here** — they are hosted and installed from GitLab; see
`plans/v2_engine_bundle_gitlab_distribution.md`.

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
- Bundles that follow `plans/v2_huggingface_voice_repo_spec.md` are read natively; imported
  voices land in `tts_voices/`.
- Imported voices get presentation + structured metadata from
  `plans/v2_voice_metadata_and_casting.md` + `plans/v2_voice_tag_taxonomy.md`, including
  `provenance` set to `imported`.
- All network access respects the privacy disclosure rules in
  `v2_voice_system_interface.md` §8 (cloud/off-machine activity must be explicit).

## 4. Import flow

1. **Search.** User searches the HF Hub (filtered to audio datasets / voice model cards).
   _Assumption: query the public HF API; no token needed for public, read-only search._
2. **Inspect.** Show the card: title, author, **license**, languages, sample preview,
   description. License and any consent terms must be visible before download.
3. **Consent gate.** User confirms they have the right to use the voice (cloning consent).
   We record the acknowledgement in `provenance`.
4. **Import.** Download the bundle. If it follows the **Audiobook Studio voice bundle
   shape** (`plans/v2_huggingface_voice_repo_spec.md`), Studio reads `voice.json` and
   registers it natively with no setup. Otherwise, pull the reference audio into the
   voice's sample set (subject to the file-format/quality guidance in the handbook).
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

## 6. Upload / export to Hugging Face

- **Export** (Voices tab) runs the bundle generator and produces `<voice-id>.asvoice.zip`
  for sharing/backup/manual upload. The handbook documents manual upload (unzip first, push
  the loose files to a new HF **model** repo).
- **Upload to Hugging Face** (Voices tab) runs the same generator and pushes **loose files**
  to the user's HF repo via their token, setting the `audiobook-studio-voice` anchor and
  `as-*` tags automatically.
- Both paths use the shape in `plans/v2_huggingface_voice_repo_spec.md`.

> **Engines are not here.** TTS engine plugins are hosted on GitLab and installed/updated
> through `plans/v2_engine_bundle_gitlab_distribution.md`.

## 7. Security, licensing, privacy

- **Token handling:** HF token is optional, stored like other secrets (never logged,
  never bundled into exported voices), used only for authenticated Hub calls.
- **License surfacing (warn, don't block):** every voice on HF declares a license (who may
  use it and how). Studio always **shows** that license before import and flags the
  restrictive ones (e.g. non-commercial, no-derivatives), but does **not** block the
  import — the user decides. Studio displays the facts; it doesn't act as a legal gate.
- **Consent:** explicit cloning-consent acknowledgement recorded in `provenance`.
- **Disclosure:** any download or off-machine call is shown in the UI, consistent with the
  cloud-engine disclosure rules.
- **Voices are data, not code.** Importing a voice never executes third-party code, so its
  trust bar is lower than installing an engine (which does — see the GitLab engine spec §9).

## 8. AI-handoff documentation note

Per the handbook style guide, the eventual API/integration page for this must be precise
enough that a reader can hand it to their AI to implement: exact HF Hub endpoints used,
auth header shape, the download → `build_voice_asset` sequence, the `provenance` record,
and the resulting `VoiceProfile`/`VoiceAsset` JSON. Keep general "import a voice" steps
everyday-simple; keep the integration contract exact.

## 9. Decisions & remaining questions

Decided (this round):
- **Voices host = Hugging Face; engines host = GitLab.**
- **Delivery:** Export → zip; direct Upload → loose files; manual upload documented.
- **Token:** optional — public browse/import needs none; required only to upload or to read
  private repos.

- **License handling = warn, don't block.** Studio shows each voice's license and flags
  restrictive ones, but never blocks the import; the user decides (see §7).

Still open (minor):
1. In-app HF search UI vs. "paste a Hub ID / URL" for the very first version (full browse
   is the target either way).

## 10. References

- `plans/v2_huggingface_voice_repo_spec.md` (the on-Hub bundle shape)
- `plans/v2_voice_tag_taxonomy.md` (tags)
- `plans/v2_voice_metadata_and_casting.md` (metadata & casting)
- `plans/v2_engine_bundle_gitlab_distribution.md` (engines — separate host)
- `plans/v2_voice_system_interface.md`, `plans/implementation/voice_engine_impl.md`
