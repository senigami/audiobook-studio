import React from 'react';
import { Play, Pause, XCircle, Terminal } from 'lucide-react';
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar';
import type { ProcessingQueueItem, Job } from '@/types';
import { formatQueueContext } from '@/utils/queueLabels';
import { shouldShowIndeterminateProgress, isSegmentScopedJob } from '@/utils/jobSelection';
import { recordStudioDebugSnapshot } from '@/utils/runtimeDebug';
import { getLiveEventAuditSnapshot } from '@/store/liveEventAuditStore';

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
    const latestSnapshotRef = React.useRef<any>(null);
    const handleDebugSnapshot = React.useCallback((snapshot: any) => {
        latestSnapshotRef.current = snapshot;
    }, []);
    const status = job.status;
    const isTrulyActive = ['preparing', 'running', 'processing', 'finalizing'].includes(status);
    const rawStarted = job.started_at ?? liveJob?.started_at;
    const preferLiveEta = (isTrulyActive && typeof liveJob?.eta_seconds === 'number' && liveJob.eta_seconds > 0);
    const selectEtaSource = (): 'liveJob' | 'job' | 'fallback' => {
        if (isTrulyActive && typeof liveJob?.eta_seconds === 'number' && liveJob.eta_seconds > 0) {
            return 'liveJob';
        }
        if (job.eta_seconds !== undefined && job.eta_seconds !== null) {
            return 'job';
        }
        if (typeof liveJob?.eta_seconds === 'number' && liveJob.eta_seconds > 0) {
            return 'liveJob';
        }
        return 'fallback';
    };
    const etaSource = selectEtaSource();

    const rawEtaSeconds = etaSource === 'liveJob'
        ? liveJob?.eta_seconds
        : (etaSource === 'job' ? job.eta_seconds : (job.eta_seconds ?? liveJob?.eta_seconds));

    const etaBasis = etaSource === 'liveJob'
        ? (liveJob?.eta_basis ?? 'remaining_from_update')
        : (etaSource === 'job'
            ? (job.eta_basis ?? 'remaining_from_update')
            : (job.eta_basis ?? liveJob?.eta_basis ?? (rawEtaSeconds != null ? 'remaining_from_update' : undefined)));

    const estimatedEndAt = isTrulyActive && typeof rawEtaSeconds === 'number' && rawEtaSeconds > 0
        ? undefined
        : (job.estimated_end_at ?? liveJob?.estimated_end_at);
    const selectEtaSourceTimestamp = (): number | null | undefined => {
        if (etaSource === 'liveJob') {
            return liveJob?.updated_at ?? job.updated_at;
        }
        if (etaSource === 'job') {
            return job.updated_at ?? liveJob?.updated_at;
        }
        return job.updated_at ?? liveJob?.updated_at;
    };
    const updatedAt = selectEtaSourceTimestamp();
    const rawUpdatedAt = job.updated_at ?? liveJob?.updated_at;
    const isSegmentJob = isSegmentScopedJob(job) || (liveJob ? isSegmentScopedJob(liveJob) : false);
    const activeSegmentId = isSegmentJob ? (liveJob?.active_segment_id ?? job.active_segment_id) : undefined;
    const isGroupedJob = (job.render_group_count ?? 0) > 0 || (liveJob?.render_group_count ?? 0) > 0;
    const isRunningOrProcessing = ['running', 'processing', 'finalizing'].includes(status) || (status === 'preparing' && isGroupedJob);
    const activeSegmentProgress = isSegmentJob && isRunningOrProcessing
        ? (typeof liveJob?.active_segment_progress === 'number'
            ? liveJob.active_segment_progress
            : (typeof job.active_segment_progress === 'number' ? job.active_segment_progress : undefined))
        : (isSegmentJob ? (job.active_segment_progress ?? undefined) : undefined);
    const jobProgress = isRunningOrProcessing
        ? Math.max(job.progress ?? 0, liveJob?.progress ?? 0)
        : (job.progress ?? 0);
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
    const [stableUpdatedAt, setStableUpdatedAt] = React.useState<number | null | undefined>(updatedAt);
    const [stableEtaBasis, setStableEtaBasis] = React.useState<'remaining_from_update' | 'total_from_start' | null | undefined>(etaBasis);

    React.useEffect(() => {
        if (typeof rawStarted === 'number' && rawStarted > 0) {
            setStableStarted(rawStarted);
        } else if (!['running', 'processing', 'finalizing'].includes(displayStatus)) {
            setStableStarted(rawStarted);
        }
    }, [rawStarted, displayStatus]);

    React.useEffect(() => {
        if (etaSource === 'liveJob') {
            if (typeof liveJob?.eta_seconds === 'number' && liveJob.eta_seconds > 0) {
                setStableEta(liveJob.eta_seconds);
                const nextUpdated = liveJob.updated_at ?? job.updated_at;
                setStableUpdatedAt(prev => {
                    if (typeof nextUpdated === 'number' && (typeof prev !== 'number' || nextUpdated > prev)) {
                        return nextUpdated;
                    }
                    return prev;
                });
                setStableEtaBasis(liveJob.eta_basis ?? 'remaining_from_update');
            }
        } else if (etaSource === 'job') {
            if (typeof job.eta_seconds === 'number' && job.eta_seconds > 0) {
                setStableEta(job.eta_seconds);
                const nextUpdated = job.updated_at;
                setStableUpdatedAt(prev => {
                    if (typeof nextUpdated === 'number' && (typeof prev !== 'number' || nextUpdated > prev)) {
                        return nextUpdated;
                    }
                    return prev;
                });
                setStableEtaBasis(job.eta_basis ?? 'remaining_from_update');
            }
        }

        if (!['running', 'processing', 'finalizing'].includes(displayStatus)) {
            setStableEta(rawEtaSeconds);
            setStableUpdatedAt(updatedAt);
            setStableEtaBasis(etaBasis);
        }
    }, [rawEtaSeconds, displayStatus, updatedAt, etaBasis, liveJob, job.eta_seconds, job.updated_at, job.eta_basis, etaSource]);

    // Original start and ETA values (may be undefined for non-active statuses)
    const started = ['running', 'processing', 'finalizing'].includes(displayStatus)
        ? (stableStarted ?? rawStarted)
        : undefined;
    const etaSeconds = ['running', 'processing', 'finalizing'].includes(displayStatus)
        ? (stableEta ?? rawEtaSeconds)
        : undefined;
    const activeUpdatedAt = ['running', 'processing', 'finalizing'].includes(displayStatus)
        ? (stableUpdatedAt ?? updatedAt)
        : updatedAt;
    const derivedEtaBasis = ['running', 'processing', 'finalizing'].includes(displayStatus)
        ? (stableEtaBasis ?? etaBasis)
        : undefined;

    // Derive missing ETA seconds or estimated end time when possible
    const derivedEtaSeconds = typeof etaSeconds === 'number' && etaSeconds > 0
        ? etaSeconds
        : (typeof estimatedEndAt === 'number' && typeof started === 'number' && estimatedEndAt > started)
            ? estimatedEndAt - started
            : undefined;
    const derivedUpdatedAt = typeof activeUpdatedAt === 'number' ? activeUpdatedAt : rawUpdatedAt;
    const derivedEstimatedEndAt = typeof estimatedEndAt === 'number' && (typeof started !== 'number' || estimatedEndAt > started)
        ? estimatedEndAt
        : (typeof derivedEtaSeconds === 'number' && typeof started === 'number')
            ? ((derivedEtaBasis ?? etaBasis) === 'remaining_from_update' && typeof derivedUpdatedAt === 'number' ? derivedUpdatedAt + derivedEtaSeconds : started + derivedEtaSeconds)
            : undefined;

    const lastActiveDiagnosticsRef = React.useRef<any>(null);

    const etaSourcePath = etaSource === 'liveJob'
        ? 'live_overlay'
        : (etaSource === 'job' ? 'persisted_snapshot' : 'default_fallback');

    const etaSourceReason = etaSource === 'liveJob'
        ? (preferLiveEta ? 'positive_live_job_eta' : 'live_job_eta_fallback')
        : (etaSource === 'job' ? 'job_eta' : 'default_fallback');

    const isActive = ['running', 'processing', 'finalizing'].includes(displayStatus);

    React.useEffect(() => {
        if (isActive) {
            lastActiveDiagnosticsRef.current = {
                stableStarted,
                stableEta,
                stableUpdatedAt,
                stableEtaBasis,
                selectedRawEtaSeconds: rawEtaSeconds,
                selectedEtaBasis: derivedEtaBasis ?? etaBasis,
                etaSecondsPassedToProgressBar: derivedEtaSeconds,
                derivedEtaSeconds,
                derivedEstimatedEndAt,
                updatedAt: derivedUpdatedAt,
                derivedUpdatedAt,
                displayStatus,
                status,
                progress,
                etaSourcePath,
                etaSourceReason,
            };
        }
    }, [
        isActive, stableStarted, stableEta, stableUpdatedAt, stableEtaBasis, rawEtaSeconds,
        derivedEtaBasis, etaBasis, derivedEtaSeconds, derivedEstimatedEndAt, derivedUpdatedAt,
        displayStatus, status, progress, etaSourcePath, etaSourceReason
    ]);

    const handleCopyDebug = React.useCallback(async () => {
        const lastActive = lastActiveDiagnosticsRef.current || {};
        const isActive = ['running', 'processing', 'finalizing'].includes(displayStatus);
        const payload = {
            job,
            liveJob,
            displayStatus,
            selectedProgress: isActive ? progress : (lastActive.progress ?? progress),
            jobProgress,
            activeSegmentProgress,
            rawStarted,
            stableStarted: isActive ? stableStarted : (lastActive.stableStarted ?? stableStarted),
            startedPassedToProgressBar: isActive ? started : (lastActive.startedPassedToProgressBar ?? started),
            jobEtaSeconds: job.eta_seconds,
            liveJobEtaSeconds: liveJob?.eta_seconds,
            selectedRawEtaSeconds: isActive ? rawEtaSeconds : (lastActive.selectedRawEtaSeconds ?? rawEtaSeconds),
            stableEta: (isActive && typeof stableEta === 'number' && stableEta > 0) ? stableEta : (lastActive.stableEta ?? stableEta),
            etaSecondsPassedToProgressBar: (isActive && typeof derivedEtaSeconds === 'number' && derivedEtaSeconds > 0) ? derivedEtaSeconds : (lastActive.etaSecondsPassedToProgressBar ?? derivedEtaSeconds),
            jobEtaBasis: job.eta_basis,
            liveJobEtaBasis: liveJob?.eta_basis,
            selectedEtaBasis: isActive ? (derivedEtaBasis ?? etaBasis) : (lastActive.selectedEtaBasis ?? (derivedEtaBasis ?? etaBasis)),
            updatedAt: isActive ? derivedUpdatedAt : (lastActive.updatedAt ?? derivedUpdatedAt),
            derivedUpdatedAt: isActive ? derivedUpdatedAt : (lastActive.derivedUpdatedAt ?? derivedUpdatedAt),
            estimatedEndAt,
            derivedEstimatedEndAt: isActive ? derivedEstimatedEndAt : (lastActive.derivedEstimatedEndAt ?? derivedEstimatedEndAt),
            derivedEtaSeconds: (isActive && typeof derivedEtaSeconds === 'number' && derivedEtaSeconds > 0) ? derivedEtaSeconds : (lastActive.derivedEtaSeconds ?? derivedEtaSeconds),
            stableUpdatedAt: isActive ? stableUpdatedAt : (lastActive.stableUpdatedAt ?? stableUpdatedAt),
            stableEtaBasis: isActive ? stableEtaBasis : (lastActive.stableEtaBasis ?? stableEtaBasis),
            etaSourcePath: isActive ? etaSourcePath : (lastActive.etaSourcePath ?? etaSourcePath),
            etaSourceReason: isActive ? etaSourceReason : (lastActive.etaSourceReason ?? etaSourceReason),
            persistenceKey: activeSegmentId ? `${job.id}:${activeSegmentId}` : job.id,
            checkpointMode: (job.segment_ids?.length || liveJob?.segment_ids?.length || activeSegmentId)
                ? 'segment'
                : (job.render_group_count || liveJob?.render_group_count)
                ? 'queue'
                : 'default',
            evidenceWeightFraction: 1,
            transitionTickCount: (job.segment_ids?.length || liveJob?.segment_ids?.length || activeSegmentId)
                ? 3
                : (job.render_group_count || liveJob?.render_group_count)
                ? 12
                : 8,
            tickMs: 250,
            latestProgressBarSnapshot: latestSnapshotRef.current,
            recentAuditFrames: getLiveEventAuditSnapshot()
                .filter(record => record.event.jobId === job.id && (record.event.topic === 'jobs.lifecycle' || record.event.topic === 'queue.items'))
                .map(record => {
                    const ev = record.event;
                    const p = ev.payload as any;
                    return {
                        frameId: ev.frameId,
                        receivedAt: ev.receivedAt,
                        eventKind: ev.eventKind,
                        payload: {
                            status: p?.status,
                            progress: p?.progress,
                            etaSeconds: p?.etaSeconds,
                            eta_seconds: p?.eta_seconds,
                            etaBasis: p?.etaBasis,
                            eta_basis: p?.eta_basis,
                            startedAt: p?.startedAt,
                            started_at: p?.started_at,
                            updatedAt: p?.updatedAt,
                            updated_at: p?.updated_at,
                            estimatedEndAt: p?.estimatedEndAt,
                            estimated_end_at: p?.estimated_end_at,
                        },
                        reasonCode: p?.reasonCode ?? p?.reason_code,
                        source: ev.source,
                    };
                }),
        };

        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
                return;
            } catch (err) {
                // Ignore and fall back to recordStudioDebugSnapshot
            }
        }
        recordStudioDebugSnapshot(`queue-item-debug-copy-${job.id}`, payload);
    }, [
        job, liveJob, displayStatus, progress, jobProgress, activeSegmentProgress,
        rawStarted, stableStarted, started, rawEtaSeconds, stableEta, derivedEtaSeconds,
        derivedEtaBasis, etaBasis, updatedAt, derivedUpdatedAt, estimatedEndAt, derivedEstimatedEndAt,
        activeSegmentId, stableUpdatedAt, stableEtaBasis, etaSourcePath, etaSourceReason,
    ]);

    React.useEffect(() => {
        recordStudioDebugSnapshot(`queue-item-progress-${job.id}`, {
            jobId: job.id,
            jobEtaSeconds: job.eta_seconds,
            liveJobEtaSeconds: liveJob?.eta_seconds,
            selectedRawEtaSeconds: rawEtaSeconds,
            stableEta,
            derivedEtaSeconds,
            estimatedEndAt,
            derivedEstimatedEndAt,
            updatedAt: derivedUpdatedAt,
            etaBasis: derivedEtaBasis ?? etaBasis,
            status,
            progress,
            displayStatus,
            etaReason: etaSourceReason,
        });
    }, [
        job.id, job.eta_seconds, liveJob?.eta_seconds, rawEtaSeconds, stableEta,
        derivedEtaSeconds, estimatedEndAt, derivedEstimatedEndAt, derivedUpdatedAt,
        derivedEtaBasis, etaBasis, status, progress, displayStatus, isTrulyActive, etaSourceReason
    ]);

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
                            onClick={(e) => { e.stopPropagation(); void handleCopyDebug(); }}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', borderRadius: '8px' }}
                            className="hover-bg-accent"
                            title="Copy Debug Info"
                            data-testid={`debug-copy-btn-${job.id}`}
                        >
                            <Terminal size={18} strokeWidth={2} />
                        </button>
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
                    dataTestId="queue-item-progress-bar"
                    progress={progress}
                    startedAt={started}
                    etaSeconds={derivedEtaSeconds}
                    etaBasis={derivedEtaBasis ?? etaBasis}
                    estimatedEndAt={derivedEstimatedEndAt}
                    updatedAt={derivedUpdatedAt}
                    persistenceKey={activeSegmentId ? `${job.id}:${activeSegmentId}` : job.id}
                    status={displayStatus}
                    label={displayStatus === 'preparing' ? "Preparing..." : (displayStatus === 'finalizing' ? "Finalizing..." : "Processing...")}
                    predictive={true}
                    allowBackwardProgress={false}
                    onDebugSnapshot={handleDebugSnapshot}
                    checkpointMode={
                        (job.segment_ids?.length || liveJob?.segment_ids?.length || activeSegmentId)
                            ? 'segment'
                            : (job.render_group_count || liveJob?.render_group_count)
                            ? 'queue'
                            : 'default'
                    }
                    evidenceWeightFraction={1}
                    transitionTickCount={
                        (job.segment_ids?.length || liveJob?.segment_ids?.length || activeSegmentId)
                            ? 3
                            : (job.render_group_count || liveJob?.render_group_count)
                            ? 12
                            : 8
                    }
                    backwardTransitionTickCount={2}
                    tickMs={250}
                />
            </div>
        </div>
    );
};
