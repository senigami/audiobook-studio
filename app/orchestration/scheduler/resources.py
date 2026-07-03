"""Scheduler resource-claim helpers.

This module owns the normalized resource model that replaces ad-hoc worker
locks and engine-specific scheduling branches.

A ``ResourceClaim`` declares what hardware a task needs.  The scheduler
evaluates claims against current availability before allowing a task to run.

Per-engine-class counting semaphores (Studio 2.0 W-PAR task 001)
-----------------------------------------------------------------
``EngineClassSemaphore`` is a counting semaphore keyed by engine class
(``"gpu"``, ``"cpu_heavy"``, ``"cloud"``).  Each engine declares its safe
concurrency via ``behavior.max_concurrent_workers`` in its manifest; the
scheduler sizes the semaphore to that cap.  Default cap = 1, so with all
engines at the default the behavior is byte-identical to today's binary gates
(INV-1 "ships dark").

No engine-ID string comparisons are permitted in this module (INV-5).
Semaphore keys are engine-class strings derived from the manifest resource
block, not engine_id strings.

Deprecated aliases
------------------
``GpuAdmissionGate`` and ``ExclusiveAdmissionGate`` are preserved as thin
wrappers around ``get_engine_semaphore`` so existing callers compile and pass.
"""

from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)
_pause_flag = threading.Event()

# Global concurrency backstop — checked before the per-engine-class semaphore.
# Prevents a misconfigured or newly-added engine from saturating the host.
# Override via environment variable MAX_GLOBAL_CONCURRENT_SYNTHESIS (default 8).
MAX_GLOBAL_CONCURRENT_SYNTHESIS: int = int(
    os.environ.get("MAX_GLOBAL_CONCURRENT_SYNTHESIS", "8")
)


def _engine_class_admission_enabled() -> bool:
    """Whether per-engine-class semaphore admission is active.

    W-PAR ships dark (task 001): until the enable toggle lands (task 007) this
    returns ``False`` so admission falls back to the single shared exclusive
    gate — byte-identical to the pre-W-PAR behavior where xtts, voxtral and API
    synthesis all serialized against one another (INV-1).

    When the per-class path is *disabled*, a claim's ``engine_class`` is ignored
    and every synthesis-class task (anything that previously held the exclusive
    or GPU gate) routes through the legacy single-flight exclusive gate.

    Override via env ``ENGINE_CLASS_ADMISSION`` (``"1"``/``"true"`` to enable).
    Read per-call so tests can toggle it without re-importing the module.
    """
    return os.environ.get("ENGINE_CLASS_ADMISSION", "").strip().lower() in {"1", "true", "yes", "on"}


def is_paused() -> bool:
    """Return whether the task orchestrator is currently paused."""
    return _pause_flag.is_set()


