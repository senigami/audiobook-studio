import React from 'react';
import { Reorder, motion, AnimatePresence } from 'framer-motion';
import { Trash2, CheckCircle, Layers, Play, Pause, XCircle, Ban, ChevronDown, ChevronRight } from 'lucide-react';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { ConfirmModal } from '@/components/overlays/ConfirmModal';
import { useGlobalQueue } from '@/hooks/useGlobalQueue';
import { QueueItem } from '@/components/queue/QueueItem';
import { ReorderableQueueItem } from '@/components/queue/ReorderableQueueItem';
import { QueueStats } from '@/components/queue/QueueStats';
import type { Job, ProcessingQueueItem } from '@/types';
import { formatQueueContext } from '@/utils/queueLabels';
import { isMainQueueSegmentItem } from '@/utils/jobSelection';
import './GlobalQueue.css';

type HistoryFilter = 'All' | 'Renders' | 'Samples' | 'API';

const SAMPLE_HISTORY_ENGINES = new Set(['sample_build', 'sample_test', 'voice_test', 'voice_build']);
const API_HISTORY_ENGINES = new Set(['api_synthesis']);

function classifyHistoryJob(job: ProcessingQueueItem): Exclude<HistoryFilter, 'All'> {
    const engine = (job.engine || '').toLowerCase();
    if (API_HISTORY_ENGINES.has(engine)) return 'API';
    if (SAMPLE_HISTORY_ENGINES.has(engine)) return 'Samples';
    return 'Renders';
}

interface GlobalQueueProps {
    paused?: boolean;
    jobs?: Record<string, Job>;
    queue: ProcessingQueueItem[];
    loading?: boolean;
    onRefresh?: () => void;
    compact?: boolean;
    engines?: import('@/types').TtsEngine[];
    historyFilter?: HistoryFilter;
    /**
     * Filter-chip row (All/Renders/Samples/API) for the History section below.
     * Owned/rendered by the caller (state lives on ActivityPage) — GlobalQueue
     * only places it directly above the "Completed / Failed History" header
     * it filters, per design-review fix (chip row was previously stranded at
     * the top of the page, above the section it controls).
     */
    historyFilterControls?: React.ReactNode;
    /** engine_id -> live effective concurrency cap (W-PAR task 014). Passed through to QueueItem's render monitor caption. */
    engineCaps?: Record<string, number>;
}

