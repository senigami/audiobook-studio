# samples/

Put the voice's preview audio here.

- **`preview.wav`** — required. The primary sample. It is what the Hugging Face page plays
  (via the `widget … output.url` in the bundle README) and what Studio plays in the Voice
  Lab. Keep it short (a sentence or two) and representative.
- `preview-*.wav` — optional extra samples (different emotions or languages). List each in
  `voice.json` under `samples[]`.

This folder ships a placeholder README only because binary audio isn't included in the
template. Replace it with a real `preview.wav` before publishing.
