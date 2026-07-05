# Task 001 — Fix WAV/MP3 discrepancy in the repo spec doc

Status: complete — 2026-07-04

## Goal

`design-docs/plans/reference/v2_huggingface_voice_repo_spec.md` documents `voice.json`'s primary
sample as `samples/preview.wav`, but this repo's binding audio-format convention (CLAUDE.md:
"voice samples/previews are MP3") and the actual shipped code
(`app/domain/voices/huggingface.py:302`: `for candidate in ("samples/preview.mp3", "sample.mp3")`,
and `bundles.py:27`: `PREVIEW_ASSET_NAMES = {"sample.mp3", "sample.wav"}` preferring mp3) both use
MP3. The doc is stale, not the code. Fix the doc.

## Files

- `design-docs/plans/reference/v2_huggingface_voice_repo_spec.md`

## Exact changes

In the file, replace every occurrence of `preview.wav` with `preview.mp3` and every occurrence of
`samples/preview.wav` with `samples/preview.mp3`. As of this writing these appear in:
- §4 canonical repo file layout (the ASCII tree): `preview.wav       # Primary sample...` →
  `preview.mp3       # Primary sample...` (keep the trailing comment text, just fix the
  extension); `preview-*.wav` → `preview-*.mp3`.
- §5 `voice.json` example: `"path": "samples/preview.wav"` → `"path": "samples/preview.mp3"`.
- §7 `README.md` example's YAML: `url: samples/preview.wav` → `url: samples/preview.mp3`.

Do a literal search for the string `preview.wav` in the file and fix every hit — do not rely on
this list being exhaustive if the file has changed since this task was written.

## Steps

- [x] `grep -n "preview.wav" design-docs/plans/reference/v2_huggingface_voice_repo_spec.md` — list
      every hit.
- [x] Replace each with the `.mp3` extension, preserving surrounding text/formatting exactly.
- [x] Re-run the grep — confirm zero hits for `preview.wav` remain in the file.

## Acceptance criteria

- [x] `grep -c "preview.wav" design-docs/plans/reference/v2_huggingface_voice_repo_spec.md`
      returns `0`.
- [x] `grep -c "preview.mp3" design-docs/plans/reference/v2_huggingface_voice_repo_spec.md`
      returns the same count that `preview.wav` had before the edit (no hits lost or duplicated).
- [x] No other content in the file changed (this is a pure find-replace on one string).

## Verification

```bash
grep -n "preview\.\(wav\|mp3\)" design-docs/plans/reference/v2_huggingface_voice_repo_spec.md
```
Expect only `.mp3` matches.

## Dependencies

None — fully independent, safe to do first or anytime.

## Map links

See `01-map.md`, "Parts" table row for `v2_huggingface_voice_repo_spec.md`.

## Out of scope

Do not touch any other doc, and do not touch `app/domain/voices/huggingface.py` or
`bundles.py` — their MP3 behavior is already correct; this task only fixes the doc.
