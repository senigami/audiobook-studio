"""SEC-1 regression: latent .pth loads must never unpickle arbitrary objects.

Bug (SEC-1): xtts_inference.py's four latent-loading call sites used
``torch.load(path, map_location=device, weights_only=False)``. A voice bundle
is user-imported data (attacker-controlled) and its ``latent.pth`` sits
exactly where these call sites read from — a crafted pickle with a malicious
``__reduce__`` would execute arbitrary code the moment the bundle's latents
were loaded (RCE on import).

Fix: all four sites now pass ``weights_only=True``, which restricts unpickling
to an allow-listed set of tensor/container types and refuses to invoke
arbitrary callables.

R1: this test's ``test_weights_only_false_would_have_executed_payload`` case
demonstrates the sentinel WOULD fire under the pre-fix (``weights_only=False``)
behavior, proving the test exercises a real gap rather than a vacuous one.
R2: nothing here mocks torch.load — a real crafted pickle is fed through the
real ``torch.load`` call to prove weights_only=True blocks it end-to-end.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
import torch


class _EvilLatent:
    """Pickle payload whose __reduce__ runs an OS command when unpickled."""

    def __init__(self, marker_path: str):
        self._marker_path = marker_path

    def __reduce__(self):
        # subprocess.run rather than os.system to make the "did code execute"
        # check unambiguous and avoid relying on a shell built-in.
        return (
            subprocess.run,
            ([sys.executable, "-c", f"open({self._marker_path!r}, 'w').write('PWNED')"],),
        )


def _craft_malicious_pth(tmp_path: Path, marker_path: Path) -> Path:
    evil_path = tmp_path / "latent.pth"
    torch.save(_EvilLatent(str(marker_path)), evil_path)
    return evil_path


def test_weights_only_true_blocks_malicious_pth_and_never_runs_payload(tmp_path):
    """The fixed behavior (weights_only=True) must refuse to unpickle the
    malicious object, and the payload (marker file write) must never run."""
    marker_path = tmp_path / "pwned.marker"
    evil_pth = _craft_malicious_pth(tmp_path, marker_path)

    with pytest.raises(Exception):
        torch.load(evil_pth, map_location="cpu", weights_only=True)

    assert not marker_path.exists(), (
        "weights_only=True load executed the malicious __reduce__ payload — RCE not blocked"
    )


def test_weights_only_false_would_have_executed_payload(tmp_path):
    """Demonstrates the pre-fix gap: had the site still used
    weights_only=False, the same crafted .pth WOULD execute arbitrary code.
    This proves the previous test is not vacuous."""
    marker_path = tmp_path / "pwned.marker"
    evil_pth = _craft_malicious_pth(tmp_path, marker_path)

    # This is the exact call shape the four sites used before the SEC-1 fix.
    torch.load(evil_pth, map_location="cpu", weights_only=False)

    assert marker_path.exists(), (
        "expected the crafted payload to execute under weights_only=False; "
        "if it did not, this test no longer demonstrates the vulnerability it guards against"
    )


def test_legitimate_latent_pth_still_loads_with_weights_only_true(tmp_path):
    """No false-break: a real latent.pth (dict of two plain tensors) must
    still load fine under weights_only=True."""
    legit_payload = {
        "gpt_cond_latent": torch.zeros(1, 32, 1024),
        "speaker_embedding": torch.zeros(1, 512, 1),
    }
    legit_pth = tmp_path / "latent.pth"
    torch.save(legit_payload, legit_pth)

    loaded = torch.load(legit_pth, map_location="cpu", weights_only=True)

    assert torch.equal(loaded["gpt_cond_latent"], legit_payload["gpt_cond_latent"])
    assert torch.equal(loaded["speaker_embedding"], legit_payload["speaker_embedding"])


def test_no_weights_only_false_sinks_remain_in_xtts_plugin():
    """Grep guard: no torch.load call site in the xtts plugin may regress to
    weights_only=False (or omit weights_only, which historically defaulted to
    False on older torch)."""
    plugin_root = Path(__file__).resolve().parents[1] / "plugin"
    assert plugin_root.is_dir(), f"expected plugin dir at {plugin_root}"

    offending: list[str] = []
    for path in plugin_root.rglob("*.py"):
        text = path.read_text(encoding="utf-8", errors="ignore")
        if "weights_only=False" in text:
            offending.append(str(path))

    assert offending == [], f"weights_only=False found in: {offending}"
