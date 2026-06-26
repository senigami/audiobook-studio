import type React from 'react';

export type ProgressPresentationState =
    | 'default'
    | 'queued'
    | 'preparing'
    | 'running'
    | 'processing'
    | 'finalizing'
    | 'done'
    | 'failed'
    | 'cancelled';

export const isActiveStatus = (status?: string) => status === 'running' || status === 'processing' || status === 'finalizing';
export const isLiveAnimatedStatus = (status?: string) => status === 'running' || status === 'processing' || status === 'finalizing';
export const isPreparingStatus = (status?: string) => status === 'preparing';
export const isFinalizingStatus = (status?: string) => status === 'finalizing';
export const isQueuedStatus = (status?: string) => status === 'queued';
export const isDoneStatus = (status?: string) => status === 'done';
export const isFailedStatus = (status?: string) => status === 'failed';
export const isCancelledStatus = (status?: string) => status === 'cancelled';
export const isLoadingPresentationStatus = (status?: string) => isPreparingStatus(status) || isFinalizingStatus(status);
export const isTerminalStatus = (status?: string) =>
    isQueuedStatus(status) || isDoneStatus(status) || isFailedStatus(status) || isCancelledStatus(status);

// NaN-safe: a non-finite input (undefined progress, NaN from a zero-duration
// lane division, etc.) collapses to 0 rather than propagating "NaN%" to the
// rendered percentage. This is the single shared sink for displayed progress.
export const clamp01 = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);

export const formatStylePercent = (value: number) => `${(clamp01(value) * 100).toFixed(1)}%`;

export const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
};

export const formatStatusLabel = (status?: string) => status
    ? status
        .split('_')
        .filter(Boolean)
        .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ')
    : '';

export const ETA_TICK_MS = 250;

// ---------------------------------------------------------------------------
// ETA Confidence Model — constants and pure helpers (doc 15)
// ---------------------------------------------------------------------------

/** All tunable constants for the ETA confidence / trust-handoff model. */
export const ETA_CONFIDENCE = {
    /** Minimum EMA alpha (heavy smoothing when trust is low). */
    ALPHA_MIN: 0.15,
    /** Maximum EMA alpha (near-raw tracking when trust is high). */
    ALPHA_MAX: 0.85,
    /** Progress at which the progress-based trust ramp begins. */
    RAMP_START: 0.55,
    /** Progress at which the progress-based trust ramp reaches 1. */
    RAMP_END: 0.90,
    /** CV scaling factor: stable → base near 1, jittery → base near 0. */
    K: 2.0,
    /** Minimum base trust (never fully ignore the backend ETA). */
    BASE_FLOOR: 0.2,
    /** Number of end-time samples in the ring buffer. */
    N: 6,
    /** Slope cap at w=0 (coasting, tight). */
    SLOPE_CAP_LOW: 1.5,
    /** Slope cap at w=1 (trusted ETA, loose). */
    SLOPE_CAP_HIGH: 4.0,
    /** No-update stall duration before decaying w toward 0 (ms). */
    STALL_MS: 10_000,
} as const;

/**
 * Smoothstep ramp in [0,1] mapping progress p from RAMP_START→RAMP_END.
 * Returns 0 below RAMP_START, 1 above RAMP_END, smooth cubic in between.
 */
export const smoothstepRamp = (p: number, start = ETA_CONFIDENCE.RAMP_START, end = ETA_CONFIDENCE.RAMP_END): number => {
    if (p <= start) return 0;
    if (p >= end) return 1;
    const t = (p - start) / (end - start);
    return t * t * (3 - 2 * t);
};

/**
 * Coefficient of variation of *remaining time* over a ring of end-time samples.
 * cv = stddev(remaining[i]) / max(1, mean(remaining[i]))
 * remaining[i] = sample[i] - nowMs
 */
export const computeCv = (samples: number[], nowMs: number): number => {
    if (samples.length < 2) return 0;
    const remaining = samples.map(s => Math.max(0, s - nowMs));
    const mean = remaining.reduce((a, b) => a + b, 0) / remaining.length;
    const variance = remaining.reduce((a, r) => a + (r - mean) ** 2, 0) / remaining.length;
    const stddev = Math.sqrt(variance);
    return stddev / Math.max(1, mean);
};

/**
 * Single EMA step.
 * ema = ema + alpha * (sample - ema)
 */
export const emaStep = (ema: number, sample: number, alpha: number): number =>
    ema + clamp01(alpha) * (sample - ema);

/**
 * Clamp the implied velocity of a proposed end time so it does not exceed
 * SLOPE_CAP * prevVelocity.  Returns a clamped endAtMs.
 *
 * velocity = (0.995 - currentProgress) / (endAtMs - nowMs)
 * prevVelocity = (0.995 - currentProgress) / (prevEndAtMs - nowMs)
 *
 * If prevEndAtMs is null or very close to nowMs, skip clamping.
 */
