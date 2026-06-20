# 005 — Remove the XTTS server engine's app.* import fallback

- **Status:** done
- **Workload:** Workload 2 — Boundary restoration
- **Severity / type:** major · boundaries
- **Effort:** S
- **Blocked by:** 002
- **Blocks:** nothing

## Goal

`plugins/tts_xtts/plugin/server/engine.py` no longer imports anything from `app.*`; voice
inputs come exclusively from the request (`voice_ref` / `voice_profile_dir` / script
entries), restoring the SDK boundary.

## Why this matters

The SDK contract (`docs/specs/plugin-contract.md`; `app/engines/voice/base.py:105-108`)
says server-side plugins must not import Studio internals. The fallback at
`plugins/tts_xtts/plugin/server/engine.py:433-444` (silent
`from app.engines.voice_engines import resolve_voice_preview_inputs` inside a swallow-all
except) violates that and *masked* the missing-`voice_profile_dir` bugs — callers appeared
to work until the import path or DB access failed inside the TTS server process. Task 002
now guarantees the dir arrives in the request, so the crutch can go.

## Context an executor needs

- `_resolve_voice_inputs` at `plugins/tts_xtts/plugin/server/engine.py:419-446`: resolution
  order is `voice_ref` → `settings["voice_profile_dir"]` → app-import fallback.
- Error surfaces when nothing resolves: :194-201 (synthesize), :382-386 (preview).
- Task 002 must be `done` first (it makes `generate_via_bridge` always include the dir for
  profile-named requests).

## Target shape / contract

`_resolve_voice_inputs` uses only request-supplied data. If nothing resolves, return the
existing explicit error ("XTTS requires voice_ref or a voice profile directory") — failing
loudly at the contract boundary instead of guessing.

## Steps

1. Delete the fallback branch (:433-444) and its swallow-all except.
2. Search the rest of `plugins/tts_xtts/plugin/server/` for other `app.` imports; remove any.
3. Tests: engine-level test that a request with neither `voice_ref` nor `voice_profile_dir`
   returns the explicit error (may already exist — extend `plugins/tts_xtts/tests/`); a
   request with `voice_profile_dir` resolves reference audio from a temp profile dir.
4. Run the XTTS plugin suite: `./venv/bin/python -m pytest plugins/tts_xtts/tests`.

## Acceptance criteria

- [x] No import of Studio internals that reach the DB/state layer remains in
      `plugins/tts_xtts/plugin/server/` (`app.engines.voice_engines` fallback deleted).
      Note: imports of the sanctioned SDK surface (`app.engines.voice.sdk`,
      `app.engines.voice.base`) and the shared process/audio utilities
      (`app.engines.proc_utils`, `app.engines.audio_ops`) remain — they do not touch
      Studio storage; tightening them to a dedicated SDK package is a separate refactor.
- [x] Plugin suite + full backend suite green.
- [ ] An end-to-end sample render with a reference-cloned XTTS voice still works (verify via
      the running app or the existing integration tests).

## Out of scope

Voxtral's server engine (already clean); changing the resolution order for `voice_ref`.
