"""Scheduler resource-claim helpers.

This module owns the normalized resource model that replaces ad-hoc worker
locks and engine-specific scheduling branches.

A ``ResourceClaim`` declares what hardware a task needs.  The scheduler
evaluates claims against current availability before allowing a task to run.

GPU admission enforcement
-------------------------
``GpuAdmissionGate`` enforces the rule that only one GPU task may run at
a time.  This ensures exclusive GPU access for synthesis workloads while
moving the policy into the scheduler layer where it belongs.

Current state: The ``GpuAdmissionGate`` is a module-level
singleton that tracks active GPU tasks in memory.  It is thread-safe for
single-process use.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass

logger = logging.getLogger(__name__)
_pause_flag = threading.Event()


def is_paused() -> bool:
    """Return whether the task orchestrator is currently paused."""
    return _pause_flag.is_set()


def set_paused(value: bool) -> None:
    """Set the global pause state for the task orchestrator."""
    from app.state import update_settings
    if value:
        _pause_flag.set()
        update_settings({"is_paused": True})
    else:
        _pause_flag.clear()
        update_settings({"is_paused": False})


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
    exclusive: bool = False

    @classmethod
    def none(cls) -> "ResourceClaim":
        """Return a claim for tasks that need no special resources."""
        return cls()

    @classmethod
    def exclusive_claim(cls) -> "ResourceClaim":
        """Return a claim for tasks that must run one-at-a-time."""
        return cls(exclusive=True)

    @classmethod
    def gpu_heavy(cls, vram_mb: int = 4000) -> "ResourceClaim":
        """Return a claim for GPU-heavy synthesis tasks."""
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
            exclusive=bool(getattr(resource, "exclusive", False)),
        )


class GpuAdmissionGate:
    """Enforces the one-GPU-task-at-a-time policy.

    This is the scheduler-layer replacement for the worker-layer GPU lock
    pattern scattered across the original worker code.

    Thread-safe for single-process use.  The gate tracks the currently
    admitted task ID so the orchestrator can report a clear waiting reason.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active_task_id: str | None = None

    def try_acquire(self, task_id: str) -> tuple[bool, str | None]:
        """Attempt to acquire the GPU slot for ``task_id``.

        Args:
            task_id: The task requesting the GPU.

        Returns:
            tuple[bool, str | None]: ``(admitted, waiting_reason)``
            - ``(True, None)`` when the slot was acquired.
            - ``(False, reason)`` when another task already holds the slot.
        """
        with self._lock:
            if self._active_task_id is None:
                self._active_task_id = task_id
                logger.debug("GPU slot acquired by task %s.", task_id)
                return True, None
            reason = (
                f"GPU slot held by task {self._active_task_id}. "
                "This task will run when the current synthesis completes."
            )
            logger.debug(
                "GPU slot unavailable for task %s — held by %s.",
                task_id,
                self._active_task_id,
            )
            return False, reason

    def release(self, task_id: str) -> None:
        """Release the GPU slot held by ``task_id``.

        No-op if the slot is not held by this task (e.g. after a crash recovery).

        Args:
            task_id: The task releasing the GPU.
        """
        with self._lock:
            if self._active_task_id == task_id:
                self._active_task_id = None
                logger.debug("GPU slot released by task %s.", task_id)
            else:
                logger.debug(
                    "GPU release by %s ignored — slot held by %s.",
                    task_id,
                    self._active_task_id,
                )

    @property
    def active_task_id(self) -> str | None:
        """The task ID currently holding the GPU slot, or None."""
        with self._lock:
            return self._active_task_id

    def reset(self) -> None:
        """Force-release the GPU slot (used in testing and crash recovery)."""
        with self._lock:
            self._active_task_id = None