export const clampSlope = (
    proposedEndAtMs: number,
    prevEndAtMs: number | null,
    currentProgress: number,
    nowMs: number,
    w: number,
): number => {
    const slopeCap = ETA_CONFIDENCE.SLOPE_CAP_LOW + (ETA_CONFIDENCE.SLOPE_CAP_HIGH - ETA_CONFIDENCE.SLOPE_CAP_LOW) * w;
    if (prevEndAtMs === null) return proposedEndAtMs;

    const remaining = 0.995 - currentProgress;
    if (remaining <= 0) return proposedEndAtMs;

    const prevDuration = prevEndAtMs - nowMs;
    if (prevDuration <= 0) return proposedEndAtMs; // can't derive prev velocity

    const proposedDuration = proposedEndAtMs - nowMs;
    if (proposedDuration <= 0) return proposedEndAtMs; // already overrun, let autoFinalizing handle it

    // velocity is proportional to 1/duration; clamp duration so velocity stays in [1/cap, cap] of prevVelocity
    // vPrev / SLOPE_CAP ≤ v ≤ vPrev * SLOPE_CAP
    // → prevDuration / SLOPE_CAP ≤ proposedDuration ≤ prevDuration * SLOPE_CAP  (inverted: larger duration = slower)
    const minDuration = prevDuration / slopeCap;
    const maxDuration = prevDuration * slopeCap;
    const clampedDuration = Math.max(minDuration, Math.min(maxDuration, proposedDuration));
    return nowMs + clampedDuration;
};

export const getRemainingTicks = (nowMs: number, endTimeMs: number | null) =>
    endTimeMs === null
        ? 1
        : Math.max(1, Math.ceil(Math.max(0, endTimeMs - nowMs) / ETA_TICK_MS));

export const getProgressInfo = ({
    presentationState,
    preparingIndeterminate,
    displayProgress,
}: {
    presentationState?: string;
    preparingIndeterminate: boolean;
    displayProgress: number;
}) => {
    if (isDoneStatus(presentationState)) {
        if (displayProgress < 0.999) {
            return { localProgress: clamp01(displayProgress), indeterminate: false };
        }
        return { localProgress: 1, indeterminate: false };
    }
    if (isFailedStatus(presentationState)) {
        return { localProgress: 1, indeterminate: false };
    }
    if (isFinalizingStatus(presentationState)) {
        return { localProgress: clamp01(displayProgress), indeterminate: false };
    }
    if (isQueuedStatus(presentationState) || isCancelledStatus(presentationState)) {
        return { localProgress: 0, indeterminate: false };
    }
    if (preparingIndeterminate) {
        return { localProgress: 0, indeterminate: true };
    }

    return {
        localProgress: clamp01(displayProgress),
        indeterminate: false,
    };
};

export const getAutoFinalizing = ({
    presentationState,
    localProgress,
    now,
    estimatedEndAt,
    displayedRemaining,
}: {
    presentationState?: string;
    localProgress: number;
    now: number;
    estimatedEndAt?: number | null;
    displayedRemaining: number | null;
}) => {
    let normalizedLaunchEtaExpired = false;
    const nowSeconds = now / 1000;

    if (typeof estimatedEndAt === 'number' && estimatedEndAt > 0) {
        normalizedLaunchEtaExpired = nowSeconds >= estimatedEndAt;
    }

    return isLiveAnimatedStatus(presentationState)
        && (localProgress >= 0.995 || normalizedLaunchEtaExpired || (displayedRemaining !== null && displayedRemaining <= 0))
        && !isDoneStatus(presentationState)
        && !isFailedStatus(presentationState)
        && !isCancelledStatus(presentationState);
};

export const getBusyStatusText = (visualState: string | undefined, indeterminate: boolean) =>
    visualState === 'finalizing'
        ? 'Finalizing...'
        : indeterminate
        ? 'Preparing…'
        : null;

export const getTerminalStatusText = (visualState: string | undefined) =>
    isDoneStatus(visualState)
        ? 'Complete'
        : isFailedStatus(visualState)
        ? 'Error'
        : isCancelledStatus(visualState)
        ? 'Cancelled'
        : isQueuedStatus(visualState)
        ? 'Queued'
        : null;

export const getTerminalFillStyle = (visualState: string | undefined): React.CSSProperties | null =>
    isDoneStatus(visualState)
        ? {
            background: 'var(--progress-done-fill)',
            boxShadow: '0 0 15px var(--progress-done-glow)',
        }
        : isFailedStatus(visualState)
        ? {
            background: 'var(--progress-failed-fill)',
            boxShadow: '0 0 15px var(--progress-failed-glow)',
        }
        : isQueuedStatus(visualState) || isCancelledStatus(visualState)
        ? {
            background: 'var(--progress-queued-fill)',
            boxShadow: 'none',
        }
        : null;
