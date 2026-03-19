import React from 'react';
import { Play, Pause, XCircle } from 'lucide-react';
import { PredictiveProgressBar } from '../PredictiveProgressBar';
import type { ProcessingQueueItem, Job } from '../../types';

interface QueueItemProps {
    job: ProcessingQueueItem;
    liveJob?: Job;
    localPaused: boolean;
    formatJobTitle: (job: any) => string;
    formatTime: (ts: number | null | undefined) => string;
    onRemove: (id: string) => void;
}

export const QueueItem: React.FC<QueueItemProps> = ({
    job,
    liveJob,
    localPaused,
    formatJobTitle,
    formatTime,
    onRemove
}) => {
    const started = liveJob?.started_at ?? job.started_at;
    const prog = job.engine === 'xtts'
        ? (liveJob?.active_segment_progress ?? 0)
        : (liveJob?.progress ?? job.progress ?? 0);

    return (
        <div style={{
            background: 'var(--surface)', 
            border: '1px solid var(--accent)',
            borderRadius: '16px', 
            padding: '1.5rem', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '1.5rem',
            boxShadow: 'var(--shadow-md)',
            position: 'relative',
            overflow: 'hidden'
        }}>
            <div style={{ 
                position: 'absolute', 
                left: 0, 
                top: 0, 
                bottom: 0, 
                width: '6px', 
                background: 'var(--accent)' 
            }} />
            
            <div style={{ 
                width: '48px', 
                height: '48px', 
                borderRadius: '12px', 
                background: 'var(--accent-tint)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                flexShrink: 0
            }}>
                {localPaused ? (
                    <Pause size={24} strokeWidth={2} color="var(--accent)" />
                ) : (
                    <Play size={24} strokeWidth={2} color="var(--accent)" className="animate-pulse" />
                )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div style={{ minWidth: 0 }}>
                        <h4 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {formatJobTitle(job)}
                        </h4>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {job.project_name ? (
                                <span>{job.project_name} • Part {job.split_part + 1}</span>
                            ) : (
                                <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>Internal Process</span>
                            )}
                            {started && (
                                <>
                                    <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Started {formatTime(started)}</span>
                                </>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                            onClick={(e) => { e.stopPropagation(); onRemove(job.id); }}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', borderRadius: '8px' }}
                            className="hover-bg-destructive"
                            title="Cancel Job"
                        >
                            <XCircle size={18} strokeWidth={2} />
                        </button>
                    </div>
                </div>
                <PredictiveProgressBar 
                    progress={prog}
                    startedAt={undefined}
                    etaSeconds={undefined}
                    status={job.status}
                    label={job.status === 'preparing' ? "Preparing..." : (job.status === 'finalizing' ? "Finalizing..." : "Processing...")}
                    predictive={false}
                />
            </div>
        </div>
    );
};
