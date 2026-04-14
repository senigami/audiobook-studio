import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import type { ProcessingQueueItem, Job } from '../types';
import { isSegmentScopedJob } from '../utils/jobSelection';

const COMPLETION_HOLD_SECONDS = 12;
const STATUS_PRIORITY: Record<string, number> = {
    done: 5,
    failed: 5,
    cancelled: 5,
    finalizing: 4,
    running: 3,
    preparing: 2,
    queued: 1,
};

function hasChapterAudioReady(item: ProcessingQueueItem): boolean {
    return item.chapter_audio_status === 'done' || !!item.chapter_audio_file_path;
}

function shouldHoldCompletedCloudItem(item: ProcessingQueueItem, jobs: Record<string, Job>, queue: ProcessingQueueItem[], baseStatus: string): boolean {
    const liveJob = jobs[item.id];
    const engine = liveJob?.engine ?? item.engine;
    if (!['voxtral', 'mixed'].includes(engine || '')) return false;
    if (isSegmentScopedJob({
        segment_ids: liveJob?.segment_ids ?? item.segment_ids,
        active_segment_id: liveJob?.active_segment_id,
        custom_title: liveJob?.custom_title ?? item.custom_title,
    })) return false;
    if (baseStatus !== 'done' || !item.chapter_id) return false;
    if (hasChapterAudioReady(item)) return false;
    const recentlyCompleted = !!item.completed_at && ((Date.now() / 1000) - item.completed_at) <= COMPLETION_HOLD_SECONDS;
    if (!recentlyCompleted && !jobs[item.id]) return false;
    const hasActiveSibling = queue.some(other =>
        other.id !== item.id &&
        other.chapter_id === item.chapter_id &&
        ['queued', 'preparing', 'running', 'finalizing'].includes(other.status)
    );
    return !hasActiveSibling;
}

function reconcileQueueItem(
    item: ProcessingQueueItem,
    jobs: Record<string, Job>,
    queue: ProcessingQueueItem[],
    previousItem?: ProcessingQueueItem,
): ProcessingQueueItem {
    const liveJob = jobs[item.id];
    const liveStatus = liveJob?.status;
    let baseStatus = liveStatus ?? item.status;
    if (
        !liveStatus
        && previousItem?.status
        && (STATUS_PRIORITY[previousItem.status] ?? 0) > (STATUS_PRIORITY[baseStatus] ?? 0)
        && ['running', 'finalizing'].includes(previousItem.status)
        && ['queued', 'preparing'].includes(baseStatus)
    ) {
        baseStatus = previousItem.status;
    }
    let nextStatus = baseStatus;
    const liveStartedAt = liveJob?.started_at;
    const itemStartedAt = item.started_at;
    const previousStartedAt = previousItem?.started_at;
    const stableStartedAt = (
        ['running', 'preparing', 'finalizing', 'done'].includes(baseStatus)
        && typeof (previousStartedAt ?? itemStartedAt) === 'number'
        && typeof (liveStartedAt ?? previousStartedAt) === 'number'
    )
        ? (previousStartedAt ?? itemStartedAt)
        : (liveStartedAt ?? previousStartedAt ?? itemStartedAt);

    const liveEta = liveJob?.eta_seconds;
    const itemEta = item.eta_seconds;
    const previousEta = previousItem?.eta_seconds;
    const stableEta = (
        typeof liveEta === 'number'
        && typeof (previousEta ?? itemEta) === 'number'
        && ['running', 'preparing', 'finalizing'].includes(baseStatus)
        && Math.abs(liveEta - (previousEta ?? itemEta ?? liveEta)) < 1
    )
        ? (previousEta ?? itemEta)
        : (liveEta ?? previousEta ?? itemEta);

    const liveProgress = typeof liveJob?.progress === 'number' ? liveJob.progress : undefined;
    const previousProgress = typeof previousItem?.progress === 'number' ? previousItem.progress : undefined;
    const itemProgress = typeof item.progress === 'number' ? item.progress : undefined;
    const stableProgress = nextStatus === 'finalizing'
        ? 1.0
        : ['preparing', 'running', 'finalizing'].includes(nextStatus)
            ? Math.max(liveProgress ?? 0, previousProgress ?? 0, itemProgress ?? 0)
            : (liveProgress ?? previousProgress ?? itemProgress ?? 0);

    if (baseStatus === 'done' && shouldHoldCompletedCloudItem(item, jobs, queue, baseStatus)) {
        nextStatus = 'finalizing';
    }

    if (
        nextStatus === item.status
        && stableProgress === (item.progress ?? 0)
        && stableStartedAt === item.started_at
        && stableEta === item.eta_seconds
    ) {
        return item;
    }

    return {
        ...item,
        status: nextStatus,
        progress: stableProgress,
        started_at: stableStartedAt,
        eta_seconds: stableEta,
    };
}

