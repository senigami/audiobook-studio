"""ETA helpers for Studio 2.0."""

from __future__ import annotations

import math
from collections import deque
from math import ceil

# ---------------------------------------------------------------------------
# §4A.2 numeric eta_confidence constants
# ---------------------------------------------------------------------------
K_VAR: float = 2.0
P_LO: float = 0.55
P_HI: float = 0.95
STALL_MS: float = 10_000.0
TAU_MS: float = 8_000.0
BASE_FLOOR: float = 0.2

# §4A.5 cold-start maturity factor: confidence scales with min(n_samples/N_MATURE, 1).
# With 0 samples the factor is 0 → confidence = BASE_FLOOR (minimum floor).
# With N_MATURE or more samples the factor is 1 → no penalty.
N_MATURE: int = 5

# §4A.8 ETA crossfade constants (same P_LO/P_HI as confidence)
CEIL_SLACK: float = 1.3
EPS: float = 1e-6


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def _smoothstep(x: float, lo: float, hi: float) -> float:
    """Smooth cubic interpolation from 0 to 1 over [lo, hi]."""
    if hi <= lo:
        return 1.0 if x >= hi else 0.0
    t = _clamp01((x - lo) / (hi - lo))
    return t * t * (3.0 - 2.0 * t)


def compute_eta_confidence(
    *,
    progress: float,
    age_ms: float,
    cv: float,
    n_samples: int = N_MATURE,
) -> float:
    """Compute numeric eta_confidence per §4A.2 + §4A.5 cold-start fix.

    Args:
        progress:  Current job progress in [0, 1].
        age_ms:    Milliseconds since the last ETA sample arrived. Zero when fresh.
        cv:        Coefficient of variation of recent ETA / velocity samples.
        n_samples: Number of samples in the ETA ring.  Used for the §4A.5
                   maturity factor: ``min(n_samples / N_MATURE, 1)``.  Defaults to
                   ``N_MATURE`` (fully mature, no cold-start penalty) for callers
                   that have not yet been updated to pass this parameter.

    Returns:
        float in [BASE_FLOOR, 1.0].

    Formula::

        c_var     = clamp01(1 - K_VAR * cv)
        c_done    = smoothstep(progress, P_LO, P_HI)
        c_fresh   = exp(-max(0, age_ms - STALL_MS) / TAU_MS)
        c_mature  = min(n_samples / N_MATURE, 1)          # §4A.5 cold-start fix
        raw       = c_fresh * c_mature * (c_var + (1 - c_var) * c_done)
        result    = clamp(BASE_FLOOR, 1, raw)

    §4A.5 cold-start fix: with 0-1 samples the ring cv() is 0 (not enough data
    to measure instability), so c_var=1.  Without c_mature this produces falsely
    high confidence on the very first frame.  c_mature = min(n/N_MATURE, 1)
    scales the raw value toward zero when few samples exist, ensuring confidence
    starts LOW and RISES as data accumulates — which is the correct behaviour.
    """
    c_var = _clamp01(1.0 - K_VAR * cv)
    c_done = _smoothstep(progress, P_LO, P_HI)
    stale_ms = max(0.0, age_ms - STALL_MS)
    c_fresh = math.exp(-stale_ms / TAU_MS)
    c_mature = min(max(n_samples, 0) / N_MATURE, 1.0)
    raw = c_fresh * c_mature * (c_var + (1.0 - c_var) * c_done)
    return max(BASE_FLOOR, min(1.0, raw))


def crossfade_eta(
    *,
    progress: float,
    eta_calculated: float | None,
    eta_observed: float | None,
    velocity: float | None = None,
) -> float | None:
    """Crossfade calculated ETA (start-phase) → observed ETA (end-phase) per §4A.8.

    Args:
        progress:       Current job progress in [0, 1].
        eta_calculated: Remaining chars × seconds_per_char.  ``None`` if unknown.
        eta_observed:   remaining_work / observed_velocity.  ``None`` if unknown.
        velocity:       Observed velocity (chars/s or work-units/s) used for the
                        mechanical ceiling guard (§4A.4). ``None`` skips the ceiling.

    Returns:
        Blended ETA in seconds (≥ 0), or ``None`` when both inputs are None.

    The result is bounded by the §4A.4 mechanical ceiling and clamped to 0 at
    near-completion (progress ≥ 0.999).
    """
    if progress >= 0.999:
        return 0.0

    if eta_calculated is None and eta_observed is None:
        return None

    ramp = _smoothstep(progress, P_LO, P_HI)

    # Substitute the available source for the missing one.
    if eta_calculated is None:
        eta_calc = float(eta_observed)  # type: ignore[arg-type]
    else:
        eta_calc = float(eta_calculated)

    if eta_observed is None:
        eta_obs = float(eta_calculated)  # type: ignore[arg-type]
    else:
        eta_obs = float(eta_observed)

    blended = (1.0 - ramp) * eta_calc + ramp * eta_obs

    # §4A.4: bound by mechanical ceiling.
    if velocity is not None and velocity > EPS:
        remaining = 1.0 - progress
        ceiling = CEIL_SLACK * remaining / velocity
        blended = min(blended, ceiling)

    return max(0.0, blended)


