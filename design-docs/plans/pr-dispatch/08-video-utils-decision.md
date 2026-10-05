# PR 08 — video_utils.py: product decision, then wire (or remove)

**Branch:** `studio2/video-utils` (only after the decision)
**Target:** `studio-2.0`
**Size:** XS for the decision; S for wiring; XS for removal.
**Gate:** ⚠️ **Product decision required before any code.** This is the open owner question, not a
ready task.

## The open question (from TASKS.md line ~687)

`app/engines/video_utils.py` (63 lines, commit `bb2bb025`) has a `generate_video_sample()` that
builds a real ffmpeg command (background + audio + optional logo overlay) to render an **MP4 voice
preview**. It's exercised only by `tests/engines/test_engines.py` — **zero production callers** (no
router, no task, no plugin references it) and **no matching spec**.

> **Owner: is this still wanted (a video-preview feature for voices), and if so what UI/route should
> call it?**

Until that's answered, there are three possible outcomes — this brief covers all three. **Do not
guess the product direction.** Ask the owner first (or the orchestrator dispatching this should have
the answer in hand).

## Outcome A — "Yes, wire it up"

Only proceed once the owner has said **what surface calls it**. Then:
1. Read `video_utils.py` and its existing test to learn the exact contract
   (`generate_video_sample()` inputs/outputs, ffmpeg dependency, output path conventions).
2. Add the route/task the owner specified, routing through the existing orchestration + pathing
   patterns (untrusted paths via `safe_join`/`secure_join_flat`; no import-time side effects; no
   engine-ID branching). Video previews are a new artifact type — decide storage under
   `projects/<id>/...` per `app/core/config.py`, and remember the audio-format convention (samples
   are MP3, renders WAV — a video preview is a new category, spec it).
3. Write a spec for the feature under `design-docs/specs/` (versioned) — it has none today.
4. Frontend affordance if the owner wants it visible (the "what UI" answer drives this).
5. Tests for the new route/task (not just the ffmpeg builder), + verify ffmpeg availability handling
   (graceful when ffmpeg absent).

## Outcome B — "Maybe later, not now"

Leave the code, but stop it from masquerading as shippable: confirm the TASKS.md entry documents it
as intentionally-unwired future work (it already does), and **do nothing else**. No PR needed — just
report back. Don't let it sit as an ambiguous "half-feature."

## Outcome C — "No, not wanted"

Remove the dead code cleanly: delete `video_utils.py` and its now-orphan test, grep for any stray
reference, confirm the suite still passes. This matches the Studio 2.0 clean-break directive (delete
legacy/unused code, don't preserve it).

## Verify (A or C)

- `./venv/bin/python -m pytest -q` + `ruff check .` green.
- **A:** actually invoke the new route/task and confirm an MP4 is produced (or the graceful-no-ffmpeg
  path fires) — screenshot/log it. Spec added + versioned.
- **C:** grep confirms zero references remain.

## Definition of done

- The owner's answer is recorded in the PR/report.
- Code + spec + tests match the chosen outcome; suites green.
- Code-map changelog-queue entry if code changed.
- PR via `write-pr` → `studio-2.0` (A or C), or a short report (B).
