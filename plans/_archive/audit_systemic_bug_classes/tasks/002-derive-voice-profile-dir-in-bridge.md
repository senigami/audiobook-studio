# 002 — Derive voice_profile_dir centrally in generate_via_bridge

- **Status:** done
- **Workload:** Workload 1 — Central fixes
- **Severity / type:** critical · correctness
- **Effort:** S
- **Blocked by:** nothing
- **Blocks:** 005

## Goal

`generate_via_bridge` derives `voice_profile_dir` from `profile_name` when the caller does
not pass it, so no bridge caller can ever again send a synthesis request that strands a
reference-cloned voice without its reference audio.

## Why this matters

Two shipped bugs (`92645e4b` sample/chapter 500s, `a39b3a24` mixed-render failure) were both
"caller forgot voice_profile_dir". The XTTS non-script render paths are still bare and only
work today because the server-side engine has an SDK-violating fallback import (removed in
task 005, which depends on this task).

## Context an executor needs

- `app/jobs/handlers/bridge_helpers.py:12-58` — builds the request; includes
  `voice_profile_dir` only when passed (:55-56). Every caller already passes `profile_name`.
- Resolution function: `app.db.speakers.get_profile_dir(profile_name_or_id)` (raises
  `ValueError` for unknown profiles — treat best-effort, mirror
  `app/engines/voice_engines.py:160-174 resolve_voice_preview_inputs`).
- Still-bare callers fixed by this change: `plugins/tts_xtts/plugin/studio/standard_handler.py:254-264`
  and `:266-276` (non-script paths).
- Dead code to delete: `plugins/tts_xtts/plugin/studio/helpers.py:24-35 _generate_direct_xtts`
  (no callers anywhere).
- Already-fixed callers that pass the dir explicitly (must keep working unchanged):
  `plugins/tts_voxtral/plugin/studio/handler.py:143`, `plugins/synthesis_mixed/handler.py:131`,
  `app/jobs/worker_voice.py:114`.

## Target shape / contract

```python
# bridge_helpers.generate_via_bridge, after building the base request:
if voice_profile_dir is None and profile_name:
    voice_profile_dir = _best_effort_profile_dir(profile_name)  # None on any failure
if voice_profile_dir:
    request["voice_profile_dir"] = str(voice_profile_dir)
```

Explicit caller-supplied values always win; derivation is a fallback only; failures degrade
to the current behavior (no dir in request), never raise.

## Steps

1. Add the best-effort derivation to `generate_via_bridge` (import `get_profile_dir` lazily
   inside the helper to respect import-side-effect rules).
2. Delete `_generate_direct_xtts` from `plugins/tts_xtts/plugin/studio/helpers.py`.
3. Tests (R1): calling `generate_via_bridge(engine=…, profile_name="X")` with a mocked
   bridge (mock at the `create_voice_bridge` boundary, per R2) and a real/temp profile dir
   resolution must produce a request containing `voice_profile_dir`; an explicit
   `voice_profile_dir` argument must override; an unresolvable profile must omit the key and
   not raise. Place near existing bridge_helpers/handler tests.

## Acceptance criteria

- [ ] Request payload contains `voice_profile_dir` for profile-named calls without the
      caller passing it (test red pre-fix).
- [ ] `_generate_direct_xtts` is gone; `npm`/pytest discovery finds no references.
- [ ] Full backend suite + plugin suites green.

## Out of scope

The XTTS server-side fallback import (task 005). Orchestrated task payloads
(`synthesis_settings["voice_profile_dir"]`) — already correct.
