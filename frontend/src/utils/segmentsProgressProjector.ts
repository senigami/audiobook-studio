/**
 * Pure builders for the segments.progress projected update object and its trace metadata.
 * Extracted from useJobs.ts — no React or hook imports.
 */

import type { StudioSocketEnvelope } from '@/store/studioSocketBus';
import { resolveEventUpdatedAt } from '@/utils/jobEventAdapters';

type LiveEvent = {
    topic: string;
    eventKind?: string | null;
    jobId?: string | null;
    chapterId?: string | null;
    projectId?: string | null;
    segmentId?: string | null;
    frameId?: string | number | null;
    receivedAt?: string | null;
};

function getVal(payload: Record<string, any>, keyCamel: string, keySnake: string): any {
    if (payload[keyCamel] !== undefined) return payload[keyCamel];
    if (payload[keySnake] !== undefined) return payload[keySnake];
    return undefined;
}

export interface SegmentsProgressProjection {
    projectedUpdates: Record<string, any>;
    trace: Record<string, any>;
}

/**
 * Builds the projectedUpdates + trace metadata objects for a segments.progress event.
 * Called with the parsed event, payload, and envelope; returns both objects.
 */
export function buildSegmentsProgressProjection(
    event: LiveEvent,
    payload: Record<string, any>,
    envelope: StudioSocketEnvelope | undefined,
    raw: any
): SegmentsProgressProjection {
    const segmentProg = getVal(payload, 'activeSegmentProgress', 'active_segment_progress') ?? payload.progress;
    const rawStatus = getVal(payload, 'status', 'status');
    const rawReasonCode = getVal(payload, 'reasonCode', 'reason_code');
    // Honor the backend's segment status. Only an explicit pre-confirmation /
    // load window is "preparing": the announce (SEGMENT_PENDING, before engine
    // confirmation) or an indeterminate frame. Do NOT infer "preparing" from
    // progress===0 — the backend now emits a true running 0% start
    // (START_SEGMENT / [PROGRESS] 0% / the START_SYNTHESIS sync frame), and
    // forcing those to "preparing" nulls the predictive ETA (resolveEndAtMs I10
    // guard), so the segment bar + text highlight cannot animate until progress
    // first exceeds 0 — the reported slow start (no animation until the 2nd update).
    const isLoadWindow = rawReasonCode === 'SEGMENT_PENDING'
        || getVal(payload, 'indeterminate', 'indeterminate') === true;
    const projectedStatus = isLoadWindow
        ? 'preparing'
        : (rawStatus && rawStatus !== 'done' && rawStatus !== 'failed' && rawStatus !== 'cancelled')
            ? rawStatus
            : undefined;

    const rawUpdatedAt = getVal(payload, 'updatedAt', 'updated_at');
    const rawStartedAt = getVal(payload, 'startedAt', 'started_at');
    const rawEta = getVal(payload, 'etaSeconds', 'eta_seconds');
    const rawEtaBasis = getVal(payload, 'etaBasis', 'eta_basis');
    const rawHasSegmentSupport = getVal(payload, 'hasSegmentSupport', 'has_segment_support');
    const parsedSegmentEta = rawEta === null || rawEta === undefined
        ? null
        : (typeof rawEta === 'number' ? rawEta : Number(rawEta));
    const segmentEtaSeconds = Number.isFinite(parsedSegmentEta) ? parsedSegmentEta : null;

    const projectedUpdates: Record<string, any> = {
        source_topic: 'segments.progress',
        project_id: event.projectId,
        chapter_id: event.chapterId,
        active_segment_id: event.segmentId || null,
        active_segment_progress: segmentProg ?? null,
        active_segment_eta_seconds: segmentProg != null ? segmentEtaSeconds : null,
        active_segment_eta_basis: segmentProg != null && segmentEtaSeconds != null ? (rawEtaBasis || 'remaining_from_update') : null,
        active_segment_updated_at: segmentProg != null ? resolveEventUpdatedAt(event as any, payload) : null,
        hasSegmentSupport: typeof rawHasSegmentSupport === 'boolean' ? rawHasSegmentSupport : undefined,
        has_segment_support: typeof rawHasSegmentSupport === 'boolean' ? rawHasSegmentSupport : undefined,
        status: projectedStatus,
        reason_code: rawReasonCode,
        indeterminate: getVal(payload, 'indeterminate', 'indeterminate'),
        log: payload.message || payload.log,
        updated_at: resolveEventUpdatedAt(event as any, payload),
        db_updated_at: typeof rawUpdatedAt === 'number' ? rawUpdatedAt : (typeof rawUpdatedAt === 'string' ? Date.parse(rawUpdatedAt) / 1000 : undefined),
        db_started_at: typeof rawStartedAt === 'number' ? rawStartedAt : (typeof rawStartedAt === 'string' ? Date.parse(rawStartedAt) / 1000 : undefined),
    };

    const segmentStartedAt = rawStartedAt !== undefined
        ? (typeof rawStartedAt === 'number'
            ? rawStartedAt
            : (typeof rawStartedAt === 'string' ? Date.parse(rawStartedAt) / 1000 : rawStartedAt))
        : null;

    const trace: Record<string, any> = {
        rawEnvelope: {
            frameId: envelope?.frameId || null,
            receivedAt: envelope?.receivedAt || null,
            topic: event.topic,
            eventKind: event.eventKind,
            projectId: event.projectId,
            chapterId: event.chapterId,
            jobId: event.jobId,
            segmentId: event.segmentId,
            raw: raw || null,
            payload: payload,
        },
        consumedTopic: "segments.progress",
        ignoredTopics: ["tts.logs", "queue.items", "chapters.progress"],
        selectedFields: {
            topic: event.topic,
            eventKind: event.eventKind,
            frameId: envelope?.frameId || null,
            receivedAt: envelope?.receivedAt || null,
            projectId: event.projectId,
            chapterId: event.chapterId,
            jobId: event.jobId,
            segmentId: event.segmentId,
            activeSegmentId: event.segmentId || null,
            activeSegmentProgress: segmentProg ?? null,
            etaSeconds: projectedUpdates.active_segment_eta_seconds !== null && projectedUpdates.active_segment_eta_seconds !== undefined ? projectedUpdates.active_segment_eta_seconds : null,
            eta_basis: projectedUpdates.active_segment_eta_basis || null,
            hasSegmentSupport: projectedUpdates.hasSegmentSupport ?? null,
            started_at: segmentStartedAt,
            status: projectedStatus || null,
            progress: payload.progress ?? null,
            reasonCode: rawReasonCode || null,
            updatedAt: projectedUpdates.updated_at,
        },
        ignoredFields: Object.keys(payload).filter(
            k => ![
                'activeSegmentId', 'active_segment_id',
                'activeSegmentProgress', 'active_segment_progress',
                'etaSeconds', 'eta_seconds',
                'etaBasis', 'eta_basis',
                'startedAt', 'started_at',
                'status',
                'progress',
                'reasonCode', 'reason_code',
                'updatedAt', 'updated_at',
                'confidence',
                'etaUpdatedAt', 'eta_updated_at',
                'segmentIndex', 'segment_index',
                'segmentCount', 'segment_count',
                'message',
                'hasSegmentSupport', 'has_segment_support'
            ].includes(k)
        )
    };

    return { projectedUpdates, trace };
}
