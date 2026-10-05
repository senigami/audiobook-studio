/**
 * Pure ETA source selection functions extracted from QueueItem.tsx.
 * No React imports — these are plain functions that can be unit-tested in isolation.
 */

import type { ProcessingQueueItem, Job } from '@/types';

export type EtaSource = 'liveJob' | 'job' | 'fallback';

/**
 * Determines which source (liveJob, job, or fallback) provides the most
 * up-to-date ETA, preferring the more recently updated one when both are positive.
 */
export function selectEtaSource(
    job: Pick<ProcessingQueueItem, 'eta_seconds' | 'eta_updated_at' | 'updated_at'>,
    liveJob: Pick<Job, 'eta_seconds' | 'eta_updated_at' | 'updated_at'> | undefined,
    _isTrulyActive: boolean
): EtaSource {
    const hasLiveEta = typeof liveJob?.eta_seconds === 'number' && liveJob.eta_seconds > 0;
    const hasJobEta = typeof job.eta_seconds === 'number' && job.eta_seconds > 0;

    if (hasLiveEta && hasJobEta) {
        const liveTime = liveJob!.eta_updated_at ?? liveJob!.updated_at ?? 0;
        const jobTime = job.eta_updated_at ?? job.updated_at ?? 0;
        if (liveTime >= jobTime) {
            return 'liveJob';
        } else {
            return 'job';
        }
    }

    if (hasLiveEta) {
        return 'liveJob';
    }

    if (hasJobEta) {
        return 'job';
    }

    if (job.eta_seconds !== undefined && job.eta_seconds !== null) {
        return 'job';
    }
    if (typeof liveJob?.eta_seconds === 'number') {
        return 'liveJob';
    }
    return 'fallback';
}

/**
 * Returns the timestamp most associated with the selected ETA source,
 * falling back through available timestamps in priority order.
 */
export function selectEtaSourceTimestamp(
    etaSource: EtaSource,
    job: Pick<ProcessingQueueItem, 'eta_seconds' | 'eta_updated_at' | 'updated_at'>,
    liveJob: Pick<Job, 'eta_seconds' | 'eta_updated_at' | 'updated_at'> | undefined
): number | null | undefined {
    if (etaSource === 'liveJob') {
        return (typeof liveJob?.eta_seconds === 'number' && liveJob.eta_seconds > 0 ? liveJob.eta_updated_at : undefined)
            ?? (typeof job.eta_seconds === 'number' && job.eta_seconds > 0 ? job.eta_updated_at : undefined)
            ?? liveJob?.updated_at
            ?? job.updated_at;
    }
    if (etaSource === 'job') {
        return (typeof job.eta_seconds === 'number' && job.eta_seconds > 0 ? job.eta_updated_at : undefined)
            ?? (typeof liveJob?.eta_seconds === 'number' && liveJob.eta_seconds > 0 ? liveJob.eta_updated_at : undefined)
            ?? job.updated_at
            ?? liveJob?.updated_at;
    }
    return liveJob?.updated_at ?? job.updated_at;
}
