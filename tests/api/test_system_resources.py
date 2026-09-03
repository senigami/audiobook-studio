import subprocess
from unittest.mock import MagicMock, patch

import pytest

from app.engines.system_resources import sample_resources


class _FakeVirtualMemory:
    def __init__(self, used_bytes, total_bytes):
        self.used = used_bytes
        self.total = total_bytes


def _patch_cpu_ram(cpu_pct=42.5, used_gb=8.0, total_gb=16.0):
    return (
        patch("app.engines.system_resources.psutil.cpu_percent", return_value=cpu_pct),
        patch(
            "app.engines.system_resources.psutil.virtual_memory",
            return_value=_FakeVirtualMemory(used_gb * 1024 ** 3, total_gb * 1024 ** 3),
        ),
    )


def test_sample_resources_normal_case_all_fields_populated():
    p1, p2 = _patch_cpu_ram()
    fake_result = MagicMock(returncode=0, stdout="1024, 8192\n")
    with p1, p2, patch("app.engines.system_resources.subprocess.run", return_value=fake_result) as run_mock:
        sample = sample_resources()

    run_mock.assert_called_once()
    assert sample["cpu_pct"] == 42.5
    assert sample["ram_used_gb"] == pytest.approx(8.0)
    assert sample["ram_total_gb"] == pytest.approx(16.0)
    assert sample["vram_used_gb"] == pytest.approx(1.0)
    assert sample["vram_total_gb"] == pytest.approx(8.0)


def test_sample_resources_nvidia_smi_not_found_returns_null_vram():
    p1, p2 = _patch_cpu_ram()
    with p1, p2, patch("app.engines.system_resources.subprocess.run", side_effect=FileNotFoundError()):
        sample = sample_resources()

    assert sample["vram_used_gb"] is None
    assert sample["vram_total_gb"] is None
    assert sample["cpu_pct"] == 42.5


def test_sample_resources_nvidia_smi_times_out_returns_null_vram():
    p1, p2 = _patch_cpu_ram()
    with p1, p2, patch(
        "app.engines.system_resources.subprocess.run",
        side_effect=subprocess.TimeoutExpired(cmd="nvidia-smi", timeout=2),
    ):
        sample = sample_resources()

    assert sample["vram_used_gb"] is None
    assert sample["vram_total_gb"] is None


def test_sample_resources_nvidia_smi_garbage_output_returns_null_vram():
    p1, p2 = _patch_cpu_ram()
    fake_result = MagicMock(returncode=0, stdout="not,a,number,here\n")
    with p1, p2, patch("app.engines.system_resources.subprocess.run", return_value=fake_result):
        sample = sample_resources()

    assert sample["vram_used_gb"] is None
    assample_total = sample["vram_total_gb"]
    assert assample_total is None


def test_sample_resources_nvidia_smi_nonzero_exit_returns_null_vram():
    p1, p2 = _patch_cpu_ram()
    fake_result = MagicMock(returncode=1, stdout="")
    with p1, p2, patch("app.engines.system_resources.subprocess.run", return_value=fake_result):
        sample = sample_resources()

    assert sample["vram_used_gb"] is None
    assert sample["vram_total_gb"] is None


def test_get_system_resources_route_returns_200_and_expected_shape():
    from fastapi.testclient import TestClient
    from app.api.web import app as fastapi_app

    p1, p2 = _patch_cpu_ram()
    fake_result = MagicMock(returncode=0, stdout="2048, 10240\n")
    with p1, p2, patch("app.engines.system_resources.subprocess.run", return_value=fake_result):
        client = TestClient(fastapi_app)
        resp = client.get("/api/system/resources")

    assert resp.status_code == 200
    body = resp.json()
    assert set(["cpu_pct", "ram_used_gb", "ram_total_gb", "vram_used_gb", "vram_total_gb"]).issubset(body.keys())
    assert body["cpu_pct"] == 42.5
    assert body["vram_used_gb"] == pytest.approx(2.0)
    assert body["vram_total_gb"] == pytest.approx(10.0)
