/**
 * Pure job-update reducer extracted from useJobs.ts / applyJobUpdatedEvent.
 * No React imports — pure function testable in isolation.
 */

import type { Job } from '@/types';
import { isSegmentScopedJob } from '@/utils/jobSelection';
import { copyRenderGroupFields } from '@/utils/jobEventAdapters';

export const STATUS_PRIORITY: Record<string, number> = {
    done: 5,
    failed: 5,
    cancelled: 5,
    finalizing: 4,
    running: 3,
    preparing: 2,
    queued: 1,
};

export interface ApplyJobUpdatedOpts {
    /** When true the update must not create a new job row */
    overlayOnly?: boolean;
}

/**
 * Detects whether an incoming status rollback (queued/preparing/running) represents
 * a genuinely newer job run rather than stale/out-of-order delivery.
 */
export function detectNewerRun(
    oldJob: Job,
    updates: Record<string, any>,
    incomingStatus: string | undefined
): boolean {
    const isRollbackStatus = ['queued', 'preparing', 'running'].includes(incomingStatus || '');
    if (!isRollbackStatus) return false;

    const dbUpdatedAt = updates.db_updated_at;
    const dbStartedAt = updates.db_started_at;
    const oldUpdatedAt = oldJob.updated_at;
    const oldFinishedAt = oldJob.finished_at;
    const oldStartedAt = oldJob.started_at;

    const hasOldTimestamps = typeof oldUpdatedAt === 'number' || typeof oldFinishedAt === 'number' || typeof oldStartedAt === 'number';
    const hasIncomingDbTimestamps = typeof dbUpdatedAt === 'number' || typeof dbStartedAt === 'number';

    return (
        (hasIncomingDbTimestamps && (
            !hasOldTimestamps ||
            (typeof dbUpdatedAt === 'number' && (
                (typeof oldUpdatedAt !== 'number' || dbUpdatedAt > oldUpdatedAt) &&
                (typeof oldFinishedAt !== 'number' || dbUpdatedAt > oldFinishedAt)
            )) ||
            (typeof dbStartedAt === 'number' && (
                (typeof oldStartedAt !== 'number' || dbStartedAt > oldStartedAt)
            ))
        )) ||
        (!hasIncomingDbTimestamps && (
            (!['done', 'failed', 'cancelled'].includes(oldJob.status || '') || hasOldTimestamps) &&
            (typeof updates.updated_at === 'number' && (
                (typeof oldUpdatedAt !== 'number' || updates.updated_at > oldUpdatedAt) &&
                (typeof oldFinishedAt !== 'number' || updates.updated_at > oldFinishedAt)
            ))
        ))
    );
}

/**
 * Applies the segment-field guard rules: non-segments.progress sources
 * may only set active_segment_* fields when carrying an explicit reset signal.
 */
export function applySegmentFieldRules(
    nextUpdates: Record<string, any>,
    oldJob: Job,
    sourceTopic: string | undefined
): void {
    const isNotSegmentProgress = sourceTopic !== 'segments.progress';
    if (!isNotSegmentProgress) return;

    const incomingStatusForReset = typeof nextUpdates.status === 'string' ? nextUpdates.status : undefined;
    const canCarryExplicitSegmentReset = sourceTopic === 'jobs.lifecycle'
        || (sourceTopic === 'queue.items' && ['done', 'failed', 'cancelled'].includes(incomingStatusForReset || ''));
    const hasExplicitSegmentReset = canCarryExplicitSegmentReset && (
        nextUpdates.active_segment_id === null ||
        nextUpdates.active_segment_progress === 0 ||
        nextUpdates.active_segment_eta_seconds === null ||
        nextUpdates.active_segment_eta_basis === null ||
        nextUpdates.active_segment_updated_at === null ||
        nextUpdates.active_render_batch_id === null ||
        nextUpdates.active_render_batch_progress === null
    );

    if (!hasExplicitSegmentReset) {
        delete nextUpdates.active_segment_id;
        delete nextUpdates.active_segment_progress;
        delete nextUpdates.active_segment_eta_seconds;
        delete nextUpdates.active_segment_eta_basis;
        delete nextUpdates.active_segment_updated_at;
    }

    const isSegmentJob = isSegmentScopedJob(oldJob);
    const isPreparingZeroProgress = oldJob.status === 'preparing' &&
        (oldJob.active_segment_progress ?? 0) <= 0 &&
        (oldJob.progress ?? 0) <= 0;

    if (isSegmentJob) {
        delete nextUpdates.classification;
        delete nextUpdates.segment_ids;
        delete nextUpdates.eta_seconds;
        delete nextUpdates.eta_basis;
        delete nextUpdates.estimated_end_at;
    }

    if ((oldJob.active_segment_id || isSegmentJob) && isPreparingZeroProgress) {
        delete nextUpdates.status;
    }
}

