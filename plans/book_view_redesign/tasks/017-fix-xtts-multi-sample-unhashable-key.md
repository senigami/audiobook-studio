# 017 — Fix XTTS synthesis crash for multi-sample voices (unhashable key)

- **Status:** done
- **Workload:** Real-app bug fixes
- **Severity / type:** critical · logic (blocked ALL XTTS rendering; live, 2026-06-17)
- **Blocked by:** 015 (which surfaced the real cause)
- **Blocks:** nothing

## Goal
XTTS synthesis no longer crashes with `TypeError: unhashable type: 'list'` when a voice has multiple reference samples; the chapter renders to audio.

## Why this matters
Every XTTS render 500'd with the opaque "did not produce an audio file." Task 015's diagnostics surfaced the true cause from the TTS server log:
```
xtts_inference.py:317 in _run_serve_job
    unique_speakers[key] = (sw or None, vpdir)
TypeError: unhashable type: 'list'
```
A voice with multiple reference samples has `speaker_wav` as a **list**; the serve loop put it inside the tuple dict key `(vpdir, sw)`, which is unhashable. The worker crashed before producing audio. The list is legitimate downstream (`xtts_model.get_conditioning_latents(audio_path=...)` accepts a list), so only the key needed to be hashable.

## What was done
- New torch-free helper `plugins/tts_xtts/plugin/core/serve_speakers.py` → `build_unique_speakers(script, default_voice_profile_dir)`: normalizes a list `speaker_wav` to a `tuple` for the dict key while keeping the original `speaker_wav` (list intact) in the stored value. Importable in the main venv (no torch), so it's unit-testable — `xtts_inference.py` itself can't be (subprocess/torch only).
- `plugins/tts_xtts/plugin/core/xtts_inference.py` `_run_serve_job`: inline build (≈ lines 311-317) replaced with `build_unique_speakers(script, voice_profile_dir)`; downstream latent loop unchanged.
- Tests: `plugins/tts_xtts/tests/test_serve_speakers.py` (7 cases incl. list speaker_wav hashable, string dedup, and an R1 regression guard reproducing the old key form → `TypeError`).

## Acceptance criteria
- [x] A script entry with `speaker_wav` as a list builds the speaker map without raising; value keeps the list.
- [x] String `speaker_wav` still dedupes correctly.
- [x] Revert-checked; `pytest -q` green (1 pre-existing unrelated failure — see note); `ruff` clean.
- [ ] **Owner verification:** restart the app (TTS server subprocess reloads `xtts_inference.py`), re-render Chapter 1 / Dracula → produces audio.

## Root-cause fix (fusion triage — supersedes the partial patches above)
The earlier patches treated symptoms (one key site, then an import). A fusion-reasoning panel found the real **class**: the latent-cache key was **constructed in one place and rebuilt differently in another**, and this logic was **duplicated across two functions** — `_run_serve_job` (warm worker, lookup was line 376) AND `main()` (one-shot fallback, lookup was line 708). Two defects: (1) the list crash, and (2) a silent cache-miss even for string voices when `voice_profile_dir` is a `Path` (`str(vpdir)` on construct vs raw `Path` on lookup) → every segment fell to the slow per-sentence path, and a list `fallback_sw` would then hit `synthesizer.tts` (which, unlike `get_conditioning_latents`, doesn't accept a list) — a latent second crash.

**Fix:** one canonical `speaker_key(voice_profile_dir, speaker_wav)` in `serve_speakers.py`, used by `build_unique_speakers` AND all lookups (both functions), so construction/lookup can never diverge again; plus `fallback_sw` list→single-string normalization in both functions. New `plugins/tts_xtts/tests/test_speaker_key.py` (17 tests incl. construction==lookup regression guards + revert-checks for both old failure modes). Full suite green.

## Follow-up fix (import regression)
The first version of this fix imported the helper as `from plugins.tts_xtts.plugin.core.serve_speakers import …`, which threw `ModuleNotFoundError: No module named 'plugins'` in the **subprocess** — `xtts_inference.py` runs as a standalone script with only `ROOT_DIR = plugins/tts_xtts/plugin` on `sys.path` (not the repo root). Corrected to `from core.serve_speakers import build_unique_speakers` (verified by simulating the subprocess sys.path). The test's full-path import is unaffected (pytest context has the repo root on path).

## Notes
- Pre-existing unrelated red test: `tests/core/test_launcher_agnosticism.py::test_plugin_requirements_owns_full_xtts_dependency_set` asserts `coqui-ai-TTS` in `plugins/tts_xtts/requirements.txt`, but the file uses the current name `coqui-tts`. Failing before this session; worth a separate one-line fix.