export const GlobalQueue: React.FC<GlobalQueueProps> = ({
    paused = false,
    jobs = {},
    queue: initialQueue,
    loading = false,
    onRefresh,
    compact = false,
    engines = [],
    historyFilter = 'All',
    historyFilterControls,
    engineCaps,
}) => {
    const {
        queue,
        localPaused,
        hoveredJobId,
        setHoveredJobId,
        showHistory,
        setShowHistory,
        confirmConfig,
        setConfirmConfig,
        handlePauseToggle,
        handleReorder,
        handleRemove,
        handleClearCompleted,
        handleClearAll,
        handleDragStart,
        handleDragEnd
    } = useGlobalQueue(initialQueue, paused, onRefresh);

    const formatTime = React.useCallback((ts: number | null | undefined) => {
        if (!ts) return "";
        const d = new Date(ts * 1000);
        return d.toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }, []);

    const formatRunDuration = React.useCallback((start: number | null | undefined, end: number | null | undefined) => {
        if (!start || !end || end < start) return "";
        const total = Math.max(0, Math.round(end - start));
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        const seconds = total % 60;
        if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
        if (minutes > 0) return `${minutes}m ${seconds}s`;
        return `${seconds}s`;
    }, []);

    const formatAudioDuration = React.useCallback((seconds: number | undefined) => {
        if (!seconds) return "";
        if (seconds < 60) return `${seconds.toFixed(1)}s`;
        const mins = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return `${mins}m ${secs}s`;
    }, []);

    const formatJobTitle = React.useCallback((job: ProcessingQueueItem) => {
        const liveJob = jobs[job.id];
        const displayJob = liveJob ? { ...job, ...liveJob } : job;
        const base = displayJob.custom_title || displayJob.chapter_title || "System Task";
        if (displayJob.engine === 'audiobook') {
            return `Assembling m4b for: ${base}`;
        }
        return base;
    }, [jobs]);

    const chapterJobs = React.useMemo(() => queue.filter(q => !isMainQueueSegmentItem(q)), [queue]);
    const [recentlyCompleted, setRecentlyCompleted] = React.useState<Record<string, number>>({});
    const [visuallyPendingJobs, setVisuallyPendingJobs] = React.useState<Record<string, boolean>>({});
    // Live-region announcement text — updated when a job completes so screen readers announce it.
    const [liveAnnouncement, setLiveAnnouncement] = React.useState('');

    const handleVisualPendingChange = React.useCallback((jobId: string, pending: boolean) => {
        setVisuallyPendingJobs(prev => {
            if (prev[jobId] === pending) return prev;
            return { ...prev, [jobId]: pending };
        });
    }, []);

    const prevQueueRef = React.useRef<ProcessingQueueItem[]>([]);
    const timeoutsRef = React.useRef<Record<string, NodeJS.Timeout>>({});

    React.useEffect(() => {
        return () => {
            // Clean up all timeouts on unmount
            Object.values(timeoutsRef.current).forEach(clearTimeout);
        };
    }, []);

    React.useEffect(() => {
        const now = Date.now();
        const newCompletions = { ...recentlyCompleted };
        let changed = false;

        // Clean up timeouts and completions for any removed/cancelled jobs
        prevQueueRef.current.forEach(prevJob => {
            const stillExists = queue.some(j => j.id === prevJob.id);
            if (!stillExists) {
                if (timeoutsRef.current[prevJob.id]) {
                    clearTimeout(timeoutsRef.current[prevJob.id]);
                    delete timeoutsRef.current[prevJob.id];
                }
                if (newCompletions[prevJob.id]) {
                    delete newCompletions[prevJob.id];
                    changed = true;
                }
            }
        });

        queue.forEach(job => {
            const prevJob = prevQueueRef.current.find(j => j.id === job.id);
            if (prevJob) {
                const wasActive = ['running', 'preparing', 'finalizing'].includes(prevJob.status);
                const isTerminal = ['done', 'failed', 'cancelled'].includes(job.status);
                const wentActiveAgain = ['done', 'failed', 'cancelled'].includes(prevJob.status) && ['running', 'preparing', 'finalizing', 'queued'].includes(job.status);

                if (wentActiveAgain) {
                    if (timeoutsRef.current[job.id]) {
                        clearTimeout(timeoutsRef.current[job.id]);
                        delete timeoutsRef.current[job.id];
                    }
                    if (newCompletions[job.id]) {
                        delete newCompletions[job.id];
                        changed = true;
                    }
                }

                if (wasActive && isTerminal && !newCompletions[job.id]) {
                    newCompletions[job.id] = now;
                    changed = true;

                    if (timeoutsRef.current[job.id]) {
                        clearTimeout(timeoutsRef.current[job.id]);
                    }

                    timeoutsRef.current[job.id] = setTimeout(() => {
                        setRecentlyCompleted(prev => {
                            const next = { ...prev };
                            delete next[job.id];
                            return next;
                        });
                        delete timeoutsRef.current[job.id];
                    }, 30000);

                    // Announce completion to screen readers via the live region.
                    const title = job.custom_title || job.chapter_title || 'Task';
                    const outcome = job.status === 'done' ? 'completed' : job.status === 'failed' ? 'failed' : 'cancelled';
                    setLiveAnnouncement(`${title} ${outcome}.`);
                }

                if (wasActive && job.status === 'done') {
                    setVisuallyPendingJobs(prev => {
                        if (prev[job.id] === true) return prev;
                        return { ...prev, [job.id]: true };
                    });
                }
            }
        });

        if (changed) {
            setRecentlyCompleted(newCompletions);
        }
        prevQueueRef.current = queue;
    }, [queue, recentlyCompleted]);

    const activeJobs = React.useMemo(() => {
        const active = chapterJobs.filter(q => q.status === 'running' || q.status === 'preparing' || q.status === 'finalizing');
        const now = Date.now();
        const retained = chapterJobs.filter(q => {
            const completedAt = recentlyCompleted[q.id];
            const prevJob = prevQueueRef.current.find(j => j.id === q.id);
            const wasActive = prevJob ? ['running', 'preparing', 'finalizing'].includes(prevJob.status) : false;
            const justTransitionedToDone = wasActive && q.status === 'done';

            const isVisualPending = visuallyPendingJobs[q.id] !== undefined
                ? visuallyPendingJobs[q.id]
                : (justTransitionedToDone || (q.status === 'done' && (q.progress ?? 0) < 1.0));
            return (completedAt && (now - completedAt < 30000)) || isVisualPending;
        });
        const activeIds = new Set(active.map(j => j.id));
        return [...active, ...retained.filter(j => !activeIds.has(j.id))];
    }, [chapterJobs, recentlyCompleted, visuallyPendingJobs]);

    // activeJobs above intentionally retains just-finished jobs for a brief
    // completion animation, so it can contain terminal-status (done/failed/
    // cancelled) rows alongside truly-running ones. The "Processing Now"
    // count must only reflect jobs that are actually processing — counting a
    // job with a "Complete" progress bar as "processing" is a contradictory
    // display (design-review fix).
    const trulyProcessingCount = React.useMemo(
        () => activeJobs.filter(q => ['running', 'preparing', 'finalizing'].includes(q.status)).length,
        [activeJobs]
    );

    const pendingJobs = React.useMemo(() => chapterJobs.filter(q => q.status === 'queued'), [chapterJobs]);
    const nothingToPause = trulyProcessingCount === 0 && pendingJobs.length === 0;
    const activeIds = React.useMemo(() => new Set(activeJobs.map(j => j.id)), [activeJobs]);
    const pastJobs = React.useMemo(() => chapterJobs.filter(q => (q.status === 'done' || q.status === 'failed' || q.status === 'cancelled') && !activeIds.has(q.id)), [chapterJobs, activeIds]);
    const filteredPastJobs = React.useMemo(() => {
        if (historyFilter === 'All') return pastJobs;
        return pastJobs.filter(job => classifyHistoryJob(job) === historyFilter);
    }, [historyFilter, pastJobs]);
    if (loading) return <div style={{ padding: 'var(--space-6)' }}>Loading Queue...</div>;

    return (
        <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: compact ? 'var(--space-4)' : 'var(--space-6)', minHeight: '100%', paddingBottom: compact ? 'var(--space-6)' : '4rem' }}>
            {/* Visually-hidden live region: announces job completions to screen readers */}
            <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="sr-only"
            >
                {liveAnnouncement}
            </div>
            {/* Visually-hidden h1 when rendered as the full page (not compact drawer) */}
            {!compact && (
                <h1 className="sr-only">
                    Queue
                </h1>
            )}
            <header className="global-queue-header" style={{
                display: 'flex',
                flexDirection: compact ? 'column' : 'row',
                justifyContent: 'space-between',
                alignItems: compact ? 'flex-start' : 'flex-end',
                paddingBottom: 'var(--space-4)',
                borderBottom: '1px solid var(--border)',
                gap: compact ? 'var(--space-4)' : '0'
            }}>
                <div className="global-queue-header__title">
                    {/* When rendered compact inside the queue Drawer, the Drawer's own
                        header already carries the title ("Processing Queue") + dialog
                        landmark — repeating "Global Queue" here was a redundant double
                        title. Only render this heading on the full-page route. */}
                    {!compact && (
                        <h2 style={{ fontSize: '1.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                            <Layers size={24} strokeWidth={2} color="var(--action-primary)" /> Global Queue
                        </h2>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-1)' }}>
                        {!compact && <p style={{ color: 'var(--text-muted)', margin: 0 }}>Manage your batch audio generation tasks</p>}
                        {chapterJobs.some(q => ['queued', 'preparing', 'running', 'finalizing'].includes(q.status)) && (
                            <QueueStats queue={chapterJobs} jobs={jobs} />
                        )}
                    </div>
                </div>
                <div className="global-queue-header__actions" style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', width: compact ? '100%' : 'auto' }}>
                    {/*
                        Pausing/resuming only affects jobs that are running or waiting
                        their turn — with nothing active or queued (only history left,
                        or an empty queue), this button has nothing to act on. Disable
                        it in that case instead of leaving a live-looking control that
                        silently does nothing (design-review fix).
                    */}
                    <button
                        onClick={handlePauseToggle}
                        disabled={nothingToPause}
                        title={nothingToPause ? 'Nothing queued to pause' : undefined}
                        className={localPaused ? "btn-success" : "btn-primary"}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 'var(--space-2)',
                            padding: compact ? 'var(--space-2) var(--space-3)' : '10px 20px',
                            borderRadius: '10px',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            boxShadow: nothingToPause ? 'none' : 'var(--shadow-sm)',
                            transition: 'all 0.2s ease',
                            border: 'none',
                            cursor: nothingToPause ? 'default' : 'pointer',
                            opacity: nothingToPause ? 0.5 : 1,
                            flex: compact ? 1 : 'none'
                        }}
                    >
                        {localPaused ? <Play size={16} strokeWidth={2} fill="currentColor" /> : <Pause size={16} strokeWidth={2} fill="currentColor" />}
                        {localPaused ? (compact ? 'Resume' : 'Resume Processing') : (compact ? 'Pause All' : 'Pause All Jobs')}
                    </button>
                    <ActionMenu
                        items={[
                            { label: 'Clear Completed', icon: CheckCircle, onClick: handleClearCompleted },
                            { label: 'Clear All Jobs', icon: Trash2, onClick: handleClearAll, isDestructive: true }
                        ]}
                    />
                </div>
            </header>

            {chapterJobs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '5rem var(--space-6)', background: 'var(--surface)', borderRadius: '20px', border: '2px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-5)', color: 'var(--text-muted)' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                        <Layers size={32} />
                    </div>
                    <div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>Queue is empty</h3>
                        <p style={{ maxWidth: '300px', margin: '0 auto', fontSize: '0.9rem', lineHeight: 1.5 }}>
                            Jobs you add from the project chapter view will appear here for processing.
                        </p>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                    {localPaused && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ background: 'var(--warning-tint-bg)', border: '1px solid var(--warning-tint-border)', borderRadius: '12px', padding: 'var(--space-4) var(--space-5)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--warning-text)' }}>
                            <Pause size={18} fill="currentColor" />
                            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Processing is currently paused. Resume to continue the queue.</span>
                        </motion.div>
                    )}

                    {activeJobs.length > 0 ? (
                        <div>
                            <h3 className="queue-section-label" style={{ marginBottom: 'var(--space-4)' }}>
                                Processing Now ({trulyProcessingCount})
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                                {activeJobs.map(job => (
                                    <QueueItem
                                        key={job.id}
                                        job={job}
                                        liveJob={jobs[job.id]}
                                        localPaused={localPaused}
                                        formatJobTitle={formatJobTitle}
                                        formatTime={formatTime}
                                        onRemove={handleRemove}
                                        compact={compact}
                                        engines={engines}
                                        engineCaps={engineCaps}
                                        onVisualPendingChange={handleVisualPendingChange}
                                        onRefresh={onRefresh}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : pendingJobs.length === 0 && !localPaused ? (
                        <div style={{ textAlign: 'center', padding: 'var(--space-6) var(--space-4)', background: 'var(--surface)', borderRadius: '16px', border: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--text-muted)' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                                <Layers size={24} />
                            </div>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>No active renders</span>
                        </div>
                    ) : null}

                    {pendingJobs.length > 0 && (
                        <div style={{ position: 'relative' }}>
                            <h3 className="queue-section-label" style={{ marginBottom: 'var(--space-4)' }}>
                                Up Next ({pendingJobs.length})
                            </h3>
                            <Reorder.Group
                                axis="y"
                                values={pendingJobs}
                                onReorder={handleReorder}
                                style={{
                                    listStyle: 'none',
                                    margin: 0,
                                    padding: 0,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 'var(--space-4)',
                                    position: 'relative', // Ensure coordinate space is local
                                    minHeight: '50px' // Prevent collapse if empty during drag
                                }}
                            >
                    {pendingJobs.map(job => (
                        <ReorderableQueueItem
                            key={job.id}
                            job={job}
                            formatJobTitle={formatJobTitle}
                            handleRemove={handleRemove}
                            handleDragStart={handleDragStart}
                            handleDragEnd={handleDragEnd}
                            compact={compact}
                            engines={engines}
                        />
                    ))}
                            </Reorder.Group>
                        </div>
                    )}

                    {pastJobs.length > 0 && (
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-6)' }}>
                            {historyFilterControls}
                            <button onClick={() => setShowHistory(!showHistory)} style={{ background: 'none', border: 'none', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-2) 0', cursor: 'pointer', marginBottom: showHistory ? 'var(--space-4)' : 0 }}>
                                <h3 className="queue-section-label" style={{ margin: 0 }}>Completed / Failed History ({filteredPastJobs.length})</h3>
                                <div style={{ color: 'var(--text-muted)' }}>{showHistory ? <ChevronDown size={18} strokeWidth={2} /> : <ChevronRight size={18} strokeWidth={2} />}</div>
                            </button>
                            <AnimatePresence>
                                {showHistory && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} style={{ overflow: 'hidden' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', paddingBottom: 'var(--space-4)' }}>
                                            {filteredPastJobs.length === 0 ? (
                                                <div style={{ padding: '0.85rem var(--space-4)', borderRadius: '12px', border: '1px dashed var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                    No history matches this filter.
                                                </div>
                                            ) : filteredPastJobs.map(job => {
                                                const liveJob = jobs[job.id];
                                                const displayJob = liveJob ? { ...job, ...liveJob } : job;
                                                const isDone = displayJob.status === 'done';
                                                const isCancelled = displayJob.status === 'cancelled';
                                                // Cancelled is user-initiated, not an error — per Apple HIG it must not
                                                // borrow the error-red used for genuine failures (done=success,
                                                // failed=error, cancelled=neutral/muted).
                                                const statusTint = isDone ? 'var(--success-tint)' : isCancelled ? 'var(--surface-alt)' : 'var(--error-tint)';
                                                const statusColor = isDone ? 'var(--success)' : isCancelled ? 'var(--text-muted)' : 'var(--error)';
                                                const StatusIcon = isDone ? CheckCircle : isCancelled ? Ban : XCircle;
                                                const audioLen = displayJob.produced_audio_length || displayJob.audio_length_seconds;
                                                const charCount = displayJob.produced_chars || displayJob.char_count;
                                                const segCount = displayJob.produced_segment_count;
                                                return (
                                                <div key={job.id} onMouseEnter={() => setHoveredJobId(job.id)} onMouseLeave={() => setHoveredJobId(null)} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: 'var(--space-3) 1.25rem', display: 'flex', alignItems: 'flex-start', gap: '1.25rem', opacity: 0.8, transition: 'all 0.2s ease' }}>
                                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: statusTint, display: 'flex', alignItems: 'center', justifyContent: 'center', color: statusColor, flexShrink: 0 }}>
                                                        <StatusIcon size={18} strokeWidth={2} />
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <h4 className="queue-history-title" style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{formatJobTitle(displayJob as any)}</h4>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-2)', rowGap: '4px', marginTop: '2px' }}>
                                                            <span style={{ ...( !job.project_name ? { color: 'var(--action-primary)', fontWeight: 700, fontSize: compact ? '0.65rem' : 'var(--type-caption)', textTransform: 'uppercase' as const } : {}), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                                                                {formatQueueContext(displayJob as any, engines)}
                                                            </span>
                                                            {(displayJob.started_at || displayJob.completed_at || displayJob.updated_at) && (
                                                                <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                                                                    <span>
                                                                        {formatTime(displayJob.started_at || displayJob.completed_at || displayJob.updated_at)}
                                                                        {displayJob.started_at && displayJob.completed_at && displayJob.completed_at > displayJob.started_at && (
                                                                            <> → {formatRunDuration(displayJob.started_at, displayJob.completed_at)}</>
                                                                        )}
                                                                    </span>
                                                                </span>
                                                            )}
                                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: statusColor }}>{displayJob.status}</span>
                                                            {isDone && Boolean(audioLen) && (
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                                                                    <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                                                                    <span style={{ fontSize: 'var(--type-caption)', color: 'var(--action-primary)', fontWeight: 600 }}>
                                                                        {formatAudioDuration(audioLen)}
                                                                    </span>
                                                                </span>
                                                            )}
                                                            {isDone && Boolean(charCount) && (
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                                                                    <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                                                                    <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)' }}>
                                                                        {charCount?.toLocaleString()} chars
                                                                        {segCount ? ` • ${segCount} segment${segCount === 1 ? '' : 's'}` : ''}
                                                                    </span>
                                                                </span>
                                                            )}
                                                        </div>
                                                        {!isDone && (displayJob.error || displayJob.log) && (
                                                            <div style={{ marginTop: '0.35rem', fontSize: 'var(--type-caption)', lineHeight: 1.45, color: 'var(--error)', whiteSpace: 'normal' }}>
                                                                Reason: {displayJob.error || displayJob.log}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => handleRemove(job.id)}
                                                        className="hover-bg-destructive queue-history-remove-btn"
                                                        aria-label="Remove from history"
                                                        style={{ background: 'none', border: 'none', padding: 'var(--space-2)', borderRadius: '8px', cursor: 'pointer', color: hoveredJobId === job.id ? 'var(--error)' : 'var(--text-muted)', opacity: hoveredJobId === job.id ? 1 : 0.7, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease', flexShrink: 0 }}
                                                    >
                                                        <Trash2 size={16} strokeWidth={2} />
                                                    </button>
                                                </div>
                                                );
                                            })}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            )}

            <ConfirmModal
                isOpen={!!confirmConfig}
                title={confirmConfig?.title || ''}
                message={confirmConfig?.message || ''}
                onConfirm={() => { confirmConfig?.onConfirm(); setConfirmConfig(null); }}
                onCancel={() => setConfirmConfig(null)}
                isDestructive={confirmConfig?.isDestructive}
                confirmText={confirmConfig?.confirmText}
            />
        </div>
    );
};