/**
 * Pure reducer for a single job-updated event.
 *
 * Returns the next jobs map (a new object reference) or null when the
 * incoming update should be ignored entirely (no state change).
 */
export function applyJobUpdated(
    prevJobs: Record<string, Job>,
    jobId: string,
    updates: Record<string, any>,
    opts: ApplyJobUpdatedOpts = {}
): Record<string, Job> | null {
    const oldJob = prevJobs[jobId];

    if (!oldJob) {
        if (opts.overlayOnly) return null;
        const newJob = { id: jobId, ...updates } as Job;
        return { ...prevJobs, [jobId]: newJob };
    }

    const prov = updates.segmentProgressSocketProvenance;
    const nextUpdates = { ...updates } as Record<string, any>;
    const sourceTopic = typeof nextUpdates.source_topic === 'string' ? nextUpdates.source_topic : undefined;
    delete nextUpdates.source_topic;

    Object.keys(nextUpdates).forEach(key => {
        if (nextUpdates[key] === undefined) delete nextUpdates[key];
    });

    // Build segment-progress history entry
    if (prov) {
        const entry = prov._sequencedEntry ?? {
            sequence: Date.now(), // caller may inject a pre-sequenced entry via _sequencedEntry
            receivedAt: prov.rawEnvelope?.receivedAt || new Date().toISOString(),
            emittedAt: prov.rawEnvelope?.emittedAt || prov.rawEnvelope?.emitted_at || null,
            topic: prov.consumedTopic,
            eventKind: prov.rawEnvelope?.eventKind || null,
            jobId: prov.rawEnvelope?.jobId || null,
            chapterId: prov.rawEnvelope?.chapterId || null,
            segmentId: prov.rawEnvelope?.segmentId || null,
            activeSegmentId: prov.selectedFields?.activeSegmentId || null,
            activeSegmentProgress: prov.selectedFields?.activeSegmentProgress ?? null,
            progress: prov.selectedFields?.progress ?? null,
            etaSeconds: prov.selectedFields?.etaSeconds ?? null,
            etaBasis: prov.selectedFields?.eta_basis || prov.selectedFields?.etaBasis || null,
            status: prov.selectedFields?.status || null,
            reasonCode: prov.selectedFields?.reasonCode || null,
            updatedAt: prov.selectedFields?.updatedAt || null,
            renderedJobId: prov.rawEnvelope?.jobId || null,
        };
        const oldHistory = (oldJob as any).segmentProgressUpdates || [];
        nextUpdates.segmentProgressUpdates = [entry, ...oldHistory].slice(0, 20);
    }

    // Stale-update guard: allow only segment-scoped fields through from stale frames
    if (
        typeof oldJob.updated_at === 'number'
        && typeof updates?.updated_at === 'number'
        && updates.updated_at < oldJob.updated_at
    ) {
        if (updates.active_segment_id !== undefined || updates.active_segment_progress !== undefined) {
            const nextUpdatesStale: Record<string, any> = {};
            if (updates.active_segment_id !== undefined) nextUpdatesStale.active_segment_id = updates.active_segment_id;
            if (updates.active_segment_progress !== undefined) nextUpdatesStale.active_segment_progress = updates.active_segment_progress;
            if (updates.active_segment_eta_seconds !== undefined) nextUpdatesStale.active_segment_eta_seconds = updates.active_segment_eta_seconds;
            if (updates.active_segment_eta_basis !== undefined) nextUpdatesStale.active_segment_eta_basis = updates.active_segment_eta_basis;
            if (updates.active_segment_updated_at !== undefined) nextUpdatesStale.active_segment_updated_at = updates.active_segment_updated_at;
            if (updates.hasSegmentSupport !== undefined) nextUpdatesStale.hasSegmentSupport = updates.hasSegmentSupport;
            if (updates.has_segment_support !== undefined) nextUpdatesStale.has_segment_support = updates.has_segment_support;
            if (updates.project_id !== undefined) nextUpdatesStale.project_id = updates.project_id;
            if (updates.chapter_id !== undefined) nextUpdatesStale.chapter_id = updates.chapter_id;
            if (updates.segmentProgressSocketProvenance !== undefined) nextUpdatesStale.segmentProgressSocketProvenance = updates.segmentProgressSocketProvenance;
            if (nextUpdates.segmentProgressUpdates !== undefined) nextUpdatesStale.segmentProgressUpdates = nextUpdates.segmentProgressUpdates;
            return { ...prevJobs, [jobId]: { ...oldJob, ...nextUpdatesStale } };
        }
        return null;
    }

    // Segment field rules
    applySegmentFieldRules(nextUpdates, oldJob, sourceTopic);

    const excludeSegmentFields = sourceTopic !== 'segments.progress';
    copyRenderGroupFields(nextUpdates, updates as Record<string, any>, excludeSegmentFields);

    const incomingStatus = typeof nextUpdates.status === 'string' ? nextUpdates.status : undefined;
    const currentStatus = typeof oldJob.status === 'string' ? oldJob.status : undefined;

    const isNewerRun = detectNewerRun(oldJob, updates, incomingStatus);

    // Status regression protection
    if (incomingStatus && currentStatus) {
        const incomingPriority = STATUS_PRIORITY[incomingStatus] ?? 0;
        const currentPriority = STATUS_PRIORITY[currentStatus] ?? 0;

        if (!isNewerRun) {
            if (currentPriority >= 5 && incomingPriority < currentPriority) {
                if (nextUpdates.active_segment_id !== undefined || nextUpdates.active_segment_progress !== undefined) {
                    delete nextUpdates.status;
                    delete nextUpdates.progress;
                } else {
                    return null;
                }
            } else if (incomingPriority < currentPriority) {
                delete nextUpdates.status;
            }
        }
    }

    // Progress regression guard
    if (typeof nextUpdates.progress === 'number') {
        const currentProgress = typeof oldJob.progress === 'number' ? oldJob.progress : 0;
        const effectiveStatus = (nextUpdates.status as string | undefined) ?? currentStatus;
        if (!isNewerRun && !['queued', 'preparing'].includes(effectiveStatus || '') && nextUpdates.progress < currentProgress) {
            delete nextUpdates.progress;
        }
    }

    // started_at guard
    const effectiveStatus = (nextUpdates.status as string | undefined) ?? currentStatus;
    if (
        !isNewerRun &&
        typeof oldJob.started_at === 'number'
        && typeof nextUpdates.started_at === 'number'
        && ['running', 'processing', 'finalizing', 'done'].includes(effectiveStatus || '')
        && nextUpdates.started_at !== oldJob.started_at
    ) {
        delete nextUpdates.started_at;
    }

    // ETA epsilon guard
    if (
        typeof oldJob.eta_seconds === 'number'
        && typeof nextUpdates.eta_seconds === 'number'
        && ['running', 'processing', 'finalizing'].includes(effectiveStatus || '')
    ) {
        if (Math.abs(nextUpdates.eta_seconds - oldJob.eta_seconds) < 1) {
            delete nextUpdates.eta_seconds;
        }
    }

    const newJob = { ...oldJob, ...nextUpdates };
    return { ...prevJobs, [jobId]: newJob };
}
