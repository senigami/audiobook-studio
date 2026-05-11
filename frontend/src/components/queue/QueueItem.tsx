import React from 'react';
import { Play, Pause, XCircle } from 'lucide-react';
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar';
import type { ProcessingQueueItem, Job } from '@/types';
import { formatQueueContext } from '@/utils/queueLabels';
import { shouldShowIndeterminateProgress } from '@/utils/jobSelection';

interface QueueItemProps {
    job: ProcessingQueueItem;
    liveJob?: Job;
    localPaused: boolean;
    formatJobTitle: (job: any) => string;
    formatTime: (ts: number | null | undefined) => string;
    onRemove: (id: string) => void;
    compact?: boolean;
    engines?: import('@/types').TtsEngine[];
}

export const QueueItem: React.FC<QueueItemProps> = ({
    job,
    liveJob,
    localPaused,
    formatJobTitle,
    formatTime,
    onRemove,
    compact = false,
    engines = []
}) => {
    const status = job.status;
    const isTrulyActive = ['preparing', 'running', 'processing', 'finalizing'].includes(status);
    const rawStarted = job.started_at ?? liveJob?.started_at;
    const rawEtaSeconds = job.eta_seconds ?? liveJob?.eta_seconds;
    const etaBasis = job.eta_basis ?? liveJob?.eta_basis ?? (rawEtaSeconds != null ? 'remaining_from_update' : undefined);
    const estimatedEndAt = job.estimated_end_at ?? liveJob?.estimated_end_at;
    const updatedAt = job.updated_at ?? liveJob?.updated_at;
    const rawUpdatedAt = job.updated_at ?? liveJob?.updated_at;
    const activeSegmentId = liveJob?.active_segment_id ?? job.active_segment_id;
    const activeSegmentProgress = typeof liveJob?.active_segment_progress === 'number'
        ? liveJob.active_segment_progress
        : (typeof job.active_segment_progress === 'number' ? job.active_segment_progress : undefined);
    const jobProgress = Math.max(job.progress ?? 0, liveJob?.progress ?? 0);
    const progress = !isTrulyActive
        ? 0
        : (typeof activeSegmentProgress === 'number'
            ? activeSegmentProgress
            : jobProgress);
    const engineType = (liveJob?.engine ?? job.engine) || '';
    const engineMeta = Array.isArray(engines) ? engines.find(e => e && e.engine_id === engineType) : undefined;
    const isCloudLike = engineMeta 
        ? (Array.isArray(engineMeta.capabilities) && engineMeta.capabilities.includes('simulated_finalizing')) || !!engineMeta.cloud
        : false;
    const showIndeterminateProgress = shouldShowIndeterminateProgress({
            engine: engineType,
            segment_ids: liveJob?.segment_ids ?? job.segment_ids,
            active_segment_id: liveJob?.active_segment_id,
            custom_title: liveJob?.custom_title ?? job.custom_title,
            engineMeta
        });
    // Render-group metadata can arrive before the backend flips a grouped chapter job from
    // preparing into running. Keep the queue row in the backend's explicit status so the UI
    // does not start the active animation early just because group bookkeeping showed up.
    const displayStatus = isCloudLike && status === 'finalizing' ? 'finalizing' : (showIndeterminateProgress ? 'preparing' : status);
    const [stableStarted, setStableStarted] = React.useState<number | null | undefined>(rawStarted);
    const [stableEta, setStableEta] = React.useState<number | null | undefined>(rawEtaSeconds);

    React.useEffect(() => {
        if (typeof rawStarted === 'number' && rawStarted > 0) {
            setStableStarted(rawStarted);
        } else if (!['running', 'processing', 'finalizing'].includes(displayStatus)) {
            setStableStarted(rawStarted);
        }
    }, [rawStarted, displayStatus]);

    React.useEffect(() => {
        if (typeof rawEtaSeconds === 'number' && rawEtaSeconds > 0) {
            setStableEta(rawEtaSeconds);
        } else if (!['running', 'processing', 'finalizing'].includes(displayStatus)) {
            setStableEta(rawEtaSeconds);
        }
    }, [rawEtaSeconds, displayStatus]);

    // Original start and ETA values (may be undefined for non-active statuses)
    const started = ['running', 'processing', 'finalizing'].includes(displayStatus)
        ? (stableStarted ?? rawStarted)
        : undefined;
    const etaSeconds = ['running', 'processing', 'finalizing'].includes(displayStatus)
        ? (stableEta ?? rawEtaSeconds)
        : undefined;

    // Derive missing ETA seconds or estimated end time when possible
    const derivedEtaSeconds = typeof etaSeconds === 'number'
        ? etaSeconds
        : (typeof estimatedEndAt === 'number' && typeof started === 'number')
            ? Math.max(0, estimatedEndAt - started)
            : undefined;
    const derivedEstimatedEndAt = typeof estimatedEndAt === 'number'
        ? estimatedEndAt
        : (typeof derivedEtaSeconds === 'number' && typeof started === 'number')
            ? started + derivedEtaSeconds
            : undefined;
    // Fallback for updatedAt if missing
    const derivedUpdatedAt = typeof updatedAt === 'number' ? updatedAt : rawUpdatedAt;

    return (
        <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--accent)',
            borderRadius: compact ? '12px' : '16px',
            padding: compact ? '0.75rem 1rem' : '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: compact ? '1rem' : '1.5rem',
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
                width: compact ? '36px' : '48px',
                height: compact ? '36px' : '48px',
                borderRadius: compact ? '8px' : '12px',
                background: 'var(--accent-tint)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
            }}>
                {localPaused ? (
                    <Pause size={compact ? 18 : 24} strokeWidth={2} color="var(--accent)" />
                ) : (
                    <Play size={compact ? 18 : 24} strokeWidth={2} color="var(--accent)" className="animate-pulse" />
                )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: compact ? '4px' : '12px' }}>
                    <div style={{ minWidth: 0 }}>
                        <h4 style={{ fontWeight: 700, fontSize: compact ? '0.95rem' : '1.1rem', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {formatJobTitle(job)}
                        </h4>
                        <div style={{ fontSize: compact ? '0.75rem' : '0.85rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={!job.project_name ? { color: 'var(--accent)', fontWeight: 700, fontSize: compact ? '0.65rem' : '0.75rem', textTransform: 'uppercase' } : undefined}>
                                {formatQueueContext(job, engines)}
                            </span>
                            {started && (
                                <>
                                    <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                                    <span style={{ fontSize: compact ? '0.7rem' : '0.8rem', color: 'var(--text-muted)' }}>Started {formatTime(started)}</span>
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
                    progress={progress}
                    startedAt={started}
                    etaSeconds={derivedEtaSeconds}
                    etaBasis={etaBasis}
                    estimatedEndAt={derivedEstimatedEndAt}
                    updatedAt={derivedUpdatedAt}
                    persistenceKey={activeSegmentId ? `${job.id}:${activeSegmentId}` : job.id}
                    status={displayStatus}
                    label={displayStatus === 'preparing' ? "Preparing..." : (displayStatus === 'finalizing' ? "Finalizing..." : "Processing...")}
                    predictive={true}
                    allowBackwardProgress={false}
                    checkpointMode={(job.segment_ids?.length || liveJob?.segment_ids?.length || activeSegmentId) ? 'segment' : 'default'}
                    evidenceWeightFraction={1}
                    transitionTickCount={3}
                    backwardTransitionTickCount={2}
                    tickMs={250}
                />
            </div>
        </div>
    );
};
