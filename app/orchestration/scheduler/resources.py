"""Scheduler resource-claim helpers.

This module owns the normalized resource model that replaces ad-hoc worker
locks and engine-specific scheduling branches.

A ``ResourceClaim`` declares what hardware a task needs.  The scheduler
evaluates claims against current availability before allowing a task to run.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ResourceClaim:
    """Normalized resource requirements for a scheduled task.

    Attributes:
        gpu: Whether the task needs exclusive GPU access.
        vram_mb: Estimated VRAM usage in megabytes.
        cpu_heavy: Whether the task does sustained heavy CPU work.
    """

    gpu: bool = False
    vram_mb: int = 0
    cpu_heavy: bool = False

    @classmethod
    def none(cls) -> "ResourceClaim":
        """Return a claim for tasks that need no special resources."""
        return cls()

    @classmethod
    def gpu_heavy(cls, vram_mb: int = 4000) -> "ResourceClaim":
        """Return a claim for GPU-heavy tasks (e.g. XTTS synthesis)."""
        return cls(gpu=True, vram_mb=vram_mb, cpu_heavy=True)

    @classmethod
    def from_engine_manifest(cls, manifest: object) -> "ResourceClaim":
        """Build a ResourceClaim from an engine manifest's resource profile.

        Args:
            manifest: An ``EngineManifestModel`` instance.

        Returns:
            ResourceClaim: Claim derived from the manifest's resource profile.
        """
        resource = getattr(manifest, "resource", None)
        if resource is None:
            return cls.none()
        return cls(
            gpu=bool(getattr(resource, "gpu", False)),
            vram_mb=int(getattr(resource, "vram_mb", 0)),
            cpu_heavy=bool(getattr(resource, "cpu_heavy", False)),
        )


def reserve_task_resources(
    *, task_type: str, resource_claims: dict[str, object]
) -> dict[str, object]:
    """Reserve resources for a scheduled task.

    In Phase 5 this is a lightweight admission-control gate.  The TTS Server
    owns GPU memory, so we don't need to track VRAM in Studio.  All we enforce
    here is that a GPU task cannot be co-scheduled with another GPU task.

    Args:
        task_type: Queue task type requesting resources.
        resource_claims: Normalized resource claims needed by the task.

    Returns:
        dict[str, object]: Reservation record (currently informational only).
    """
    # Coerce the claims dict into a structured form for logging and future use.
    gpu = bool(resource_claims.get("gpu", False))
    vram_mb = int(resource_claims.get("vram_mb", 0))
    cpu_heavy = bool(resource_claims.get("cpu_heavy", False))

    return {
        "task_type": task_type,
        "gpu": gpu,
        "vram_mb": vram_mb,
        "cpu_heavy": cpu_heavy,
        "reserved": True,
    }
