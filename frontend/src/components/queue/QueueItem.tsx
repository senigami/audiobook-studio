import React from 'react';
import { Play, Pause, XCircle, Terminal } from 'lucide-react';
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar';
import { SegmentRenderMonitor, FULL_STRIP_MIN } from '@/components/progress/SegmentRenderMonitor/SegmentRenderMonitor';
import { SegmentPeekStrip } from '@/components/progress/SegmentRenderMonitor/SegmentPeekStrip';
import { api } from '@/api';
import type { ProcessingQueueItem, Job } from '@/types';
import { formatQueueContext } from '@/utils/queueLabels';
import { shouldShowIndeterminateProgress, isMainQueueSegmentItem } from '@/utils/jobSelection';
import { recordStudioDebugSnapshot } from '@/utils/runtimeDebug';
import { useDevMode } from '@/utils/devMode';
import { selectEtaSource, selectEtaSourceTimestamp } from '@/utils/queueItemEtaSelection';
import { buildQueueItemDebugPayload } from '@/utils/queueItemDebugPayload';
import { useSegmentInventory } from '@/hooks/useSegmentInventory';
import { isPeekStripDismissed, setPeekStripDismissed } from '@/utils/segmentPeekStripState';
import { ACTIVE_STATUSES } from '@/utils/jobStatus';
import { isTerminalStatus } from '@/components/progress/PredictiveProgressBar/predictiveProgressBarHelpers';
import { emitToast } from '@/utils/toast';

// W-PAR task 011 (moved to per-row scope by task 015): the auto-appear
// threshold for the Level-2 peek strip — a job with fewer than this many
// segments concurrently *rendering* isn't yet showing the parallelism the
// strip exists to surface. Owner-decided default (see
// design-docs/plans/active/parallel-segment-rendering/tasks/011-monitor-peek-strip.md);
// not a settings-exposed threshold (out of scope per that task's "Out of scope").
const PEEK_STRIP_ACTIVE_THRESHOLD = 2;
// Fallback only (task 008 default, superseded by task 014's live cap
// admission): used for the monitor's caption text when `engineCaps` (the
// job's engine isn't in the map yet, or GET /api/engines/concurrency hasn't
// resolved/failed) doesn't have a real per-engine effective cap to show.
const SEGMENT_MONITOR_CAP = 1;

interface QueueItemProps {
    job: ProcessingQueueItem;
    liveJob?: Job;
    localPaused: boolean;
    formatJobTitle: (job: any) => string;
    formatTime: (ts: number | null | undefined) => string;
    onRemove: (id: string) => void;
    compact?: boolean;
    engines?: import('@/types').TtsEngine[];
    /** engine_id -> live effective concurrency cap (W-PAR task 014). Falls back to SEGMENT_MONITOR_CAP when a lookup misses. */
    engineCaps?: Record<string, number>;
    onVisualPendingChange?: (jobId: string, pending: boolean) => void;
    onRefresh?: () => void | Promise<void>;
}

