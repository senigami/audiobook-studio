import React, { useState, useEffect, useRef } from 'react';
import {
    clamp01,
    formatStylePercent,
    getBusyStatusText,
    getProgressInfo,
    getRemainingTicks,
    getTerminalFillStyle,
    getTerminalStatusText,
    isActiveStatus,
    isLiveAnimatedStatus,
    isPreparingStatus,
    isTerminalStatus,
    isDoneStatus,
    isFailedStatus,
    isQueuedStatus,
    isCancelledStatus,
    clampSlope,
    type ProgressPresentationState,
} from '@/components/progress/PredictiveProgressBar/predictiveProgressBarHelpers';
import {
    buildPredictiveProgressDebugSnapshot,
    type PredictiveProgressDebugSnapshot,
} from '@/components/progress/PredictiveProgressBar/predictiveProgressBarDebug';
import { useEtaConfidence } from '@/components/progress/PredictiveProgressBar/useEtaConfidence';
import { recordExternalHandoffEvent } from '@/hooks/useSegmentHandoffQueue';
import {
    type ProgressLane,
    type LaneMigration,
    resolveEndAtMs,
    getLaneProgress,
    getRenderedStartAtMs,
    getRenderedEndAtMs,
    getRenderedStartProgress,
} from '@/components/progress/PredictiveProgressBar/predictiveProgressBarLane';
import { ProgressStatusRow } from '@/components/progress/PredictiveProgressBar/ProgressStatusRow';

export type { PredictiveProgressDebugSnapshot } from '@/components/progress/PredictiveProgressBar/predictiveProgressBarDebug';

export interface PredictiveProgressBarProps {
    progress: number;
    startedAt?: number;
    etaSeconds?: number;
    updatedAt?: number;
    persistenceKey?: string;
    label?: string;
    showEta?: boolean;
    showPercent?: boolean;
    showLabel?: boolean;
    barOnly?: boolean;
    status?: string;
    etaBasis?: 'remaining_from_update' | 'total_from_start';
    estimatedEndAt?: number;
    predictive?: boolean;
    /** @deprecated Use allowBackwardProgress instead */
    authoritativeFloor?: boolean;
    /**
     * Explicitly allow the bar to move backward on updates. Default is derived from
     * authoritativeFloor. Callers should always pass this explicitly — all production
     * call sites do — rather than relying on the derived default.
     */
    allowBackwardProgress?: boolean;
    transitionTickCount?: number;
    backwardTransitionTickCount?: number;
    tickMs?: number;
    checkpointMode?: 'default' | 'queue' | 'segment';
    state?: ProgressPresentationState;
    onDebugSnapshot?: (snapshot: PredictiveProgressDebugSnapshot) => void;
    /** Fires every animation tick with the bar's live interpolated progress (0–1). */
    onDisplayProgress?: (progress: number) => void;
    dataTestId?: string;
    /**
     * Per-bar label override for the indeterminate busy-text (right-side status string).
     * Only takes effect when the bar is indeterminate; finalizing and all other states
     * continue to use the standard getBusyStatusText path. Leave undefined for the
     * generic "Preparing…" fallback (assembly / export / queue-row bars).
     * Model-load bars set this to "Preparing… / Loading voice model…".
     */
    busyLabel?: string;
    /**
     * When true the bar renders as indeterminate (preparing pulse, no predictive lane)
     * regardless of status. Used for mid-chapter model-load frames that arrive with
     * status:'running' + indeterminate:true (W-MIX-LA 004).
     * Has no effect when status is already 'preparing'.
     */
    indeterminate?: boolean;
}

const progressMemory = new Map<string, number>();

const PROGRESS_MEMORY_MAX = 100;

const progressMemorySet = (key: string, value: number) => {
    const isNew = !progressMemory.has(key);
    progressMemory.set(key, value);
    if (isNew && progressMemory.size > PROGRESS_MEMORY_MAX) {
        // Map preserves insertion order; delete oldest entries until within cap
        const excess = progressMemory.size - PROGRESS_MEMORY_MAX;
        let count = 0;
        for (const k of progressMemory.keys()) {
            if (count >= excess) break;
            progressMemory.delete(k);
            count++;
        }
    }
};

