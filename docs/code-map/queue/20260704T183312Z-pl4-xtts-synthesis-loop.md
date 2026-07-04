# PL-4 — Extract the shared XTTS synthesis loop (code-map queue entry)

Task: `design-docs/plans/active/simplification/06_plugin_consolidation.md` PL-4. Highest-risk task
in the plugin-consolidation backlog ("audio output correctness... do it alone, test hard"). Pure
refactor of `plugins/tts_xtts/plugin/core/xtts_inference.py`: no observable behavior change for
either call path, verified by a new parity test plus the full existing plugin + app suites.

## What changed

`_run_serve_job()` (warm-worker serve path) and `main()` (one-shot CLI path) each implemented the
same synthesis loop twice: sentence splitting, semicolon sub-pause splitting, sentence/paragraph
pause insertion (`SENTENCE_PAUSE_MS=180`, `PARAGRAPH_PAUSE_MS=650`, `PAUSE_CHAR_MS=400`),
per-segment marker emission (`[START_SEGMENT]`, `[PROGRESS]`, `[SEGMENT_SAVED]`), the
`_synthesize_one()` latents-vs-fallback-speaker_wav branch, per-segment WAV save, and the final
concatenated WAV save. `_normalize_speaker_wav_paths()` was also defined twice, byte-identical.

- Hoisted `_normalize_speaker_wav_paths()` to module level (one definition; both callers + both
  latent-computation functions now call the shared one).
- Extracted `_run_synthesis_loop(script, tts, xtts_model, device, *, language, speed, temperature,
  repetition_penalty, task_id, out_path, speaker_latents, emit_line, default_voice_profile_dir=None,
  voice_reference_error_detail=False)` — both `_run_serve_job()` and `main()` now call this one
  function instead of running their own ~250-300 line copy.
- `main()`'s speaker pre-load loop was switched to call the shared `build_unique_speakers()`
  helper (`core/serve_speakers.py`, already used by serve mode and already covered by
  `test_serve_speakers.py`) instead of its own inline, logically-equivalent loop — verified
  identical key/value construction before switching (same `speaker_key()`, same `sw or None`
  storage), not a behavior change.

## Genuine divergences found and how each was handled (none unified away)

1. **Latent-cache staleness check** (the one named in the plan doc): serve mode's `_get_latents`
   has no invalidation — once a `latent.pth` exists it is trusted forever. One-shot mode's
   `get_latents` gates reuse on `_profile_fingerprint()` (sha256 over each profile wav's
   name+size+mtime), rebuilding when a voice profile's source wavs changed. This logic runs
   *before* `_run_synthesis_loop` (building the `speaker_latents` dict that's passed in as a
   parameter) and was deliberately left outside the shared loop — it's a genuine cache-correctness
   difference, not boilerplate. Documented with matching comments at both `_get_latents` (serve)
   and `get_latents` (one-shot).
2. **`.pth` direct-load branch structure/error handling**: serve's version checks the `.pth`
   shortcut first and re-raises on failure; one-shot's checks it after `_normalize_speaker_wav_paths`
   and does not re-raise (falls through to try the cache/recompute path instead). Untouched — both
   still live in their respective un-shared latent functions.
3. **Marker flush behavior**: serve mode always flushes every marker line immediately
   (`_emit_stderr_line(msg, flush=True)`) — required by the warm-worker's persistent stderr reader
   (commit `8b9ae90a`, fixed a marker-corruption bug from orphaned per-job readers) to see markers
   promptly. One-shot mode's original code did NOT flush two lines explicitly (`[SEGMENT_SAVED]`
   and the final "Successfully synthesized..." line were bare `print(..., file=sys.stderr)`,
   relying on default buffering). Preserved via an `emit_line` callable each caller supplies: serve
   always passes `flush=True`; one-shot's wrapper checks the line prefix and flushes for everything
   except those two line types, reproducing the exact original per-line behavior.
4. **"No voice reference" error message detail**: serve's message is short ("No voice reference
   available"); one-shot's includes a repr of the missing `speaker_wav`. Preserved via the
   `voice_reference_error_detail` bool parameter (`False` for serve, `True` for one-shot).
5. **Exception-to-outcome translation**: serve's `_run_serve_job` catches the loop's exception and
   returns `1` (continuing its serve loop for the next job); one-shot's `main()` catches it and
   calls `sys.exit(1)` (process exit). Both exception handlers are untouched, sitting around the
   shared `_run_synthesis_loop(...)` call at each site — the loop itself only raises, it never
   decides return-code-vs-exit.
6. **Segment `voice_profile_dir` fallback source**: both callers fall back to a job/args-level
   default `voice_profile_dir` when a segment doesn't specify its own — threaded through as the new
   `default_voice_profile_dir` parameter (this was almost dropped during extraction; caught by
   re-reading both originals side by side before finalizing the loop body).

No genuine divergence was found that could not be cleanly parameterized — no owner escalation
needed.

## Marker-parity test (new)

`plugins/tts_xtts/tests/test_synthesis_loop_parity.py` — runs a real 2-segment script (via
`script_json`, so `[START_SEGMENT]`/`[SEGMENT_SAVED]` are genuinely exercised, not skipped) through
both `_run_serve_job()` and `main()` with a deterministic mocked TTS model (output is a pure
function of text + every synthesis parameter, so the test is sensitive to a future parameter-only
drift between the two call sites, not just control-flow changes). Asserts:
- byte-identical final WAV output and byte-identical per-segment WAV output for both paths.
- identical marker-*type* sequence (`[START_SYNTHESIS]`/`[START_SEGMENT]`/`[PROGRESS]`/
  `[SEGMENT_SAVED]`, extracted with a regex tolerant of tqdm's `\r`-based progress-bar text sharing
  stderr lines with markers — a capture artifact of tqdm writing to the same stream, not a real
  behavior signal).

Manually verified this test has teeth (not committed as a stashable regression fixture, since there
is no pre-existing "bug" here — this is a parity lock, not a defect fix): temporarily injected a
per-call-site-only parameter drift (`temperature + 0.2` in just the serve call) and a marker-drop
(`[START_SEGMENT]` swallowed in just serve's `emit_line`), confirmed the test failed for the
expected reason each time (audio-byte diff / marker-sequence diff respectively), then reverted and
confirmed byte-identical restoration via diff against a backup.

## Verify

Full plugin suite (`plugins/tts_xtts/tests`) green: 185 passed, 1 skipped (184 passed, 1 skipped
baseline + 1 new parity test). Full repo `pytest -q`: 2197 passed, 3 skipped. `ruff check .` clean.

## Spec

None — per the plan doc, this loop is internal to the plugin with no associated spec doc.
