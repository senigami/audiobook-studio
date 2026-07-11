# 014 — Add chapter & book defaults to the queue voice-fallback chain

- **Status:** done
- **Workload:** Real-app bug fixes
- **Severity / type:** major · logic (live bug, reported 2026-06-17)
- **Effort:** S
- **Blocked by:** nothing
- **Blocks:** nothing

## Goal
"Add to queue" no longer blocks with "No voice available" when a chapter-level or book/project-level default voice is set.

## Why this matters
The owner hit "Queue Blocked — No voice available" despite having a default voice. The fallback chain in `api_add_to_queue` only consulted explicit pick → global Settings default → first cast segment, so a chapter/book default (the columns exist but were never read) couldn't satisfy the gate. Owner's intended chain: assigned (per-segment, honored by the script builder) → chapter default → book default → global default → only then error.

## What was done
- `app/api/routers/generation.py` `api_add_to_queue` (~275-281): `active_profile` fallback now reads `get_chapter(chapter_id).speaker_profile_name` and `get_project(project_id).speaker_profile_name` between the explicit pick and the global default. Order: `speaker_profile → chapter default → book/project default → settings.default_speaker_profile → first cast segment → block`.
- DB getters reused: `get_chapter` (`app/db/chapters.py:72`), `get_project` (`app/db/projects.py:50`) — already exported from `app.db`.
- Tests added in `tests/api/test_api_queue.py`: chapter-default case, project-default case, and a guard that still blocks when nothing is set anywhere. Revert-checked (cases 400 on pre-fix, proceed after).

## Acceptance criteria
- [x] Chapter with `speaker_profile_name` set (no global default, no pick, no per-segment cast) queues instead of 400.
- [x] Same for the project/book default.
- [x] Still blocks when no voice resolves anywhere (guard intact).
- [x] Revert-checked test; `pytest -q` green (1 pre-existing unrelated failure); `ruff` clean.

## Out of scope
- The TTS Server `/synthesize` 500 ("Synthesis failed") — a separate engine failure (real cause logged in the **TTS server process stderr**, not the main app). Likely a resolved voice whose profile dir / reference wav / `latent.pth` is missing. Tracked separately pending the server-side log line.
