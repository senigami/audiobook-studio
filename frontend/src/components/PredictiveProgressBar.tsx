import React, { useState, useEffect, useRef } from 'react';

interface PredictiveProgressBarProps {
    progress: number;
    startedAt?: number;
    etaSeconds?: number;
    label?: string;
    showEta?: boolean;
    status?: string;
    predictive?: boolean;
    indeterminateRunning?: boolean;
}

const isActiveStatus = (status?: string) => status === 'running' || status === 'processing' || status === 'finalizing';

const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const getInitialDisplayProgress = (
    progress: number,
    startedAt?: number,
    etaSeconds?: number,
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
    //    pacing hint, and ease toward later real backend corrections when they arrive.
    // 4. While a job is active, the displayed bar should be monotonic: corrections change
    //    future pace, but they should not visually move the bar backward.
    // 4. Segment-scoped bars follow the same smoothing rule, but their source progress is
    //    segment progress rather than chapter/job progress.
    if (!predictive || !startedAt || !etaSeconds) return clamp01(progress);
    return clamp01(progress);
};

export const PredictiveProgressBar: React.FC<PredictiveProgressBarProps> = ({
    progress,
    startedAt,
    etaSeconds,
    label = "Progress",
    showEta = true,
    status,
    predictive = true,
    indeterminateRunning = false
}) => {
    const [now, setNow] = useState(Date.now());
    const [displayedRemaining, setDisplayedRemaining] = useState<number | null>(null);
    const [displayProgress, setDisplayProgress] = useState(() => getInitialDisplayProgress(progress, startedAt, etaSeconds, predictive, status, indeterminateRunning));
    const lastTickRef = useRef(Date.now());

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
        if (!isActiveStatus(status)) {
            setDisplayProgress(0);
            return;
        }
        if (indeterminateRunning) {
            setDisplayProgress(0);
            return;
        }
        if (!predictive || !startedAt || !etaSeconds) {
            setDisplayProgress(prev => {
                const target = clamp01(progress);
                const gap = target - prev;
                if (Math.abs(gap) <= 0.002) return target;
                return clamp01(prev + (gap * 0.35));
            });
        }
    }, [progress, startedAt, etaSeconds, predictive, status, indeterminateRunning]);

    useEffect(() => {
        const tickNow = now;
        const dt = Math.max(0.05, (tickNow - lastTickRef.current) / 1000);
        lastTickRef.current = tickNow;

        if (status === 'finalizing') {
            setDisplayProgress(1);
            return;
        }
        if (!isActiveStatus(status)) {
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

        const authoritativeProgress = clamp01(progress);
        const elapsed = Math.max(0, (tickNow / 1000) - startedAt);
        const estimatedRemaining = Math.max(1, etaSeconds - elapsed);
        const actualRemaining = authoritativeProgress > 0.05
            ? Math.max(1, (elapsed / authoritativeProgress) - elapsed)
            : estimatedRemaining;
        const blend = Math.min(1.0, authoritativeProgress / 0.3);
        const refinedRemaining = Math.max(1, (estimatedRemaining * (1 - blend)) + (actualRemaining * blend));

        setDisplayProgress(prev => {
            const targetProgress = Math.max(prev, authoritativeProgress);
            const gap = targetProgress - prev;
            let next = prev;

            if (gap > 0.003) {
                const correctionWindow = 0.6;
                const correctionFraction = Math.min(1, dt / correctionWindow);
                next = prev + (gap * correctionFraction);
            } else {
                const velocity = (1 - targetProgress) / refinedRemaining;
                next = prev + (velocity * dt);
            }

            return clamp01(Math.max(prev, Math.min(next, 0.995)));
        });
    }, [now, progress, startedAt, etaSeconds, predictive, indeterminateRunning, status]);

    const getProgressInfo = () => {
        if (status === 'finalizing') {
            return { remaining: null, localProgress: 1, indeterminate: false };
        }
        if (!isActiveStatus(status)) {
            return { remaining: null, localProgress: 0, indeterminate: false };
        }
        if (indeterminateRunning) {
            return { remaining: null, localProgress: 0, indeterminate: true };
        }
        if (!predictive) {
            return {
                remaining: null,
                localProgress: clamp01(displayProgress),
                indeterminate: false,
            };
        }
        if (!startedAt || !etaSeconds) {
            return { remaining: null, localProgress: displayProgress, indeterminate: false };
        }

        const elapsed = Math.max(0, (now / 1000) - startedAt);
        const visibleProgress = clamp01(displayProgress);
        const estimatedRemaining = Math.max(1, etaSeconds - elapsed);
        const actualRemaining = visibleProgress > 0.05
            ? Math.max(1, (elapsed / visibleProgress) - elapsed)
            : estimatedRemaining;
        const blend = Math.min(1.0, visibleProgress / 0.3);
        const refinedRemaining = (estimatedRemaining * (1 - blend)) + (actualRemaining * blend);

        return {
            remaining: Math.max(0, Math.floor(refinedRemaining)),
            localProgress: visibleProgress,
            indeterminate: false
        };
    };

    const { remaining: calculatedRemaining, localProgress, indeterminate } = getProgressInfo();

    useEffect(() => {
        if (calculatedRemaining === null) {
            setDisplayedRemaining(null);
        } else {
            if (displayedRemaining === null || Math.abs(displayedRemaining - calculatedRemaining) > 5) {
                setDisplayedRemaining(calculatedRemaining);
            } else if (displayedRemaining > 0) {
                setDisplayedRemaining(displayedRemaining - 1);
            }
        }
    }, [now, calculatedRemaining]);

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
                        transition: indeterminate ? 'none' : 'width 1s ease-out'
                    }}
                />
            </div>
        </div>
    );
};
