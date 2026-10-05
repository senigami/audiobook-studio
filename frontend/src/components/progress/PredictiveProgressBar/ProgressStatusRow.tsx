import React from 'react';
import { formatTime } from '@/components/progress/PredictiveProgressBar/predictiveProgressBarHelpers';

export interface ProgressStatusRowProps {
    showLabel: boolean;
    showPercent: boolean;
    showEta: boolean;
    label: string;
    localProgress: number;
    displayedRemaining: number | null;
    terminalStatusText: string | null;
    busyStatusText: string | null;
}

/**
 * The label + percent/ETA/status-text row rendered above the fill track.
 * Pure presentational split from PredictiveProgressBar — preserves the exact
 * markup/styles/conditions of the original inline JSX.
 */
export const ProgressStatusRow: React.FC<ProgressStatusRowProps> = ({
    showLabel,
    showPercent,
    showEta,
    label,
    localProgress,
    displayedRemaining,
    terminalStatusText,
    busyStatusText,
}) => {
    if (!(showLabel || showPercent || showEta)) return null;

    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                {showLabel && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>}
            </div>
            <div>
                {showEta && displayedRemaining !== null && !terminalStatusText && (!busyStatusText || displayedRemaining > 0) ? (
                    // Parallel-render model (§2.6 / I10 v1.8.0 amended): a real positive
                    // ETA renders its countdown in EVERY non-terminal state, including
                    // running+indeterminate (the model-load window).  The busy label
                    // ("Preparing…" / "Loading voice model…") only shows when there is
                    // no positive ETA (displayedRemaining null or ≤ 0).
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {showPercent && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{Math.round(localProgress * 100)}%</span>}
                        <span style={{ fontSize: '0.65rem', color: 'var(--action-primary)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                            ETA: {formatTime(displayedRemaining)}
                        </span>
                    </div>
                ) : (
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--action-primary)' }}>
                        {terminalStatusText ?? busyStatusText ?? (showPercent ? `${Math.round(localProgress * 100)}%` : '')}
                    </span>
                )}
            </div>
        </div>
    );
};
