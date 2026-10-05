"""PL-4: lock in parity between the warm-worker serve path (_run_serve_job) and the
one-shot CLI path (main), for the shared synthesis loop extracted into
_run_synthesis_loop.

Both paths previously implemented the same synthesis loop twice (sentence
splitting, pause insertion, per-segment marker emission, `_synthesize_one()`
fallback). PL-4 hoisted the shared logic into `_run_synthesis_loop`, keeping the
genuine differences (latent-cache staleness check, marker flush behavior, error
message detail, exception-to-return-code translation) as explicit, documented
parameters rather than papering over them.

Both paths run a real 2-segment script (with `id` + `save_path` on each segment,
so [START_SEGMENT]/[SEGMENT_SAVED] are genuinely exercised, not skipped) through
the real _run_synthesis_loop, _synthesize_one, sentence splitting, and pause math.

R1-style verification performed manually (not committed as a stashable fixture,
since there is no pre-fix "bug" here — this is a parity lock, not a defect fix):
  1. Injected a per-call-site divergence in _run_serve_job's call to
     _run_synthesis_loop (temperature + 0.2) and confirmed
     test_serve_and_oneshot_produce_identical_audio_and_markers failed on the
     audio-byte assertion with the exact injected value visible in the diff.
     Reverted; confirmed byte-identical restoration via diff against a backup.
  2. This proves the test is sensitive to exactly the class of bug duplication
     invites: a future edit landing in only one of the two call sites.

R2: only the TTS model object, torch.load, and the XTTS model wrapper are mocked
(the actual TTS engine boundary). The real _run_synthesis_loop, _synthesize_one,
sentence splitting, and pause math all run for real.

R4: no sleeps; both paths run synchronously in-process.
"""
from __future__ import annotations

import io
import json
import re
import sys
import wave
from unittest.mock import MagicMock, patch

import pytest

np = pytest.importorskip("numpy")  # xtts-env only; skip in the light CI env


def _make_script(save_dir, speaker_wav):
    """Two segments with `id` + `save_path` so START_SEGMENT/SEGMENT_SAVED are
    genuinely exercised (a plain-text job with no script_json never sets these
    keys, which would silently skip those markers). Each segment carries its
    own speaker_wav — a script_json job's top-level "speaker_wav" field is only
    used by the plain-text-mode script builder, not by segments loaded from
    script_json, so the per-segment latents lookup needs it here."""
    return [
        {
            "id": "seg-0",
            "text": "Hello world. This is segment one.",
            "speaker_wav": speaker_wav,
            "save_path": str(save_dir / "seg-0.wav"),
        },
        {
            "id": "seg-1",
            "text": "This is segment two! It has two sentences.",
            "speaker_wav": speaker_wav,
            "save_path": str(save_dir / "seg-1.wav"),
        },
    ]


def _make_mock_tts_and_model():
    """Build a mock `tts` + `xtts_model` pair whose synthesis output is a pure
    function of the input text AND every synthesis parameter (language, speed,
    temperature, repetition_penalty) so the parity test is actually sensitive to
    a future edit that changes a parameter in only one call site — not just to
    changes in the shared loop's control flow. Deterministic and reproducible."""
    mock_model = MagicMock()

    def _inference(text, language=None, speed=None, temperature=None, repetition_penalty=None, **kwargs):
        seed_material = f"{text}|{language}|{speed}|{temperature}|{repetition_penalty}"
        n = 2400 + (len(text) * 7)
        rng = np.random.RandomState(abs(hash(seed_material)) % (2**31))
        return {"wav": rng.uniform(-0.5, 0.5, size=n).astype(np.float32)}

    mock_model.inference.side_effect = _inference

    mock_tts = MagicMock()
    mock_tts.synthesizer.split_into_sentences.side_effect = lambda p: [
        s.strip() for s in p.replace("!", ".").replace("?", ".").split(".") if s.strip()
    ]
    return mock_tts, mock_model


def _read_wav_samples(path: str):
    with wave.open(path, "rb") as f:
        assert f.getnchannels() == 1
        assert f.getsampwidth() == 2
        assert f.getframerate() == 24000
        raw = f.readframes(f.getnframes())
    return raw


@pytest.fixture
def speaker_wav_pth(tmp_path):
    """A fake pre-computed-latent path (.pth) so both paths take the .pth
    shortcut branch in their respective latent-loading functions, keeping the
    latent-cache-staleness divergence (the one deliberately NOT unified) out of
    this test's blast radius — it tests the shared loop, not the latent cache."""
    ref = tmp_path / "speaker_ref.pth"
    ref.write_bytes(b"fake-pth-content-torch-load-is-mocked")
    return str(ref)


