# Task 04 — XTTS server/core/interface/cli import rewrite

Context: 00-overview.md boundary. Depends on 02, 03. Zero behavior change; pure import redirection
now that identity is guaranteed by shims.

## Exact sites (verified)
- `plugins/tts_xtts/plugin/server/engine.py`
  - line 23: `from app.engines.voice.sdk import TTSRequest, TTSResult, VerificationResult`
    → `from studio_plugin_sdk.types import ...` (or package root)
  - line 24: `from app.engines.voice.base import StudioTTSEngine` → `from studio_plugin_sdk.engine import StudioTTSEngine`
  - line 25: `from app.engines.proc_utils import run_cmd_stream` → `from studio_plugin_sdk.proc import run_cmd_stream`
    (verify call sites don't rely on TRANSIENT_DIR-dependent helpers: `grep -n "run_cmd_stream" plugins/tts_xtts/plugin/server/engine.py`)
  - line 247: fn-body `from app.engines.voice.sdk import TTSTimingResult, SegmentTimingResult, TimingEvent` → SDK
  - line 643: fn-body `from app.engines.audio_ops import wav_to_mp3 as _conv` →
    `from studio_plugin_sdk.audio import wav_to_mp3` with `quality=` sourced from engine settings/context —
    check where MP3 quality is configurable for this engine (`grep -rn "quality\|mp3" plugins/tts_xtts/settings_schema.json plugins/tts_xtts/plugin/server/engine.py | head`);
    if none, default to the same constant value app used (verify `MP3_QUALITY` in `app/core/config.py`)
    passed via the plugin's settings/env — do NOT import app.core.config.
- Sweep the rest: `grep -rEn "from app|import app" plugins/tts_xtts/plugin/server plugins/tts_xtts/plugin/core plugins/tts_xtts/interface.py plugins/tts_xtts/cli.py plugins/tts_xtts/preview plugins/tts_xtts/scripts 2>/dev/null` → fix all; end state zero.

## TDD
Extend/adjust `plugins/tts_xtts/tests/test_s4_import_cleanliness.py` ONLY if it currently whitelists
these paths (task 07 owns the gate change; here just do not regress it). Behavior tests: existing
engine tests must pass unchanged — that IS the contract check.

## Acceptance
- `grep -rE "from app|import app" plugins/tts_xtts/plugin/server plugins/tts_xtts/plugin/core plugins/tts_xtts/interface.py plugins/tts_xtts/cli.py` → empty.
- `pytest plugins/tts_xtts -q` and full suite parity (tests still patch `app.engines.audio_ops.wav_to_mp3` — those
  WILL now miss; if any xtts test fails for that reason, repoint the patch to `studio_plugin_sdk.audio.wav_to_mp3`
  in the same commit — this is the monkeypatch-drift risk; list every repointed patch in the PR).
- Code-map queue entry.
