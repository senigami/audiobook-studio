# Task 09 — Voxtral test rewrite (6 files) — mechanical

Depends on 05, 06. Same rules as task 08 (read it). Sites:
`test_voxtral_implementation.py` (Job import ×3 → note for task 11; wav_to_mp3 patch line 288 → per
task-05 decision), `test_voxtral_segments_bake.py` (patches `app.engines.audio_ops.stitch_segments`/
`get_audio_duration` — these exercise HOST bake via context → LEAVE as app.*),
plus sdk-type imports sweep: `grep -rEn "from app|import app" plugins/tts_voxtral/tests`.

Acceptance: `pytest plugins/tts_voxtral -q` pass-count parity; full suite green.
