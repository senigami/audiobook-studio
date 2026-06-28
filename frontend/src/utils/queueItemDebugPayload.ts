/**
 * Pure debug payload builder extracted from QueueItem.tsx.
 * Takes all the derived values as plain data; returns a JSON-serialisable payload object.
 * The component keeps the clipboard call + recordStudioDebugSnapshot side-effect.
 */

import type { ProcessingQueueItem, Job } from '@/types';
import type { EtaSource } from './queueItemEtaSelection';
import { getLiveEventAuditSnapshot } from '@/store/liveEventAuditStore';
import type { TtsLogLiveEvent } from '@/api/contracts/liveEvents';

export interface QueueItemDebugInputs {
    job: ProcessingQueueItem;
    liveJob: Job | undefined;
    displayStatus: string;
    progress: number;
    jobProgress: number;
    activeSegmentProgress: number | undefined;
    rawStarted: number | null | undefined;
    stableStarted: number | null | undefined;
    started: number | null | undefined;
    rawEtaSeconds: number | null | undefined;
    stableEta: number | null | undefined;
    derivedEtaSeconds: number | undefined;
    derivedEtaBasis: 'remaining_from_update' | 'total_from_start' | null | undefined;
    etaBasis: 'remaining_from_update' | 'total_from_start' | null | undefined;
    updatedAt: number | null | undefined;
    derivedUpdatedAt: number | undefined;
    estimatedEndAt: number | undefined;
    derivedEstimatedEndAt: number | undefined;
    activeSegmentId: string | null | undefined;
    stableUpdatedAt: number | null | undefined;
    stableEtaBasis: 'remaining_from_update' | 'total_from_start' | null | undefined;
    etaSource: EtaSource;
    etaSourcePath: string;
    etaSourceReason: string;
    etaSelectionDebug: Record<string, unknown>;
    selectedEvidenceWeightFraction: number;
    lastActiveDiagnosticsRef: React.RefObject<any>;
    latestSnapshotRef: React.RefObject<any>;
}

