import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import type { ProcessingQueueItem, Job } from '../types';

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

    useEffect(() => {
        queueRef.current = queue;
    }, [queue]);

    // Define fetchQueue first to avoid hosting/initialization errors in effects
    const fetchQueue = useCallback(async () => {
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