def set_paused(value: bool) -> None:
    """Set the global pause state for the task orchestrator."""
    from app.db.state import update_settings
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
        engine_class: Engine-class string used to key the counting semaphore.
            Derived from the manifest resource block: ``"gpu"`` if
            ``resource.gpu``, ``"cpu_heavy"`` if ``resource.cpu_heavy``,
            else ``"cloud"``.  Empty string means ``"exclusive"``
            (legacy compat).
        cap: Maximum concurrent tasks of this engine class (from
            ``behavior.max_concurrent_workers``; default 1).
    """

    gpu: bool = False
    vram_mb: int = 0
    cpu_heavy: bool = False
    exclusive: bool = False
    engine_class: str = ""
    cap: int = 1

    @classmethod
    def none(cls) -> "ResourceClaim":
        """Return a claim for tasks that need no special resources."""
        return cls()

    @classmethod
    def exclusive_claim(cls) -> "ResourceClaim":
        """Return a claim for tasks that must run one-at-a-time."""
        return cls(exclusive=True, engine_class="exclusive", cap=1)

    @classmethod
    def gpu_heavy(cls, vram_mb: int = 4000) -> "ResourceClaim":
        """Return a claim for GPU-heavy synthesis tasks."""
        return cls(gpu=True, vram_mb=vram_mb, cpu_heavy=True, engine_class="gpu", cap=1)

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


# ===========================================================================
# EngineClassSemaphore — counting semaphore keyed by engine class
# ===========================================================================


class EngineClassSemaphore:
    """Counting semaphore for one engine class.

    Admits up to ``cap`` concurrent tasks.  Tracks active task IDs for
    diagnostics.  Thread-safe for single-process use.

    Args:
        cap: Maximum number of concurrent slots (≥ 1).
    """

    def __init__(self, cap: int = 1) -> None:
        if cap < 1:
            raise ValueError(f"cap must be ≥ 1, got {cap}")
        self._cap = cap
        self._lock = threading.Lock()
        self._active_ids: set[str] = set()

    def try_acquire(self, task_id: str) -> tuple[bool, Optional[str]]:
        """Non-blocking attempt to acquire one slot for ``task_id``.

        Returns:
            ``(True, None)`` when a slot was acquired.
            ``(False, reason_str)`` when all slots are taken.
        """
        with self._lock:
            if len(self._active_ids) < self._cap:
                self._active_ids.add(task_id)
                logger.debug(
                    "Engine-class slot acquired by %s (%d/%d active).",
                    task_id,
                    len(self._active_ids),
                    self._cap,
                )
                return True, None
            sample = next(iter(self._active_ids), "unknown")
            reason = (
                f"All {self._cap} slot(s) for this engine class are occupied "
                f"(e.g. task {sample!r}). "
                "This task will run when a current synthesis completes."
            )
            logger.debug(
                "Engine-class slot unavailable for %s (%d/%d slots taken).",
                task_id,
                len(self._active_ids),
                self._cap,
            )
            return False, reason

    def release(self, task_id: str) -> None:
        """Release the slot held by ``task_id``.

        No-op if ``task_id`` is not currently active (safe for crash-recovery
        and double-release scenarios).
        """
        with self._lock:
            if task_id in self._active_ids:
                self._active_ids.discard(task_id)
                logger.debug(
                    "Engine-class slot released by %s (%d/%d active).",
                    task_id,
                    len(self._active_ids),
                    self._cap,
                )
            else:
                logger.debug(
                    "Engine-class release by %s ignored — not in active set.",
                    task_id,
                )

    @property
    def active_count(self) -> int:
        """Number of slots currently held."""
        with self._lock:
            return len(self._active_ids)

    @property
    def active_task_id(self) -> Optional[str]:
        """Return one held task ID (useful for cap=1 diagnostics), or None."""
        with self._lock:
            return next(iter(self._active_ids), None)

    def reset(self) -> None:
        """Force-release all slots (used in testing and crash recovery)."""
        with self._lock:
            self._active_ids.clear()

    def ensure_min_cap(self, cap: int) -> None:
        """Grow this semaphore's capacity to at least ``cap`` (never shrinks).

        Fixed 2026-07-03: capacity used to be frozen forever at whichever
        caller happened to create the singleton first — silently ignoring
        every later, possibly more-authoritative, cap request. In practice
        any caller that asked for a smaller cap before the real
        manifest-derived claim ever ran (e.g. a deprecated legacy gate, or
        an unrelated test resetting the same engine-class key) would
        permanently lock out real concurrency for that engine class, with no
        error or warning. Growing (never shrinking) makes the manifest's
        intended cap self-healing regardless of call order, while never
        surprising an in-flight caller with a sudden capacity *decrease*.
        """
        with self._lock:
            if cap > self._cap:
                logger.info(
                    "Engine-class semaphore cap grew %d -> %d.", self._cap, cap
                )
                self._cap = cap
            elif cap < self._cap:
                # Mirror-image of the bug this method fixes: silently ignoring
                # a *smaller* request is exactly as surprising as the old
                # silently-frozen-forever behavior, just in the other
                # direction (e.g. an operator lowers max_concurrent_workers
                # after OOMs and expects the next task to respect it). Never
                # shrink live (would risk violating an in-flight admission
                # decision) — but make the mismatch visible instead of silent.
                logger.warning(
                    "Engine-class semaphore requested cap %d is smaller than "
                    "the current cap %d — capacity does NOT shrink at "
                    "runtime; restart the process for a lowered manifest cap "
                    "to take effect.",
                    cap,
                    self._cap,
                )


# ===========================================================================
# Module-level semaphore registry (keyed by engine_class string)
# ===========================================================================

_engine_semaphores: dict[str, EngineClassSemaphore] = {}
_semaphore_registry_lock = threading.Lock()


def get_engine_semaphore(engine_class: str, cap: int = 1) -> EngineClassSemaphore:
    """Return the module-level semaphore for ``engine_class``.

    Singletons are created lazily on the first call for a given class
    string. Subsequent calls with the same ``engine_class`` return the
    existing instance, growing its capacity to ``cap`` if ``cap`` is larger
    than what it currently has (see ``EngineClassSemaphore.ensure_min_cap``).
    Capacity never shrinks from a later call — only the first creation or a
    larger request can change it.

    Args:
        engine_class: Engine-class string (``"gpu"``, ``"cpu_heavy"``,
            ``"cloud"``, ``"exclusive"``, or any custom string).
        cap: Semaphore capacity. Used verbatim when creating a new instance;
            for an existing instance, grows its cap if this is larger.

    Returns:
        EngineClassSemaphore: The singleton for this class.
    """
    with _semaphore_registry_lock:
        if engine_class not in _engine_semaphores:
            _engine_semaphores[engine_class] = EngineClassSemaphore(cap=max(1, cap))
            logger.debug(
                "Created EngineClassSemaphore(class=%r, cap=%d).", engine_class, cap
            )
        else:
            _engine_semaphores[engine_class].ensure_min_cap(max(1, cap))
        return _engine_semaphores[engine_class]


# Global cap backstop — checked before the per-engine semaphore.
_global_cap_gate = EngineClassSemaphore(cap=MAX_GLOBAL_CONCURRENT_SYNTHESIS)


# ===========================================================================
# Deprecated binary gates — thin wrappers kept for backward compatibility
# ===========================================================================


class GpuAdmissionGate:
    """Deprecated. Legacy single-slot GPU gate for backward compatibility
    with existing tests and the pre-W-PAR "exclusive across all engines" path.

    Uses its own private ``EngineClassSemaphore(cap=1)`` — it must NOT be
    backed by the shared ``get_engine_semaphore`` registry.  Bug fixed
    2026-07-03: this gate used to call ``get_engine_semaphore("gpu", 1)``,
    which *eagerly registers* into the same registry a manifest-derived
    ``engine_class="gpu"`` claim also uses (``get_engine_semaphore`` caches
    by key and ignores ``cap`` for an existing entry).  Because this gate is
    constructed at module import time (``_gpu_gate = GpuAdmissionGate()``
    below), it always won the race and permanently capped every GPU-class
    engine at 1 concurrent task — silently ignoring the manifest's
    ``max_concurrent_workers`` even with ``ENGINE_CLASS_ADMISSION`` enabled.
    """

    def __init__(self) -> None:
        self._sem = EngineClassSemaphore(cap=1)

    def try_acquire(self, task_id: str) -> tuple[bool, Optional[str]]:
        admitted, reason = self._sem.try_acquire(task_id)
        if admitted:
            logger.debug("GPU slot acquired by task %s.", task_id)
        else:
            logger.debug("GPU slot unavailable for task %s.", task_id)
        return admitted, reason

    def release(self, task_id: str) -> None:
        self._sem.release(task_id)
        logger.debug("GPU slot released by task %s.", task_id)

    @property
    def active_task_id(self) -> Optional[str]:
        return self._sem.active_task_id

    def reset(self) -> None:
        self._sem.reset()


class ExclusiveAdmissionGate:
    """Deprecated. Legacy single-slot exclusive gate for backward
    compatibility with existing tests and the pre-W-PAR "exclusive across
    all engines" path.

    Uses its own private ``EngineClassSemaphore(cap=1)`` — see
    ``GpuAdmissionGate`` for why this must not share the manifest-driven
    registry (this class predates any real ``engine_class="exclusive"``
    manifest value, so it happened not to cause an observable bug, but it
    shared the same latent hazard and is fixed for the same reason).
    """

    def __init__(self) -> None:
        self._sem = EngineClassSemaphore(cap=1)

    def try_acquire(self, task_id: str) -> tuple[bool, Optional[str]]:
        admitted, reason = self._sem.try_acquire(task_id)
        if admitted:
            logger.debug("Exclusive slot acquired by task %s.", task_id)
        else:
            logger.debug("Exclusive slot unavailable for task %s.", task_id)
        return admitted, reason

    def release(self, task_id: str) -> None:
        self._sem.release(task_id)
        logger.debug("Exclusive slot released by task %s.", task_id)

    @property
    def active_task_id(self) -> Optional[str]:
        return self._sem.active_task_id

    def reset(self) -> None:
        self._sem.reset()


# Module-level singleton — one gate for the Studio process. Each has its own
# PRIVATE semaphore (not the shared engine-class registry, see class
# docstrings above) so real manifest-derived engine-class claims are never
# capped by these legacy single-flight gates.
_gpu_gate = GpuAdmissionGate()
_exclusive_gate = ExclusiveAdmissionGate()


def get_gpu_gate() -> GpuAdmissionGate:
    """Return the module-level GPU admission gate (deprecated wrapper)."""
    return _gpu_gate


def get_exclusive_gate() -> ExclusiveAdmissionGate:
    """Return the module-level single-flight admission gate (deprecated wrapper)."""
    return _exclusive_gate


# ===========================================================================
# Reserve / release
# ===========================================================================


def _reservation_result(
    *,
    admitted: bool,
    task_type: str,
    task_id: str,
    gpu: bool,
    vram_mb: int,
    cpu_heavy: bool,
    exclusive: bool,
    engine_class: str,
    waiting_reason: Optional[str],
) -> dict[str, object]:
    """Build the reservation result dict (single shape for all return paths)."""
    if admitted:
        logger.info(
            "Resources admitted for task %s (type=%s, engine_class=%r, gpu=%s, vram_mb=%d, exclusive=%s).",
            task_id, task_type, engine_class or "<legacy>", gpu, vram_mb, exclusive,
        )
    else:
        logger.info(
            "Resources DENIED for task %s (type=%s): %s", task_id, task_type, waiting_reason,
        )
    return {
        "admitted": admitted,
        "task_type": task_type,
        "task_id": task_id,
        "gpu": gpu,
        "vram_mb": vram_mb,
        "cpu_heavy": cpu_heavy,
        "exclusive": exclusive,
        "engine_class": engine_class,
        "waiting_reason": waiting_reason,
    }


def reserve_task_resources(
    *, task_type: str, resource_claims: dict[str, object]
) -> dict[str, object]:
    """Attempt to reserve resources for a scheduled task.

    Enforcement order:
    1. Pause gate.
    2. Global cap backstop (``MAX_GLOBAL_CONCURRENT_SYNTHESIS``).
    3. Per-engine-class semaphore (from ``engine_class`` + ``cap`` in claims,
       or legacy ``exclusive`` / ``gpu`` flags for backward compatibility).

    New optional keys in ``resource_claims``:
    - ``engine_class`` (str): Engine-class key for the counting semaphore.
      When absent, falls back to legacy ``exclusive`` / ``gpu`` logic.
    - ``cap`` (int): Semaphore capacity (default 1; ignored for existing singletons).

    Args:
        task_type: Queue task type requesting resources (used for logging).
        resource_claims: Normalized resource claims for the task.  Must
            include at minimum ``task_id`` (str).

    Returns:
        dict[str, object]: Reservation result with these keys:

        - ``admitted`` (bool): Whether the task was admitted.
        - ``task_type`` (str): Echo of the input task type.
        - ``gpu`` (bool): Whether GPU was claimed.
        - ``vram_mb`` (int): VRAM requested.
        - ``cpu_heavy`` (bool): Whether CPU-heavy flag was set.
        - ``exclusive`` (bool): Whether exclusive flag was set.
        - ``engine_class`` (str): Engine-class string used for admission.
        - ``waiting_reason`` (str | None): Human-readable reason when
          ``admitted`` is False.  None when admitted.
    """
    task_id = str(resource_claims.get("task_id", "unknown"))
    gpu = bool(resource_claims.get("gpu", False))
    vram_mb = int(resource_claims.get("vram_mb", 0))
    cpu_heavy = bool(resource_claims.get("cpu_heavy", False))
    exclusive = bool(resource_claims.get("exclusive", False))
    engine_class = str(resource_claims.get("engine_class", ""))
    cap = int(resource_claims.get("cap", 1))

    waiting_reason: Optional[str] = None

    if is_paused():
        return {
            "admitted": False,
            "task_type": task_type,
            "task_id": task_id,
            "gpu": gpu,
            "vram_mb": vram_mb,
            "cpu_heavy": cpu_heavy,
            "exclusive": exclusive,
            "engine_class": engine_class,
            "waiting_reason": "Orchestrator is paused.",
        }

    admitted = True

    # --- Ships-dark gate (W-PAR task 001, INV-1) ---
    # Until per-engine-class admission is explicitly enabled (task 007), any
    # synthesis-class claim (engine_class set) is funnelled through the single
    # shared exclusive gate.  This preserves the pre-W-PAR invariant that xtts,
    # voxtral, mixed and API synthesis all serialize against ONE another — no
    # observable parallelism leaks in before the toggle.  W5 stays closed
    # because mixed (engine_class="cloud") now passes through the gate too.
    _class_admission = _engine_class_admission_enabled()
    if engine_class and not _class_admission:
        admitted, waiting_reason = _exclusive_gate.try_acquire(task_id)
        return _reservation_result(
            admitted=admitted,
            task_type=task_type,
            task_id=task_id,
            gpu=gpu,
            vram_mb=vram_mb,
            cpu_heavy=cpu_heavy,
            exclusive=exclusive,
            engine_class=engine_class,
            waiting_reason=waiting_reason,
        )

    # --- Global cap backstop (checked before per-engine semaphore) ---
    # Only applies when a meaningful engine_class is claimed (not CPU-only
    # tasks that don't touch synthesis resources).
    _used_global_cap = False
    if engine_class:
        global_admitted, global_reason = _global_cap_gate.try_acquire(task_id)
        if not global_admitted:
            return {
                "admitted": False,
                "task_type": task_type,
                "task_id": task_id,
                "gpu": gpu,
                "vram_mb": vram_mb,
                "cpu_heavy": cpu_heavy,
                "exclusive": exclusive,
                "engine_class": engine_class,
                "waiting_reason": global_reason,
            }
        _used_global_cap = True

    # --- Per-engine-class semaphore (new path) or legacy gates (old path) ---
    if engine_class:
        # New semaphore-based path: derive semaphore from engine_class + cap.
        sem = get_engine_semaphore(engine_class, cap)
        admitted, waiting_reason = sem.try_acquire(task_id)
        if not admitted and _used_global_cap:
            _global_cap_gate.release(task_id)
    else:
        # Legacy path: honour exclusive / gpu flags for backward compatibility.
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
            "Resources admitted for task %s (type=%s, engine_class=%r, gpu=%s, vram_mb=%d, exclusive=%s).",
            task_id,
            task_type,
            engine_class or "<legacy>",
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
        "engine_class": engine_class,
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
    engine_class = str(resource_claims.get("engine_class", ""))
    gpu = bool(resource_claims.get("gpu", False))
    exclusive = bool(resource_claims.get("exclusive", False))
    cap = int(resource_claims.get("cap", 1))

    # Ships-dark path: when per-engine-class admission is disabled, a synthesis
    # claim only ever acquired the shared exclusive gate (see reserve), so that
    # is all we release.  Mirrors reserve_task_resources exactly (INV-1).
    if engine_class and not _engine_class_admission_enabled():
        _exclusive_gate.release(task_id)
        return

    if engine_class:
        # New semaphore path.
        sem = get_engine_semaphore(engine_class, cap)
        sem.release(task_id)
        _global_cap_gate.release(task_id)
    else:
        # Legacy path.
        if gpu:
            _gpu_gate.release(task_id)
        if exclusive:
            _exclusive_gate.release(task_id)
