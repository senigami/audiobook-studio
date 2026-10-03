"""Best-effort host resource sampling (CPU/RAM/VRAM).

Pure, synchronous, side-effect-free sampling functions. No import-time work,
no threads, no persistent state — safe to call directly from a request
handler (see `design-docs/engineering-rules/modular_architecture.md`).
"""
from __future__ import annotations

import subprocess
from typing import Optional, TypedDict

import psutil

_BYTES_PER_GB = 1024 ** 3
_NVIDIA_SMI_TIMEOUT_SECONDS = 2


class ResourceSample(TypedDict):
    cpu_pct: float
    ram_used_gb: float
    ram_total_gb: float
    ram_available_gb: Optional[float]
    vram_used_gb: Optional[float]
    vram_total_gb: Optional[float]


def _sample_cpu_ram() -> tuple[float, float, float, Optional[float]]:
    """CPU percent and RAM figures. Never raises.

    ``available`` (not ``free``, not total minus used) is what the OS says can
    be handed to a new process without swapping; on macOS ``free`` is a small
    fraction of that. None when the OS did not report it.
    """
    try:
        cpu_pct = psutil.cpu_percent(interval=None)
        vm = psutil.virtual_memory()
        available = getattr(vm, "available", None)
        ram_available_gb = None if available is None else available / _BYTES_PER_GB
        return cpu_pct, vm.used / _BYTES_PER_GB, vm.total / _BYTES_PER_GB, ram_available_gb
    except Exception:
        return 0.0, 0.0, 0.0, None


def _sample_vram() -> tuple[Optional[float], Optional[float]]:
    """Best-effort NVIDIA VRAM sample via `nvidia-smi`.

    Never raises. Returns (None, None) on any failure: nvidia-smi missing,
    timeout, non-zero exit, or unparseable output.
    """
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=memory.used,memory.total",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=_NVIDIA_SMI_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.SubprocessError):
        return None, None

    if result.returncode != 0:
        return None, None

    first_line = result.stdout.strip().splitlines()[0] if result.stdout.strip() else ""
    parts = [p.strip() for p in first_line.split(",")]
    if len(parts) != 2:
        return None, None

    try:
        used_mib = float(parts[0])
        total_mib = float(parts[1])
    except ValueError:
        return None, None

    return used_mib / 1024, total_mib / 1024


def sample_resources() -> ResourceSample:
    """Sample current host CPU/RAM/VRAM usage. Never raises."""
    cpu_pct, ram_used_gb, ram_total_gb, ram_available_gb = _sample_cpu_ram()
    vram_used_gb, vram_total_gb = _sample_vram()
    return {
        "cpu_pct": cpu_pct,
        "ram_used_gb": ram_used_gb,
        "ram_total_gb": ram_total_gb,
        "ram_available_gb": ram_available_gb,
        "vram_used_gb": vram_used_gb,
        "vram_total_gb": vram_total_gb,
    }
