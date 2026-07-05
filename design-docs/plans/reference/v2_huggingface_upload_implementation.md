# Research: `huggingface_hub` upload implementation for the voice-bundle "Push to Hub" feature

> **Status:** Research reference (implementation-level). Not a product spec — see
> `design-docs/plans/active/v2_huggingface_voice_interface.md` (product-level browse/import/upload
> flow) and `design-docs/plans/reference/v2_huggingface_voice_repo_spec.md` (exact on-Hub bundle
> layout + `voice.json` schema). This doc exists because those two already assume direct upload
> works, but neither cites the concrete `huggingface_hub` API calls or the gotchas below. Read
> those two first; this doc is the "how" layer under their "what."

## 1. Executive summary

`huggingface_hub`'s `HfApi.upload_folder()` can point directly at Studio's existing on-disk
voice-bundle directory and push it to a **model** repo in one call — no repacking, no manual
LFS/Xet staging, and no separate transformation step, provided the local directory is filtered
to exclude anything Studio keeps locally that shouldn't ship (`ignore_patterns`/`allow_patterns`,
or a `.gitignore` at the bundle root). The confirmed reason the repo spec already chose **model**
over **dataset** stands up under research: only a dataset repo gets an automatic Data Viewer, and
a model repo's audio widget requires either Inference Provider hosting (not applicable to a local
voice-clone bundle) or a static `widget.output.url` entry in the model card metadata pointing at
`samples/preview.wav` — which is exactly what the repo spec's generated `README.md` frontmatter
should emit. For atomicity across the multi-file bundle (icon, sample(s), optional engine assets,
`voice.json`, generated `README.md`), `upload_folder()` already commits the whole folder as a
single commit; the lower-level `CommitOperationAdd`/`create_commit()` primitives are only needed
if Studio ever wants partial updates (e.g. "just replace the icon") without re-uploading
everything. Large binaries (wav/mp3 samples, engine embeddings) are handled transparently by the
Xet backend (default since `huggingface_hub` 0.32.0) — no manual `preupload_lfs_files()` call is
required for the standard `upload_folder()` path; that function is a power-user escape hatch for
custom commit-based flows, not something Studio's "Save to Hub" button needs to call directly.
For auth, the two supported UX patterns are paste-a-token and OAuth device-code (browser +
short code) — both are exposed through `huggingface_hub`'s login helpers and map cleanly onto a
"paste your token" field plus an optional "or sign in with Hugging Face" button.

## 2. Upload APIs and how they map onto the voice bundle

### 2.1 `upload_folder()` — the primary mechanism, and it can point at the bundle dir as-is

```python
from huggingface_hub import HfApi

api = HfApi(token=user_hf_token)
api.create_repo(repo_id=f"{namespace}/{voice_id}", repo_type="model", exist_ok=True)
api.upload_folder(
    folder_path=str(local_bundle_dir),       # e.g. tts_voices/<id>/ — no repacking
    repo_id=f"{namespace}/{voice_id}",
    repo_type="model",
    commit_message=f"Publish voice '{voice_id}' via Audiobook Studio",
    ignore_patterns=["*.tmp", "*.lock", "__pycache__/*", ".DS_Store"],
)
```

- `upload_folder(folder_path=..., repo_id=..., repo_type=..., path_in_repo=...)` uploads an
  entire local directory to a repo (root or subpath) in one call — this is the documented,
  recommended API for "push this folder to the Hub." [C0, C1, C8]
- Filtering unwanted local files is done via `allow_patterns` / `ignore_patterns` /
  `delete_patterns`, or a `.gitignore` at the folder root — not by pre-copying to a staging
  directory. `delete_patterns` additionally cleans stale files already on the remote repo before
  the new push lands, which matters if Studio ever removes a sample from a bundle and re-publishes
  (otherwise the orphaned remote file lingers). [C1]