export const QueueItem: React.FC<QueueItemProps> = ({
    job,
    liveJob,
    localPaused,
    formatJobTitle,
    formatTime,
    onRemove,
    compact = false,
    engines = [],
    engineCaps,
    onVisualPendingChange,
    onRefresh
}) => {
    const devMode = useDevMode();
    const latestSnapshotRef = React.useRef<any>(null);
    const handleDebugSnapshot = React.useCallback((snapshot: any) => {
        latestSnapshotRef.current = snapshot;
    }, []);
    const status = job.status;
    const isTrulyActive = ['preparing', 'running', 'processing', 'finalizing'].includes(status);

    // W-PAR task 015: per-row segment inventory + peek-strip/render-monitor
    // state, previously owned by ActivityPage.tsx for a single page-wide
    // "active job" (tasks 008/011). Each QueueItem row now hydrates and
    // gates its own strip independently, so N concurrently-active jobs each
    // get their own instance with no shared state between rows.
    const chapterId = liveJob?.chapter_id ?? (job as any)?.chapter_id;
    const isSegmentMonitorActive = ACTIVE_STATUSES.has(status) && !!chapterId;
    const { segments: inventorySegments } = useSegmentInventory(
        devMode && isSegmentMonitorActive ? (liveJob ?? null) : null
    );

    const [peekDismissed, setPeekDismissedState] = React.useState(false);
    const [monitorExpanded, setMonitorExpanded] = React.useState(false);
    React.useEffect(() => {
        setPeekDismissedState(isPeekStripDismissed(job.id));
        setMonitorExpanded(false);
    }, [job.id]);

    const renderingCount = React.useMemo(
        () => inventorySegments.filter((s) => s.phase === 'rendering').length,
        [inventorySegments],
    );
    const failedSegmentCount = React.useMemo(
        () => inventorySegments.filter((s) => s.phase === 'failed').length,
        [inventorySegments],
    );
    // Only worth surfacing the peek strip if there's actually a full field to
    // expand into (SegmentRenderMonitor itself renders nothing below this
    // segment count — see its own degrade-by-count rule).
    const monitorEligible = devMode && isSegmentMonitorActive && inventorySegments.length >= FULL_STRIP_MIN;
    const peekEligible = monitorEligible && renderingCount >= PEEK_STRIP_ACTIVE_THRESHOLD;
    // A failure must never be hidden by an earlier dismiss.
    const showPeekStrip = peekEligible && !monitorExpanded && (!peekDismissed || failedSegmentCount > 0);
    const showFullMonitor = monitorEligible && (monitorExpanded || !peekEligible);

    const handlePeekExpand = React.useCallback(() => setMonitorExpanded(true), []);
    const handlePeekDismiss = React.useCallback(() => {
        setPeekDismissedState(true);
        setPeekStripDismissed(job.id, true);
    }, [job.id]);

    // Task 010 — segment-level retry, moved per-row by task 015.
    // `POST /api/segments/generate` (already used by ScriptView/BoothTool/
    // ReviseTool for single-segment re-render) is the only per-segment
    // (re)generation entry point this repo has; there is no server-side
    // "retry" verb, so re-queuing generation for the same segment id IS the
    // retry. Task 011 (U6 guided failure recovery): a failed retry request
    // now also surfaces an explanatory toast (instead of a silent
    // console.error) so the failure isn't just a dead-end red state —
    // onRefresh() re-pulls job state so the queue reflects the requeue.
    const handleSegmentRetry = React.useCallback((segmentId: string) => {
        api.generateSegments([segmentId])
            .then(() => onRefresh?.())
            .catch((e) => {
                console.error('Segment retry failed', e);
                emitToast("Couldn't retry that segment. Check the segment's status and try again.");
            });
    }, [onRefresh]);
    const rawStarted = job.started_at ?? liveJob?.started_at;
    const preferLiveEta = (isTrulyActive && typeof liveJob?.eta_seconds === 'number' && liveJob.eta_seconds > 0);
    const etaSource = selectEtaSource(job, liveJob, isTrulyActive);

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
    const updatedAt = selectEtaSourceTimestamp(etaSource, job, liveJob);
    const rawUpdatedAt = job.updated_at ?? liveJob?.updated_at;
    const isVoiceBuildJob = job.engine === 'voice_build' || liveJob?.engine === 'voice_build';
    const isSegmentJob = isVoiceBuildJob || isMainQueueSegmentItem(job) || (liveJob ? isMainQueueSegmentItem(liveJob) : false);
    const activeSegmentId = isSegmentJob ? (liveJob?.active_segment_id ?? job.active_segment_id) : undefined;
    const isGroupedJob = (job.render_group_count ?? 0) > 0 || (liveJob?.render_group_count ?? 0) > 0;
    const isRunningOrProcessing = ['running', 'processing', 'finalizing'].includes(status) || (status === 'preparing' && isGroupedJob);
    const liveActiveSegmentProgress = typeof liveJob?.active_segment_progress === 'number'
        ? liveJob.active_segment_progress
        : undefined;
    const snapshotActiveSegmentProgress = typeof job.active_segment_progress === 'number'
        ? job.active_segment_progress
        : undefined;
    const selectedActiveSegmentProgress = liveActiveSegmentProgress ?? snapshotActiveSegmentProgress;
    const hasMeaningfulActiveSegmentProgress = typeof selectedActiveSegmentProgress === 'number'
        && selectedActiveSegmentProgress > 0
        && selectedActiveSegmentProgress <= 1;
    const activeSegmentProgress = isSegmentJob && isRunningOrProcessing && (activeSegmentId || hasMeaningfulActiveSegmentProgress)
        ? selectedActiveSegmentProgress
        : undefined;
    const jobProgress = isRunningOrProcessing
        ? Math.max(job.progress ?? 0, liveJob?.progress ?? 0)
        : (job.progress ?? 0);
    const progress = (() => {
        if (isTrulyActive) {
            return typeof activeSegmentProgress === 'number'
                ? activeSegmentProgress
                : jobProgress;
        }
        // Terminal status (done, failed, cancelled)
        const lastKnownProgress = activeSegmentProgress ?? job.progress ?? liveJob?.progress;
        if (status === 'done') {
            return lastKnownProgress ?? 1;
        }
        // failed or cancelled
        return lastKnownProgress ?? 0;
    })();

    const [visualProgress, setVisualProgress] = React.useState(progress);
    const [isVisuallyPending, setIsVisuallyPending] = React.useState(status === 'done' && progress < 1.0);
    const hasReachedOneRef = React.useRef(false);
    const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);
    const [prevStatus, setPrevStatus] = React.useState<string | null>(status);
    const [currentStatus, setCurrentStatus] = React.useState(status);

    if (status !== currentStatus) {
        setPrevStatus(currentStatus);
        setCurrentStatus(status);
    }

    // Sync visualProgress when progress prop changes and not done yet
    React.useEffect(() => {
        if (status !== 'done') {
            setVisualProgress(progress);
        }
    }, [progress, status]);

    // Clean up timeout on unmount
    React.useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    React.useEffect(() => {
        if (status !== 'done') {
            setIsVisuallyPending(false);
            hasReachedOneRef.current = false;
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            return;
        }

        // status is 'done'
        const wasActive = ['running', 'preparing', 'finalizing'].includes(prevStatus ?? '');
        let currentPending = isVisuallyPending;

        if (wasActive) {
            // Seeding on transition
            currentPending = true;
            hasReachedOneRef.current = false;
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        }

        if (visualProgress >= 1.0) {
            if (!hasReachedOneRef.current) {
                hasReachedOneRef.current = true;
                if (currentPending) {
                    if (!timeoutRef.current) {
                        timeoutRef.current = setTimeout(() => {
                            setIsVisuallyPending(false);
                            timeoutRef.current = null;
                        }, 500); // 0.5s brief visible hold
                    }
                    setIsVisuallyPending(true);
                } else {
                    setIsVisuallyPending(false);
                }
            }
        } else {
            // status is 'done' but visualProgress < 1.0
            if (!hasReachedOneRef.current) {
                setIsVisuallyPending(true);
            }
        }
    }, [status, visualProgress, isVisuallyPending, prevStatus]);

    // Notify parent on change
    React.useEffect(() => {
        onVisualPendingChange?.(job.id, isVisuallyPending);
        return () => {
            onVisualPendingChange?.(job.id, false);
        };
    }, [job.id, isVisuallyPending, onVisualPendingChange]);

    const engineType = (liveJob?.engine ?? job.engine) || '';
    const engineMeta = Array.isArray(engines) ? engines.find(e => e && e.engine_id === engineType) : undefined;
    const displayJob = React.useMemo(() => (liveJob ? { ...job, ...liveJob } : job), [job, liveJob]);
    const isCloudLike = engineMeta 
        ? (Array.isArray(engineMeta.capabilities) && engineMeta.capabilities.includes('simulated_finalizing')) || !!engineMeta.cloud
        : false;
    const showIndeterminateProgress = shouldShowIndeterminateProgress({
            engine: engineType,
            segment_ids: liveJob?.segment_ids ?? job.segment_ids,
            active_segment_id: liveJob?.active_segment_id,
            custom_title: displayJob.custom_title,
            engineMeta
        });
    // Render-group metadata can arrive before the backend flips a grouped chapter job from
    // preparing into running. Keep the queue row in the backend's explicit status so the UI
    // does not start the active animation early just because group bookkeeping showed up.
    const displayStatus = isCloudLike && status === 'finalizing' ? 'finalizing' : (showIndeterminateProgress ? 'preparing' : status);
    const wasActive = prevStatus && ['running', 'preparing', 'finalizing', 'processing'].includes(prevStatus);
    const justTransitionedToDone = wasActive && status === 'done';

    const [stableStarted, setStableStarted] = React.useState<number | null | undefined>(rawStarted);
    const [stableEta, setStableEta] = React.useState<number | null | undefined>(rawEtaSeconds);
    const [stableUpdatedAt, setStableUpdatedAt] = React.useState<number | null | undefined>(updatedAt);
    const [stableEtaBasis, setStableEtaBasis] = React.useState<'remaining_from_update' | 'total_from_start' | null | undefined>(etaBasis);

    React.useEffect(() => {
        if (typeof rawStarted === 'number' && rawStarted > 0) {
            setStableStarted(rawStarted);
        } else if (!['running', 'processing', 'finalizing'].includes(displayStatus)) {
            if (!isVisuallyPending && !justTransitionedToDone) {
                setStableStarted(rawStarted);
            }
        }
    }, [rawStarted, displayStatus, isVisuallyPending, justTransitionedToDone]);

    React.useEffect(() => {
        if (etaSource === 'liveJob') {
            if (typeof liveJob?.eta_seconds === 'number' && liveJob.eta_seconds > 0) {
                setStableEta(liveJob.eta_seconds);
                const nextUpdated = liveJob.eta_updated_at
                    ?? (typeof job.eta_seconds === 'number' && job.eta_seconds > 0 ? job.eta_updated_at : undefined)
                    ?? liveJob.updated_at
                    ?? job.updated_at;
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
                const nextUpdated = job.eta_updated_at ?? job.updated_at;
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
            if (!isVisuallyPending && !justTransitionedToDone) {
                setStableEta(rawEtaSeconds);
                setStableUpdatedAt(updatedAt);
                setStableEtaBasis(etaBasis);
            }
        }
    }, [rawEtaSeconds, displayStatus, updatedAt, etaBasis, liveJob, job.eta_seconds, job.updated_at, job.eta_updated_at, job.eta_basis, etaSource, isVisuallyPending, justTransitionedToDone]);

    // Original start and ETA values (may be undefined for non-active statuses, but retained during done-transition visual pending catch-up)
    // Also retain when displayStatus === 'preparing' AND a positive ETA is present (parallel-render
    // model: the backend publishes a pre-factored ETA during the cold-load window; the global queue
    // should show the countdown rather than suppressing it with "Preparing…").
    const preparingWithEta = displayStatus === 'preparing' && (rawEtaSeconds ?? 0) > 0;
    const shouldRetainActiveParams = ['running', 'processing', 'finalizing'].includes(displayStatus) || isVisuallyPending || justTransitionedToDone || preparingWithEta;
    const started = shouldRetainActiveParams
        ? (stableStarted ?? rawStarted)
        : undefined;
    const etaSeconds = shouldRetainActiveParams
        ? (stableEta ?? rawEtaSeconds)
        : undefined;
    const activeUpdatedAt = shouldRetainActiveParams
        ? (stableUpdatedAt ?? updatedAt)
        : updatedAt;
    const derivedEtaBasis = shouldRetainActiveParams
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
    const selectedEvidenceWeightFraction = etaSource === 'liveJob'
        ? (liveJob?.confidence ?? job.confidence ?? 1.0)
        : (job.confidence ?? liveJob?.confidence ?? 1.0);

    const isActive = ['running', 'processing', 'finalizing'].includes(displayStatus);
    const liveJobSourceTopic = (liveJob as any)?.source_topic;
    const jobSourceTopic = (job as any)?.source_topic;
    const etaSelectionDebug = React.useMemo(() => ({
        source: etaSource,
        reason: etaSourceReason,
        rawEtaSeconds,
        selectedUpdatedAt: updatedAt,
        activeUpdatedAt,
        derivedUpdatedAt,
        derivedEtaSeconds,
        derivedEstimatedEndAt,
        stableEta,
        stableUpdatedAt,
        liveJob: {
            eta_seconds: liveJob?.eta_seconds,
            eta_updated_at: liveJob?.eta_updated_at,
            updated_at: liveJob?.updated_at,
            confidence: liveJob?.confidence,
            eta_basis: liveJob?.eta_basis,
            estimated_end_at: liveJob?.estimated_end_at,
            status: liveJob?.status,
            source_topic: liveJobSourceTopic,
        },
        job: {
            eta_seconds: job.eta_seconds,
            eta_updated_at: job.eta_updated_at,
            updated_at: job.updated_at,
            confidence: job.confidence,
            eta_basis: job.eta_basis,
            estimated_end_at: job.estimated_end_at,
            status: job.status,
            source_topic: jobSourceTopic,
        },
    }), [
        etaSource,
        etaSourceReason,
        rawEtaSeconds,
        updatedAt,
        activeUpdatedAt,
        derivedUpdatedAt,
        derivedEtaSeconds,
        derivedEstimatedEndAt,
        stableEta,
        stableUpdatedAt,
        liveJob?.eta_seconds,
        liveJob?.eta_updated_at,
        liveJob?.updated_at,
        liveJob?.confidence,
        liveJob?.eta_basis,
        liveJob?.estimated_end_at,
        liveJob?.status,
        liveJobSourceTopic,
        job.eta_seconds,
        job.eta_updated_at,
        job.updated_at,
        job.confidence,
        job.eta_basis,
        job.estimated_end_at,
        job.status,
        jobSourceTopic,
    ]);

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
                etaSelectionDebug,
            };
        }
    }, [
        isActive, stableStarted, stableEta, stableUpdatedAt, stableEtaBasis, rawEtaSeconds,
        derivedEtaBasis, etaBasis, derivedEtaSeconds, derivedEstimatedEndAt, derivedUpdatedAt,
        displayStatus, status, progress, etaSourcePath, etaSourceReason, etaSelectionDebug
    ]);

    const handleCopyDebug = React.useCallback(async () => {
        const payload = buildQueueItemDebugPayload({
            job, liveJob, displayStatus, progress, jobProgress, activeSegmentProgress,
            rawStarted, stableStarted, started, rawEtaSeconds, stableEta, derivedEtaSeconds,
            derivedEtaBasis, etaBasis, updatedAt, derivedUpdatedAt, estimatedEndAt,
            derivedEstimatedEndAt, activeSegmentId, stableUpdatedAt, stableEtaBasis,
            etaSource, etaSourcePath, etaSourceReason, etaSelectionDebug,
            selectedEvidenceWeightFraction, lastActiveDiagnosticsRef, latestSnapshotRef,
        });

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
        activeSegmentId, stableUpdatedAt, stableEtaBasis, etaSource, etaSourcePath, etaSourceReason,
        etaSelectionDebug, selectedEvidenceWeightFraction,
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
            evidenceWeightFraction: selectedEvidenceWeightFraction,
            etaSelectionDebug,
        });
    }, [
        job.id, job.eta_seconds, liveJob?.eta_seconds, rawEtaSeconds, stableEta,
        derivedEtaSeconds, estimatedEndAt, derivedEstimatedEndAt, derivedUpdatedAt,
        derivedEtaBasis, etaBasis, status, progress, displayStatus, isTrulyActive, etaSourceReason,
        etaSelectionDebug, selectedEvidenceWeightFraction
    ]);

    return (
        <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--action-primary)',
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
                background: 'var(--action-primary)'
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
                    <Pause size={compact ? 18 : 24} strokeWidth={2} color="var(--action-primary)" />
                ) : (
                    <Play size={compact ? 18 : 24} strokeWidth={2} color="var(--action-primary)" className="animate-pulse" />
                )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: compact ? '4px' : '12px' }}>
                    <div style={{ minWidth: 0 }}>
                        <h4 style={{ fontWeight: 700, fontSize: compact ? '0.95rem' : '1.1rem', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {formatJobTitle(displayJob)}
                        </h4>
                        <div style={{ fontSize: compact ? '0.75rem' : '0.85rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', rowGap: '2px' }}>
                            <span style={{ ...(!job.project_name ? { color: 'var(--action-primary)', fontWeight: 700, fontSize: compact ? '0.65rem' : '0.75rem', textTransform: 'uppercase' as const } : {}), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                                {formatQueueContext(displayJob as any, engines)}
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
                        {devMode && (
                            <button
                                onClick={(e) => { e.stopPropagation(); void handleCopyDebug(); }}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', borderRadius: '8px' }}
                                className="hover-bg-accent"
                                title="Copy Debug Info"
                                data-testid={`debug-copy-btn-${job.id}`}
                            >
                                <Terminal size={18} strokeWidth={2} />
                            </button>
                        )}
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
                    label={
                        // Terminal jobs (done/failed/cancelled) already show their state on
                        // the right side of this row via terminalStatusText ("Complete" /
                        // "Failed" / "Cancelled") — labeling the left side "Processing..."
                        // at the same time is a contradictory display (design-review fix).
                        isTerminalStatus(displayStatus)
                            ? ""
                            : displayStatus === 'preparing' ? "Preparing..." : (displayStatus === 'finalizing' ? "Finalizing..." : "Processing...")
                    }
                    predictive={true}
                    allowBackwardProgress={false}
                    onDebugSnapshot={handleDebugSnapshot}
                    onDisplayProgress={setVisualProgress}
                    checkpointMode={
                        (job.segment_ids?.length || liveJob?.segment_ids?.length || activeSegmentId)
                            ? 'segment'
                            : (job.render_group_count || liveJob?.render_group_count)
                            ? 'queue'
                            : 'default'
                    }
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
                {/*
                    W-PAR task 015: per-row segment peek strip / render
                    monitor, mounted BENEATH this row's own aggregate
                    progress bar (additive, not a replacement) — reuses the
                    same components/gating as the prior page-level version
                    (tasks 008/011), just scoped to this job instead of a
                    single page-wide "active job".
                */}
                {showPeekStrip && (
                    <div style={{ marginTop: '0.75rem' }}>
                        <SegmentPeekStrip
                            segments={inventorySegments}
                            activeCount={renderingCount}
                            onExpand={handlePeekExpand}
                            onDismiss={handlePeekDismiss}
                        />
                    </div>
                )}
                {showFullMonitor && (
                    <div style={{ marginTop: '1rem' }}>
                        <SegmentRenderMonitor
                            segments={inventorySegments}
                            cap={engineCaps?.[engineType] ?? SEGMENT_MONITOR_CAP}
                            renderGroupCount={job.render_group_count ?? liveJob?.render_group_count}
                            completedRenderGroups={job.completed_render_groups ?? liveJob?.completed_render_groups}
                            onRetry={handleSegmentRetry}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
