# Task 002 — `export_hf_voice_bundle` gains icon.png + generated README.md

Status: complete — 2026-07-12

## Goal

The HF export bundle currently contains only `voice.json` + `samples/preview.mp3`. Add the
generated `README.md` (reusing `bundles.py`'s existing `generate_readme_md()` — do not write a
new README generator) and the voice's `icon.png` when present, both optional/additive so a voice
with no icon still exports successfully.

## Files

- `app/domain/voices/huggingface.py` — `export_hf_voice_bundle()` at line 608
- `app/api/routers/voices_huggingface.py` — `export_hub_voice()` at line 289
- `tests/domain/test_voice_huggingface.py` — `TestExportHFVoiceBundle` at line 154

## Current contract (exact, line 608-641 of `huggingface.py`)

```python
def export_hf_voice_bundle(
    *,
    voice_manifest: dict[str, Any],
    sample_mp3_bytes: bytes,
    output_dir: Path,
    bundle_name: str,
) -> Path:
    """Write a portable ``<bundle_name>.asvoice.zip`` under ``output_dir``.
    ...
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    bundle_path = safe_join_flat(output_dir, f"{bundle_name}{ASVOICE_BUNDLE_SUFFIX}")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(ASVOICE_MANIFEST_FILENAME, json.dumps(voice_manifest, indent=2))
        zf.writestr("samples/preview.mp3", sample_mp3_bytes)

    bundle_path.write_bytes(buffer.getvalue())
    return bundle_path
```

## Target contract

```python
def export_hf_voice_bundle(
    *,
    voice_manifest: dict[str, Any],
    sample_mp3_bytes: bytes,
    output_dir: Path,
    bundle_name: str,
    icon_bytes: bytes | None = None,
) -> Path:
    """Write a portable ``<bundle_name>.asvoice.zip`` under ``output_dir``.

    Always includes ``voice.json`` and ``samples/preview.mp3``. Also includes a
    generated ``README.md`` (via ``bundles.generate_readme_md`` — the same
    HF-card generator the Studio-to-Studio bundle exporter uses, reused here
    rather than duplicated) and, when ``icon_bytes`` is provided, ``icon.png``.
    ``icon_bytes`` is optional so a voice with no icon set still exports
    successfully with just the three always-present files.
    """
    from .bundles import generate_readme_md  # local import: avoid a module-level

    output_dir.mkdir(parents=True, exist_ok=True)
    bundle_path = safe_join_flat(output_dir, f"{bundle_name}{ASVOICE_BUNDLE_SUFFIX}")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(ASVOICE_MANIFEST_FILENAME, json.dumps(voice_manifest, indent=2))
        zf.writestr("samples/preview.mp3", sample_mp3_bytes)
        zf.writestr("README.md", generate_readme_md(voice_manifest))
        if icon_bytes:
            zf.writestr("icon.png", icon_bytes)

    bundle_path.write_bytes(buffer.getvalue())
    return bundle_path
```

Note: `generate_readme_md` is imported locally inside the function (matching this module's
existing pattern of local/lazy imports for cross-module calls — see `download_files`'s
`from huggingface_hub import hf_hub_download` at line 352 for the convention to imitate), not
added to the top-level import block. This keeps `huggingface.py` import-side-effect-free per
`.agent/rules/modular_architecture.md` and avoids a module-level dependency on `bundles.py`.

## Router change (`app/api/routers/voices_huggingface.py`, `export_hub_voice`, line 289-318)

Add an icon read, mirroring the existing sample-read pattern immediately above it:

```python
    icon_bytes: bytes | None = None
    try:
        icon_path = contained_path(voice_dir, "icon.png")
    except ValueError:
        icon_path = None
    if icon_path is not None and icon_path.exists():
        icon_bytes = icon_path.read_bytes()

    export_dir = contained_path(TRANSIENT_DIR, "hf_exports")
    bundle_path = export_hf_voice_bundle(
        voice_manifest=manifest,
        sample_mp3_bytes=sample_bytes,
        output_dir=export_dir,
        bundle_name=safe_basename(body.voice_id),
        icon_bytes=icon_bytes,
    )
```

Insert the `icon_bytes` block right before the existing `export_dir = ...` line, and add
`icon_bytes=icon_bytes` to the `export_hf_voice_bundle(...)` call. `contained_path` is already
imported in this router (used for `sample_bytes` right above).

## Verified gap (added 2026-07-04, Fable accuracy review — read before implementing)

