# Audiobook Studio — agent instructions

## Project rules

- **Clean break (Studio 2.0):** legacy/v1 code is deleted, not preserved; only the v1→v2 data migration path survives. Compatibility obligations begin at the v2.0.0 release.
- **Versioned contracts:** every contract/manifest/schema (plugin manifest, SDK, event envelope, voice bundle, casting card) declares an explicit version validated at load time.
- **Audio formats:** voice samples/previews are MP3 (`sample.mp3`, `samples/preview.mp3`); chapter/book render audio is WAV; portable voice bundles are MP3.
- The release plan lives in `plans/final_release/` (doc 08 is the execution order). Where it conflicts with older `plans/` docs, the final_release folder wins.

## Testing standards (binding — see plans/final_release/17_test_quality_audit.md)

- **R1 — Revert-check every bug-fix test:** a test landing with a fix must fail on the pre-fix code. Verify it: stash the fix, run the test, confirm red, restore.
- **R2 — Mock boundaries only:** a test may mock only what is *outside* the unit under test (network, clock, filesystem, the TTS engine, broadcast capture at the websocket boundary) — never the module the test file is named for, and never the state-store internals of the function under test.
- **R3 — Contract-shaped event frames:** frontend live-event tests build socket frames via the types in `frontend/src/api/contracts/liveEvents.ts` and publish through `publishStudioSocketMessage` — no untyped hand-rolled frame literals.
- **R4 — No sleep-based timing:** use vitest fake timers / `waitFor` on the frontend and explicit synchronization (threading events) in pytest. No `setTimeout(n)`/`sleep(n)` waits.
- A test that re-implements the unit's internal math and asserts it against itself is a mocked-out test — assert observable behavior instead.
- Test-quality classification tables live in `plans/final_release/audits/`.

## Verification

- Backend: `source venv/bin/activate && python -m pytest tests -q`
- Frontend: `cd frontend && npm run build && npx vitest run`
- A pre-push hook runs lint + changed-file tests; pushes that "hang" are usually the hook running.
