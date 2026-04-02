import React, { useState, useEffect, useRef } from 'react';
import { advancePredictiveProgress, buildPredictiveProgressModel } from '../utils/predictiveProgress';
import { logProgress } from '../utils/progressDebug';

interface PredictiveProgressBarProps {
    progress: number;
    startedAt?: number;
    etaSeconds?: number;
    persistenceKey?: string;
    label?: string;
    showEta?: boolean;
    status?: string;
    predictive?: boolean;
    indeterminateRunning?: boolean;
    authoritativeFloor?: boolean;
}

const progressMemory = new Map<string, number>();
const endTimeMemory = new Map<string, number>();

const getProgressMemoryKey = (persistenceKey?: string, startedAt?: number) =>
    persistenceKey ? `${persistenceKey}:${startedAt ?? 0}` : undefined;

const isActiveStatus = (status?: string) => status === 'running' || status === 'processing' || status === 'finalizing';

const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const getMaxVisualStep = (dtSeconds: number) => Math.max(0.006, Math.min(0.012, dtSeconds * 0.012));
const ETA_END_TIME_NUDGE_MS = 150;
const ETA_SMOOTHING_MAX_SECONDS = 3;
const ETA_TICK_MS = 250;
const ETA_MAX_SMOOTHING_TICKS = Math.max(1, Math.round((ETA_SMOOTHING_MAX_SECONDS * 1000) / ETA_TICK_MS));
const hasRememberedActiveRun = (memoryKey?: string, startedAt?: number) =>
    !!(memoryKey && (
        progressMemory.has(memoryKey)
        || endTimeMemory.has(memoryKey)
        || (typeof startedAt === 'number' && startedAt > 0)
    ));

const getInitialDisplayProgress = (
    progress: number,
    startedAt?: number,
    etaSeconds?: number,
    persistenceKey?: string,
    predictive?: boolean,
    status?: string,
    indeterminateRunning?: boolean,
) => {
    if (status === 'finalizing') return 1;
    if (!isActiveStatus(status)) return 0;
    if (indeterminateRunning) return 0;
    // Contract for queue/project progress:
    // 1. Always start from the authoritative backend progress that already reflects
    //    completed chapter work, including partial renders and resumed jobs.
    // 2. Never jump forward on mount just because startedAt/eta imply more elapsed time.
    // 3. After mount, animate locally from the current displayed position using ETA as a
    //    pacing hint. Real backend updates should recalculate the remaining time model, not
    //    teleport the bar to a new percentage.
    // 4. While a job is active, the displayed bar should be monotonic: corrections change
    //    future pace, but they should not visually move the bar backward.
    // 5. Segment-scoped bars follow the same smoothing rule, but their source progress is
    //    segment progress rather than chapter/job progress.
    const baseProgress = clamp01(progress);
    const remembered = progressMemory.get(getProgressMemoryKey(persistenceKey, startedAt) || '');
    if (!predictive || !startedAt || !etaSeconds) return Math.max(baseProgress, remembered ?? 0);
    return Math.max(baseProgress, remembered ?? 0);
};

