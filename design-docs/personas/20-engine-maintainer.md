# 20 · "Dr. Sarah Kim" — Engine Maintainer  ☆ INFERRED

**Identity:** "A researcher-turned-engineer who owns the tts_mixed plugin and needs the Studio orchestrator to remain agnostic to her engine's internals — so she can change marker timing, add a new child engine, or swap a fallback without touching application code."

## Goals
- Update marker timing and `progress_pattern` in `manifest.json` without any changes bleeding into route or queue code
- Preserve ETA accuracy when mixed-synthesis hands off between child engines (XTTS voice segments → base TTS narration)
- Confirm that the orchestrator's progress contract is upheld — values rounded to 2 decimals, broadcasts only on ≥1% advance — regardless of what the engine emits
- Validate that engine-agnostic app behavior truly is agnostic: no `if engine_id == "tts_mixed"` branches in `app/`
- Keep child-engine fallback behavior observable from test coverage, not just from manual runs

## Context & environment *(INFERRED)*
- macOS with an M2 chip; runs the XTTS env in `~/xtts-env` and the mixed plugin against a stubbed base TTS for development
- Came to the project after the plugin architecture was established — she is maintaining and extending an existing contract, not designing it
- Works primarily in `plugins/tts_mixed/` and `plugins/tts_xtts/`, reads `design-docs/specs/` before any behavior change
- Runs `./venv/bin/python -m pytest plugins/tts_mixed/tests` frequently; runs the full suite before opening a PR
- Reads `app/orchestration/progress/` to understand how the orchestrator consumes her `progress_pattern` — she does not modify it, but she needs to understand it

## Key workflow moments
- **Manifest update:** Edits `plugins/tts_mixed/manifest.json` to tighten the `progress_pattern` regex after XTTS changes its log output format; re-runs the plugin test suite to confirm ETA parsing still works
- **Child-engine handoff test:** Writes a test that simulates the XTTS child engine completing its segments early and verifies that the orchestrator's reported progress continues to advance smoothly through the base-TTS narration phase without a stale-ETA spike
- **Contract drift check:** Reads `design-docs/specs/` for the plugin manifest spec and the progress contract before any manifest version bump; notes any drift between spec and current code and resolves it in the same commit
- **Fallback validation:** Simulates the base TTS child engine returning a non-retryable error mid-synthesis and verifies that the mixed plugin surfaces a structured failure to the orchestrator (not a silent hang)
- **Core-isolation audit:** Greps `app/` for `tts_mixed` and `xtts` before submitting a PR; any hit in routes, queue, or orchestrator code is a blocker

## Top friction points *(INFERRED)*
- **F1 — Mixed-synthesis ETA discontinuity:** When XTTS finishes its voice segments and the narration engine begins, the orchestrator's ETA can spike or stall because the progress stream switches source. The combined ETA math does not account for the handoff transition ring, making the UI show misleading estimates during the switch.
- **F2 — No contract-violation feedback during dev:** If `progress_pattern` in the manifest produces a match group that cannot be parsed as a float, the orchestrator silently drops the progress update rather than logging an error. Sarah only discovers this when ETA stays at 0% through a full render.
- **F3 — Spec/code drift is invisible:** There is no automated check that `manifest.json`'s declared `behavior.text_chunk_limit` matches what the plugin's `interface.py` actually enforces. She discovers drift manually when a downstream test fails unexpectedly.
- **F4 — Child-engine test isolation requires real subprocess:** Testing the mixed plugin's fallback path requires standing up a real (or stubbed) child engine subprocess. There is no lightweight mock-engine fixture, so fallback tests are slow and platform-sensitive.

## What they need from the studio
- A manifest validation step at plugin load time that emits a clear error (not a silent drop) when `progress_pattern` produces an unparseable match
- Progress contract enforcement in the orchestrator that is testable in isolation — a unit test that feeds raw engine output lines and asserts the broadcast sequence
- A documented, versioned plugin manifest spec that lists every field's type, default, and validation rule — so she knows exactly what she can change without breaking the contract
- A grep-or-lint check (CI or pre-commit) that fails if any `app/` code references a specific engine ID for core behavior
- A lightweight mock-engine fixture for plugin-local tests that simulates the subprocess protocol without requiring `~/xtts-env`

## Review lens — questions they ask of any screen
- "Does this orchestrator code branch on engine ID, or does it trust only the manifest contract?"
- "If I change `progress_pattern`, what is the first place in the codebase that will break — and is there a test that catches it?"
- "When the XTTS child engine finishes and the narration engine takes over, what does the ETA panel show during the handoff?"
- "Is this spec version consistent with what the plugin loader actually validates?"
- "If the mixed plugin emits progress at 47.3333%, does the orchestrator broadcast 47.33 or 47.3333?"
- "What happens to the queue entry if the mixed plugin crashes after XTTS completes but before narration starts?"
- "Is this test asserting observable behavior — what the orchestrator broadcasts — or is it asserting internal math?"

## Red flags that make them quit or distrust the app
- An `if engine_id == "tts_mixed":` branch anywhere in `app/orchestration/`, `app/api/routers/`, or queue code
- A manifest change that passes all plugin-local tests but silently breaks ETA in the full app due to an undocumented orchestrator assumption
- Progress values that appear correct in tests but differ in the live UI because the broadcast layer applies a separate rounding step
- A spec version bump that does not require any code change — sign that the spec is decorative rather than enforced
- Child-engine fallback that hangs the orchestrator job indefinitely rather than surfacing a structured, recoverable error

**Evidence basis:** INFERRED. Interview the engineer(s) maintaining tts_mixed or any plugin that uses multi-engine orchestration; key open question is whether the ETA handoff discontinuity is a known, tracked problem or an emergent behavior that has not yet been observed in production renders.