export function buildQueueItemDebugPayload(inputs: QueueItemDebugInputs): Record<string, unknown> {
    const {
        job, liveJob, displayStatus, progress, jobProgress, activeSegmentProgress,
        rawStarted, stableStarted, started, rawEtaSeconds, stableEta, derivedEtaSeconds,
        derivedEtaBasis, etaBasis, updatedAt, derivedUpdatedAt, estimatedEndAt,
        derivedEstimatedEndAt, activeSegmentId, stableUpdatedAt, stableEtaBasis,
        etaSource, etaSourcePath, etaSourceReason, etaSelectionDebug,
        selectedEvidenceWeightFraction, lastActiveDiagnosticsRef, latestSnapshotRef,
    } = inputs;

    const isActiveNow = ['running', 'processing', 'finalizing'].includes(displayStatus);
    const lastActive = lastActiveDiagnosticsRef.current || {};

    return {
        job,
        liveJob,
        displayStatus,
        selectedProgress: isActiveNow ? progress : (lastActive.progress ?? progress),
        jobProgress,
        activeSegmentProgress,
        rawStarted,
        stableStarted: isActiveNow ? stableStarted : (lastActive.stableStarted ?? stableStarted),
        startedPassedToProgressBar: isActiveNow ? started : (lastActive.startedPassedToProgressBar ?? started),
        jobEtaSeconds: job.eta_seconds,
        liveJobEtaSeconds: liveJob?.eta_seconds,
        selectedRawEtaSeconds: isActiveNow ? rawEtaSeconds : (lastActive.selectedRawEtaSeconds ?? rawEtaSeconds),
        stableEta: (isActiveNow && typeof stableEta === 'number' && stableEta > 0) ? stableEta : (lastActive.stableEta ?? stableEta),
        etaSecondsPassedToProgressBar: (isActiveNow && typeof derivedEtaSeconds === 'number' && derivedEtaSeconds > 0) ? derivedEtaSeconds : (lastActive.etaSecondsPassedToProgressBar ?? derivedEtaSeconds),
        jobEtaBasis: job.eta_basis,
        liveJobEtaBasis: liveJob?.eta_basis,
        jobEtaUpdatedAt: job.eta_updated_at,
        liveJobEtaUpdatedAt: liveJob?.eta_updated_at,
        etaUpdatedAt: updatedAt,
        etaSource,
        selectedEtaBasis: isActiveNow ? (derivedEtaBasis ?? etaBasis) : (lastActive.selectedEtaBasis ?? (derivedEtaBasis ?? etaBasis)),
        updatedAt: isActiveNow ? derivedUpdatedAt : (lastActive.updatedAt ?? derivedUpdatedAt),
        derivedUpdatedAt: isActiveNow ? derivedUpdatedAt : (lastActive.derivedUpdatedAt ?? derivedUpdatedAt),
        estimatedEndAt,
        derivedEstimatedEndAt: isActiveNow ? derivedEstimatedEndAt : (lastActive.derivedEstimatedEndAt ?? derivedEstimatedEndAt),
        derivedEtaSeconds: (isActiveNow && typeof derivedEtaSeconds === 'number' && derivedEtaSeconds > 0) ? derivedEtaSeconds : (lastActive.derivedEtaSeconds ?? derivedEtaSeconds),
        stableUpdatedAt: isActiveNow ? stableUpdatedAt : (lastActive.stableUpdatedAt ?? stableUpdatedAt),
        stableEtaBasis: isActiveNow ? stableEtaBasis : (lastActive.stableEtaBasis ?? stableEtaBasis),
        etaSourcePath: isActiveNow ? etaSourcePath : (lastActive.etaSourcePath ?? etaSourcePath),
        etaSourceReason: isActiveNow ? etaSourceReason : (lastActive.etaSourceReason ?? etaSourceReason),
        etaSelectionDebug,
        lastActiveEtaSelectionDebug: lastActive.etaSelectionDebug,
        persistenceKey: activeSegmentId ? `${job.id}:${activeSegmentId}` : job.id,
        checkpointMode: (job.segment_ids?.length || liveJob?.segment_ids?.length || activeSegmentId)
            ? 'segment'
            : (job.render_group_count || liveJob?.render_group_count)
            ? 'queue'
            : 'default',
        confidence: selectedEvidenceWeightFraction,
        evidenceWeightFraction: selectedEvidenceWeightFraction,
        transitionTickCount: (job.segment_ids?.length || liveJob?.segment_ids?.length || activeSegmentId)
            ? 3
            : (job.render_group_count || liveJob?.render_group_count)
            ? 12
            : 8,
        tickMs: 250,
        latestProgressBarSnapshot: latestSnapshotRef.current,
        recentAuditFrames: getLiveEventAuditSnapshot()
            .filter(record => record.event.jobId === job.id && (
                record.event.topic === 'jobs.lifecycle'
                || record.event.topic === 'queue.items'
                || record.event.topic === 'chapters.progress'
            ))
            .map(record => {
                const ev = record.event;
                const p = ev.payload as any;
                return {
                    frameId: ev.frameId,
                    receivedAt: ev.receivedAt,
                    eventKind: ev.eventKind,
                    payload: {
                        status: p?.status,
                        progress: p?.progress,
                        etaSeconds: p?.etaSeconds,
                        etaUpdatedAt: p?.etaUpdatedAt,
                        etaBasis: p?.etaBasis,
                        startedAt: p?.startedAt,
                        updatedAt: p?.updatedAt,
                        estimatedEndAt: p?.estimatedEndAt,
                        confidence: p?.confidence,
                    },
                    reasonCode: p?.reasonCode,
                    source: ev.source,
                };
            }),
        // W-MIX-LA-DIAG: last 80 tts.logs lines received over the socket for this job.
        // Shape: { line, receivedAt, jobId, sequenceNumber }
        // Decisive signal: shows whether XTTS load lines and [MODEL_LOAD_STARTED]
        // actually arrive from the TTS server before reaching the frontend.
        ttsLogLines: getLiveEventAuditSnapshot()
            .filter(record => record.event.topic === 'tts.logs' && (
                !record.event.jobId || record.event.jobId === job.id
            ))
            .slice(-80)
            .map(record => {
                const ev = record.event as TtsLogLiveEvent;
                return {
                    frameId: ev.frameId,
                    receivedAt: ev.receivedAt,
                    jobId: ev.jobId ?? ev.payload.jobId ?? null,
                    line: ev.payload.line,
                    sequence: ev.payload.sequence ?? null,
                    pluginShortName: ev.payload.pluginShortName ?? null,
                };
            }),
    };
}
