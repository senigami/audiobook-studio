"""ETA helpers for Studio 2.0."""

from __future__ import annotations

import math
from collections import deque
from math import ceil
from typing import Mapping

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


def decay_segment_eta(
    *,
    progress: float,
    seg_eta_observed: float | None,
    seg_total_baseline: float | None,
    base_confidence: float,
) -> float | None:
    """Confidence-gated decay handoff for the per-segment ETA (§4A.10).

    Stabilises the noisy early per-segment ETA by blending a grounded baseline
    with the live observed estimate **on the implied-total-duration axis** (not
    remaining-seconds — blending remaining double-counts ``(1 - progress)``),
    then deriving remaining ``= total × (1 - progress)``.

    Weighting (the owner's law)::

        w_base = base_confidence × (1 - progress)
        eta    = w_base × total_baseline + (1 - w_base) × total_observed

    The grounded baseline's influence equals its OWN confidence at the start and
    decays linearly to 0 at completion ("20% conf ⇒ 20% influence at p=0, 10% at
    p=0.5"); the live observed estimate takes the remainder and fully owns the
    estimate by completion.  Edge behaviour falls out cleanly:

    - ``base_confidence == 0`` (no history): ``w_base == 0`` → pure observed.
    - ``base_confidence == 1`` at ``p == 0``: ``w_base == 1`` → the stable
      baseline fully anchors the noisy first frames.
    - ``p → 1``: ``w_base → 0`` → pure observed (the live run is now authoritative).

    ``base_confidence`` rises with the engine's recorded sample count, so a
    well-sampled engine gets a strong early baseline anchor (damping the surge),
    while a freshly-verified engine (low confidence) leans on the live estimate
    and self-corrects as samples accumulate.

    Args:
        progress:           Active-segment progress in [0, 1].
        seg_eta_observed:   Live observed remaining seconds for the segment.
        seg_total_baseline: Grounded total-duration estimate for the segment
                            (seg_chars × seconds_per_char).
        base_confidence:    Confidence of the baseline (historical maturity), [0,1].

    Returns:
        Blended remaining-seconds (≥ 0), or ``None`` when no baseline is available
        (caller then keeps the raw observed value — today's behaviour).
    """
    if seg_total_baseline is None or seg_total_baseline <= 0:
        return None
    p = _clamp01(progress)
    if p >= 0.999:
        return 0.0

    if seg_eta_observed is not None and seg_eta_observed > 0:
        t_obs = float(seg_eta_observed) / max(1.0 - p, EPS)
    else:
        # No live estimate yet → lean entirely on the grounded baseline.
        t_obs = float(seg_total_baseline)

    w_base = _clamp01(base_confidence) * (1.0 - p)
    t_blend = w_base * float(seg_total_baseline) + (1.0 - w_base) * t_obs
    return max(0.0, t_blend * (1.0 - p))


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

    def weighted_mean(self) -> float | None:
        """Return the recency-weighted mean of stored velocity samples.

        Linear weights (oldest=1 … newest=n) so the velocity feeding the
        §4A.4 mechanical ceiling tracks the CURRENT rate instead of a flat
        historical average. In a mixed render the early fast-engine samples
        otherwise inflate the mean long after the engine switch, shrinking
        the ceiling below the honest composed ETA at the end of the chapter
        (observed live 2026-07-02, job-47213119: flat mean ≈3.7× the true
        recent rate clipped a correct 3s end-game ETA to 2s). ``cv()``
        deliberately keeps flat statistics — it measures instability.

        Returns ``None`` when no samples are available.
        """
        if not self._samples:
            return None
        acc = 0.0
        total_w = 0.0
        for i, v in enumerate(self._samples, start=1):
            acc += i * v
            total_w += i
        return acc / total_w

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


# ---------------------------------------------------------------------------
# Bracketed throughput ETA under parallelism (W-PAR task 007, Part H)
# ---------------------------------------------------------------------------
ESTIMATING_LABEL: str = "estimating…"
_MIN_COMPLETIONS_FOR_ESTIMATE: int = 3
_POOL_WINDOW_SIZE: int = 10


class BracketedEtaResult:
    """Bracketed ETA snapshot returned by ``BracketedEtaTracker.bracket``.

    Attributes:
        eta_low_seconds: Optimistic ETA (all engines at full declared cap),
            or ``None`` before enough completions have been observed.
        eta_high_seconds: Pessimistic ETA (worst case: effectively 1 worker),
            or ``None`` before enough completions have been observed.
        eta_display: Human-readable bracket string, e.g. ``"~40–70 s"``.
            ``"~40 s"`` (no bracket) when ``eta_low == eta_high`` (cap=1 or a
            single remaining pool). ``"estimating…"`` until at least 3
            completions have been recorded.
    """

    __slots__ = ("eta_low_seconds", "eta_high_seconds", "eta_display")

    def __init__(
        self,
        *,
        eta_low_seconds: int | None,
        eta_high_seconds: int | None,
        eta_display: str,
    ) -> None:
        self.eta_low_seconds = eta_low_seconds
        self.eta_high_seconds = eta_high_seconds
        self.eta_display = eta_display

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return (
            f"BracketedEtaResult(eta_low_seconds={self.eta_low_seconds!r}, "
            f"eta_high_seconds={self.eta_high_seconds!r}, eta_display={self.eta_display!r})"
        )


