/**
 * Pure provenance-vs-direct field selection for segment progress.
 * Extracted from ChapterHeader.tsx / useChapterStatus.
 * No React imports.
 */

import type { Job } from '@/types';
import { hasSegmentProgressCapability } from '@/utils/jobSelection';

const clamp01 = (val: number) => Math.max(0, Math.min(val, 1));

const getSegmentProvenanceFields = (job?: Job): Record<string, any> | null => {
    const provenance = (job as any)?.segmentProgressSocketProvenance;
    return provenance?.selectedFields ?? null;
};

export interface SegmentProgressFields {
    hasSegmentSupport: boolean;
    selectedActiveSegmentId: string | null;
    selectedActiveSegmentProgress: number | null;
    hasActiveSegment: boolean;
    liveSegmentProgressValue: number;
    selectedSegmentEtaSeconds: number | null;
    selectedSegmentEtaBasis: string | null;
    selectedSegmentUpdatedAt: number | null;
    selectedSegmentStartedAt: number | null;
    selectedSegmentReasonCode: string | undefined;
    liveSegmentProgressJob: Job | undefined;
}

/**
 * Given a candidate live job, resolves segment progress fields by preferring
 * direct job fields over provenance/socket-overlay fields.
 */
export function selectSegmentProgressFields(
    liveSegmentProgressJobCandidate: Job | undefined
): SegmentProgressFields {
    const hasSegmentSupport = liveSegmentProgressJobCandidate
        ? hasSegmentProgressCapability(liveSegmentProgressJobCandidate)
        : false;

    const segmentProvenanceFields = getSegmentProvenanceFields(liveSegmentProgressJobCandidate);

    const directActiveSegmentId = typeof liveSegmentProgressJobCandidate?.active_segment_id === 'string'
        && liveSegmentProgressJobCandidate.active_segment_id.length > 0
        ? liveSegmentProgressJobCandidate.active_segment_id
        : null;
    const provenanceActiveSegmentId = typeof segmentProvenanceFields?.activeSegmentId === 'string'
        && segmentProvenanceFields.activeSegmentId.length > 0
        ? segmentProvenanceFields.activeSegmentId
        : null;
    const selectedActiveSegmentId = directActiveSegmentId ?? provenanceActiveSegmentId;

    const directActiveSegmentProgress = directActiveSegmentId
        && typeof liveSegmentProgressJobCandidate?.active_segment_progress === 'number'
        ? clamp01(liveSegmentProgressJobCandidate.active_segment_progress)
        : null;
    const provenanceActiveSegmentProgress = typeof segmentProvenanceFields?.activeSegmentProgress === 'number'
        ? clamp01(segmentProvenanceFields.activeSegmentProgress)
        : null;
    const selectedActiveSegmentProgress = directActiveSegmentProgress ?? provenanceActiveSegmentProgress;

    const hasActiveSegment = hasSegmentSupport
        && !!selectedActiveSegmentId
        && typeof selectedActiveSegmentProgress === 'number';

    const liveSegmentProgressValue = hasActiveSegment ? selectedActiveSegmentProgress! : 0;

    const selectedSegmentEtaSeconds = directActiveSegmentId
        && typeof liveSegmentProgressJobCandidate?.active_segment_eta_seconds === 'number'
        ? liveSegmentProgressJobCandidate.active_segment_eta_seconds
        : (typeof segmentProvenanceFields?.etaSeconds === 'number' ? segmentProvenanceFields.etaSeconds : null);

    const selectedSegmentEtaBasis = directActiveSegmentId
        && typeof liveSegmentProgressJobCandidate?.active_segment_eta_basis === 'string'
        ? liveSegmentProgressJobCandidate.active_segment_eta_basis
        : (typeof segmentProvenanceFields?.eta_basis === 'string' ? segmentProvenanceFields.eta_basis : null);

    const selectedSegmentUpdatedAt = directActiveSegmentId
        && typeof liveSegmentProgressJobCandidate?.active_segment_updated_at === 'number'
        ? liveSegmentProgressJobCandidate.active_segment_updated_at
        : (typeof segmentProvenanceFields?.updatedAt === 'number' ? segmentProvenanceFields.updatedAt : null);

    const selectedSegmentStartedAt = typeof segmentProvenanceFields?.started_at === 'number'
        ? segmentProvenanceFields.started_at
        : null;

    const selectedSegmentReasonCode = typeof segmentProvenanceFields?.reasonCode === 'string'
        ? segmentProvenanceFields.reasonCode
        : liveSegmentProgressJobCandidate?.reason_code;

    const liveSegmentProgressJob = hasActiveSegment && liveSegmentProgressJobCandidate
        ? {
            ...liveSegmentProgressJobCandidate,
            active_segment_id: selectedActiveSegmentId,
            active_segment_progress: selectedActiveSegmentProgress,
            active_segment_eta_seconds: selectedSegmentEtaSeconds,
            active_segment_eta_basis: selectedSegmentEtaBasis,
            active_segment_updated_at: selectedSegmentUpdatedAt,
        } as Job
        : undefined;

    return {
        hasSegmentSupport,
        selectedActiveSegmentId,
        selectedActiveSegmentProgress,
        hasActiveSegment,
        liveSegmentProgressValue,
        selectedSegmentEtaSeconds,
        selectedSegmentEtaBasis,
        selectedSegmentUpdatedAt,
        selectedSegmentStartedAt,
        selectedSegmentReasonCode,
        liveSegmentProgressJob,
    };
}
