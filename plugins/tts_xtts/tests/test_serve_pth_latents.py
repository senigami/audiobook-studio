"""Test that the serve-mode _get_latents function handles pre-computed .pth latent files.

Bug: _run_serve_job's _get_latents called xtts_model.get_conditioning_latents(audio_path=...)
on a .pth path (no .pth branch), causing torchcodec AudioDecoder RuntimeError.

Fix: mirror the one-shot path's .pth branch inside _get_latents (serve mode).

R1: this test must fail on pre-fix code (no .pth branch in serve-mode _get_latents).
R2: only the TTS model object and torch.load are mocked (outside the unit under test).
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch, call
import pytest


def _make_job(pth_path: str, out_path: str) -> dict:
    return {
        "text": "Hello.",
        "speaker_wav": pth_path,
        "out_path": out_path,
        "language": "en",
        "speed": 1.0,
        "temperature": 0.75,
        "repetition_penalty": 2.0,
        "task_id": "test-pth",
    }


def test_serve_get_latents_uses_pth_branch_not_audio_decoder(tmp_path):
    """When speaker_wav ends in .pth, serve mode must torch.load it as pre-computed latents.

    It must NOT call xtts_model.get_conditioning_latents (audio-decoding path).
    """
    import plugins.tts_xtts.plugin.core.xtts_inference as xtts_inference  # noqa: PLC0415

    # Create a minimal real .pth fixture file content via mock torch.load
    pth_file = tmp_path / "latent.pth"
    pth_file.write_bytes(b"fake-pth-content")  # placeholder; torch.load is mocked

    fake_gpt = MagicMock(name="gpt_cond_latent")
    fake_spk = MagicMock(name="speaker_embedding")
    fake_latents = {"gpt_cond_latent": fake_gpt, "speaker_embedding": fake_spk}

    import numpy as np  # noqa: PLC0415

    mock_model = MagicMock()
    # inference returns a dict with "wav" so synthesis can complete
    mock_model.inference.return_value = {"wav": np.zeros(24000, dtype=np.float32)}
    mock_tts = MagicMock()
    mock_tts.synthesizer.split_into_sentences.return_value = ["Hello world."]
    device = "cpu"

    torch_load_calls: list = []

    def _fake_torch_load(path, *args, **kwargs):
        torch_load_calls.append(str(path))
        return fake_latents

    with (
        patch.object(xtts_inference, "_get_torch_modules") as mock_torch_mods,
        patch("torch.load", side_effect=_fake_torch_load),
    ):
        # Build a minimal fake torch module
        import torch  # noqa: PLC0415
        mock_torch_mods.return_value = (torch, None)

        job = _make_job(str(pth_file), str(tmp_path / "out.wav"))
        rc = xtts_inference._run_serve_job(job, mock_tts, mock_model, device)

    # .pth branch must have been taken: torch.load was called with the pth path
    assert any(str(pth_file) in c for c in torch_load_calls), (
        f"torch.load was not called with the .pth path; calls={torch_load_calls}"
    )

    # Audio-decoding path must NOT have been attempted on the .pth file
    assert not mock_model.get_conditioning_latents.called, (
        "get_conditioning_latents (audio-decoding) was called on a .pth speaker_wav — .pth branch missing"
    )


def test_serve_get_latents_pth_returns_correct_latent_tuple(tmp_path):
    """Latents extracted from a .pth file must propagate into xtts_model.inference calls.

    The latent tuple from torch.load must be unpacked and forwarded as
    gpt_cond_latent / speaker_embedding kwargs — observable via the model mock.
    """
    import plugins.tts_xtts.plugin.core.xtts_inference as xtts_inference  # noqa: PLC0415
    import numpy as np  # noqa: PLC0415

    pth_file = tmp_path / "speaker.pth"
    pth_file.write_bytes(b"fake")

    fake_gpt = MagicMock(name="gpt_cond_latent")
    fake_spk = MagicMock(name="speaker_embedding")
    latent_payload = {"gpt_cond_latent": fake_gpt, "speaker_embedding": fake_spk}

    def _fake_torch_load(path, *args, **kwargs):
        return latent_payload

    mock_model = MagicMock()
    # xtts_model.inference must return a dict with a "wav" key
    mock_model.inference.return_value = {"wav": np.zeros(24000, dtype=np.float32)}
    mock_tts = MagicMock()
    # Ensure tts.synthesizer.split_into_sentences returns a real list so the
    # synthesis loop produces sentences (MagicMock default is not iterable as list).
    mock_tts.synthesizer.split_into_sentences.return_value = ["Hello."]

    with (
        patch.object(xtts_inference, "_get_torch_modules") as mock_torch_mods,
        patch("torch.load", side_effect=_fake_torch_load),
    ):
        import torch  # noqa: PLC0415
        mock_torch_mods.return_value = (torch, None)

        job = _make_job(str(pth_file), str(tmp_path / "out.wav"))
        xtts_inference._run_serve_job(job, mock_tts, mock_model, device="cpu")

    # xtts_model.inference must have been called with the latents from the .pth
    assert mock_model.inference.called, "xtts_model.inference was not called"
    kwargs = mock_model.inference.call_args.kwargs
    assert kwargs.get("gpt_cond_latent") is fake_gpt, (
        "gpt_cond_latent from .pth not forwarded to inference"
    )
    assert kwargs.get("speaker_embedding") is fake_spk, (
        "speaker_embedding from .pth not forwarded to inference"
    )
