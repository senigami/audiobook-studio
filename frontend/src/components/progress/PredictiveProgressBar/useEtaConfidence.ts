import { useRef, useCallback } from 'react';
import {
    clamp01,
    ETA_CONFIDENCE,
    computeCv,
    emaStep,
    smoothstepRamp,
} from '@/components/progress/PredictiveProgressBar/predictiveProgressBarHelpers';

export interface EtaConfidenceState {
    /** Smoothed end-time estimate (ms). Null before first sample. */
    etaEndSmoothed: number | null;
    /** Trust weight in [0,1]. */
    w: number;
    /** Adaptive base trust derived from ETA stability. */
    base: number;
    /** Coefficient of variation of remaining time over last N samples. */
    cv: number;
}

interface EtaConfidenceRef {
    samples: number[];
    ema: number | null;
    base: number;
    lastUpdateMs: number | null;
    lastPersistenceKey: string | undefined;
    lastStartedAt: number | undefined;
}

/**
 * Hook that maintains the ETA confidence model (doc 15).
 *
 * Call `update(etaEndRaw, progress, nowMs)` on each incoming ETA update.
 * Returns the current state (etaEndSmoothed, w, base, cv).
 *
 * Resets automatically when persistenceKey or startedAt changes, and on
 * terminal status.
 */
export const useEtaConfidence = ({
    persistenceKey,
    startedAt,
    status,
}: {
    persistenceKey?: string;
    startedAt?: number;
    status?: string;
}) => {
    const stateRef = useRef<EtaConfidenceRef>({
        samples: [],
        ema: null,
        base: ETA_CONFIDENCE.BASE_FLOOR,
        lastUpdateMs: null,
        lastPersistenceKey: persistenceKey,
        lastStartedAt: startedAt,
    });

    // Detect key change → reset
    const s = stateRef.current;
    const keyChanged = s.lastPersistenceKey !== persistenceKey || s.lastStartedAt !== startedAt;
    const isTerminal = status === 'done' || status === 'failed' || status === 'cancelled' || status === 'queued';
    if (keyChanged || isTerminal) {
        s.samples = [];
        s.ema = null;
        s.base = ETA_CONFIDENCE.BASE_FLOOR;
        s.lastUpdateMs = null;
        s.lastPersistenceKey = persistenceKey;
        s.lastStartedAt = startedAt;
    }

    /**
     * Process a new raw ETA end-time sample.
     * @param etaEndRaw - resolved end time in ms (from resolveEndAtMs)
     * @param progress  - current effective visual progress [0,1]
     * @param nowMs     - current wall clock
     */
    const update = useCallback((
        etaEndRaw: number,
        progress: number,
        nowMs: number,
    ): EtaConfidenceState => {
        const st = stateRef.current;
        st.lastUpdateMs = nowMs;

        // Add to ring buffer
        st.samples.push(etaEndRaw);
        if (st.samples.length > ETA_CONFIDENCE.N) {
            st.samples.shift();
        }

        // Seed EMA on first sample
        if (st.ema === null) {
            st.ema = etaEndRaw;
            st.base = ETA_CONFIDENCE.BASE_FLOOR;
        }

        // Compute CV over ring
        const cv = computeCv(st.samples, nowMs);

        // Compute base trust from stability
        const rawBase = clamp01(1 - ETA_CONFIDENCE.K * cv);
        st.base = Math.max(rawBase, ETA_CONFIDENCE.BASE_FLOOR);

        // Compute composite weight w
        const ramp = smoothstepRamp(progress);
        const w = clamp01(st.base + (1 - st.base) * ramp);

        // Compute alpha and update EMA
        const alpha = ETA_CONFIDENCE.ALPHA_MIN + (ETA_CONFIDENCE.ALPHA_MAX - ETA_CONFIDENCE.ALPHA_MIN) * w;
        st.ema = emaStep(st.ema, etaEndRaw, alpha);

        return { etaEndSmoothed: st.ema, w, base: st.base, cv };
    }, []);

    /**
     * Apply stall decay: if no update for >STALL_MS while running, decay w toward 0.
     * Returns decayed w (does NOT mutate base — only affects the effective output).
     * Call this from a tick loop when status === 'running'.
     */
    const getStallDecayedW = useCallback((w: number, nowMs: number): number => {
        const st = stateRef.current;
        if (st.lastUpdateMs === null) return w;
        const stalledMs = nowMs - st.lastUpdateMs;
        if (stalledMs <= ETA_CONFIDENCE.STALL_MS) return w;
        // Decay: reduce by factor proportional to stall duration beyond threshold
        const decayFactor = Math.max(0, 1 - (stalledMs - ETA_CONFIDENCE.STALL_MS) / (ETA_CONFIDENCE.STALL_MS * 3));
        return w * decayFactor;
    }, []);

    /**
     * Get the current smoothed ETA end time (without triggering a new update).
     */
    const getCurrentEma = useCallback((): number | null => {
        return stateRef.current.ema;
    }, []);

    return { update, getStallDecayedW, getCurrentEma };
};
