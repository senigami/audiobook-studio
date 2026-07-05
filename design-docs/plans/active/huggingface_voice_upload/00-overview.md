# Overview

## The task

Studio can already export a voice to a `.asvoice.zip` and push it to Hugging Face — both
`/api/voices/huggingface/export` and `/upload` endpoints exist and are wired end-to-end. But the
implementation is a deliberately partial scaffold (its own docstring in
`app/domain/voices/huggingface.py:608` calls `export_hf_voice_bundle` "a self-contained
scaffold"). Closing the gap means the published Hub repo actually matches
`v2_huggingface_voice_repo_spec.md`'s canonical shape, so:

- The Hub page shows an icon, a playable sample widget, and full tags (not just a bare
  `voice.json` + one MP3).
- The directory structure survives the trip: `samples/preview.mp3` must land as
  `samples/preview.mp3` on the Hub, not get flattened to `preview.mp3` at repo root.
- No repacking/transformation step is needed beyond what `export_hf_voice_bundle` already
  produces — one folder, one atomic push.

## Success criteria (what "done" means)

1. Publishing a voice to Hugging Face produces a repo containing `voice.json`, a generated
   `README.md` (with `widget.output.url` YAML pointing at the primary sample — the exact
   mechanism that makes the Hub page show a player), `icon.png` when the voice has one, and
   `samples/preview.mp3` at its correct nested path (not flattened).
2. The push is **one atomic commit** via `HfApi.upload_folder()`, not N sequential
   `upload_file()` calls.
3. `design-docs/plans/reference/v2_huggingface_voice_repo_spec.md`'s WAV-vs-MP3 inconsistency
   (flagged by the implementation research doc) is corrected — the code has always been right
   (MP3), the doc's `voice.json` example is wrong (says `preview.wav`).
4. Engine-specific asset inclusion (`assets/<engine_id>/`, repo spec §6) has an explicit,
   recorded decision on variant scoping (see Open Questions) — implemented if decided, or
   clearly deferred with the reason recorded, but not silently guessed.
5. `design-docs/plans/TASKS.md` and the three related docs cross-link this plan.
6. Full `pytest -q` and `ruff check .` stay green; every behavior change has a test that fails
   on the pre-change code (R1 revert-check, per `design-docs/specs/testing-standards.md`).

## Scope

**In scope:** `app/domain/voices/huggingface.py` (`export_hf_voice_bundle`, `HFHubClient`,
`upload_voice_to_hub`), `app/api/routers/voices_huggingface.py` (`/export`, `/upload` endpoints
only), `design-docs/plans/reference/v2_huggingface_voice_repo_spec.md` (doc correction),
`design-docs/plans/TASKS.md` (annotation).

**Out of scope (non-goals):**
- The `/search` and `/inspect` (import-side) endpoints and flows — untouched.
- Implementing OAuth device-code login — flagged as a decided-later fast-follow in the product
  doc, not built here (see `design-docs/plans/reference/v2_huggingface_upload_implementation.md` §5).
- `app/domain/voices/bundles.py`'s own multi-variant `.zip` export (the *other*, Studio-to-Studio
  portability exporter) — untouched, except that this plan **reuses** its
  `generate_readme_md()` function (see `01-map.md`); it does not modify `bundles.py`'s zip
  layout or its own export/import round-trip.
- `voice.schema.json` strict validation (`bundles.py`'s `validate_voice_manifest_strict`) is not
  wired into the HF export path in this plan — flagged as a possible future hardening step, not
  required for this gap.

## Open questions (owner decision required before task 004)

1. **Which variant's engine asset gets published to `assets/<engine_id>/`?** A Studio "voice"
   can have multiple named variants (e.g. "Default", "Angry"), each independently bound to one
   engine (`variant_manifest["engine"]`) with its own model asset (`latent.pth` per
   `bundles.py:28`). The HF repo spec models one voice as one flat card with one `engines[]`
   list — it does not have a concept of multiple internal variants. Two options:
   - (a) Always publish the voice's **default variant**'s engine asset only.
   - (b) Let the caller specify which variant to publish (`ExportRequestModel`/
     `UploadRequestModel` gain an optional `variant_name`, defaulting to the default variant).
   Task 004 is written to implement (a) as the default behavior with the parameter for (b) as an
   additive, backward-compatible option — but **flag this explicitly to the owner before
   shipping task 004**; don't let it ship silently as an assumption.
2. Should the generic best-effort `ModelCard.from_template(...).push_to_hub(...)` fallback
   (current `upload_files`, `app/domain/voices/huggingface.py:433-440`) be deleted outright once
   the generated `README.md` ships as part of the folder (task 002 lands before task 003), or
   kept as a defensive fallback for the case where `README.md` is somehow missing from the
   folder? Task 003 removes it — flag if you'd rather keep a fallback.