export const PredictiveProgressBar: React.FC<PredictiveProgressBarProps> = ({
    progress,
    startedAt,
    etaSeconds,
    persistenceKey,
    label = "Progress",
    showEta = true,
    status,
    predictive = true,
    indeterminateRunning = false,
    authoritativeFloor = false
}) => {
    const memoryKey = getProgressMemoryKey(persistenceKey, startedAt);
    const preserveActiveVisualState = hasRememberedActiveRun(memoryKey, startedAt);
    const [now, setNow] = useState(Date.now());
    const [currentEndTime, setCurrentEndTime] = useState<number | null>(null);
    const [displayProgress, setDisplayProgress] = useState(() => getInitialDisplayProgress(progress, startedAt, etaSeconds, persistenceKey, predictive, status, indeterminateRunning));
    const [lastVisualProgress, setLastVisualProgress] = useState(() => getInitialDisplayProgress(progress, startedAt, etaSeconds, persistenceKey, predictive, status, indeterminateRunning));
    const lastTickRef = useRef(Date.now());
    const displayProgressRef = useRef(getInitialDisplayProgress(progress, startedAt, etaSeconds, persistenceKey, predictive, status, indeterminateRunning));
    const displayedRemainingRef = useRef<number | null>(null);
    const currentEndTimeRef = useRef<number | null>(null);
    const targetEndTimeRef = useRef<number | null>(null);
    const lastRunAnchorRef = useRef<string | null>(null);
    const pendingRunAnchorRef = useRef<string | null>(null);

    useEffect(() => {
        if (!memoryKey) return;
        progressMemory.set(memoryKey, Math.max(progressMemory.get(memoryKey) ?? 0, displayProgress));
    }, [memoryKey, displayProgress]);

    useEffect(() => {
        if (!memoryKey || currentEndTime === null) return;
        endTimeMemory.set(memoryKey, currentEndTime);
    }, [memoryKey, currentEndTime]);

    useEffect(() => {
        displayProgressRef.current = displayProgress;
    }, [displayProgress]);

    useEffect(() => {
        const runAnchor = `${persistenceKey ?? 'none'}:${startedAt ?? 0}`;
        if (lastRunAnchorRef.current === runAnchor) {
            return;
        }
        lastRunAnchorRef.current = runAnchor;
        pendingRunAnchorRef.current = runAnchor;
        lastTickRef.current = Date.now();
        const initialEndTime = etaSeconds
            ? (startedAt ? (startedAt * 1000) + (etaSeconds * 1000) : Date.now() + (etaSeconds * 1000))
            : null;
        const rememberedEndTime = memoryKey ? endTimeMemory.get(memoryKey) ?? null : null;
        const seededEndTime = rememberedEndTime ?? initialEndTime;
        currentEndTimeRef.current = seededEndTime;
        targetEndTimeRef.current = initialEndTime;
        setCurrentEndTime(seededEndTime);
        logProgress('bar:init', {
            label,
            persistenceKey,
            runAnchor,
            status,
            progress,
            startedAt,
            etaSeconds,
            predictive,
            indeterminateRunning,
            memoryKey,
            rememberedEndTime,
            initialEndTime,
            seededEndTime,
        });
        setDisplayProgress(getInitialDisplayProgress(
            progress,
            startedAt,
            etaSeconds,
            persistenceKey,
            predictive,
            status,
            indeterminateRunning,
        ));
    }, [progress, startedAt, etaSeconds, persistenceKey, predictive, status, indeterminateRunning]);

    useEffect(() => {
        lastTickRef.current = Date.now();
        const interval = setInterval(() => {
            setNow(Date.now());
        }, 250);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (status === 'finalizing') {
            setDisplayProgress(1);
            return;
        }
        if (!isActiveStatus(status) && !preserveActiveVisualState) {
            setDisplayProgress(0);
            return;
        }
        if (indeterminateRunning) {
            setDisplayProgress(0);
            return;
        }
        const memoryFloor = memoryKey ? (progressMemory.get(memoryKey) ?? 0) : 0;
        if (!predictive || !startedAt || !etaSeconds) {
            setDisplayProgress(prev => {
                const target = clamp01(progress);
                const gap = target - prev;
                if (Math.abs(gap) <= 0.002) return target;
                return Math.max(memoryFloor, clamp01(prev + (gap * 0.35)));
            });
            return;
        }
        if (authoritativeFloor) {
            setDisplayProgress(prev => Math.max(prev, memoryFloor, clamp01(progress)));
        }
    }, [progress, startedAt, etaSeconds, predictive, status, indeterminateRunning, authoritativeFloor, preserveActiveVisualState]);

    useEffect(() => {
        const tickNow = now;
        const dt = Math.max(0.05, (tickNow - lastTickRef.current) / 1000);
        lastTickRef.current = tickNow;

        if (status === 'finalizing') {
            setDisplayProgress(1);
            return;
        }
        if (!isActiveStatus(status) && !preserveActiveVisualState) {
            return;
        }
        if (indeterminateRunning) {
            setDisplayProgress(0);
            return;
        }
        if (!predictive) {
            setDisplayProgress(prev => {
                const target = indeterminateRunning ? 0 : clamp01(progress);
                const gap = target - prev;
                if (Math.abs(gap) <= 0.002) return target;
                const correctionWindow = gap > 0 ? 0.45 : 0.7;
                const correctionFraction = Math.min(1, dt / correctionWindow);
                return clamp01(prev + (gap * correctionFraction));
            });
            return;
        }
        if (!startedAt || !etaSeconds) {
            setDisplayProgress(clamp01(progress));
            return;
        }

        const runAnchor = `${persistenceKey ?? 'none'}:${startedAt ?? 0}`;
        const memoryFloor = memoryKey ? (progressMemory.get(memoryKey) ?? 0) : 0;
        if (pendingRunAnchorRef.current === runAnchor) {
            pendingRunAnchorRef.current = null;
            setDisplayProgress(prev => Math.max(prev, memoryFloor, getInitialDisplayProgress(
                progress,
                startedAt,
                etaSeconds,
                persistenceKey,
                predictive,
                status,
                indeterminateRunning,
            )));
            return;
        }

        setDisplayProgress(prev => {
            if (authoritativeFloor) {
                const base = Math.max(prev, memoryFloor, clamp01(progress));
                const elapsed = Math.max(0, (tickNow / 1000) - startedAt);
                const next = advancePredictiveProgress({
                    authoritativeProgress: progress,
                    displayedProgress: base,
                    elapsedSeconds: elapsed,
                    etaSeconds,
                    deltaSeconds: dt,
                });
                return Math.max(base, next.nextProgress);
            }
            const elapsed = Math.max(0, (tickNow / 1000) - startedAt);
            const next = advancePredictiveProgress({
                authoritativeProgress: progress,
                displayedProgress: prev,
                elapsedSeconds: elapsed,
                etaSeconds,
                deltaSeconds: dt,
            })
            const cappedNext = Math.min(next.nextProgress, prev + getMaxVisualStep(dt))
            return Math.max(prev, memoryFloor, cappedNext)
        });

    }, [now, progress, startedAt, etaSeconds, predictive, indeterminateRunning, status, authoritativeFloor, preserveActiveVisualState]);

    const getProgressInfo = () => {
        const memoryFloor = memoryKey ? (progressMemory.get(memoryKey) ?? 0) : 0;
        if (status === 'finalizing') {
            return { remaining: null, localProgress: 1, indeterminate: false };
        }
        if (!isActiveStatus(status) && !preserveActiveVisualState) {
            return { remaining: null, localProgress: 0, indeterminate: false };
        }
        if (indeterminateRunning) {
            return { remaining: null, localProgress: 0, indeterminate: true };
        }
        if (!predictive) {
            return {
                remaining: null,
                localProgress: Math.max(memoryFloor, clamp01(displayProgress)),
                indeterminate: false,
            };
        }
        if (!startedAt || !etaSeconds) {
            return { remaining: null, localProgress: Math.max(memoryFloor, displayProgress), indeterminate: false };
        }

        const visibleProgress = Math.max(memoryFloor, clamp01(displayProgress));
        const elapsed = Math.max(0, (now / 1000) - startedAt);
        const model = buildPredictiveProgressModel({
            authoritativeProgress: progress,
            displayedProgress: visibleProgress,
            elapsedSeconds: elapsed,
            etaSeconds,
        });

        return {
            remaining: Math.max(0, Math.floor(model.refinedRemainingSeconds)),
            localProgress: visibleProgress,
            indeterminate: false
        };
    };

    const { localProgress, indeterminate } = getProgressInfo();
    const visualDelta = Math.abs(localProgress - lastVisualProgress);
    const shouldAnimateWidth = !indeterminate && visualDelta <= 0.03;

    useEffect(() => {
        setLastVisualProgress(localProgress);
    }, [localProgress]);

    useEffect(() => {
        if (!predictive || ((!isActiveStatus(status) && !preserveActiveVisualState)) || indeterminateRunning) {
            currentEndTimeRef.current = null;
            targetEndTimeRef.current = null;
            setCurrentEndTime(null);
            logProgress('bar:clear', {
                label,
                persistenceKey,
                memoryKey,
                status,
                predictive,
                indeterminateRunning,
                preserveActiveVisualState,
            });
            return;
        }
        if (!startedAt || !etaSeconds) {
            return;
        }
        const elapsed = Math.max(0, (Date.now() / 1000) - startedAt);
        const rememberedProgress = memoryKey ? (progressMemory.get(memoryKey) ?? 0) : 0;
        const effectiveDisplayedProgress = Math.max(displayProgressRef.current, rememberedProgress);
        const model = buildPredictiveProgressModel({
            authoritativeProgress: progress,
            displayedProgress: effectiveDisplayedProgress,
            elapsedSeconds: elapsed,
            etaSeconds,
        });
        const nextTargetEndTime = Date.now() + (model.refinedRemainingSeconds * 1000);
        const rememberedEndTime = memoryKey ? (endTimeMemory.get(memoryKey) ?? null) : null;
        const previousTargetEndTime = targetEndTimeRef.current ?? rememberedEndTime;
        targetEndTimeRef.current = nextTargetEndTime;
        logProgress('bar:target', {
            label,
            persistenceKey,
            memoryKey,
            progress,
            displayedProgress: displayProgressRef.current,
            effectiveDisplayedProgress,
            startedAt,
            etaSeconds,
            refinedRemainingSeconds: model.refinedRemainingSeconds,
            actualRemainingSeconds: model.actualRemainingSeconds,
            estimatedRemainingSeconds: model.estimatedRemainingSeconds,
            previousTargetEndTime,
            nextTargetEndTime,
        });
        if (currentEndTimeRef.current === null) {
            const seededEndTime = rememberedEndTime ?? nextTargetEndTime;
            currentEndTimeRef.current = seededEndTime;
            setCurrentEndTime(seededEndTime);
            logProgress('bar:seed-current-end', {
                label,
                persistenceKey,
                memoryKey,
                rememberedEndTime,
                seededEndTime,
                nextTargetEndTime,
            });
        }
    }, [progress, startedAt, etaSeconds, predictive, status, indeterminateRunning, memoryKey, preserveActiveVisualState]);

    useEffect(() => {
        if (!predictive || ((!isActiveStatus(status) && !preserveActiveVisualState)) || indeterminateRunning) {
            setCurrentEndTime(null);
            return;
        }
        if (!startedAt || !etaSeconds) {
            return;
        }
        const targetEndTime = targetEndTimeRef.current;
        const currentEndTime = currentEndTimeRef.current;

        if (targetEndTime === null) {
            setCurrentEndTime(null);
            return;
        }

        if (currentEndTime === null) {
            currentEndTimeRef.current = targetEndTime;
            setCurrentEndTime(targetEndTime);
            return;
        }

        const deltaMs = targetEndTime - currentEndTime;
        const minimumCatchupMs = Math.ceil(Math.abs(deltaMs) / ETA_MAX_SMOOTHING_TICKS);
        const maxPerTickMs = Math.max(ETA_END_TIME_NUDGE_MS, minimumCatchupMs);
        const nudgeMs = deltaMs > 0
            ? Math.min(deltaMs, maxPerTickMs)
            : Math.max(deltaMs, -maxPerTickMs);
        const nextEndTime = currentEndTime + nudgeMs;

        currentEndTimeRef.current = nextEndTime;
        setCurrentEndTime(nextEndTime);
    }, [now, predictive, startedAt, etaSeconds, status, indeterminateRunning, preserveActiveVisualState]);

    const displayedRemaining = currentEndTime === null
        ? null
        : Math.max(0, Math.ceil((currentEndTime - now) / 1000));

    useEffect(() => {
        const previous = displayedRemainingRef.current;
        if (displayedRemaining !== previous) {
            if (
                previous !== null
                && displayedRemaining !== null
                && Math.abs(displayedRemaining - previous) >= 2
            ) {
                logProgress('bar:eta-jump', {
                    label,
                    persistenceKey,
                    memoryKey,
                    previousDisplayedRemaining: previous,
                    displayedRemaining,
                    currentEndTime,
                    targetEndTime: targetEndTimeRef.current,
                    startedAt,
                    etaSeconds,
                    progress,
                    displayProgress,
                });
            }
            displayedRemainingRef.current = displayedRemaining;
        }
    }, [displayedRemaining, currentEndTime, label, persistenceKey, memoryKey, startedAt, etaSeconds, progress, displayProgress]);

    return (
        <div style={{ width: '100%' }} data-testid="progress-bar">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
                {showEta && displayedRemaining !== null ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            {Math.round(localProgress * 100)}%
                        </span>
                        <span style={{
                            fontSize: '0.65rem',
                            color: 'var(--accent)',
                            fontWeight: 700,
                            fontVariantNumeric: 'tabular-nums'
                        }}>
                            ETA: {formatTime(displayedRemaining)}
                        </span>
                    </div>
                ) : (
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)' }}>
                        {indeterminate ? 'Working...' : `${Math.round(localProgress * 100)}%`}
                    </span>
                )}
            </div>
            <div style={{ height: '6px', background: 'rgba(0,0,0,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                    className={indeterminate ? 'progress-bar-animated' : undefined}
                    style={{
                        height: '100%',
                        width: indeterminate ? '35%' : `${localProgress * 100}%`,
                        background: 'var(--accent)',
                        // This bar updates on a ~250ms loop, so any width transition
                        // needs to stay at or below that cadence or the browser will
                        // visually fight the JS-driven progress engine.
                        transition: shouldAnimateWidth ? 'width 0.18s linear' : 'none'
                    }}
                />
            </div>
        </div>
    );
};