export const useGlobalQueue = (paused: boolean, jobs: Record<string, Job>, refreshTrigger: number, onRefresh?: () => void) => {
    const [queue, setQueue] = useState<ProcessingQueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [localPaused, setLocalPaused] = useState(paused);
    const [hoveredJobId, setHoveredJobId] = useState<string | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [confirmConfig, setConfirmConfig] = useState<{
        title: string;
        message: string;
        onConfirm: () => void;
        isDestructive?: boolean;
        confirmText?: string;
    } | null>(null);

    const isDraggingRef = useRef(false);
    const dragTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const queueRef = useRef(queue);
    const jobsRef = useRef(jobs);

    useEffect(() => {
        queueRef.current = queue;
    }, [queue]);

    useEffect(() => {
        jobsRef.current = jobs;
    }, [jobs]);

    // Define fetchQueue first to avoid hosting/initialization errors in effects
    const fetchQueue = useCallback(async () => {
        if (isDraggingRef.current) return;
        try {
            const data = await api.getProcessingQueue();
            if (!isDraggingRef.current) {
                const previousById = new Map(queueRef.current.map(item => [item.id, item]));
                const reconciled = data.map(item => reconcileQueueItem(item, jobsRef.current, data, previousById.get(item.id)));
                setQueue(reconciled);
            }
        } catch (e) {
            console.error("Failed to fetch queue", e);
        } finally {
            setLoading(false);
        }
    }, []);

    // Safer hover handling that prevents re-renders during drag
    const handleSetHoveredJobId = (id: string | null) => {
        if (!isDraggingRef.current) {
            setHoveredJobId(id);
        }
    };

    // Global fallback to release drag lock if Framer Motion misses an event
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (isDraggingRef.current) {
                // We give Framer Motion a moment to fire its own handleDragEnd
                setTimeout(() => {
                    if (isDraggingRef.current && !dragTimeoutRef.current) {
                        isDraggingRef.current = false;
                        fetchQueue();
                    }
                }, 200);
            }
        };
        window.addEventListener('pointerup', handleGlobalMouseUp);
        return () => window.removeEventListener('pointerup', handleGlobalMouseUp);
    }, [fetchQueue]);

    useEffect(() => {
        setLocalPaused(paused);
    }, [paused]);

    useEffect(() => {
        fetchQueue();
        const interval = setInterval(fetchQueue, 3000);
        return () => clearInterval(interval);
    }, [refreshTrigger, fetchQueue]);

    useEffect(() => {
        if (isDraggingRef.current) return;
        setQueue(prev => {
            let changed = false;
            const updated = prev.map(q => {
                const next = reconcileQueueItem(q, jobs, prev, q);
                if (
                    next !== q
                    && (
                        next.status !== q.status
                        || next.progress !== q.progress
                        || next.started_at !== q.started_at
                        || next.eta_seconds !== q.eta_seconds
                    )
                ) {
                    changed = true;
                    return next;
                }
                return q;
            });
            return changed ? updated : prev;
        });
    }, [jobs]);

    useEffect(() => {
        const timer = setInterval(fetchQueue, 30000);
        return () => clearInterval(timer);
    }, [fetchQueue]);

    const handlePauseToggle = useCallback(async () => {
        const targetState = !localPaused;
        setLocalPaused(targetState);
        try {
            const endpoint = targetState ? '/queue/pause' : '/queue/resume';
            const res = await fetch(endpoint, { method: 'POST' });
            await res.json();
            if (onRefresh) onRefresh();
            fetchQueue();
        } catch (e) {
            console.error('Failed to toggle pause', e);
            setLocalPaused(!targetState);
        }
    }, [localPaused, onRefresh, fetchQueue]);

    const handleReorder = useCallback((newOrder: ProcessingQueueItem[]) => {
        // newOrder comes from Reorder.Group values={pendingJobs}
        // pendingJobs is already filtered for 'queued' status
        setQueue(prev => {
            const nonQueued = prev.filter(q => q.status !== 'queued');
            return [...nonQueued, ...newOrder];
        });
    }, []);

    const handleDragStart = useCallback(() => {
        isDraggingRef.current = true;
        // Safety timeout: if drag ends in an unexpected way, release the lock after 10s
        if (dragTimeoutRef.current) clearTimeout(dragTimeoutRef.current);
        dragTimeoutRef.current = setTimeout(() => {
            isDraggingRef.current = false;
        }, 10000);
    }, []);

    const handleDragEnd = useCallback(async () => {
        if (dragTimeoutRef.current) {
            clearTimeout(dragTimeoutRef.current);
            dragTimeoutRef.current = null;
        }
        
        try {
            const currentQueue = queueRef.current;
            const queuedIds = currentQueue.filter(q => q.status === 'queued').map(q => q.id);
            await api.reorderProcessingQueue(queuedIds);
            
            // Wait for snap-back animation to finish completely
            await new Promise(resolve => setTimeout(resolve, 300));
            
            const data = await api.getProcessingQueue();
            // Only update if we aren't starting another drag
            if (!isDraggingRef.current) {
                setQueue(data);
            }
        } catch (e) {
            console.error('Failed to commit reorder:', e);
            fetchQueue();
        } finally {
            // Delay releasing the lock to prevent background fetch from interfering with the final snap
            setTimeout(() => {
                isDraggingRef.current = false;
            }, 100);
        }
    }, [fetchQueue]);

    const handleRemove = useCallback(async (id: string) => {
        try {
            const currentQueue = queueRef.current;
            const job = currentQueue.find(q => q.id === id);
            if (job?.chapter_id && job.status !== 'done' && job.status !== 'failed' && job.status !== 'cancelled') {
                try {
                    await fetch(`/api/chapters/${job.chapter_id}/cancel`, { method: 'POST' });
                } catch (e) {
                    console.warn('Could not cancel chapter job, removing from queue anyway', e);
                }
            }
            await api.removeProcessingQueue(id);
            fetchQueue();
        } catch (e) {
            console.error(e);
        }
    }, [fetchQueue]);

    const handleClearCompleted = async () => {
        try {
            await api.clearCompletedJobs();
            fetchQueue();
        } catch (e) {
            console.error(e);
        }
    };

    const handleClearAll = () => {
        setConfirmConfig({
            title: 'Clear Queue',
            message: 'Are you sure you want to clear all items from the queue? This will cancel any running jobs.',
            isDestructive: true,
            confirmText: 'Clear All',
            onConfirm: async () => {
                await api.clearProcessingQueue(); 
                fetchQueue(); 
                setConfirmConfig(null);
            }
        });
    };

    return {
        queue,
        loading,
        localPaused,
        hoveredJobId,
        setHoveredJobId: handleSetHoveredJobId,
        showHistory,
        setShowHistory,
        confirmConfig,
        setConfirmConfig,
        handlePauseToggle,
        handleReorder,
        handleRemove,
        handleClearCompleted,
        handleClearAll,
        fetchQueue,
        handleDragStart,
        handleDragEnd
    };
};
