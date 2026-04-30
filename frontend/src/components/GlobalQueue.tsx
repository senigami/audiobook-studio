import React from 'react';
import { Reorder, motion, AnimatePresence } from 'framer-motion';
import { Trash2, CheckCircle, Layers, Play, Pause, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { ActionMenu } from './ActionMenu';
import { ConfirmModal } from './ConfirmModal';
import { useGlobalQueue } from '../hooks/useGlobalQueue';
import { QueueItem } from './queue/QueueItem';
import { ReorderableQueueItem } from './queue/ReorderableQueueItem';
import { QueueStats } from './queue/QueueStats';
import type { Job, ProcessingQueueItem } from '../types';
import { formatQueueContext } from '../utils/queueLabels';

interface GlobalQueueProps {
    paused?: boolean;
    jobs?: Record<string, Job>;
    queue: ProcessingQueueItem[];
    loading?: boolean;
    onRefresh?: () => void;
    compact?: boolean;
}

export const GlobalQueue: React.FC<GlobalQueueProps> = ({
    paused = false,
    jobs = {},
    queue: initialQueue,
    loading = false,
    onRefresh,
    compact = false
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
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }, []);

    const formatJobTitle = React.useCallback((job: ProcessingQueueItem) => {
        const base = job.custom_title || job.chapter_title || "System Task";
        if (job.engine === 'audiobook') {
            return `Assembling m4b for: ${base}`;
        }
        return base;
    }, []);

    const activeJobs = React.useMemo(() => queue.filter(q => q.status === 'running' || q.status === 'preparing' || q.status === 'finalizing'), [queue]);
    const pendingJobs = React.useMemo(() => queue.filter(q => q.status === 'queued'), [queue]);
    const pastJobs = React.useMemo(() => queue.filter(q => q.status === 'done' || q.status === 'failed' || q.status === 'cancelled'), [queue]);
    if (loading) return <div style={{ padding: '2rem' }}>Loading Queue...</div>;

    return (
        <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: compact ? '1rem' : '2rem', minHeight: '100%', paddingBottom: compact ? '2rem' : '4rem' }}>
            <header style={{
                display: 'flex',
                flexDirection: compact ? 'column' : 'row',
                justifyContent: 'space-between',
                alignItems: compact ? 'flex-start' : 'flex-end',
                paddingBottom: '1rem',
                borderBottom: '1px solid var(--border)',
                gap: compact ? '1rem' : '0'
            }}>
                <div>
                    <h2 style={{ fontSize: compact ? '1.25rem' : '1.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                        <Layers size={compact ? 20 : 24} strokeWidth={2} color="var(--accent)" /> Global Queue
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                        {!compact && <p style={{ color: 'var(--text-muted)', margin: 0 }}>Manage your batch audio generation tasks</p>}
                        {queue.some(q => ['queued', 'preparing', 'running', 'finalizing'].includes(q.status)) && (
                            <QueueStats queue={queue} jobs={jobs} />
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', width: compact ? '100%' : 'auto' }}>
                    <button
                        onClick={handlePauseToggle}
                        className={localPaused ? "btn-success" : "btn-primary"}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: compact ? '8px 12px' : '10px 20px',
                            borderRadius: '10px',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            boxShadow: 'var(--shadow-sm)',
                            transition: 'all 0.2s ease',
                            border: 'none',
                            cursor: 'pointer',
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

            {queue.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '5rem 2rem', background: 'var(--surface)', borderRadius: '20px', border: '2px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', color: 'var(--text-muted)' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                        <Layers size={32} />
                    </div>
                    <div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Queue is empty</h3>
                        <p style={{ maxWidth: '300px', margin: '0 auto', fontSize: '0.9rem', lineHeight: 1.5 }}>
                            Jobs you add from the project chapter view will appear here for processing.
                        </p>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {localPaused && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '12px', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '12px', color: '#d97706' }}>
                            <Pause size={18} fill="currentColor" />
                            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Processing is currently paused. Resume to continue the queue.</span>
                        </motion.div>
                    )}

                    {activeJobs.length > 0 && (
                        <div>
                            <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                                Processing Now ({activeJobs.length})
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {activeJobs.map(job => (
                                    <QueueItem
                                        key={job.id}
                                        job={job}
                                        liveJob={Object.values(jobs).find(j => j.id === job.id)}
                                        localPaused={localPaused}
                                        formatJobTitle={formatJobTitle}
                                        formatTime={formatTime}
                                        onRemove={handleRemove}
                                        compact={compact}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {pendingJobs.length > 0 && (
                        <div style={{ position: 'relative' }}>
                            <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '1rem' }}>
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
                                    gap: '1rem',
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
                        />
                    ))}
                            </Reorder.Group>
                        </div>
                    )}

                    {pastJobs.length > 0 && (
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
                            <button onClick={() => setShowHistory(!showHistory)} style={{ background: 'none', border: 'none', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', cursor: 'pointer', marginBottom: showHistory ? '1rem' : 0 }}>
                                <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', margin: 0 }}>Completed / Failed History ({pastJobs.length})</h3>
                                <div style={{ color: 'var(--text-muted)' }}>{showHistory ? <ChevronDown size={18} strokeWidth={2} /> : <ChevronRight size={18} strokeWidth={2} />}</div>
                            </button>
                            <AnimatePresence>
                                {showHistory && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} style={{ overflow: 'hidden' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingBottom: '1rem' }}>
                                            {pastJobs.map(job => (
                                                <div key={job.id} onMouseEnter={() => setHoveredJobId(job.id)} onMouseLeave={() => setHoveredJobId(null)} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1.25rem', opacity: 0.8, transition: 'all 0.2s ease' }}>
                                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: job.status === 'done' ? 'var(--success-tint)' : 'var(--error-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: job.status === 'done' ? 'var(--success)' : 'var(--error)' }}>
                                                        {job.status === 'done' ? <CheckCircle size={18} strokeWidth={2} /> : <XCircle size={18} strokeWidth={2} />}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <h4 style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatJobTitle(job)}</h4>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>{formatQueueContext(job)}</span>
                                                            {job.started_at && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{formatTime(job.started_at)} {job.completed_at ? `→ ${formatTime(job.completed_at)}` : ''}</span>}
                                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: job.status === 'done' ? 'var(--success)' : 'var(--error)' }}>{job.status}</span>
                                                        </div>
                                                    </div>
                                                    <button onClick={() => handleRemove(job.id)} className="hover-bg-destructive" style={{ background: 'none', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer', color: hoveredJobId === job.id ? 'var(--error)' : 'var(--text-muted)', opacity: hoveredJobId === job.id ? 1 : 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease' }}>
                                                        <Trash2 size={16} strokeWidth={2} />
                                                    </button>
                                                </div>
                                            ))}
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