class ExclusiveAdmissionGate:
    """Enforces a single-flight rule for bridge-backed synthesis tasks."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active_task_id: str | None = None

    def try_acquire(self, task_id: str) -> tuple[bool, str | None]:
        with self._lock:
            if self._active_task_id is None:
                self._active_task_id = task_id
                logger.debug("Exclusive slot acquired by task %s.", task_id)
                return True, None
            reason = (
                f"Exclusive slot held by task {self._active_task_id}. "
                "This task will run when the current synthesis completes."
            )
            logger.debug(
                "Exclusive slot unavailable for task %s — held by %s.",
                task_id,
                self._active_task_id,
            )
            return False, reason

    def release(self, task_id: str) -> None:
        with self._lock:
            if self._active_task_id == task_id:
                self._active_task_id = None
                logger.debug("Exclusive slot released by task %s.", task_id)

    @property
    def active_task_id(self) -> str | None:
        with self._lock:
            return self._active_task_id

    def reset(self) -> None:
        with self._lock:
            self._active_task_id = None


# Module-level singleton — one gate for the Studio process.
_gpu_gate = GpuAdmissionGate()
_exclusive_gate = ExclusiveAdmissionGate()


def get_gpu_gate() -> GpuAdmissionGate:
    """Return the module-level GPU admission gate."""
    return _gpu_gate


def get_exclusive_gate() -> ExclusiveAdmissionGate:
    """Return the module-level single-flight admission gate."""
    return _exclusive_gate


def reserve_task_resources(
    *, task_type: str, resource_claims: dict[str, object]
) -> dict[str, object]:
    """Attempt to reserve resources for a scheduled task.

    Enforces the one-GPU-task-at-a-time policy via ``GpuAdmissionGate``.
    CPU-only tasks are always admitted immediately.

    Args:
        task_type: Queue task type requesting resources (used for logging).
        resource_claims: Normalized resource claims for the task.  Must
            include at minimum ``task_id`` (str), ``gpu`` (bool).

    Returns:
        dict[str, object]: Reservation result with these keys:

        - ``admitted`` (bool): Whether the task was admitted.
        - ``task_type`` (str): Echo of the input task type.
        - ``gpu`` (bool): Whether GPU was claimed.
        - ``vram_mb`` (int): VRAM requested.
        - ``cpu_heavy`` (bool): Whether CPU-heavy flag was set.
        - ``waiting_reason`` (str | None): Human-readable reason when
          ``admitted`` is False.  None when admitted.
    """
    task_id = str(resource_claims.get("task_id", "unknown"))
    gpu = bool(resource_claims.get("gpu", False))
    vram_mb = int(resource_claims.get("vram_mb", 0))
    cpu_heavy = bool(resource_claims.get("cpu_heavy", False))
    exclusive = bool(resource_claims.get("exclusive", False))

    waiting_reason: str | None = None
    if is_paused():
        return {
            "admitted": False,
            "task_type": task_type,
            "task_id": task_id,
            "gpu": gpu,
            "vram_mb": vram_mb,
            "cpu_heavy": cpu_heavy,
            "exclusive": exclusive,
            "waiting_reason": "Orchestrator is paused.",
        }

    admitted = True
    if exclusive:
        admitted, waiting_reason = _exclusive_gate.try_acquire(task_id)

    if admitted and gpu:
        gpu_admitted, gpu_waiting_reason = _gpu_gate.try_acquire(task_id)
        if not gpu_admitted:
            if exclusive:
                _exclusive_gate.release(task_id)
            admitted = False
            waiting_reason = gpu_waiting_reason

    if admitted:
        logger.info(
            "Resources admitted for task %s (type=%s, gpu=%s, vram_mb=%d, exclusive=%s).",
            task_id,
            task_type,
            gpu,
            vram_mb,
            exclusive,
        )
    else:
        logger.info(
            "Resources DENIED for task %s (type=%s): %s",
            task_id,
            task_type,
            waiting_reason,
        )

    return {
        "admitted": admitted,
        "task_type": task_type,
        "task_id": task_id,
        "gpu": gpu,
        "vram_mb": vram_mb,
        "cpu_heavy": cpu_heavy,
        "exclusive": exclusive,
        "waiting_reason": waiting_reason,
    }


def release_task_resources(*, task_id: str, resource_claims: dict[str, object]) -> None:
    """Release resources held by a completed or cancelled task.

    Must be called by the orchestrator after ``task.run()`` returns or
    after ``cancel()`` completes.

    Args:
        task_id: The task releasing resources.
        resource_claims: The same claims dict passed to ``reserve_task_resources``.
    """
    gpu = bool(resource_claims.get("gpu", False))
    exclusive = bool(resource_claims.get("exclusive", False))
    if gpu:
        _gpu_gate.release(task_id)
    if exclusive:
        _exclusive_gate.release(task_id)