- Since `huggingface_hub` 0.32.0, `hf_xet` is installed by default and `upload_folder()` uses a
  **streamed pipeline**: files are hashed/checked against the Hub, uploaded to the Xet backend
  (which chunks, dedupes, and retries internally), and committed in adaptive batches, all in
  parallel. If `hf_xet` is absent, it falls back to the legacy path (hash everything, upload over
  HTTP, single commit). **Practical implication:** don't assume the pre-Xet mental model of
  "manually track LFS extensions" applies to the Python API path — that mental model belongs to
  the raw `git`/`git-lfs` CLI workflow, not to `upload_folder()`. [C10]

### 2.2 `create_repo()` — trivial, callable with just a `repo_id`

```python
api.create_repo(repo_id="namespace/voice-id")  # repo_type defaults to "model"
```

`repo_type` must be passed explicitly (`"model"` for the voice bundle, per the repo spec's
decision) — it is **never inferred** from the files being uploaded, so this is a value Studio's
uploader must hardcode/pass, not something the Hub will guess from the presence of audio files.
`exist_ok=True` avoids a 409 on republish of an existing voice. [C6, C9]

### 2.3 `create_commit()` + `CommitOperationAdd`/`Delete`/`Copy` — only needed for partial updates

`upload_folder()` already gives one atomic commit for the whole bundle, so the low-level
commit API is **not required** for the initial "Save/Upload to Hub" button. It becomes relevant
only for a later "update just the icon" or "swap one sample" affordance:

```python
from huggingface_hub import CommitOperationAdd, CommitOperationDelete

operations = [
    CommitOperationAdd(path_in_repo="icon.png", path_or_fileobj=str(new_icon_path)),
    CommitOperationDelete(path_in_repo="samples/preview-old.wav"),
]
api.create_commit(repo_id=repo_id, operations=operations, commit_message="Update icon")
```

All operations in the list land as **one commit** — this is the mechanism for atomic multi-file
changes when you don't want to re-push the entire folder. [C2, C11]

### 2.4 `preupload_lfs_files()` — not needed for the standard path; know it exists as an escape hatch

This function stages large binaries to S3/Xet storage ahead of the commit call, and **mutates the
`CommitOperationAdd` object in place** (discarding the in-memory binary content after upload, to
avoid holding large buffers in memory). It exists for callers building a **custom** commit-based
upload flow (e.g. if Studio ever needs fine control over commit batching for very large engine
asset bundles). For the voice bundle's actual scale — one or two audio samples, an icon, a JSON
manifest, and optionally a modest engine-embedding directory — `upload_folder()` handles this
transparently and there's no reason to call `preupload_lfs_files()` directly. **Gotcha worth
recording:** if a future change *does* build a custom commit flow, remember the mutation
side-effect — don't hold a reference to the original `CommitOperationAdd` expecting its
`path_or_fileobj`/binary content to still be there after preupload. [C3]

### 2.5 CLI equivalents (for docs/handbook parity, not for the in-app button)

`hf upload <repo_id> <local_dir> [--repo-type dataset]` auto-creates the repo if missing and
wraps the same `upload_file`/`upload_folder` helpers. This is what the repo spec's handbook page
should show for the **manual upload** path (the zip-and-push-yourself flow already documented in
`v2_huggingface_voice_repo_spec.md` §3), since it's the simplest correct incantation for a
technical user following docs, even though Studio's in-app button uses the Python API directly.
[C5, C13]

## 3. Repo type: model vs dataset (confirms the spec's existing choice, with the mechanism)

The repo spec (`v2_huggingface_voice_repo_spec.md` §2) already decided **model repo**, citing the
`widget.output.url` mechanism. Research confirms the precise gating behind that choice:

- `repo_type` is an explicit parameter (`create_repo`, `upload_folder`, `upload_file`, or
  `--repo-type` on the CLI) — it defaults to `"model"` and is never inferred from file content.
  [C6]
- **Dataset repos** get an automatic Data(set) Viewer — including playable audio — purely from
  having a supported file/directory structure, no widget config needed. But (a) framing a single
  voice as a "dataset" is a semantic mismatch the repo spec already rejected, and (b) dataset-repo
  auto-metadata (transcriptions, etc.) is only picked up from a `metadata.csv`/`.jsonl`/`.parquet`
  file with a `file_name` column — a plain `voice.json` alongside the audio is **not** itself
  recognized as dataset metadata by the Viewer. So even if Studio used a dataset repo, `voice.json`
  would need to stay purely a Studio-native sidecar; it would earn no automatic Hub-side metadata
  wiring either way. [C14, C15]
