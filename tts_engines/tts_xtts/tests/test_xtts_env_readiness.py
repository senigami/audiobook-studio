"""BUG 1 regression: XTTS readiness must check the external xtts-env, not the
server's own interpreter.

Real XTTS inference always shells out to ``XTTS_ENV_PYTHON`` as a subprocess
(``core/implementation.py``) — the server process itself never imports
``TTS``/``torch``. Before this fix, ``check_env()`` did an in-process
``import TTS``, which checks the *server's* venv (where these deps are never
installed by ``run.sh``) instead of the external env where they actually
live — permanently gating the engine as ``needs_setup``.
"""

from __future__ import annotations

import importlib
import sys

import pytest


@pytest.fixture
def implementation_module(monkeypatch, tmp_path):
    """Reload ``core.implementation`` with XTTS_ENV_DIR/XTTS_ENV_PYTHON pointed
    at an isolated tmp_path so tests don't depend on (or mutate) a real
    ~/xtts-env on the machine running the suite.
    """
    monkeypatch.setenv("XTTS_ENV_DIR", str(tmp_path / "xtts-env"))
    monkeypatch.delenv("XTTS_ENV_PYTHON", raising=False)
    module_name = "tts_engines.tts_xtts.plugin.core.implementation"
    sys.modules.pop(module_name, None)
    impl = importlib.import_module(module_name)
    yield impl
    sys.modules.pop(module_name, None)


def _make_fake_env(
    env_dir,
    *,
    python_version: str = "3.11",
    with_tts_dir: bool = False,
    with_dist_info: bool = False,
) -> None:
    python_bin = env_dir / "bin" / "python"
    python_bin.parent.mkdir(parents=True, exist_ok=True)
    python_bin.write_text("#!/bin/sh\n")
    python_bin.chmod(0o755)
    site_packages = env_dir / "lib" / f"python{python_version}" / "site-packages"
    site_packages.mkdir(parents=True, exist_ok=True)
    if with_tts_dir:
        (site_packages / "TTS").mkdir()
    if with_dist_info:
        (site_packages / "coqui_tts-0.27.5.dist-info").mkdir()


def test_env_ready_false_when_interpreter_missing(implementation_module, tmp_path):
    ok, msg = implementation_module.xtts_env_ready()
    assert ok is False
    assert "not found" in msg


def test_env_ready_false_when_tts_package_absent(implementation_module, tmp_path):
    env_dir = implementation_module.XTTS_ENV_DIR
    _make_fake_env(env_dir)

    ok, msg = implementation_module.xtts_env_ready()
    assert ok is False
    assert "not found" in msg
    assert "run.sh" in msg


def test_env_ready_false_mid_install_tts_dir_without_dist_info(implementation_module, tmp_path):
    """A partial/interrupted install unpacks the ``TTS`` package dir before
    pip finishes writing its ``dist-info`` marker. Checking the bare
    directory would flap ready/not-ready on the 5s heartbeat and could admit
    a synthesis request that then fails deep in the subprocess -- the
    dist-info marker must be required, not just the package dir.
    """
    env_dir = implementation_module.XTTS_ENV_DIR
    _make_fake_env(env_dir, with_tts_dir=True, with_dist_info=False)

    ok, msg = implementation_module.xtts_env_ready()
    assert ok is False
    assert "not found" in msg


def test_env_ready_true_when_external_env_has_tts_installed(implementation_module, tmp_path):
    """The core regression check: readiness must come from the external env's
    installed packages on disk, never from an in-process import — this must
    report ready even though ``TTS`` is not (and never will be) importable in
    the current test process.
    """
    env_dir = implementation_module.XTTS_ENV_DIR
    # No real "TTS" package here at all, just the completion marker a real
    # pip install would leave -- proving readiness comes from a filesystem
    # check of the external env, not an in-process import of the real thing.
    _make_fake_env(env_dir, with_tts_dir=True, with_dist_info=True)

    ok, msg = implementation_module.xtts_env_ready()
    assert ok is True
    assert msg == "OK"


def test_env_ready_true_finds_marker_despite_stale_python_version_dir(implementation_module, tmp_path):
    """A Python upgrade can leave a stale ``lib/pythonX.Y`` dir (no TTS)
    alongside the real, re-provisioned ``lib/pythonX.Z`` (has TTS) under the
    same env root. The check must not shadow the real one behind the stale
    one -- picking an arbitrary/first match by sort order would silently
    recreate the exact "permanently needs_setup" bug this fix addresses.
    """
    env_dir = implementation_module.XTTS_ENV_DIR
    _make_fake_env(env_dir, python_version="3.9")  # stale, empty
    _make_fake_env(env_dir, python_version="3.12", with_tts_dir=True, with_dist_info=True)

    ok, msg = implementation_module.xtts_env_ready()
    assert ok is True
    assert msg == "OK"
