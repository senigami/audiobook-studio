# 018 — Render without a global default: fall back to any available voice

- **Status:** done
- **Workload:** Real-app bug fixes
- **Severity / type:** major · logic (fusion-panel triage, 2026-06-17)
- **Blocked by:** nothing
- **Blocks:** nothing

## Goal
The queue no longer blocks `"No voice available"` when no default is set but the project has voices; it blocks only when zero voices exist anywhere.

## Why
With the global default cleared and an uncast chapter, `active_profile` resolved to `None` → block. Owner: a default must not be mandatory — render if any usable voice exists. The gate and render share `active_profile`, so fixing the gate fixes both.

## What was done
`app/api/routers/generation.py`: added `_first_available_profile()` (preference: a speaker named "Narrator" with a profile → fresh-read global default → first `list_speakers()` entry's `default_profile_name` → None only if no speakers exist), appended `or _first_available_profile()` to the `active_profile` chain at all three sites (`api_add_to_queue` ~287, `api_bake_chapter` ~487, `api_generate_segments` ~673). Reuses `app/db/speakers.py list_speakers()`; no hardcoded voice. `_validate_generation_engines` still runs after, so a fallback on a disabled engine still errs cleanly. Tests in `tests/api/test_api_queue.py` (uncast+has-speaker proceeds; zero-speakers still blocks); revert-checked; suite green.

## Note
With no Narrator character and no default, the fallback picks the first speaker alphabetically — set a default voice to control which. (A future "system default / Studio Voice" concept would make this deterministic.)
