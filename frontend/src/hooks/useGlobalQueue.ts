import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import type { ProcessingQueueItem, Job } from '../types';

export const useGlobalQueue = (paused: boolean, jobs: Record<string, Job>, refreshTrigger: number, onRefresh?: () => void) => {
    const [queue, setQueue] = useState<ProcessingQueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [localPaused, setLocalPaused] = useState(paused);
    const [hoveredJobId, setHoveredJobId] = useState<string | null>(null);
    const isDraggingRef = useRef(false);
    const [showHistory, setShowHistory] = useState(false);
    const [confirmConfig, setConfirmConfig] = useState<{
        title: string;
        message: string;
        onConfirm: () => void;
        isDestructive?: boolean;
        confirmText?: string;
    } | null>(null);

    useEffect(() => {
        setLocalPaused(paused);
    }, [paused]);

    const fetchQueue = async () => {
        if (isDraggingRef.current) return;
        try {
            const data = await api.getProcessingQueue();
            if (!isDraggingRef.current) {
                setQueue(data);
            }
        } catch (e) {
            console.error("Failed to fetch queue", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchQueue();
        const interval = setInterval(fetchQueue, 3000);
        return () => clearInterval(interval);
    }, [refreshTrigger]);

    useEffect(() => {
        if (isDraggingRef.current) return;
        setQueue(prev => {
            let changed = false;
            const updated = prev.map(q => {
                const liveJob = Object.values(jobs).find(j => j.id === q.id);
                if (liveJob && liveJob.status !== q.status) {
                    changed = true;
                    return { ...q, status: liveJob.status };
                }
                return q;
            });
            return changed ? updated : prev;
        });
    }, [jobs]);

    useEffect(() => {
        const timer = setInterval(fetchQueue, 30000);
        return () => clearInterval(timer);
    }, []);

    const handlePauseToggle = async () => {
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
    };

    const handleReorder = (newOrder: ProcessingQueueItem[]) => {
        // newOrder comes from Reorder.Group values={pendingJobs}
        // pendingJobs is already filtered for 'queued' status
        setQueue(prev => {
            const nonQueued = prev.filter(q => q.status !== 'queued');
            return [...nonQueued, ...newOrder];
        });
    };

    const handleDragStart = () => {
        isDraggingRef.current = true;
    };

    const handleDragEnd = async () => {
        try {
            const queuedIds = queue.filter(q => q.status === 'queued').map(q => q.id);
            await api.reorderProcessingQueue(queuedIds);
            
            // Explicitly sync after save
            const data = await api.getProcessingQueue();
            setQueue(data);
        } catch (e) {
            console.error('Failed to commit reorder:', e);
            fetchQueue();
        } finally {
            // Delay releasing the lock slightly to ensure all animations settle
            setTimeout(() => {
                isDraggingRef.current = false;
            }, 100);
        }
    };

    const handleRemove = async (id: string) => {
        try {
            const job = queue.find(q => q.id === id);
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
    };

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
        fetchQueue,
        handleDragStart,
        handleDragEnd
    };
};