def test_serve_and_oneshot_produce_identical_audio_and_markers(tmp_path, speaker_wav_pth):
    """The warm-worker serve path and the one-shot CLI path must produce the
    same audio bytes and the same marker-type sequence for an identical 2-segment
    script through identical mocked synthesis.
    """
    import tts_engines.tts_xtts.plugin.core.xtts_inference as xtts_inference

    fake_gpt = MagicMock(name="gpt_cond_latent")
    fake_spk = MagicMock(name="speaker_embedding")
    fake_latents = {"gpt_cond_latent": fake_gpt, "speaker_embedding": fake_spk}

    mock_tts, mock_model = _make_mock_tts_and_model()

    # ---- run serve path -------------------------------------------------
    serve_dir = tmp_path / "serve"
    serve_dir.mkdir()
    serve_out = serve_dir / "out.wav"
    serve_script_path = serve_dir / "script.json"
    serve_script_path.write_text(json.dumps(_make_script(serve_dir, speaker_wav_pth)))

    serve_stderr = io.StringIO()

    with (
        patch.object(xtts_inference, "_get_torch_modules") as mock_torch_mods,
        patch("torch.load", return_value=fake_latents),
        patch.object(sys, "stderr", serve_stderr),
    ):
        import torch  # noqa: PLC0415
        mock_torch_mods.return_value = (torch, None)

        job = {
            "script_json": str(serve_script_path),
            "speaker_wav": speaker_wav_pth,
            "out_path": str(serve_out),
            "language": "en",
            "speed": 1.0,
            "temperature": 0.75,
            "repetition_penalty": 2.0,
            "task_id": "parity-task",
        }
        with patch("os.path.exists", return_value=True):
            rc = xtts_inference._run_serve_job(job, mock_tts, mock_model, device="cpu")

    assert rc == 0
    assert serve_out.exists()
    serve_markers = serve_stderr.getvalue().splitlines()

    # ---- run one-shot path ------------------------------------------------
    oneshot_dir = tmp_path / "oneshot"
    oneshot_dir.mkdir()
    oneshot_out = oneshot_dir / "out.wav"
    oneshot_script_path = oneshot_dir / "script.json"
    oneshot_script_path.write_text(json.dumps(_make_script(oneshot_dir, speaker_wav_pth)))

    fake_argv = [
        "xtts_inference.py",
        "--script_json", str(oneshot_script_path),
        "--speaker_wav", speaker_wav_pth,
        "--out_path", str(oneshot_out),
        "--task_id", "parity-task",
    ]

    fake_tts_module = MagicMock()
    mock_tts.to.return_value = mock_tts
    mock_tts.synthesizer.tts_model = mock_model
    fake_tts_module.TTS = MagicMock(return_value=mock_tts)

    oneshot_stderr = io.StringIO()

    with (
        patch.object(sys, "argv", fake_argv),
        patch.object(xtts_inference, "_get_torch_modules") as mock_torch_mods2,
        patch("torch.load", return_value=fake_latents),
        patch.object(xtts_inference, "_patch_xtts_load_audio"),
        patch("os.path.exists", return_value=True),
        patch.dict("sys.modules", {"TTS.api": fake_tts_module}),
    ):
        import torch  # noqa: PLC0415
        mock_torch_mods2.return_value = (torch, None)

        # main() does `sys.stderr = original_stderr` inside a try/finally around
        # model load, so patch stderr around the whole call and let main() restore
        # its own captured "original" (which is our StringIO) afterward.
        real_stderr = sys.stderr
        sys.stderr = oneshot_stderr
        try:
            xtts_inference.main()
        finally:
            sys.stderr = real_stderr

    assert oneshot_out.exists()
    oneshot_markers = oneshot_stderr.getvalue().splitlines()

    # ---- compare audio bytes ----------------------------------------------
    serve_audio = _read_wav_samples(str(serve_out))
    oneshot_audio = _read_wav_samples(str(oneshot_out))
    assert serve_audio == oneshot_audio, (
        "Serve-path and one-shot-path audio output diverged for identical input "
        "and identical mocked synthesis — the shared _run_synthesis_loop must "
        "produce byte-identical output for both callers."
    )

    # Also compare the two individually-saved per-segment WAVs (save_path).
    for seg_name in ("seg-0.wav", "seg-1.wav"):
        serve_seg = _read_wav_samples(str(serve_dir / seg_name))
        oneshot_seg = _read_wav_samples(str(oneshot_dir / seg_name))
        assert serve_seg == oneshot_seg, f"Per-segment audio diverged for {seg_name}"

    # ---- compare marker-type sequences (strip flush/task_id text differences) --
    #
    # tqdm writes its progress bar to the same stderr stream WITHOUT a trailing
    # newline (it repositions with \r), so `splitlines()` on the raw captured
    # stream can merge a tqdm bar update and the marker print that immediately
    # follows it onto one "line" (e.g. "...?seg/s][START_SEGMENT] seg-0"). Search
    # for the marker pattern anywhere in the line rather than requiring it to be
    # the first token, so this test isn't sensitive to tqdm's carriage-return
    # interleaving (a capture artifact, not a behavior this test is about).
    _MARKER_RE = re.compile(r"\[(START_SEGMENT|PROGRESS|SEGMENT_SAVED|START_SYNTHESIS)\]")

    def _marker_types(lines):
        types = []
        for line in lines:
            for name in _MARKER_RE.findall(line):
                types.append(f"[{name}]")
        return types

    serve_marker_types = _marker_types(serve_markers)
    oneshot_marker_types = _marker_types(oneshot_markers)
    assert serve_marker_types == oneshot_marker_types, (
        f"Marker sequence diverged between serve and one-shot paths.\n"
        f"serve:   {serve_marker_types}\n"
        f"oneshot: {oneshot_marker_types}"
    )

    # Sanity: all four marker types were actually emitted, for both segments
    # (not an empty-script or single-segment false pass).
    assert serve_marker_types.count("[START_SYNTHESIS]") == 1
    assert serve_marker_types.count("[START_SEGMENT]") == 2
    assert serve_marker_types.count("[SEGMENT_SAVED]") == 2
    assert serve_marker_types.count("[PROGRESS]") >= 4  # >=2 sentences/segment across 2 segments