- **Model repos** do *not* get an automatic playable widget just from having audio files present.
  The interactive widget only renders when the model is actually served by an Inference
  Provider (irrelevant for a personal voice-clone bundle — no provider serves it) **or** when the
  model card declares a static `widget:` entry with an `output.url` pointing at a file in the repo
  (or a remote URL). This is exactly the mechanism the repo spec's generated `README.md` needs to
  emit — an `output.url: samples/preview.wav`-shaped YAML block — to get a working preview player
  on a model repo with no live inference backend. This is a **static showcase**, not a live
  widget; it should be described that way in any UI copy that promises a "preview" on the Hub
  page. [C16, C17]

**Actionable for the bundle README generator:** the YAML frontmatter Studio generates from
`voice.json` must include a `widget:` block with an `output.url` pointing at
`samples/preview.wav` (or whichever sample is marked `"primary": true`) — without it, the model
repo page will show no player at all, defeating the reason the repo spec picked "model" over
"dataset" in the first place. This is a concrete, previously-uncited action item that the repo
spec's rationale implies but doesn't spell out as an implementation requirement.

## 4. Large-file handling for audio/engine assets

- HF Hub's large-file backend is now **Xet** (chunk-level content-defined dedup), not classic
  Git LFS, though LFS remains supported for backward compatibility on older repos. Xet gives
  smaller uploads and faster downloads via chunk reuse across commits — relevant because a user
  re-publishing a voice after a minor `voice.json` edit will only re-transfer changed chunks, not
  the whole sample file again. [C18, C19]
- The **git-CLI** large-file threshold (10 MB, `.gitattributes`-driven, `git xet track` for
  uncovered extensions) is a distinct workflow from the **Python API** path. `upload_folder()` /
  `hf upload` handle chunking/dedup transparently through the `hf_xet` binding with no
  `.gitattributes` editing or extension-tracking step required from the caller — that manual
  tracking requirement is specific to users pushing via raw `git`/`git-lfs`, not to Studio's
  in-app uploader. Do not port the "add extensions to `.gitattributes`" mental model into the
  in-app upload code path; it doesn't apply there. [C12, C13]
- Net effect for Studio: **no LFS/Xet-specific code is needed in the uploader.** `wav`/`mp3`
  samples and any binary engine-embedding files are just regular files handed to
  `upload_folder()`; the library decides internally whether/how to route them through Xet.

## 5. Authentication UX patterns

Two patterns are both first-class in `huggingface_hub`, and match the two options the product
plan (`v2_huggingface_voice_interface.md` §7) already anticipates ("HF token is optional, stored
like other secrets"):

1. **Paste an access token.** Simplest to wire into a settings field: user creates a token at
   `huggingface.co/settings/tokens` (needs `write` scope for upload) and pastes it into Studio;
   Studio passes it as `HfApi(token=...)` / stores it the same way other secrets are stored (never
   logged, never bundled into exported voices — per the product plan's existing rule).
2. **OAuth device-code flow.** `huggingface_hub`'s CLI login (`hf auth login`) offers this as the
   default, browser-based alternative to pasting a token: it opens/prints
   `https://huggingface.co/oauth/device` plus a short code (e.g. `ABCD-EFGH`), the user approves
   in their browser, and the app polls/exchanges the device code for a token
   (`POST /oauth/device` → `POST /oauth/token` with
   `grant_type=urn:ietf:params:oauth:grant-type:device_code`). This is the RFC 8628 standard
   device-authorization grant, the same shape GitHub CLI uses. For a **desktop/local web app**
   with no public HTTPS redirect URI, this is the natural non-token-paste option — it avoids the
   user ever handling a raw long-lived PAT for casual publishing, at the cost of needing Studio to
   register an OAuth app (with the Hub) and implement the poll loop. [C7, C20]
3. **Public OAuth app shape.** If Studio does implement the device-code option, HF explicitly
   supports **public OAuth apps with no client secret** — the recommended shape for native/desktop
   apps that can't safely embed a secret, authenticating via `client_id` alone (optionally with
   PKCE for the authorization-code variant). This removes the "where do we hide the client secret
   in a locally-run app" problem that would otherwise block using OAuth from a local FastAPI
   process. [C21]

**Recommendation for the product doc:** treat paste-token as the v1 mechanism (matches the
"optional token, stored like other secrets" language already in
`v2_huggingface_voice_interface.md` §7 with zero new infrastructure), and flag OAuth device-code
as a fast-follow — it needs a registered public OAuth app but no secret storage, and it's a
strictly nicer UX for non-technical users who don't want to visit the HF tokens page manually.

## 6. Directory-layout compatibility: can `upload_folder` point straight at Studio's local voice dir?

Yes, with one caveat. The repo spec's canonical loose layout (`v2_huggingface_voice_repo_spec.md`
§4):

