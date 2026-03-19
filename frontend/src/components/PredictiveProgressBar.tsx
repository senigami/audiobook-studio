import React, { useState, useEffect } from 'react';

interface PredictiveProgressBarProps {
    progress: number;
    startedAt?: number;
    etaSeconds?: number;
    label?: string;
    showEta?: boolean;
    status?: string;
    predictive?: boolean;
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
    predictive = true
}) => {
    const [now, setNow] = useState(Date.now());
    const [displayedRemaining, setDisplayedRemaining] = useState<number | null>(null);

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const getProgressInfo = () => {
        if (status !== 'running' && status !== 'finalizing') {
            return { remaining: null, localProgress: 0 };
        }
        if (!predictive) {
            return { remaining: null, localProgress: Math.max(0, Math.min(1, progress)) };
        }
        if (!startedAt || !etaSeconds) {
            return { remaining: null, localProgress: progress };
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
            localProgress: currentProgress
        };
    };

    const { remaining: calculatedRemaining, localProgress } = getProgressInfo();

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
                        {Math.round(localProgress * 100)}%
                    </span>
                )}
            </div>
            <div style={{ height: '6px', background: 'rgba(0,0,0,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                    className="progress-bar-animated"
                    style={{
                        height: '100%',
                        width: `${localProgress * 100}%`,
                        background: 'var(--accent)',
                        transition: 'width 1s easeOut'
                    }}
                />
            </div>
        </div>
    );
};