def apply_eta_ceiling(
    *,
    eta_seconds: float | None,
    progress: float,
    velocity: float | None,
    status: str = "running",
) -> float | None:
    """Apply the §4A.4 mechanical ceiling and terminal zeroing to an ETA.

    Args:
        eta_seconds: Raw ETA in seconds (may be None).
        progress:    Current job progress in [0, 1].
        velocity:    Observed velocity (work-units/s). None skips the ceiling.
        status:      Job status string.

    Returns:
        Bounded ETA (≥ 0) or None when input is None.  Returns 0.0 at
        completion/terminal regardless of the raw value.
    """
    terminal = status in {"done", "failed", "cancelled"}
    if terminal or progress >= 0.999:
        return 0.0

    if eta_seconds is None:
        return None

    eta = float(eta_seconds)

    if velocity is not None and velocity > EPS:
        remaining = 1.0 - progress
        ceiling = CEIL_SLACK * remaining / max(velocity, EPS)
        eta = min(eta, ceiling)

    return max(0.0, eta)


class EtaSampleRing:
    """Small ring buffer of ETA/velocity samples for CV computation.

    Stores the last ``maxlen`` samples and computes the coefficient of
    variation (std/mean) of the **velocity** (work-units per second) so
    that a monotonically *shrinking* remaining-time does not look unstable.

    Args:
        maxlen: Maximum number of samples retained.
    """

    def __init__(self, maxlen: int = 6) -> None:
        self._samples: deque[float] = deque(maxlen=maxlen)

    def push(self, velocity: float) -> None:
        """Add one velocity sample."""
        if velocity > 0:
            self._samples.append(velocity)

    def mean(self) -> float | None:
        """Return the arithmetic mean of stored velocity samples.

        Returns ``None`` when no samples are available.
        """
        if not self._samples:
            return None
        vals = list(self._samples)
        return sum(vals) / len(vals)

    def cv(self) -> float:
        """Return the coefficient of variation of stored velocity samples.

        Returns 0.0 when fewer than 2 samples are available (not enough
        data to measure instability).
        """
        if len(self._samples) < 2:
            return 0.0
        vals = list(self._samples)
        mean = sum(vals) / len(vals)
        if mean <= 0:
            return 0.0
        variance = sum((v - mean) ** 2 for v in vals) / len(vals)
        std = math.sqrt(variance)
        return std / mean

    def __len__(self) -> int:
        return len(self._samples)


def estimate_eta_seconds(
    *,
    completed_units: int,
    total_units: int,
    observed_cps: float | None = None,
    baseline_cps: float | None = None,
) -> int | None:
    """Describe ETA calculation from run progress and throughput baselines.

    Args:
        completed_units: Number of completed progress units.
        total_units: Total number of expected progress units.
        observed_cps: Optional throughput from the current run.
        baseline_cps: Optional historical throughput baseline.

    Returns:
        int | None: Estimated remaining seconds, or None when insufficient
        throughput data is available.

    The estimator intentionally stays conservative. When live throughput is
    clearly degraded by pause-like behavior, the caller should pass an
    effective observed throughput rather than a raw wall-clock rate.
    """
    total = max(int(total_units), 0)
    completed = max(min(int(completed_units), total), 0)
    remaining = max(total - completed, 0)
    if remaining == 0:
        return 0

    baseline = _select_eta_baseline(observed_cps=observed_cps, baseline_cps=baseline_cps)
    if baseline is None or baseline <= 0:
        return None

    return max(1, int(ceil(remaining / baseline)))


def _select_eta_baseline(
    *, observed_cps: float | None, baseline_cps: float | None
) -> float | None:
    """Describe the baseline-selection rule for ETA estimation.

    Args:
        observed_cps: Optional throughput from the active run.
        baseline_cps: Optional historical throughput baseline.

    Returns:
        float | None: Preferred throughput estimate for ETA calculation.

    The observed live rate wins when it is available and plausible. If it is
    collapsing far below the historical baseline, we fall back to the baseline
    rather than inflating ETA into a misleading stall estimate.
    """
    observed = observed_cps if observed_cps and observed_cps > 0 else None
    baseline = baseline_cps if baseline_cps and baseline_cps > 0 else None

    if observed is None:
        return baseline
    if baseline is None:
        return observed

    if observed < baseline * 0.25:
        return baseline
    return observed
