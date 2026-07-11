# Implementation map

## Big picture

Two independent export/import pipelines exist for Studio voices today. Confusing or merging them
is the single biggest way to get this plan wrong, so the map exists mainly to keep them separate:

```
Pipeline 1 (UNTOUCHED by this plan): Studio-to-Studio portability
  app/domain/voices/bundles.py: export_voice_bundle() / import_voice_bundle()
  → multi-variant zip: voice.json, README.md, bundle.json, <VariantName>/profile.json,
    <VariantName>/sample.mp3, <VariantName>/latent.pth, ...
  → used by app/api/routers/voices_bundles.py (a *different* router, not in scope)

Pipeline 2 (THIS PLAN): Hugging Face Hub publish
  app/domain/voices/huggingface.py: export_hf_voice_bundle() / HFHubClient.upload_files()
  → flat, single-card zip: voice.json, README.md, icon.png, samples/preview.mp3,
    assets/<engine_id>/...   (no per-variant subdirectories — HF has no "variant" concept)
  → used by app/api/routers/voices_huggingface.py (/export, /upload)
```

They currently share **zero code** except both eventually reading the same on-disk
`voice.json` (`app/domain/voices/manifest.py`). This plan makes them share exactly **one**
function — `generate_readme_md()` — deliberately, not by merging the pipelines. Pipeline 1's
directory layout (variant-subdirectory-per-preset) is fundamentally incompatible with the HF
repo spec's flat single-card layout; do not try to unify the zip-writing logic itself.

## Parts

