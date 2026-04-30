"""ETA helpers for Studio 2.0."""

from __future__ import annotations

from math import ceil


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
