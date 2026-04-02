import React from 'react';
import { Play, Pause, XCircle } from 'lucide-react';
import { PredictiveProgressBar } from '../PredictiveProgressBar';
import type { ProcessingQueueItem, Job } from '../../types';
import { formatQueueContext } from '../../utils/queueLabels';
import { shouldShowIndeterminateProgress } from '../../utils/jobSelection';

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
    const rawStarted = liveJob?.started_at ?? job.started_at;
    const rawEtaSeconds = liveJob?.eta_seconds ?? job.eta_seconds;
    const status = liveJob?.status ?? job.status;
    const engine = (liveJob?.engine ?? job.engine) || '';
    const activeSegmentProgress = liveJob?.active_segment_progress;
    const jobProgress = liveJob?.progress ?? job.progress ?? 0;
    const renderGroupCount = liveJob?.render_group_count ?? 0;
    const completedRenderGroups = liveJob?.completed_render_groups ?? 0;
    const activeRenderGroupIndex = liveJob?.active_render_group_index ?? 0;
    const totalRenderWeight = liveJob?.total_render_weight ?? 0;
    const completedRenderWeight = liveJob?.completed_render_weight ?? 0;
    const activeRenderGroupWeight = liveJob?.active_render_group_weight ?? 0;
    const isGroupedChapterJob = renderGroupCount > 0 && !job.segment_ids?.length && !liveJob?.segment_ids?.length;
    const activeGroupProgress = activeRenderGroupIndex > completedRenderGroups
        ? Math.max(0, Math.min(activeSegmentProgress ?? 0, 1))
        : 0;
    const evidenceWeightFraction = totalRenderWeight > 0
        ? (activeRenderGroupWeight / totalRenderWeight)
        : 1;
    const weightedProgress = totalRenderWeight > 0
        ? (((completedRenderWeight + (activeRenderGroupWeight * activeGroupProgress)) / totalRenderWeight) * 0.9)
        : 0;
    const groupedProgress = isGroupedChapterJob
        ? Math.max(weightedProgress, (((completedRenderGroups + activeGroupProgress) / Math.max(1, renderGroupCount)) * 0.9))
        : 0;
    const useLiveSegmentProgress = ['voice_build', 'voice_test'].includes(engine)
        && status === 'running'
        && typeof activeSegmentProgress === 'number'
        && activeSegmentProgress > 0;
    const progress = useLiveSegmentProgress
        ? Math.max(jobProgress, activeSegmentProgress)
        : (isGroupedChapterJob ? Math.max(jobProgress, groupedProgress) : jobProgress);
    const engineType = (liveJob?.engine ?? job.engine) || '';
    const isCloudLike = ['voxtral', 'mixed'].includes(engineType);
    const showIndeterminateProgress = engineType === 'voxtral' && shouldShowIndeterminateProgress({
        engine: liveJob?.engine ?? job.engine,
        segment_ids: liveJob?.segment_ids ?? job.segment_ids,
        active_segment_id: liveJob?.active_segment_id,
        custom_title: liveJob?.custom_title ?? job.custom_title,
    });
    const hasActiveGroupSignal = isGroupedChapterJob && (completedRenderGroups > 0 || activeRenderGroupIndex > 0);
    const stableStatus = hasActiveGroupSignal && ['queued', 'preparing'].includes(status) ? 'running' : status;
    const displayStatus = isCloudLike && stableStatus === 'finalizing' ? 'finalizing' : stableStatus;
    const [stableStarted, setStableStarted] = React.useState<number | null | undefined>(rawStarted);
    const [stableEta, setStableEta] = React.useState<number | null | undefined>(rawEtaSeconds);

    React.useEffect(() => {
        if (typeof rawStarted === 'number' && rawStarted > 0) {
            setStableStarted(rawStarted);
        } else if (!['running', 'processing', 'finalizing'].includes(displayStatus) && !hasActiveGroupSignal) {
            setStableStarted(rawStarted);
        }
    }, [rawStarted, displayStatus, hasActiveGroupSignal]);

    React.useEffect(() => {
        if (typeof rawEtaSeconds === 'number' && rawEtaSeconds > 0) {
            setStableEta(rawEtaSeconds);
        } else if (!['running', 'processing', 'finalizing'].includes(displayStatus) && !hasActiveGroupSignal) {
            setStableEta(rawEtaSeconds);
        }
    }, [rawEtaSeconds, displayStatus, hasActiveGroupSignal]);

    const started = ['running', 'processing', 'finalizing'].includes(displayStatus) || hasActiveGroupSignal
        ? (stableStarted ?? rawStarted)
        : rawStarted;
    const etaSeconds = ['running', 'processing', 'finalizing'].includes(displayStatus) || hasActiveGroupSignal
        ? (stableEta ?? rawEtaSeconds)
        : rawEtaSeconds;

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
                            <span style={!job.project_name ? { color: 'var(--accent)', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' } : undefined}>
                                {formatQueueContext(job)}
                            </span>
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
                    progress={progress}
                    startedAt={started}
                    etaSeconds={etaSeconds}
                    persistenceKey={job.id}
                    status={displayStatus}
                    label={displayStatus === 'preparing' ? "Preparing..." : (displayStatus === 'finalizing' ? "Finalizing..." : "Processing...")}
                    predictive={true}
                    indeterminateRunning={showIndeterminateProgress}
                    authoritativeFloor={isGroupedChapterJob}
                    evidenceWeightFraction={isGroupedChapterJob ? evidenceWeightFraction : 1}
                />
            </div>
        </div>
    );
};
