import React from 'react';
import { Clock } from 'lucide-react';
import type { ProcessingQueueItem, Job } from '@/types';
import { useNow } from '@/hooks/useNow';

interface QueueStatsProps {
    queue: ProcessingQueueItem[];
    jobs: Record<string, Job>;
}

export const QueueStats: React.FC<QueueStatsProps> = React.memo(({ queue, jobs }) => {
    // P6: use shared clock hook so N mounted instances share one interval.
    const now = useNow();

    const activeProcessing = queue.filter(q => ['queued', 'preparing', 'running', 'finalizing'].includes(q.status));
    
    if (activeProcessing.length === 0) return null;

    const totalSeconds = (() => {
        let total = 0;
        let hasUncalibrated = false;

        for (const q of activeProcessing) {
            const liveJob = Object.values(jobs).find(j => j.id === q.id);
            if (liveJob) {
                const p = liveJob.progress || 0;
                const startedAt = liveJob.started_at;
                const etaSeconds = liveJob.eta_seconds;

                if (etaSeconds !== undefined && etaSeconds !== null) {
                    if (startedAt) {
                        const elapsed = (now / 1000) - startedAt;
                        total += Math.max(0, etaSeconds - elapsed);
                    } else {
                        total += etaSeconds * (1 - p);
                    }
                } else {
                    hasUncalibrated = true;
                    break;
                }
            } else {
                hasUncalibrated = true;
                break;
            }
        }

        return hasUncalibrated ? null : total;
    })();

    if (totalSeconds === null) return null;

    const formatETA = (total: number) => {
        if (total <= 0) return "Finishing...";
        
        const d = Math.floor(total / 86400);
        const h = Math.floor((total % 86400) / 3600);
        // Ceil the minutes so we don't show 0m until it's actually finished
        const m = Math.ceil((total % 3600) / 60);

        const parts = [];
        if (d > 0) parts.push(`${d}d`);
        if (h > 0) parts.push(`${h}h`);
        if (m > 0 || (d === 0 && h === 0)) parts.push(`${m}m`);
        
        return `${parts.join(' ')} remaining`;
    };

    return (
        <>
            <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--border)' }} />
            <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px', 
                color: 'var(--accent)', 
                fontSize: '0.85rem', 
                fontWeight: 600,
                background: 'var(--accent-tint)',
                padding: '2px 10px',
                borderRadius: '12px'
            }}>
                <Clock size={14} />
                <span>{formatETA(totalSeconds)}</span>
            </div>
        </>
    );
});