class BracketedEtaTracker:
    """Rolling-throughput / bottleneck-pool ETA model for N parallel workers.

    Maintains a sliding window of the last ``K`` segment completions per pool
    (engine class or engine id — caller's choice of key), and derives a
    bracketed ``[low, high]`` ETA from the per-pool throughput and declared
    per-pool concurrency caps.

    - **Rolling throughput**: per pool, ``pool_cps = sum(chars) / sum(wall_seconds)``
      over the last ``K`` completions (default ``K=10``).
    - **Bottleneck pool**: ``effective_cps = min(pool_cps * pool_cap)`` across
      pools with at least one completion — the slowest pool's throughput,
      scaled by its own concurrency, bounds overall progress.
    - **Bracket**: ``eta_low = remaining_chars / (effective_cps * global_cap)``
      (optimistic: every pool at full cap); ``eta_high = remaining_chars /
      effective_cps`` (pessimistic: single-worker-equivalent). With a single
      pool at ``cap=1`` the two collapse to the same value — the model
      reduces exactly to today's single-stream CPS (INV-1 cap=1 parity).
    - **Cold start**: returns ``"estimating…"`` (no numeric ETA) until at
      least 3 completions have been recorded across all pools, matching the
      "no fabrication" principle — no ETA is emitted before there is enough
      real throughput data to support one.

    Args:
        pool_caps: Mapping of pool key -> declared concurrency cap (≥ 1).
        window_size: Number of recent completions retained per pool for the
            rolling throughput calculation (default 10).
    """

    def __init__(
        self,
        *,
        pool_caps: Mapping[str, int] | None = None,
        window_size: int = _POOL_WINDOW_SIZE,
    ) -> None:
        self._pool_caps: dict[str, int] = {
            str(k): max(1, int(v)) for k, v in (pool_caps or {}).items()
        }
        self._window_size = max(1, int(window_size))
        self._pool_chars: dict[str, deque[float]] = {}
        self._pool_wall: dict[str, deque[float]] = {}
        self._completion_count: int = 0

    def record_completion(self, *, pool: str, chars_completed: float, wall_seconds: float) -> None:
        """Record one segment completion for ``pool``.

        Args:
            pool: Pool key (engine class or engine id).
            chars_completed: Characters synthesized by this completion.
            wall_seconds: Wall-clock seconds the completion took.
        """
        if chars_completed <= 0 or wall_seconds <= 0:
            return
        chars_ring = self._pool_chars.setdefault(pool, deque(maxlen=self._window_size))
        wall_ring = self._pool_wall.setdefault(pool, deque(maxlen=self._window_size))
        chars_ring.append(float(chars_completed))
        wall_ring.append(float(wall_seconds))
        self._pool_caps.setdefault(pool, 1)
        self._completion_count += 1

    def pool_cps(self, pool: str) -> float | None:
        """Return the rolling characters-per-second rate for ``pool``.

        Returns ``None`` when no completions have been recorded for ``pool``.
        """
        chars_ring = self._pool_chars.get(pool)
        wall_ring = self._pool_wall.get(pool)
        if not chars_ring or not wall_ring:
            return None
        total_wall = sum(wall_ring)
        if total_wall <= 0:
            return None
        return sum(chars_ring) / total_wall

    def effective_cps(self) -> float | None:
        """Return the bottleneck throughput across all active pools.

        ``effective_cps = min(pool_cps * pool_cap)`` over pools with at least
        one recorded completion. Returns ``None`` when no pool has data.
        """
        rates: list[float] = []
        for pool in self._pool_chars:
            cps = self.pool_cps(pool)
            if cps is None:
                continue
            cap = self._pool_caps.get(pool, 1)
            rates.append(cps * cap)
        if not rates:
            return None
        return min(rates)

    def bracket(self, *, remaining_chars: float) -> BracketedEtaResult:
        """Compute the bracketed ETA for ``remaining_chars`` of remaining work.

        Returns ``"estimating…"`` (no numeric ETA) until at least 3
        completions have been observed. With a single pool at cap=1, the
        bracket collapses to a single value (no dash) — numerically identical
        to ``estimate_eta_seconds`` for the same throughput (INV-1 cap=1
        parity, pinned by test B).
        """
        if self._completion_count < _MIN_COMPLETIONS_FOR_ESTIMATE:
            return BracketedEtaResult(
                eta_low_seconds=None, eta_high_seconds=None, eta_display=ESTIMATING_LABEL,
            )

        remaining = max(0.0, float(remaining_chars))
        if remaining == 0:
            return BracketedEtaResult(eta_low_seconds=0, eta_high_seconds=0, eta_display="~0 s")

        effective_cps = self.effective_cps()
        if effective_cps is None or effective_cps <= 0:
            return BracketedEtaResult(
                eta_low_seconds=None, eta_high_seconds=None, eta_display=ESTIMATING_LABEL,
            )

        global_cap = max(1, sum(self._pool_caps.values())) if self._pool_caps else 1
        # Optimistic: every pool's declared concurrency fully utilised.
        low = max(1, int(ceil(remaining / (effective_cps * global_cap))))
        # Pessimistic: bottleneck throughput with no extra concurrency headroom.
        high = max(1, int(ceil(remaining / effective_cps)))

        if low == high or global_cap <= 1:
            return BracketedEtaResult(
                eta_low_seconds=high, eta_high_seconds=high, eta_display=f"~{high} s",
            )

        low, high = min(low, high), max(low, high)
        return BracketedEtaResult(
            eta_low_seconds=low,
            eta_high_seconds=high,
            eta_display=f"~{low}–{high} s",
        )
