# 016 — Fall back to an installed engine in text analysis when no default is set

- **Status:** done
- **Workload:** Real-app bug fixes
- **Severity / type:** major · logic (live bug, 2026-06-17)
- **Effort:** S
- **Blocked by:** nothing
- **Blocks:** nothing

## Goal
`POST /api/analyze_text` (and chapter analysis) work when the global `default_engine` setting is empty, instead of returning `400 "No TTS engine configured"`.

## Why this matters
`app/state.json` ships `default_engine: ""`, and rendering resolves its engine from the voice profile (not the global default), so `default_engine` can legitimately be empty while the app otherwise works. Analysis only needs *an* engine's chunk-limit/split-target, but it read the raw setting and hard-failed — same shape as the voice-fallback bug (014).

## What was done
- `app/api/routers/analysis.py`: both `api_analyze_text` (line ~227) and the chapter-analysis guard (line ~107) now resolve `engine_id = get_default_profile_engine(settings) or next((e for e in list_tts_engines() if enabled.get(e, True)), None)`, raising the 400 only when no engine is available. Helpers from `app/engines/voice_engines.py`; no hard-coded engine IDs.
- Tests in `tests/api/test_api_analysis.py`: two new fallback cases (200 when `default_engine=""` but an engine is installed) + the existing 400 cases strengthened to patch `list_tts_engines → []` so they still prove the true no-engines path. Revert-checked.

## Acceptance criteria
- [x] `analyze_text` returns 200 with `default_engine=""` and an engine installed.
- [x] Same for chapter analysis.
- [x] Still 400s when zero engines are available.
- [x] Revert-checked tests; `pytest -q` green (1 pre-existing unrelated failure); `ruff` clean.

## Notes
- When no default is set, analysis uses the first installed+enabled engine; for deterministic results across engines with different chunk limits, set a default in Settings. (A future enhancement could surface which engine analysis used.)
