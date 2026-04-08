"""ETA helpers for Studio 2.0."""


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

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = _select_eta_baseline(observed_cps=observed_cps, baseline_cps=baseline_cps)
    raise NotImplementedError


def _select_eta_baseline(
    *, observed_cps: float | None, baseline_cps: float | None
) -> float | None:
    """Describe the baseline-selection rule for ETA estimation.

    Args:
        observed_cps: Optional throughput from the active run.
        baseline_cps: Optional historical throughput baseline.

    Returns:
        float | None: Preferred throughput estimate for ETA calculation.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    raise NotImplementedError