```
<namespace>/<voice-name>/
├── README.md
├── voice.json
├── icon.png
├── samples/
│   └── preview.wav (+ optional preview-*.wav)
├── assets/<engine_id>/...
└── LICENSE
```

...is already designed to be the literal on-disk shape, per that doc's own note that manual
upload means "push the unzipped files at the repo root (so `README.md`, `voice.json`, `icon.png`,
and `samples/` sit at top level)." That means:

- If Studio's local `tts_voices/<id>/` directory **is** this exact shape (README + voice.json +
  icon.png + samples/ + assets/ + optional LICENSE, nothing else), `upload_folder(folder_path=
  local_dir, repo_id=..., repo_type="model")` can point directly at it — no transformation step.
- The one thing to verify/handle at implementation time (not resolved by the research, flagged
  here for the product doc to settle): whether Studio's local `tts_voices/<id>/` directory also
  contains **local-only** working files that must never reach the Hub (e.g. temp render
  scratch, cached engine intermediates, `.DS_Store`, lockfiles, or any local metadata not meant
  for `voice.json`'s canonical spec). If so, those are excluded at upload time via
  `ignore_patterns=[...]` (or a `.gitignore` committed at the bundle root) — this is a filtering
  concern handled by `upload_folder`'s existing parameters, not a reason to repack into a
  temp/staging directory before upload. [C0, C1]
- Minor cross-doc note (not a contradiction to resolve here, just a flag for whoever implements
  this): the repo spec's example `voice.json` references `samples/preview.wav`, while
  `CLAUDE.md`'s binding audio-format convention states portable voice bundles are **MP3**
  (`samples/preview.mp3`). Whichever is correct, the local bundle directory and the Hub layout
  must use the *same* extension for the "byte-identical, no transform" property in this section
  to hold — if Studio's local storage keeps a WAV master and the bundle spec expects an MP3
  preview, an encode step is unavoidably part of "build the bundle," independent of the upload
  mechanism itself (this is a `voice.json`/repo-spec consistency question, not a `huggingface_hub`
  API question).

## 7. Gotchas checklist for implementation

- Always pass `repo_type="model"` explicitly on `create_repo`/`upload_folder` — never rely on the
  default silently matching intent, and never infer it from bundle contents. [C6]
- Use `exist_ok=True` on `create_repo` for "publish again" / "update" flows, since the voice may
  already have a repo from a prior push.
- Use `ignore_patterns` (or a bundle-root `.gitignore`) to keep local-only scratch files out of the
  pushed bundle rather than staging a temp copy. [C1]
- Don't call `preupload_lfs_files()` unless a future change needs custom commit batching — and if
  it does, remember it mutates the `CommitOperationAdd` in place and discards the in-memory binary
  afterward. [C3]
- The generated `README.md` model-card frontmatter must include a `widget: output.url:` entry
  pointing at the primary sample, or the Hub page will show no preview player at all (no
  Inference Provider will ever serve a personal voice-clone repo). [C16, C17]
- Don't port `.gitattributes`/`git xet track` extension-tracking logic into the Python upload
  path — it's a git-CLI-only concern and doesn't apply to `upload_folder()`. [C12]
- Token needs `write` scope for uploads (a read-only token will fail at `create_repo`/
  `upload_folder`, not at token-parse time) — surface this clearly as an error, not a silent 403.
  (General `huggingface_hub` auth behavior; not one of the individually re-verified claims above,
  flagged here as a practical UX point to test.)

## 8. Open questions carried back to the product/spec docs

The follow-through on these action items (the `upload_folder` switch, the generated README,
engine-asset inclusion) is tracked as an executable plan at
`design-docs/plans/active/huggingface_voice_upload/`.

1. Should Studio's local `tts_voices/<id>/` on-disk layout be made to exactly match the Hub loose
   layout byte-for-byte (so `upload_folder` truly needs zero `ignore_patterns`), or will local
   storage always carry extra working files that require filtering? This determines whether the
   "no transform step" property in §6 is exact or "exact modulo an ignore list."
   Recommend the product doc **must decide** which of the two it wants.
   ANSWER: Filter with ignore_patterns; do not force local storage to mirror the Hub shape 1:1
   if that would compromise Studio's own working-directory needs.
2. Does the repo spec's `README.md` generator already plan to emit the `widget.output.url` YAML
   block? If not, this should be added as an explicit requirement — otherwise voices published
   as model repos get no on-Hub preview at all, undermining the stated reason for choosing model
   over dataset.
3. WAV vs MP3 for `samples/preview.*` — reconcile the repo spec's example (`preview.wav`) against
   `CLAUDE.md`'s binding convention (portable voice bundles are MP3) before building the bundle
   generator, since this affects the encode-before-upload step, independent of the
   `huggingface_hub` API choice.
4. Does Studio want the OAuth device-code login path in v1, or is paste-token sufficient for the
   first release? Device-code needs a registered public HF OAuth app (no secret to manage, per
   §5.3) but adds a poll-loop implementation; token-paste needs zero new HF-side registration.

## Sources

Primary (huggingface_hub / Hugging Face official docs, current as of 2026-07):
- https://huggingface.co/docs/huggingface_hub/en/guides/upload
- https://github.com/huggingface/huggingface_hub/blob/main/docs/source/en/guides/upload.md
- https://huggingface.co/docs/huggingface_hub/en/guides/cli
- https://huggingface.co/docs/hub/en/models-uploading
- https://huggingface.co/docs/hub/en/repositories-getting-started
- https://huggingface.co/docs/hub/en/datasets-audio
- https://huggingface.co/docs/hub/models-widgets
- https://huggingface.co/docs/hub/en/xet/index
- https://huggingface.co/docs/hub/oauth
- https://github.com/huggingface/huggingface_hub

## Caveats

- No independent, real-world GitHub repo examples of a third-party "Push to Hub" button (voice
  cloning app, LoRA tool, ComfyUI-Manager-style hub) were captured as citable, individually
  verified claims in the underlying research pass — the surviving claims are entirely primary
  Hugging Face documentation. Treat §2–§5 as confirmed API behavior, but the "how do other creative
  AI tools structure their button/UX" comparative question (research prompt item 2) remains
  underserved by citable findings; worth a follow-up pass specifically against GitHub code search
  (e.g. `upload_folder(` usage in voice-cloning/LoRA-sharing repos) if that comparative detail is
  wanted before implementation.
- The Xet-vs-LFS transition is active/recent (2025-2026 rollout) — behavior described here matches
  current (`huggingface_hub` >= 0.32.0) docs; pin the dependency version and re-check this doc if
  upgrading across a major `huggingface_hub` version bump.
- Two claims from the original research pass were refuted on verification and are **not** relied
  on above: (a) a stronger claim that Xet uploads "automatically split very large folders into
  multiple commits" (refuted 0-3 — not corroborated); (b) a claim that `upload_folder` is fully
  resumable/idempotent with "no local state required to resume" (refuted 0-3 — resumability
  nuances were not verifiable as stated); (c) a claim that a raw folder with no `pipeline_tag`
  "will not surface an inference widget at all" stated too strongly (refuted 0-3 — the static
  `widget.output.url` mechanism in §3 is the correct, verified nuance, not a blanket "no widget
  ever" claim). Don't reintroduce these stronger forms when writing implementation code comments.
