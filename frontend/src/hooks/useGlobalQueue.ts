import { useState, useEffect } from 'react';
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

    useEffect(() => {
        setLocalPaused(paused);
    }, [paused]);

    const fetchQueue = async () => {
        try {
            const data = await api.getProcessingQueue();
            setQueue(data);
        } catch (e) {
            console.error("Failed to fetch queue", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchQueue();
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
        // Extreme simplicity for skeleton
        setQueue(prev => {
            const active = prev.filter(q => q.status !== 'queued');
            return [...active, ...newOrder];
        });
    };

    const handleRemove = async (id: string) => {
        try {
            await api.removeProcessingQueue(id);
            fetchQueue();
        } catch (e) {
            console.error(e);
        }
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
        handleClearCompleted: async () => { await api.clearCompletedJobs(); fetchQueue(); },
        handleClearAll: () => { /* ... simplified ... */ },
        fetchQueue,
        handleDragStart: () => {},
        handleDragEnd: () => {}
    };
};