| Part | File | Responsibility |
|---|---|---|
| `export_hf_voice_bundle()` | `app/domain/voices/huggingface.py:608` | Builds the flat HF-shaped `.asvoice.zip` (currently: `voice.json` + `samples/preview.mp3` only) |
| `generate_readme_md()` | `app/domain/voices/bundles.py:98` | **Reused, not reimplemented.** Pure function: `voice_manifest dict -> README.md string` with YAML frontmatter (tags, license, `widget.output.url`). Produces exactly the shape `v2_huggingface_voice_repo_spec.md` §7 describes **when the manifest carries a `samples[]` entry** — the `widget:` block (the thing that makes the Hub page playable) is emitted only if `voice_manifest["samples"]` is non-empty (`bundles.py:141,160`). Only the v1-schema migration (`migration.py:283-305`, from a variant's `preview_audio`) ever writes `samples[]` locally, and `final_release/04_voice_metadata_and_tagging.md` notes current voices have no `preview_audio` to migrate — so a typical local `voice.json` has **no** `samples[]` and would get a widget-less README. Task 002 must handle this (see its "Verified gap" note). <!-- qualified 2026-07-04, Fable accuracy review --> |
| `HFHubClient.upload_files()` | `app/domain/voices/huggingface.py:405` | Pushes files to the Hub. **Currently**: N sequential `upload_file()` calls with `path_in_repo=Path(file_path).name` (flattens structure, non-atomic) + a separate generic `ModelCard.push_to_hub()` fallback for tags. **Target**: one `create_repo()` + one `upload_folder()` call. |
| `upload_voice_to_hub()` | `app/domain/voices/huggingface.py:649` | Thin wrapper: `upload_hub_voice` router → this → `HFHubClient.upload_files`. Signature changes ripple through here. |
| `export_hub_voice` / `upload_hub_voice` | `app/api/routers/voices_huggingface.py:289,332` | FastAPI endpoints. `/upload` currently calls `/export` internally, extracts the zip to `extract_dir`, then builds a flat `loose_files` list via `rglob("*")` before calling `upload_voice_to_hub`. |
| `icon.png` convention | `app/api/routers/voices_metadata.py:198` (`_ICON_FILENAME`) | Already the real, existing local file convention — a voice's icon already lives at `<voice_dir>/icon.png` when set. Nothing to invent here, just read it if present. |
| `voice.json` local manifest | `app/domain/voices/manifest.py` | Already schema-aligned with the HF spec's `voice.json` (has `attributes`, `tags`, `taxonomy_version`). Not modified by this plan. |
| `v2_huggingface_voice_repo_spec.md` | `design-docs/plans/reference/` | The target shape. Has one factual bug this plan fixes: its `voice.json` example says `samples/preview.wav`; the actual code (and `CLAUDE.md`'s binding convention) is MP3. |

## Connections (the wiring an executor must not break)

```
voices_metadata.py (icon upload)  ──writes──>  <voice_dir>/icon.png
                                                      │
                                                      │ read (task 002)
                                                      ▼
export_hf_voice_bundle()  ──calls (task 002)──>  generate_readme_md()  [from bundles.py]
        │                                              (pure fn, voice_manifest -> str)
        │ writes zip: voice.json, README.md, icon.png, samples/preview.mp3, [assets/<engine_id>/]
        ▼
export_hub_voice() [router]  ──returns bundle_path──>  upload_hub_voice() [router]
        │                                                      │
        │                                                extracts zip to extract_dir
        │                                                      │
        │                                          (task 003: pass extract_dir directly,
        │                                           not a flattened file list)
        ▼                                                      ▼
                                          upload_voice_to_hub(client, hub_id, extract_dir, ...)
                                                      │
                                                      ▼
                                          HFHubClient.upload_files(hub_id, folder_path, ...)
                                                      │
                                                      ▼
                                          api.create_repo() + api.upload_folder(folder_path=...)
                                                      │  ONE atomic commit, structure preserved
                                                      ▼
                                                 Hugging Face Hub repo
```

**Signature change ripples (task 003):** `HFHubClientProtocol.upload_files` and
`HFHubClient.upload_files` change from `files: list[Path]` to `folder_path: Path`. Every caller
and every test that constructs a fake client or asserts on `upload_file`/`upload_files` call
shape must move together in the same change:
- `upload_voice_to_hub()` (`huggingface.py:649`) — parameter rename/passthrough.
- `upload_hub_voice()` (`voices_huggingface.py:332`) — stop building `loose_files`, pass
  `extract_dir` directly.
- `tests/domain/test_voice_huggingface_client.py::TestHFHubClientUpload` — 4 tests assert the
  old per-file-loop behavior; they must assert `upload_folder` was called once instead.
- `tests/api/test_api_voices_huggingface.py::TestUploadEndpoint::test_upload_pushes_extracted_bundle_files_and_never_returns_token`
  — asserts more than call count: lines 323-328 check `call["files"]` basenames
  (`voice.json`, `preview.mp3`) and `call["tags"]` — those assertions must be rewritten
  against the extracted folder's contents, not just key-renamed. <!-- corrected 2026-07-04,
  Fable accuracy review: previously described as "only asserts len(upload_calls) == 1" -->
- `tests/domain/test_voice_huggingface.py` — its own `FakeHFHubClient.upload_files`
  (line 56) and `TestTokenHandling::test_token_not_present_in_upload_log_output`
  (calls `upload_voice_to_hub(client, ..., [sample_file], ...)` and serializes
  `upload_calls[0]["files"]` at line 272) must move in the same change — note this is
  the very test INV-HF-1 below names; "unmodified in intent" still requires the
  mechanical signature update. <!-- added 2026-07-04, Fable accuracy review: this fake
  was missing from the ripple list -->

- Any fake implementing `HFHubClientProtocol` elsewhere in the test suite (grep for
  `HFHubClientProtocol` before starting task 003 — don't assume the list above is exhaustive).

## Invariants (must hold across every task in this plan)

- **[INV-HF-1] Token never leaves the process boundary.** No task may log, return, or write the
  HF token value anywhere — this is already tested
  (`tests/domain/test_voice_huggingface.py::test_token_not_present_in_upload_log_output` /
  `test_token_not_present_in_exported_bundle`, `tests/security/test_huggingface_token_security.py`).
  Any new code path touching the token must keep passing these, unmodified in intent.
- **[INV-HF-2] `repo_type="model"` is always explicit, never inferred.** Per the implementation
  research doc §3 — a silently-defaulted or content-inferred `repo_type` is exactly the kind of
  bug that would ship a voice as the wrong Hub artifact type.
- **[INV-HF-3] Path-traversal guards on every Hub-derived or user-typed name stay intact.**
  `validate_hub_id`, `safe_basename`, `safe_join_flat`, `contained_path` are already in place
  (see `huggingface.py`'s module docstring) — no task in this plan removes or weakens them, even
  incidentally while refactoring `upload_files`.
- **[INV-HF-4] `bundles.py`'s own export/import round-trip (Pipeline 1) is never modified.**
  Reusing `generate_readme_md()` is an import, not an edit — `bundles.py` itself should have zero
  diff from this plan (verify with `git diff app/domain/voices/bundles.py` showing nothing after
  each task).
- **[INV-HF-5] Every zip-structure test that currently passes for the *absent* case (no icon, no
  README, no assets) must keep passing** — the new fields are additive/optional, matching how a
  voice with no icon set today behaves. Don't make `icon.png`/`assets/` required.

## Risks

- **Test-contract drift risk (task 003):** the 4+ existing tests asserting per-file-loop behavior
  will fail after the signature change until updated *in the same commit* — this is expected and
  required, not a regression to avoid. Missing one of them ships a half-migrated state.
- **Silent scope-widening risk (task 004):** the variant-vs-engine_id question (Open Question 1
  in `00-overview.md`) is easy to "just pick an answer" for without flagging it — resist that;
  it's a real product decision, not an implementation detail.
- **bundles.py coupling risk:** importing `generate_readme_md` from `bundles.py` into
  `huggingface.py` creates a one-way dependency (`huggingface.py` → `bundles.py`). Confirm this
  doesn't create an import cycle (`bundles.py` does not import anything from `huggingface.py`
  today — verify this stays true).

## Open questions

See `00-overview.md`'s "Open questions" section — both apply across tasks 003-004, not to a
single task in isolation, which is why they're tracked at the plan level rather than buried in
one task file.