`generate_readme_md` emits the `widget:` block — the exact mechanism this plan's success
criterion 1 depends on for the playable Hub sample — **only when
`voice_manifest["samples"]` is non-empty** (`bundles.py:141,160-165`). The only code that ever
writes `samples[]` into a local `voice.json` is the v1-schema migration
(`migration.py:283-305`, sourced from a variant's `preview_audio`), and
`final_release/04_voice_metadata_and_tagging.md` records that current voices have no
`preview_audio` to migrate. So a typical installed voice's manifest has **no** `samples[]`,
and the target contract as written would produce a README with tags but **no widget** — while
every test specified below still passes (the API test fixture `_make_voice_root` hand-writes a
`samples[]` entry, hiding the gap).

Required handling: when the export path has sample bytes (the router found
`samples/preview.mp3`/`sample.mp3`) but the manifest lacks a `samples[]` entry, ensure the
manifest handed to `generate_readme_md` — and written into the bundle's `voice.json`, so the
on-Hub manifest and README agree — carries
`{"path": "samples/preview.mp3", "primary": true}` (synthesize it; do not mutate the on-disk
`voice.json`). Add a test asserting the generated README contains `url: samples/preview.mp3`
inside a `widget:` block for a manifest **without** a pre-existing `samples[]` key — that test
fails against the bare reuse-only implementation. Secondary, same class of bug:
`generate_readme_md` defaults `image` to `"icon.png"` even when the bundle has no icon —
acceptable (harmless broken `<img>`), but note it to the owner rather than silently shipping.

## Steps

- [x] Edit `export_hf_voice_bundle()` per the target contract above (add `icon_bytes` param,
      local import of `generate_readme_md`, two new `zf.writestr` calls).
- [x] Handle the no-`samples[]` manifest case per the "Verified gap" section above, with its
      widget-asserting test.
- [x] Edit `export_hub_voice()` per the router change above.
- [x] Update `tests/domain/test_voice_huggingface.py::TestExportHFVoiceBundle::test_export_produces_expected_asvoice_zip_structure`:
      the current assertion `assert names == {"voice.json", "samples/preview.mp3"}` must become
      `assert names == {"voice.json", "samples/preview.mp3", "README.md"}` (no `icon_bytes` passed
      in that test, so `icon.png` must NOT appear — this is the R1 check that the optional-icon
      path is truly optional).
- [x] Add one new test in the same class: `test_export_includes_icon_when_provided` — call
      `export_hf_voice_bundle(..., icon_bytes=b"fake-png-bytes")` and assert
      `"icon.png" in names` and `zf.read("icon.png") == b"fake-png-bytes"`.
- [x] Add one new test: `test_export_readme_reflects_voice_manifest` — call with a
      `voice_manifest` containing `name`/`description`/`attributes`, read back
      `zf.read("README.md").decode()`, assert the voice's `name` appears in it (don't assert the
      full generated text verbatim — that couples this test to `generate_readme_md`'s internals,
      which already has its own tests in `bundles.py`'s test file).

## R1 revert-check

Before committing: `git stash push -- app/domain/voices/huggingface.py
app/api/routers/voices_huggingface.py`, run the 2 new tests, confirm they fail (README/icon
missing from the zip), `git stash pop`, confirm they pass.

## Acceptance criteria

- [x] `export_hf_voice_bundle` signature matches the target contract exactly.
- [x] `./venv/bin/python -m pytest tests/domain/test_voice_huggingface.py -q` — all pass,
      including the 2 new tests and the updated structure assertion.
- [x] `./venv/bin/python -m pytest tests/api/test_api_voices_huggingface.py -q` — still green
      (the `/export` endpoint test doesn't assert exact zip contents beyond existence, per current
      `test_export_produces_bundle_for_installed_voice`, but re-check that assumption before
      assuming no change is needed there).
- [x] `ruff check app/domain/voices/huggingface.py app/api/routers/voices_huggingface.py` clean.
- [x] `git diff app/domain/voices/bundles.py` is empty (INV-HF-4 — this task imports from
      `bundles.py`, never edits it).

## Dependencies

None (can run before or in parallel with task 003 — see `02-roadmap.md` for the
same-router-file serialization note if run concurrently with task 003).

## Map links

`01-map.md` — Parts: `export_hf_voice_bundle()`, `generate_readme_md()`, `icon.png` convention.
Connections diagram, top half (`voices_metadata.py` → `icon.png` → `export_hf_voice_bundle`).
Invariants: INV-HF-4, INV-HF-5.

## Out of scope

- Do not touch `HFHubClient.upload_files` or anything upload-mechanism-related — that's task 003.
- Do not add `assets/<engine_id>/` inclusion — that's task 004 (owner-gated).
- Do not modify `bundles.py` itself.
