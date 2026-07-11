import { useState, useEffect, useCallback, useRef } from 'react';
import type { Job, SegmentProgress } from '@/types';
import { recordWebsocketDebugMessage } from '@/utils/runtimeDebug';
import {
  recordLiveEventSubscriberObservation,
  getLiveEventAuditRecordByFrameId,
} from '@/store/liveEventAuditStore';
import {
  sendStudioSocketMessage,
  subscribeStudioSocketMessages,
} from '@/store/studioSocketBus';
import { useStudioSocketConnection } from '@/hooks/useStudioSocketConnection';
import {
  adaptEventToJobUpdates,
} from '@/utils/jobEventAdapters';
import { applyTerminalLifecycleReset } from '@/utils/jobEventUtils';
import { applyJobUpdated } from '@/utils/jobUpdateReducer';
import { buildSegmentsProgressProjection } from '@/utils/segmentsProgressProjector';

const globalSegmentProgressUpdates: any[] = [];
let nextSequenceNumber = 1;

export const resetGlobalSegmentProgressUpdates = () => {
  globalSegmentProgressUpdates.length = 0;
  nextSequenceNumber = 1;
};

export const useJobs = (onJobComplete?: () => void, onQueueUpdate?: () => void, onPauseUpdate?: (paused: boolean) => void, onSegmentsUpdate?: (chapterId: string) => void, onChapterUpdate?: (chapterId: string) => void) => {
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [segmentProgress, setSegmentProgress] = useState<Record<string, SegmentProgress>>({});
  const [loading, setLoading] = useState(true);
  const prevJobsRef = useRef<Record<string, Job>>({});
  // liveJobsRef is kept in sync inside setJobs functional updaters so overlay-only
  // guards always see the latest committed state, even before React flushes.
  const liveJobsRef = useRef<Record<string, Job>>({});
  const connected = useStudioSocketConnection();

  // Keep callbacks in a ref so the subscribe effect below doesn't need them as deps.
  // This prevents the subscription from tearing down and re-creating on every render
  // when callers pass inline functions.
  const callbacksRef = useRef({ onJobComplete, onQueueUpdate, onPauseUpdate, onSegmentsUpdate, onChapterUpdate });
  useEffect(() => {
    callbacksRef.current = { onJobComplete, onQueueUpdate, onPauseUpdate, onSegmentsUpdate, onChapterUpdate };
  });

  const refreshJobs = useCallback(() => {
    if (connected) {
      sendStudioSocketMessage({ type: 'jobs_snapshot_request' });
    }
  }, [connected]);

  const [testProgress, setTestProgress] = useState<Record<string, { progress: number; started_at?: number }>>({});

  const applyJobUpdatedEvent = useCallback((data: any) => {
    const { job_id } = data;
    let { updates } = data;

    // Stamp the module-level sequence number before the pure reducer runs
    // (sequence is side-effectful and belongs at the hook boundary, not in the pure function).
    if (updates.segmentProgressSocketProvenance) {
      const prov = updates.segmentProgressSocketProvenance;
      const entry = {
        sequence: nextSequenceNumber++,
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
        // Carry the model-load signal (indeterminate + elapsed) through to the
        // segment progress history so the LOADING_MODEL window is represented.
        indeterminate: prov.selectedFields?.indeterminate ?? null,
        loadingElapsedSeconds: prov.selectedFields?.loadingElapsedSeconds ?? null,
      };
      globalSegmentProgressUpdates.push(entry);
      if (globalSegmentProgressUpdates.length > 20) globalSegmentProgressUpdates.shift();
      updates = { ...updates, segmentProgressSocketProvenance: { ...prov, _sequencedEntry: entry } };
    }

    setJobs(prev => {
      const next = applyJobUpdated(prev, job_id, updates, { overlayOnly: data._overlayOnly });
      if (next === null) return prev;
      liveJobsRef.current = next;
      return next;
    });
  }, []);

  // Snapshot/control frames (jobs_snapshot) are not domain live events, so they ride the raw bus
  // rather than the topic router. Everything else dispatches by topic below.
  useEffect(() => {
    return subscribeStudioSocketMessages((data) => {
      if (data?.type !== 'jobs_snapshot') return;
      const jobMap = (data.jobs || []).reduce((acc: Record<string, Job>, job: Job) => {
        acc[job.id] = job;
        return acc;
      }, {} as Record<string, Job>);
      liveJobsRef.current = jobMap;
      setJobs(jobMap);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    return subscribeStudioSocketMessages((data, raw, envelope) => {
      const record = getLiveEventAuditRecordByFrameId(envelope?.frameId);
      if (!record) return;

      const event = record.event;
      const payload = event.payload as any;

      switch (event.topic) {
        case 'tts.logs':
          recordWebsocketDebugMessage('useJobs', data, raw, envelope);
          break;

        case 'jobs.lifecycle': {
          recordWebsocketDebugMessage('useJobs', data, raw, envelope);
          recordLiveEventSubscriberObservation(envelope?.frameId, 'main-queue', 'handled');
          const lifecycleUpdates = adaptEventToJobUpdates(event);
          applyTerminalLifecycleReset(lifecycleUpdates, lifecycleUpdates.status);
          if (event.jobId) {
            applyJobUpdatedEvent({
              job_id: event.jobId,
              updates: lifecycleUpdates,
            });
          }
          const reasonCode = payload.reasonCode ?? payload.reason_code;
          if (reasonCode === 'QUEUE_INVALIDATED') {
            refreshJobs();
            if (callbacksRef.current.onQueueUpdate) callbacksRef.current.onQueueUpdate();
          }
          break;
        }

        case 'queue.items': {
          recordWebsocketDebugMessage('useJobs', data, raw, envelope);
          if (event.eventKind === 'queue_item_invalidated') {
            refreshJobs();
            if (onQueueUpdate) onQueueUpdate();
          } else {
            recordLiveEventSubscriberObservation(envelope?.frameId, 'main-queue', 'handled');
            if (event.eventKind === 'queue_paused') {
              if (callbacksRef.current.onPauseUpdate) callbacksRef.current.onPauseUpdate(payload.paused ?? data.paused);
            } else if (event.jobId) {
              applyJobUpdatedEvent({
                job_id: event.jobId,
                updates: adaptEventToJobUpdates(event),
              });
            }
          }
          break;
        }

        case 'chapters.progress': {
          recordWebsocketDebugMessage('useJobs', data, raw, envelope);
          recordLiveEventSubscriberObservation(envelope?.frameId, 'main-queue', 'handled');
          recordLiveEventSubscriberObservation(envelope?.frameId, 'chapter-state', 'handled');
          if (event.jobId) {
            // chapters.progress is overlay-only: must not create a new row or change
            // status/classification. Use liveJobsRef for an always-current existence check.
            if (liveJobsRef.current[event.jobId]) {
              applyJobUpdatedEvent({
                job_id: event.jobId,
                updates: adaptEventToJobUpdates(event),
                _overlayOnly: true,
              });
            }
          }
          break;
        }

        case 'chapters.lifecycle': {
          recordWebsocketDebugMessage('useJobs', data, raw, envelope);
          recordLiveEventSubscriberObservation(envelope?.frameId, 'main-queue', 'handled');
          recordLiveEventSubscriberObservation(envelope?.frameId, 'chapter-state', 'handled');
          const chapterId = event.chapterId || data.chapter_id;
          if (callbacksRef.current.onChapterUpdate && chapterId) callbacksRef.current.onChapterUpdate(chapterId);
          break;
        }

        case 'segments.progress': {
          recordWebsocketDebugMessage('useJobs', data, raw, envelope);
          recordLiveEventSubscriberObservation(envelope?.frameId, 'segment-state', 'handled');

          const { projectedUpdates, trace } = buildSegmentsProgressProjection(event, payload, envelope, raw);
          const segmentProg = projectedUpdates.active_segment_progress;

          if (event.segmentId) {
            const next: SegmentProgress = {
              job_id: event.jobId || '',
              chapter_id: event.chapterId || '',
              segment_id: event.segmentId,
              progress: segmentProg,
              // Escaped defect fix (2026-07-05): captured so useStudioChapter.ts
              // can build a usable active-segments fallback from data that was
              // already flowing here and being discarded.
              eta_seconds: projectedUpdates.active_segment_eta_seconds ?? null,
              status: projectedUpdates.status,
              updated_at: projectedUpdates.updated_at,
            };
            setSegmentProgress(prev => ({ ...prev, [next.segment_id]: next }));
          }
          if (event.jobId && liveJobsRef.current[event.jobId]) {
            recordLiveEventSubscriberObservation(envelope?.frameId, 'chapter-state', 'handled');

            projectedUpdates.segmentProgressSocketProvenance = trace;

            // Remove undefined keys so we don't clear existing job keys unless intended
            Object.keys(projectedUpdates).forEach(key => {
              if (projectedUpdates[key] === undefined) {
                delete projectedUpdates[key];
              }
            });

            applyJobUpdatedEvent({
              job_id: event.jobId,
              updates: projectedUpdates,
            });
          }
          break;
        }

        case 'segments.lifecycle': {
          recordWebsocketDebugMessage('useJobs', data, raw, envelope);
          recordLiveEventSubscriberObservation(envelope?.frameId, 'segment-state', 'handled');
          const chapterId = event.chapterId || data.chapter_id;
          if (callbacksRef.current.onSegmentsUpdate && chapterId) callbacksRef.current.onSegmentsUpdate(chapterId);
          break;
        }

        case 'voice.test': {
          recordWebsocketDebugMessage('useJobs', data, raw, envelope);
          recordLiveEventSubscriberObservation(envelope?.frameId, 'main-queue', 'handled');
          recordLiveEventSubscriberObservation(envelope?.frameId, 'voice-test-state', 'handled');
          const nameVal = payload.voiceName || data.name || '';
          const progVal = typeof payload.progress === 'number' ? payload.progress : (data.progress ?? 0);
          const startedVal = payload.startedAt || data.started_at || 0;
          if (nameVal) {
            setTestProgress(prev => ({ ...prev, [nameVal]: { progress: progVal, started_at: startedVal } }));
          }
          if (event.jobId) {
            // voice.test is overlay-only: must not create a new row or change
            // status/classification. Use liveJobsRef for an always-current existence check.
            if (liveJobsRef.current[event.jobId]) {
              const voiceUpdates = adaptEventToJobUpdates(event);
              // Do not allow voice.test to reclassify or change lifecycle status
              delete voiceUpdates.status;
              delete voiceUpdates.classification;
              applyJobUpdatedEvent({
                job_id: event.jobId,
                updates: voiceUpdates,
              });
            }
          }
          break;
        }
      }
    });
  }, [applyJobUpdatedEvent, refreshJobs]);


  // Monitor jobs for completions to trigger global data refresh
  useEffect(() => {
    const hasNewCompletion = Object.values(jobs).some(j => {
      // Find this job in a ref of previous jobs to see if it just finished
      const wasDone = prevJobsRef.current[j.id]?.status === 'done';
      return !wasDone && j.status === 'done';
    });

    if (hasNewCompletion) {
      callbacksRef.current.onJobComplete?.();
    }
    prevJobsRef.current = jobs;
  }, [jobs]);

  // Snapshot hydration is event-driven only: once on (re)connect, plus explicit
  // refreshJobs() calls on queue-invalidation events. No periodic polling — the
  // live event stream is the source of truth between snapshots.
  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  return { jobs, loading, refreshJobs, testProgress, segmentProgress, segmentProgressUpdates: globalSegmentProgressUpdates };
};
