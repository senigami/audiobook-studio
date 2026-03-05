import React, { useEffect, useRef, useState } from 'react';
import { Terminal, X } from 'lucide-react';

interface PanelProps {
    title: string;
    logs?: string;
    subtitle?: string;
    filename: string | null;
    progress?: number;
    status?: string;
    startedAt?: number;
    etaSeconds?: number;
    onClose?: () => void;
}

export const Panel: React.FC<PanelProps> = ({ title, logs, subtitle, progress, status, startedAt, etaSeconds, onClose }) => {
    const [now, setNow] = useState(Date.now());
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    const getRemainingAndProgress = () => {
        if (status !== 'running' || !startedAt || !etaSeconds) {
            return { remaining: null, localProgress: progress || 0 };
        }
        const elapsed = (now / 1000) - startedAt;
        const timeProgress = Math.min(0.99, elapsed / etaSeconds);
        const currentProgress = Math.max(progress || 0, timeProgress);

        const blend = Math.min(1.0, currentProgress / 0.25);
        const estimatedRemaining = Math.max(0, etaSeconds - elapsed);
        const actualRemaining = (currentProgress > 0.01) ? (elapsed / currentProgress) - elapsed : estimatedRemaining;

        const refinedRemaining = (estimatedRemaining * (1 - blend)) + (actualRemaining * blend);

        return {
            remaining: Math.max(0, Math.floor(refinedRemaining)),
            localProgress: currentProgress
        };
    };

    const formatSeconds = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    const { remaining, localProgress } = getRemainingAndProgress();

    return (
        <div className="glass-panel" style={{
            height: '350px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 0,
            width: '100%',
            marginTop: 'auto',
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            borderBottom: 'none'
        }}>
            <div style={{
                padding: '0 1.5rem',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                height: '50px',
                background: 'rgba(255,255,255,0.01)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Terminal size={14} color="var(--accent)" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>System Console</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <h3 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h3>
                        {(subtitle || remaining !== null) && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                {remaining !== null ? `ETA: ${formatSeconds(remaining)}` : subtitle}
                            </span>
                        )}
                    </div>
                    {onClose && (
                        <button onClick={onClose} className="btn-ghost" style={{ padding: '4px' }}>
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            {(status === 'running' || status === 'preparing' || status === 'finalizing' || status === 'queued') && (
                <div style={{ height: '2px', background: 'rgba(0,0,0,0.05)', width: '100%', overflow: 'hidden' }}>
                    <div
                        className="progress-bar-animated"
                        style={{
                            height: '100%',
                            background: 'var(--accent)',
                            width: `${localProgress * 100}%`,
                            transition: 'width 1s linear'
                        }}
                    />
                </div>
            )}

            <div
                ref={scrollRef}
                style={{
                    flex: 1,
                    padding: '1.25rem',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.75rem',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    color: 'var(--text-secondary)',
                    background: 'var(--surface-alt)',
                    lineHeight: '1.5'
                }}
            >
                {logs || 'Waiting for activity...'}
            </div>
        </div>
    );
};
