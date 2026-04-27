import { useEffect, useRef, useState } from 'react';
import { SEGMENT_PROGRESS_LINGER_MS } from '../utils/performanceTabHelpers';

export function useSegmentProgressLifecycle(
    isActive: boolean,
    activeProgress: number,
    hasProcessingState: boolean,
    allowSettle: boolean,
    initialSettled: boolean,
    isRunning: boolean,
    resetKey?: string
) {
    const [settledProgress, setSettledProgress] = useState<number | null>(null);
    const [smoothedProgress, setSmoothedProgress] = useState(0);
    const settleTimerRef = useRef<number | null>(null);
    const wasActiveRef = useRef(false);

    useEffect(() => {
        wasActiveRef.current = false;
        const nextSettled = initialSettled ? 1 : null;
        setSettledProgress(nextSettled);
        setSmoothedProgress(nextSettled ?? Math.max(0, Math.min(1, activeProgress)));
        if (settleTimerRef.current !== null) {
            window.clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
        }
    }, [resetKey, activeProgress, initialSettled]);

    useEffect(() => {
        if (!initialSettled || isActive) {
            return;
        }
        if (settleTimerRef.current !== null) {
            window.clearTimeout(settleTimerRef.current);
        }
        settleTimerRef.current = window.setTimeout(() => {
            setSettledProgress(null);
            settleTimerRef.current = null;
        }, SEGMENT_PROGRESS_LINGER_MS);
        return () => {
            if (settleTimerRef.current !== null) {
                window.clearTimeout(settleTimerRef.current);
                settleTimerRef.current = null;
            }
        };
    }, [initialSettled, isActive]);

    useEffect(() => {
        if (settleTimerRef.current !== null && !(initialSettled && !wasActiveRef.current && !isActive)) {
            window.clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
        }

        if (isActive) {
            wasActiveRef.current = true;
            setSettledProgress(null);
            return;
        }

        if (wasActiveRef.current && allowSettle) {
            wasActiveRef.current = false;
            setSettledProgress(1);
            settleTimerRef.current = window.setTimeout(() => {
                setSettledProgress(null);
                settleTimerRef.current = null;
            }, SEGMENT_PROGRESS_LINGER_MS);
        } else if (wasActiveRef.current) {
            wasActiveRef.current = false;
            setSettledProgress(null);
        }
    }, [isActive, allowSettle, initialSettled]);

    useEffect(() => {
        if (!hasProcessingState || isActive) return;
        wasActiveRef.current = false;
        setSettledProgress(null);
        if (settleTimerRef.current !== null) {
            window.clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
        }
    }, [hasProcessingState, isActive]);

    useEffect(() => () => {
        if (settleTimerRef.current !== null) {
            window.clearTimeout(settleTimerRef.current);
        }
    }, []);

    useEffect(() => {
        if (isActive && activeProgress > 0) {
            setSmoothedProgress(prev => Math.max(prev, Math.min(1, activeProgress)));
        }
    }, [isActive, activeProgress]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setSmoothedProgress(prev => {
                const target = isActive ? activeProgress : (settledProgress ?? 0);
                if (isActive && target >= 1) {
                    return 1;
                }
                if (isActive && target > 0) {
                    const floor = Math.max(prev, Math.min(1, target));
                    return Math.min(0.995, floor + 0.005);
                }
                if (isActive && isRunning) {
                    return Math.min(0.95, Math.max(prev, prev + 0.005));
                }
                const gap = target - prev;
                if (Math.abs(gap) <= 0.002) return target;
                const correctionWindow = gap > 0 ? 0.45 : 0.65;
                const correctionFraction = Math.min(1, 0.25 / correctionWindow);
                return Math.max(0, Math.min(1, prev + (gap * correctionFraction)));
            });
        }, 250);
        return () => window.clearInterval(timer);
    }, [isActive, activeProgress, settledProgress, isRunning]);

    return {
        displayProgress: smoothedProgress,
        showProgress: isActive || settledProgress !== null || hasProcessingState,
        isSettling: settledProgress !== null
    };
}
