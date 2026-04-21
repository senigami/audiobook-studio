import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import type { ProcessingQueueItem } from '../types';

export const useGlobalQueue = (initialQueue: ProcessingQueueItem[], paused: boolean, onRefresh?: () => void) => {
    const [queue, setQueue] = useState<ProcessingQueueItem[]>(initialQueue);
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

    // Sync local queue state with the incoming merged queue from the sync hook,
    // but ONLY when not dragging.
    useEffect(() => {
        if (!isDraggingRef.current) {
            setQueue(initialQueue);
        }
    }, [initialQueue]);

    useEffect(() => {
        return () => {
            if (dragTimeoutRef.current) clearTimeout(dragTimeoutRef.current);
        };
    }, []);


    const handleSetHoveredJobId = (id: string | null) => {
        if (!isDraggingRef.current) {
            setHoveredJobId(id);
        }
    };

    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (isDraggingRef.current) {
                setTimeout(() => {
                    if (isDraggingRef.current && !dragTimeoutRef.current) {
                        isDraggingRef.current = false;
                        if (onRefresh) onRefresh();
                    }
                }, 200);
            }
        };
        window.addEventListener('pointerup', handleGlobalMouseUp);
        return () => window.removeEventListener('pointerup', handleGlobalMouseUp);
    }, [onRefresh]);

    useEffect(() => {
        setLocalPaused(paused);
    }, [paused]);

    const handlePauseToggle = useCallback(async () => {
        const targetState = !localPaused;
        setLocalPaused(targetState);
        try {
            await api.toggleQueuePause(targetState);
            if (onRefresh) onRefresh();
        } catch (e) {
            console.error('Failed to toggle pause', e);
            setLocalPaused(!targetState);
        }
    }, [localPaused, onRefresh]);

    const handleReorder = useCallback((newOrder: ProcessingQueueItem[]) => {
        setQueue(prev => {
            const nonQueued = prev.filter(q => q.status !== 'queued');
            return [...nonQueued, ...newOrder];
        });
    }, []);

    const handleDragStart = useCallback(() => {
        isDraggingRef.current = true;
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
            const queuedIds = queue.filter(q => q.status === 'queued').map(q => q.id);
            await api.reorderProcessingQueue(queuedIds);
            
            await new Promise(resolve => setTimeout(resolve, 300));
            
            if (onRefresh) onRefresh();
        } catch (e) {
            console.error('Failed to commit reorder:', e);
            if (onRefresh) onRefresh();
        } finally {
            setTimeout(() => {
                isDraggingRef.current = false;
            }, 100);
        }
    }, [queue, onRefresh]);

    const handleRemove = useCallback(async (id: string) => {
        try {
            const job = queue.find(q => q.id === id);
            if (job?.chapter_id && job.status !== 'done' && job.status !== 'failed' && job.status !== 'cancelled') {
                try {
                    await api.cancelChapterGeneration(job.chapter_id);
                } catch (e) {
                    console.warn('Could not cancel chapter job, removing from queue anyway', e);
                }
            }
            await api.removeProcessingQueue(id);
            if (onRefresh) onRefresh();
        } catch (e) {
            console.error(e);
        }
    }, [queue, onRefresh]);

    const handleClearCompleted = async () => {
        try {
            await api.clearCompletedJobs();
            if (onRefresh) onRefresh();
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
                if (onRefresh) onRefresh();
                setConfirmConfig(null);
            }
        });
    };

    return {
        queue,
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
        handleDragStart,
        handleDragEnd
    };
};
