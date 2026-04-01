import React, { useState, useEffect } from 'react';
import { logVoxtralDebug } from '../utils/debugVoxtral';

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

const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
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

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const getProgressInfo = () => {
        if (status === 'finalizing') {
            return { remaining: null, localProgress: 1, indeterminate: false };
        }
        if (status !== 'running' && status !== 'finalizing') {
            return { remaining: null, localProgress: 0, indeterminate: false };
        }
        if (!predictive) {
            return {
                remaining: null,
                localProgress: indeterminateRunning && status === 'running' ? 0 : Math.max(0, Math.min(1, progress)),
                indeterminate: indeterminateRunning && status === 'running',
            };
        }
        if (!startedAt || !etaSeconds) {
            return { remaining: null, localProgress: progress, indeterminate: false };
        }
        const elapsed = (now / 1000) - startedAt;
        const timeProgress = Math.min(0.99, Math.max(0, elapsed / etaSeconds));
        // If we disabled prediction via props (e.g. usePredictionLabels=false),
        // ETA seconds or startedAt would be undefined.
        // It should drop into the if block above.
        const currentProgress = Math.max(progress, timeProgress);
        
        // Use a 5% threshold before relying on actual job rate math to avoid noise/spikes
        const estimatedRemaining = Math.max(0, etaSeconds - elapsed);
        const actualRemaining = (currentProgress > 0.05) ? (elapsed / currentProgress) - elapsed : estimatedRemaining;
        
        // Blend between estimated (stable) and actual (real) over the first 30% of the job
        const blend = Math.min(1.0, currentProgress / 0.3);
        const refinedRemaining = (estimatedRemaining * (1 - blend)) + (actualRemaining * blend);

        return {
            remaining: Math.max(0, Math.floor(refinedRemaining)),
            localProgress: currentProgress,
            indeterminate: false
        };
    };

    const { remaining: calculatedRemaining, localProgress, indeterminate } = getProgressInfo();

    useEffect(() => {
        if (!indeterminateRunning && predictive) return;
        logVoxtralDebug('progress-bar', {
            label,
            status: status ?? null,
            predictive,
            indeterminateRunning,
            progress,
            startedAt: startedAt ?? null,
            etaSeconds: etaSeconds ?? null,
            localProgress,
            displayedRemaining,
            indeterminate,
        });
    }, [
        label,
        status,
        predictive,
        indeterminateRunning,
        progress,
        startedAt,
        etaSeconds,
        localProgress,
        displayedRemaining,
        indeterminate,
    ]);

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