export const resetPredictiveProgressMemory = (persistenceKey?: string) => {
    if (!persistenceKey) {
        progressMemory.clear();
        return;
    }
    for (const key of Array.from(progressMemory.keys())) {
        if (key.startsWith(`${persistenceKey}:`)) {
            progressMemory.delete(key);
        }
    }
};

const getProgressMemoryKey = (persistenceKey?: string, startedAt?: number) =>
    persistenceKey ? `${persistenceKey}:${startedAt ?? 0}` : undefined;
const getRememberedProgress = (memoryKey?: string) =>
    memoryKey ? (progressMemory.get(memoryKey) ?? 0) : 0;

export const PredictiveProgressBar: React.FC<PredictiveProgressBarProps> = ({
    progress,
    startedAt,
    etaSeconds,
    persistenceKey,
    label = "Progress",
    showEta = true,
    showPercent = true,
    showLabel = true,
    barOnly = false,
    status,
    etaBasis = 'total_from_start',
    estimatedEndAt,
    updatedAt,
    predictive = true,
    authoritativeFloor = false,
    allowBackwardProgress,
    transitionTickCount = 8,
    backwardTransitionTickCount = 2,
    tickMs = 250,
    checkpointMode,
    state,
    onDebugSnapshot,
    onDisplayProgress,
    dataTestId,
    busyLabel,
    indeterminate: incomingIndeterminate,
}) => {
    const presentationState = state ?? status;
    const effectiveAllowBackward = allowBackwardProgress ?? !authoritativeFloor;
    const memoryKey = getProgressMemoryKey(persistenceKey, startedAt);
    // Latest memoryKey, readable from the unmount-only cleanup effect below without adding
    // memoryKey as a dep (which would fire that cleanup on every key change, not just unmount).
    const memoryKeyRef = useRef(memoryKey);
    memoryKeyRef.current = memoryKey;
    // Tracks whether the terminal-status effect below already deleted this bar's progressMemory
    // entry, so the unmount cleanup effect doesn't need to (and can't accidentally interfere with
    // a different bar that has since reused the same key).
    const memoryFinalizedRef = useRef(false);
    // Queue bar with a positive ETA renders DETERMINATE even during preparing/indeterminate:
    // the predictive fill starts at ETA-arrival and progresses continuously into running,
    // eliminating the "hidden catch-up jump" at the START_SYNTHESIS transition.
    // All other bars (segment, default) keep the existing indeterminate-pulse behavior.
    const hasPositiveEta = typeof etaSeconds === 'number' && Number.isFinite(etaSeconds) && etaSeconds > 0;
    const queueBarWithEta = checkpointMode === 'queue' && hasPositiveEta;
    const preparingIndeterminate = !queueBarWithEta && (isPreparingStatus(presentationState) || incomingIndeterminate === true);
    const [tickState, forceUpdate] = useState(Date.now());
    const [currentLane, setCurrentLane] = useState<ProgressLane | null>(null);
    const [migration, setMigration] = useState<LaneMigration | null>(null);

    const currentLaneRef = useRef<ProgressLane | null>(null);
    const prevPresentationStateRef = useRef<string | null>(presentationState);
    const migrationRef = useRef<LaneMigration | null>(null);
    const displayProgressRef = useRef<number>(clamp01(progress));
    const doneTransitionRef = useRef<{ startTimeMs: number; durationMs: number; startProgress: number } | null>(null);
    // Set synchronously in render when done state is first detected; cleared in effect after transition is initialized.
    // Ensures isDoneAnimating is false on the first done-render so shouldTick stays true.
    const doneTransitionPendingRef = useRef<boolean>(false);

    const lastDisplayWriteRef = useRef<{ source: string; value: number | null }>({
        source: 'init',
        value: clamp01(progress),
    });

    const isPhaseHandoff = isPreparingStatus(prevPresentationStateRef.current ?? undefined) && !isPreparingStatus(presentationState);

    const lastUpdateMetadataRef = useRef<{
        incomingProgress: number | null;
        effectiveTargetProgress: number | null;
        currentVisualAtUpdate: number | null;
        isBackwardMigration: boolean;
    }>({
        incomingProgress: null,
        effectiveTargetProgress: null,
        currentVisualAtUpdate: null,
        isBackwardMigration: false,
    });

    // ETA confidence model state (doc 15)
    const etaConfidence = useEtaConfidence({ persistenceKey, startedAt, status: presentationState });
    const etaConfidenceStateRef = useRef<{
        w: number;
        base: number;
        cv: number;
        etaEndSmoothed: number | null;
        slopeCappedVsRaw: number | null;
    }>({ w: 0, base: 0.2, cv: 0, etaEndSmoothed: null, slopeCappedVsRaw: null });

    // Throttle state for lane_update instrumentation (segment checkpointMode only).
    const laneUpdateThrottleRef = useRef<{ lastProgress: number; lastEndInMs: number | null } | null>(null);

    const updateLaneToTarget = (source: string, nextEndAtMs: number | null, nextProgress: number, instant = false) => {
        const nowMs = Date.now();
        const incomingProgress = clamp01(nextProgress);

        const currentVisual = getLaneProgress(
            getRenderedStartAtMs(currentLaneRef.current, migrationRef.current, nowMs),
            getRenderedEndAtMs(currentLaneRef.current, migrationRef.current, nowMs),
            getRenderedStartProgress(currentLaneRef.current, migrationRef.current, nowMs),
            nowMs
        );

        // --- Authoritative floor (backend percent is the position floor) ---
        let effectiveIncomingProgress = incomingProgress;
        if (!effectiveAllowBackward) {
            effectiveIncomingProgress = Math.max(incomingProgress, currentVisual);
            const remembered = getRememberedProgress(memoryKey);
            if (remembered > 0) {
                effectiveIncomingProgress = Math.max(effectiveIncomingProgress, remembered);
            }
        }

        // --- Backward migration detection (for transitionTickCount selection) ---
        const isBackwardMigration = effectiveAllowBackward && incomingProgress < currentVisual - 0.001;
        const activeTransitionTickCount = isBackwardMigration ? backwardTransitionTickCount : transitionTickCount;

        // --- Instant snap (preparing→running phase handoff, or forced) ---
        if (instant) {
            const snapLane: ProgressLane = {
                startedAtMs: nowMs,
                startProgress: effectiveIncomingProgress,
                endAtMs: nextEndAtMs,
            };
            currentLaneRef.current = snapLane;
            setCurrentLane(snapLane);
            setMigration(null);
            migrationRef.current = null;
            displayProgressRef.current = effectiveIncomingProgress;

            lastUpdateMetadataRef.current = {
                incomingProgress,
                effectiveTargetProgress: effectiveIncomingProgress,
                currentVisualAtUpdate: currentVisual,
                isBackwardMigration: false,
            };

            try {
                if (checkpointMode === 'segment') {
                    const endInMs = nextEndAtMs !== null ? Math.round(nextEndAtMs - nowMs) : null;
                    laneUpdateThrottleRef.current = { lastProgress: effectiveIncomingProgress, lastEndInMs: endInMs };
                    recordExternalHandoffEvent('lane_update', { source, progress: effectiveIncomingProgress, endInMs });
                }
            } catch { /* never throw from instrumentation */ }
            return;
        }

        // --- ETA confidence model: compute w and smoothed end time ---
        let confidenceW = etaConfidenceStateRef.current.w;
        let confidenceBase = etaConfidenceStateRef.current.base;
        let confidenceCv = etaConfidenceStateRef.current.cv;
        let etaEndSmoothed = etaConfidenceStateRef.current.etaEndSmoothed;

        if (nextEndAtMs !== null) {
            const cs = etaConfidence.update(nextEndAtMs, effectiveIncomingProgress, nowMs);
            confidenceW = cs.w;
            confidenceBase = cs.base;
            confidenceCv = cs.cv;
            etaEndSmoothed = cs.etaEndSmoothed;
            // Apply stall decay if running
            if (isLiveAnimatedStatus(presentationState)) {
                confidenceW = etaConfidence.getStallDecayedW(confidenceW, nowMs);
            }
            etaConfidenceStateRef.current = {
                w: confidenceW,
                base: confidenceBase,
                cv: confidenceCv,
                etaEndSmoothed,
                slopeCappedVsRaw: null, // updated below
            };
        }

        // --- Velocity-continuous lane construction ---
        // Position is always from current visual (no anchor teleport).
        // End time is blended between the current rendered end and the smoothed ETA.
        const currentRenderedEnd = getRenderedEndAtMs(currentLaneRef.current, migrationRef.current, nowMs);

        let newEndAtMs: number | null = null;
        let slopeCappedVsRaw: number | null = null;

        if (etaEndSmoothed !== null && nextEndAtMs !== null) {
            const blendedEnd = currentRenderedEnd !== null
                ? currentRenderedEnd + (etaEndSmoothed - currentRenderedEnd) * confidenceW
                : etaEndSmoothed;
            const clamped = clampSlope(blendedEnd, currentRenderedEnd, effectiveIncomingProgress, nowMs, confidenceW);
            slopeCappedVsRaw = clamped - blendedEnd; // positive = slowed down, negative = sped up
            newEndAtMs = clamped;
        } else if (nextEndAtMs !== null && etaEndSmoothed === null) {
            // No confidence state yet (e.g. first update) — use raw but record it
            newEndAtMs = nextEndAtMs;
        }
        // If nextEndAtMs is null, newEndAtMs stays null (no ETA)

        etaConfidenceStateRef.current.slopeCappedVsRaw = slopeCappedVsRaw;

        const desiredEndAtMs = newEndAtMs;

        if (!currentLaneRef.current) {
            // Initial mount — set the lane directly, no migration
            const initialLane: ProgressLane = {
                startedAtMs: nowMs,
                startProgress: effectiveIncomingProgress,
                endAtMs: desiredEndAtMs,
            };
            currentLaneRef.current = initialLane;
            setCurrentLane(initialLane);
            setMigration(null);
            migrationRef.current = null;
            displayProgressRef.current = effectiveIncomingProgress;

            lastDisplayWriteRef.current = { source, value: effectiveIncomingProgress };
            lastUpdateMetadataRef.current = {
                incomingProgress,
                effectiveTargetProgress: effectiveIncomingProgress,
                currentVisualAtUpdate: currentVisual,
                isBackwardMigration: false,
            };

            try {
                if (checkpointMode === 'segment') {
                    const endInMs = desiredEndAtMs !== null ? Math.round(desiredEndAtMs - nowMs) : null;
                    laneUpdateThrottleRef.current = { lastProgress: effectiveIncomingProgress, lastEndInMs: endInMs };
                    recordExternalHandoffEvent('lane_update', { source, progress: effectiveIncomingProgress, endInMs });
                }
            } catch { /* never throw from instrumentation */ }
            return;
        }

        // Velocity-continuous new target lane:
        // startedAtMs = now, startProgress = target position, endAtMs = clamped blended end.
        // For forward migration: floor to effectiveIncomingProgress (backend authoritative floor).
        // For backward migration (allowed): target is incomingProgress.
        const targetStartProgress = isBackwardMigration ? incomingProgress : effectiveIncomingProgress;
        const toLane: ProgressLane = {
            startedAtMs: nowMs,
            startProgress: targetStartProgress,
            endAtMs: desiredEndAtMs,
        };

        const newMigration: LaneMigration = {
            startedAtMs: nowMs,
            durationMs: activeTransitionTickCount * tickMs,
            fromLane: {
                startedAtMs: getRenderedStartAtMs(currentLaneRef.current, migrationRef.current, nowMs),
                startProgress: getRenderedStartProgress(currentLaneRef.current, migrationRef.current, nowMs),
                endAtMs: getRenderedEndAtMs(currentLaneRef.current, migrationRef.current, nowMs),
            },
            toLane,
        };

        setMigration(newMigration);
        migrationRef.current = newMigration;
        displayProgressRef.current = currentVisual;

        lastDisplayWriteRef.current = { source, value: targetStartProgress };
        lastUpdateMetadataRef.current = {
            incomingProgress,
            effectiveTargetProgress: targetStartProgress,
            currentVisualAtUpdate: currentVisual,
            isBackwardMigration,
        };

        // Lane instrumentation for segment checkpointMode (Task 3).
        // Throttle: emit on initial mount or when progress moved ≥0.05 or endInMs changed by ≥30%.
        try {
            if (checkpointMode === 'segment') {
                const endInMs = nextEndAtMs !== null ? Math.round(nextEndAtMs - nowMs) : null;
                const prev = laneUpdateThrottleRef.current;
                const isInitial = prev === null;
                const progressDelta = prev !== null ? Math.abs(effectiveIncomingProgress - prev.lastProgress) : 0;
                const endDelta = (prev !== null && prev.lastEndInMs !== null && endInMs !== null)
                    ? Math.abs(endInMs - prev.lastEndInMs) / (Math.abs(prev.lastEndInMs) + 1)
                    : 1; // treat null↔number transitions as a significant change
                if (isInitial || progressDelta >= 0.05 || endDelta >= 0.30) {
                    laneUpdateThrottleRef.current = { lastProgress: effectiveIncomingProgress, lastEndInMs: endInMs };
                    recordExternalHandoffEvent('lane_update', { source, progress: effectiveIncomingProgress, endInMs });
                }
            }
        } catch {
            // never throw from instrumentation
        }
    };

    const initialNow = Date.now();

    // Detect the first render where presentationState becomes 'done' from an active state.
    // Mark transition pending so isDoneAnimating is false (animation in progress) even before the effect runs.
    // Only set pending when prevPresentationState is an active state (i.e., a real 500ms animation will occur).
    const prevIsDoneActiveTransition = prevPresentationStateRef.current === 'running' ||
        prevPresentationStateRef.current === 'processing' ||
        prevPresentationStateRef.current === 'finalizing';
    if (presentationState === 'done' && !doneTransitionRef.current && prevIsDoneActiveTransition) {
        doneTransitionPendingRef.current = true;
    } else if (presentationState !== 'done') {
        doneTransitionPendingRef.current = false;
    }

    const isDoneAnimating = presentationState === 'done' && !doneTransitionPendingRef.current && (
        !doneTransitionRef.current ||
        (tickState - doneTransitionRef.current.startTimeMs >= doneTransitionRef.current.durationMs)
    );
    // Queue bar with a positive ETA must tick even during 'preparing' so the
    // determinate fill advances continuously from ETA-arrival.
    const shouldTick = isLiveAnimatedStatus(presentationState) || (presentationState === 'done' && !isDoneAnimating) || queueBarWithEta;
    const now = shouldTick ? tickState : initialNow;

    const renderedStartAtMs = getRenderedStartAtMs(currentLane, migration, now);
    const renderedEndAtMs = getRenderedEndAtMs(currentLane, migration, now);
    const renderedStartProgress = getRenderedStartProgress(currentLane, migration, now);

    let displayProgress = getLaneProgress(renderedStartAtMs, renderedEndAtMs, renderedStartProgress, now);
    if (presentationState === 'done' && doneTransitionRef.current) {
        const elapsed = now - doneTransitionRef.current.startTimeMs;
        const duration = doneTransitionRef.current.durationMs;
        if (duration > 0 && elapsed < duration) {
            const t = Math.max(0, Math.min(1, elapsed / duration));
            displayProgress = doneTransitionRef.current.startProgress + (1.0 - doneTransitionRef.current.startProgress) * t;
        } else {
            displayProgress = 1.0;
        }
    }
    if (!effectiveAllowBackward && memoryKey) {
        displayProgress = Math.max(displayProgress, getRememberedProgress(memoryKey));
    }
    displayProgressRef.current = displayProgress;

    useEffect(() => {
        const nowMs = Date.now();

        if (presentationState === 'done') {
            if (!doneTransitionRef.current) {
                const prevActive = prevPresentationStateRef.current && (
                    prevPresentationStateRef.current === 'running' ||
                    prevPresentationStateRef.current === 'processing' ||
                    prevPresentationStateRef.current === 'finalizing'
                );
                doneTransitionRef.current = {
                    startTimeMs: nowMs,
                    durationMs: prevActive ? 500 : 0,
                    startProgress: prevActive ? displayProgressRef.current : 1.0,
                };
            }
            // Clear the pending flag now that the transition object is initialized.
            doneTransitionPendingRef.current = false;
        } else {
            doneTransitionRef.current = null;
            doneTransitionPendingRef.current = false;
        }

        const resolvedEndAtMs = resolveEndAtMs({
            nowMs,
            startedAt,
            etaSeconds,
            etaBasis,
            estimatedEndAt,
            updatedAt,
            presentationState,
        });
        // I10 extension (parallel-render update, §2.6 v1.8.0): when the bar is
        // indeterminate the fill is width-locked (100% pulse or 35% sweep — never
        // driven by the lane end time), so passing a real ETA through to the lane
        // does NOT cause fill creep.  Passing it through is what populates
        // renderedEndAtMs → displayedRemaining → the countdown number.
        // Only suppress when there is no real ETA (null resolvedEndAtMs); suppress
        // always for queued (resolveEndAtMs already returned null).
        const nextEndAtMs = resolvedEndAtMs;

        const isTransitionAnimating = presentationState === 'done' && (
            !isDoneAnimating || prevPresentationStateRef.current !== 'done'
        );

        if (!isTransitionAnimating) {
            updateLaneToTarget('prop-sync', nextEndAtMs, progress, isPhaseHandoff);
        }
        prevPresentationStateRef.current = presentationState;
        forceUpdate(nowMs);
    }, [progress, startedAt, etaSeconds, etaBasis, estimatedEndAt, updatedAt, presentationState, isPhaseHandoff, isDoneAnimating]);

    useEffect(() => {
        if (!shouldTick) return;
        const interval = setInterval(() => {
            const nowMs = Date.now();
            forceUpdate(nowMs);

            if (migrationRef.current && nowMs >= migrationRef.current.startedAtMs + migrationRef.current.durationMs) {
                const targetLane = migrationRef.current.toLane;
                currentLaneRef.current = targetLane;
                setCurrentLane(targetLane);
                migrationRef.current = null;
                setMigration(null);
            }
        }, tickMs);
        return () => clearInterval(interval);
    }, [shouldTick, tickMs]);

    const { localProgress, indeterminate } = getProgressInfo({
        presentationState,
        preparingIndeterminate,
        displayProgress,
    });

    const activeTargetLane = migration?.toLane ?? currentLane;
    // Chokepoint: a null OR non-finite end time yields no countdown (never "NaN:NaN").
    const displayedRemaining = (renderedEndAtMs == null || !Number.isFinite(renderedEndAtMs))
        ? null
        : Math.max(0, Math.ceil((renderedEndAtMs - now) / 1000));

    const autoFinalizing = isLiveAnimatedStatus(presentationState)
        && localProgress >= 0.995
        && !isDoneStatus(presentationState)
        && !isFailedStatus(presentationState)
        && !isCancelledStatus(presentationState);

    useEffect(() => {
        if (!memoryKey) return;
        if (isTerminalStatus(presentationState)) {
            // Bar has reached a terminal state; evict its own key to avoid unbounded growth
            progressMemory.delete(memoryKey);
            memoryFinalizedRef.current = true;
            return;
        }
        memoryFinalizedRef.current = false;
        const currentFloor = !effectiveAllowBackward ? Math.max(getRememberedProgress(memoryKey), displayProgress) : clamp01(displayProgress);
        progressMemorySet(memoryKey, currentFloor);
    }, [memoryKey, displayProgress, effectiveAllowBackward, presentationState]);

    // COR-F-5: the effect above only evicts this bar's progressMemory floor when it reaches a
    // TERMINAL status. A bar that unmounts while still active (e.g. its row/segment disappears
    // from a filtered list, or the surface it lives in is navigated away from) never runs that
    // path, so its floor entry is orphaned in the module-global `progressMemory` map forever —
    // and the 100-entry FIFO cap in `progressMemorySet` can then evict OTHER, still-live bars'
    // floors to make room for entries that will never be cleaned up. Delete this bar's own key
    // on unmount too, unless the terminal-status effect already finalized (and deleted) it.
    useEffect(() => {
        return () => {
            const key = memoryKeyRef.current;
            if (key && !memoryFinalizedRef.current) {
                progressMemory.delete(key);
            }
        };
        // Intentionally empty deps: this must run its cleanup ONLY on true unmount, reading the
        // latest memoryKey via ref rather than re-running (and re-deleting) on every key change.
    }, []);

    // Fire onDisplayProgress with localProgress — the exact value rendered as the bar width —
    // on every render where it changes. Throttled to 4 decimal places to prevent infinite loops.
    const lastReportedProgressRef = useRef<number | null>(null);
    useEffect(() => {
        if (!onDisplayProgress) return;
        const rounded = Math.round(localProgress * 10000) / 10000;
        if (lastReportedProgressRef.current !== rounded) {
            lastReportedProgressRef.current = rounded;
            onDisplayProgress(localProgress);
        }
    }, [localProgress, onDisplayProgress]);

    const visualState = autoFinalizing ? 'finalizing' : presentationState;
    const shouldAnimateWidth = !indeterminate && isActiveStatus(visualState);
    const indeterminateClassName = indeterminate
        ? (visualState === 'finalizing' ? 'progress-bar-finalizing' : preparingIndeterminate ? 'progress-bar-pending' : 'progress-bar-animated')
        : undefined;
    const busyStatusText = (indeterminate && busyLabel) ? busyLabel : getBusyStatusText(presentationState, indeterminate);
    const terminalStatusText = getTerminalStatusText(presentationState);
    const terminalFillStyle = getTerminalFillStyle(presentationState);

    // Deriving a stable phase key forces a remount on broad mode transitions (preparing -> active),
    // which prevents the browser from trying to animate widthRegressions from 100% back to 0.
    const stablePhaseKey = indeterminate
        ? (preparingIndeterminate ? 'preparing-indeterminate' : 'finalizing-indeterminate')
        : (isActiveStatus(visualState) || visualState === 'running' ? 'determinate-active' : 'terminal');

    useEffect(() => {
        if (!onDebugSnapshot) return;
        onDebugSnapshot(buildPredictiveProgressDebugSnapshot({
            memoryKey,
            resolvedCheckpointMode: checkpointMode ?? (effectiveAllowBackward ? 'default' : 'queue'),
            status,
            progress,
            startedAt,
            etaSeconds,
            predictive,
            tickLoopActive: isLiveAnimatedStatus(presentationState),
            preserveMountedProgress: true,
            preserveActiveVisualState: true,
            memoryFloor: getRememberedProgress(memoryKey),
            displayProgress,
            localProgress,
            currentLane,
            desiredLane: migration?.toLane ?? null,
            migrationProgress: migration ? clamp01((now - migration.startedAtMs) / migration.durationMs) : null,
            displayedRemaining,
            remainingTicks: renderedEndAtMs == null ? null : getRemainingTicks(now, renderedEndAtMs),
            launchEtaOnly: false,
            allowBackwardProgress: effectiveAllowBackward,
            lastDisplayWriteSource: lastDisplayWriteRef.current.source,
            lastDisplayWriteValue: lastDisplayWriteRef.current.value,
            transitionTickCount,
            backwardTransitionTickCount,
            activeTransitionTickCount: migration ? Math.round(migration.durationMs / tickMs) : null,
            isBackwardMigration: migration ? lastUpdateMetadataRef.current.isBackwardMigration : false,
            tickMs,
            migrationDurationMs: migration?.durationMs ?? null,
            migrationElapsedMs: migration ? Math.max(0, now - migration.startedAtMs) : null,
            migrationTicksTotal: migration ? Math.round(migration.durationMs / tickMs) : transitionTickCount,
            migrationTicksElapsed: migration ? Math.floor(Math.max(0, now - migration.startedAtMs) / tickMs) : null,
            incomingProgress: lastUpdateMetadataRef.current.incomingProgress,
            effectiveTargetProgress: lastUpdateMetadataRef.current.effectiveTargetProgress,
            currentVisualAtUpdate: lastUpdateMetadataRef.current.currentVisualAtUpdate,
            etaConfidenceW: etaConfidenceStateRef.current.w,
            etaConfidenceBase: etaConfidenceStateRef.current.base,
            etaConfidenceCv: etaConfidenceStateRef.current.cv,
            etaEndSmoothed: etaConfidenceStateRef.current.etaEndSmoothed,
            slopeCappedVsRaw: etaConfidenceStateRef.current.slopeCappedVsRaw,
        }));
    }, [
        onDebugSnapshot, memoryKey, status, progress, startedAt, etaSeconds, predictive,
        effectiveAllowBackward, tickState,
        presentationState, currentLane, migration, activeTargetLane, renderedEndAtMs, tickMs
    ]);

    // Apply bar-breathe on the fill when live-animated (5% opacity swell, 4s hold-and-ease).
    // StatusOrb ring keeps calm-pulse (30%); fills use this gentler class instead.
    const fillRunningClass = isLiveAnimatedStatus(presentationState) ? 'progress-bar-breathe' : undefined;

    if (barOnly) {
        return (
            <div style={{ height: '6px', background: 'var(--progress-track)', borderRadius: '3px', overflow: 'hidden' }} data-testid={dataTestId ?? "progress-bar-tiny"}>
                <div
                    key={stablePhaseKey}
                    className={[visualState === 'finalizing' ? 'progress-bar-finalizing' : indeterminateClassName, fillRunningClass].filter(Boolean).join(' ') || undefined}
                    style={{
                        height: '100%',
                        width: indeterminate ? '100%' : (isDoneStatus(visualState) && localProgress < 1.0) ? formatStylePercent(localProgress) : terminalStatusText ? (isDoneStatus(visualState) || isFailedStatus(visualState) ? '100%' : '0%') : formatStylePercent(localProgress),
                        background: visualState === 'finalizing' ? 'var(--progress-finalizing-fill)' : terminalFillStyle?.background ?? 'var(--accent)',
                        opacity: terminalStatusText && (isQueuedStatus(visualState) || isCancelledStatus(visualState)) ? 0.55 : 1,
                        boxShadow: terminalFillStyle?.boxShadow ?? (visualState === 'finalizing' ? '0 0 15px var(--progress-finalizing-glow)' : '0 0 15px var(--accent)'),
                        transition: (shouldAnimateWidth && !isTerminalStatus(visualState)) || (isDoneStatus(visualState) && localProgress < 1.0) ? 'width 0.25s linear' : 'none'
                    }}
                />
            </div>
        );
    }

    return (
        <div style={{ width: '100%' }} data-testid={dataTestId ?? "progress-bar"}>
            <ProgressStatusRow
                showLabel={showLabel}
                showPercent={showPercent}
                showEta={showEta}
                label={label}
                localProgress={localProgress}
                displayedRemaining={displayedRemaining}
                terminalStatusText={terminalStatusText}
                busyStatusText={busyStatusText}
            />
            <div style={{ height: '6px', background: 'var(--progress-track)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                    key={stablePhaseKey}
                    className={[visualState === 'finalizing' ? 'progress-bar-finalizing' : indeterminateClassName, fillRunningClass].filter(Boolean).join(' ') || undefined}
                    style={{
                        height: '100%',
                        width: indeterminate ? (preparingIndeterminate ? '100%' : visualState === 'finalizing' ? '100%' : '35%') : (isDoneStatus(visualState) && localProgress < 1.0) ? formatStylePercent(localProgress) : terminalStatusText ? (isDoneStatus(visualState) || isFailedStatus(visualState) ? '100%' : '0%') : formatStylePercent(localProgress),
                        background: visualState === 'finalizing' ? 'var(--progress-finalizing-fill)' : (indeterminate && preparingIndeterminate ? 'var(--progress-preparing-fill)' : terminalFillStyle?.background ?? 'var(--accent)'),
                        opacity: terminalStatusText && (isQueuedStatus(visualState) || isCancelledStatus(visualState)) ? 0.55 : 1,
                        boxShadow: visualState === 'finalizing' ? '0 0 15px var(--progress-finalizing-glow)' : (indeterminate && preparingIndeterminate ? '0 0 10px var(--progress-preparing-glow)' : terminalFillStyle?.boxShadow ?? '0 0 15px var(--accent)'),
                        transition: (shouldAnimateWidth && !isTerminalStatus(visualState)) || (isDoneStatus(visualState) && localProgress < 1.0) ? 'width 0.25s linear' : 'none'
                    }}
                />
            </div>
        </div>
    );
};
