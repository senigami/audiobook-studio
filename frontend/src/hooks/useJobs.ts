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

const globalSegmentProgressUpdates: any[] = [];
let nextSequenceNumber = 1;

export const resetGlobalSegmentProgressUpdates = () => {
  globalSegmentProgressUpdates.length = 0;
  nextSequenceNumber = 1;
};

const STATUS_PRIORITY: Record<string, number> = {
  done: 5,
  failed: 5,
  cancelled: 5,
  finalizing: 4,
  running: 3,
  preparing: 2,
  queued: 1,
};

const copyRenderGroupFields = (target: Record<string, any>, source: Record<string, any>) => {
  const fields = [
    'render_group_count',
    'completed_render_groups',
    'active_render_group_index',
    'total_render_weight',
    'completed_render_weight',
    'active_render_group_weight',
    'grouped_progress',
    'active_segment_id',
    'active_segment_progress',
  ];
  for (const key of fields) {
    if (source[key] !== undefined) {
      target[key] = source[key];
    }
  }
};

const resolveEventUpdatedAt = (event: any, payload: any): number => {
  if (typeof payload?.updatedAt === 'number') return payload.updatedAt;
  if (typeof payload?.updated_at === 'number') return payload.updated_at;
  if (typeof payload?.updatedAt === 'string') {
    const val = Date.parse(payload.updatedAt) / 1000;
    if (!isNaN(val)) return val;
  }
  if (typeof payload?.updated_at === 'string') {
    const val = Date.parse(payload.updated_at) / 1000;
    if (!isNaN(val)) return val;
  }
  if (typeof event?.emittedAt === 'number') return event.emittedAt;
  if (typeof event?.emitted_at === 'number') return event.emitted_at;
  return Date.now() / 1000;
};

const adaptEventToJobUpdates = (event: any) => {
  const payload = event.payload || {};

  const getVal = (keyCamel: string, keySnake: string) => {
    if (payload[keyCamel] !== undefined) return payload[keyCamel];
    if (payload[keySnake] !== undefined) return payload[keySnake];
    return undefined;
  };

  const rCode = getVal('reasonCode', 'reason_code');
  const shouldOmitMessage = event.topic === 'chapters.progress' && (rCode === 'segment_start' || rCode === 'segment_saved');

  const updates: any = {
    source_topic: event.topic,
    job_id: event.jobId,
    project_id: event.projectId,
    chapter_id: event.chapterId,
    classification: getVal('classification', 'classification'),
    parent_job_id: getVal('parentJobId', 'parent_job_id'),
    segment_ids: getVal('segmentIds', 'segment_ids'),
    engine: getVal('engine', 'engine'),
    status: getVal('status', 'status'),
    progress: getVal('progress', 'progress'),
    eta_seconds: getVal('etaSeconds', 'eta_seconds'),
    started_at: getVal('startedAt', 'started_at'),
    updated_at: resolveEventUpdatedAt(event, payload),
    db_updated_at: typeof (getVal('updatedAt', 'updated_at')) === 'number' ? getVal('updatedAt', 'updated_at') : (typeof (getVal('updatedAt', 'updated_at')) === 'string' ? Date.parse(getVal('updatedAt', 'updated_at') as string) / 1000 : undefined),
    db_started_at: typeof (getVal('startedAt', 'started_at')) === 'number' ? getVal('startedAt', 'started_at') : (typeof (getVal('startedAt', 'started_at')) === 'string' ? Date.parse(getVal('startedAt', 'started_at') as string) / 1000 : undefined),
    estimated_end_at: getVal('estimatedEndAt', 'estimated_end_at'),
    reason_code: rCode,
    render_group_count: getVal('renderGroupCount', 'render_group_count'),
    completed_render_groups: getVal('completedRenderGroups', 'completed_render_groups'),
    active_render_group_index: getVal('activeRenderGroupIndex', 'active_render_group_index'),
    total_render_weight: getVal('totalRenderWeight', 'total_render_weight'),
    completed_render_weight: getVal('completedRenderWeight', 'completed_render_weight'),
    active_render_group_weight: getVal('activeRenderGroupWeight', 'active_render_group_weight'),
    grouped_progress: getVal('groupedProgress', 'grouped_progress'),
    active_segment_id: getVal('activeSegmentId', 'active_segment_id'),
    active_segment_progress: getVal('activeSegmentProgress', 'active_segment_progress'),
    active_segment_eta_seconds: getVal('activeSegmentEtaSeconds', 'active_segment_eta_seconds'),
    active_segment_eta_basis: getVal('activeSegmentEtaBasis', 'active_segment_eta_basis'),
    active_segment_updated_at: getVal('activeSegmentUpdatedAt', 'active_segment_updated_at'),
    active_render_batch_id: getVal('activeRenderBatchId', 'active_render_batch_id'),
    active_render_batch_progress: getVal('activeRenderBatchProgress', 'active_render_batch_progress'),
  };

  if (!shouldOmitMessage) {
    updates.log = payload.message || payload.log;
  }

  return updates;
};

export const useJobs = (onJobComplete?: () => void, onQueueUpdate?: () => void, onPauseUpdate?: (paused: boolean) => void, onSegmentsUpdate?: (chapterId: string) => void, onChapterUpdate?: (chapterId: string) => void) => {
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [segmentProgress, setSegmentProgress] = useState<Record<string, SegmentProgress>>({});
  const [loading, setLoading] = useState(true);
  const prevJobsRef = useRef<Record<string, Job>>({});
  const connected = useStudioSocketConnection();

  const refreshJobs = useCallback(() => {
    if (connected) {
      sendStudioSocketMessage({ type: 'jobs_snapshot_request' });
    }
  }, [connected]);

  const [testProgress, setTestProgress] = useState<Record<string, { progress: number; started_at?: number }>>({});

  const applyJobUpdatedEvent = useCallback((data: any) => {
    const { job_id, updates } = data;
    setJobs(prev => {
      const oldJob = prev[job_id];
      if (!oldJob) {
        return { ...prev, [job_id]: { id: job_id, ...updates } as Job };
      }

      const prov = updates.segmentProgressSocketProvenance;
      const nextUpdates = { ...updates } as Record<string, any>;
      const sourceTopic = typeof nextUpdates.source_topic === 'string' ? nextUpdates.source_topic : undefined;
      delete nextUpdates.source_topic;

      Object.keys(nextUpdates).forEach(key => {
        if (nextUpdates[key] === undefined) {
          delete nextUpdates[key];
        }
      });

      if (prov) {
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
        };

        const oldHistory = (oldJob as any).segmentProgressUpdates || [];
        const newHistory = [entry, ...oldHistory].slice(0, 20);

        globalSegmentProgressUpdates.push(entry);
        if (globalSegmentProgressUpdates.length > 20) {
          globalSegmentProgressUpdates.shift();
        }

        nextUpdates.segmentProgressUpdates = newHistory;
      }

      if (
        typeof oldJob.updated_at === 'number'
        && typeof updates?.updated_at === 'number'
        && updates.updated_at < oldJob.updated_at
      ) {
        if (updates.active_segment_id !== undefined || updates.active_segment_progress !== undefined) {
          const nextUpdatesStale: Record<string, any> = {};
          if (updates.active_segment_id !== undefined) nextUpdatesStale.active_segment_id = updates.active_segment_id;
          if (updates.active_segment_progress !== undefined) nextUpdatesStale.active_segment_progress = updates.active_segment_progress;
          if (updates.project_id !== undefined) nextUpdatesStale.project_id = updates.project_id;
          if (updates.chapter_id !== undefined) nextUpdatesStale.chapter_id = updates.chapter_id;
          if (updates.segmentProgressSocketProvenance !== undefined) nextUpdatesStale.segmentProgressSocketProvenance = updates.segmentProgressSocketProvenance;
          if (nextUpdates.segmentProgressUpdates !== undefined) nextUpdatesStale.segmentProgressUpdates = nextUpdates.segmentProgressUpdates;
          return { ...prev, [job_id]: { ...oldJob, ...nextUpdatesStale } };
        }
        return prev;
      }

      const isNotSegmentProgress = sourceTopic !== 'segments.progress';
      if (isNotSegmentProgress) {
        delete nextUpdates.active_segment_progress;
        delete nextUpdates.active_segment_eta_seconds;
        delete nextUpdates.active_segment_eta_basis;
        delete nextUpdates.active_segment_updated_at;

        if (oldJob.active_segment_id) {
          delete nextUpdates.eta_seconds;
          delete nextUpdates.eta_basis;
          delete nextUpdates.estimated_end_at;
        }
      }

      copyRenderGroupFields(nextUpdates, updates as Record<string, any>);
      const incomingStatus = typeof nextUpdates.status === 'string' ? nextUpdates.status : undefined;
      const currentStatus = typeof oldJob.status === 'string' ? oldJob.status : undefined;

      const dbUpdatedAt = updates.db_updated_at;
      const dbStartedAt = updates.db_started_at;

      const oldUpdatedAt = oldJob.updated_at;
      const oldFinishedAt = oldJob.finished_at;
      const oldStartedAt = oldJob.started_at;

      const hasOldTimestamps = typeof oldUpdatedAt === 'number' || typeof oldFinishedAt === 'number' || typeof oldStartedAt === 'number';
      const hasIncomingDbTimestamps = typeof dbUpdatedAt === 'number' || typeof dbStartedAt === 'number';

      const isRollbackStatus = ['queued', 'preparing', 'running'].includes(incomingStatus || '');

      const isNewerRun = isRollbackStatus && (
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
          (!['done', 'failed', 'cancelled'].includes(currentStatus || '') || hasOldTimestamps) &&
          (typeof updates.updated_at === 'number' && (
            (typeof oldUpdatedAt !== 'number' || updates.updated_at > oldUpdatedAt) &&
            (typeof oldFinishedAt !== 'number' || updates.updated_at > oldFinishedAt)
          ))
        ))
      );

      if (incomingStatus && currentStatus) {
        const incomingPriority = STATUS_PRIORITY[incomingStatus] ?? 0;
        const currentPriority = STATUS_PRIORITY[currentStatus] ?? 0;

        if (!isNewerRun) {
          if (currentPriority >= 5 && incomingPriority < currentPriority) {
            if (nextUpdates.active_segment_id !== undefined || nextUpdates.active_segment_progress !== undefined) {
              delete nextUpdates.status;
              delete nextUpdates.progress;
            } else {
              return prev;
            }
          } else if (incomingPriority < currentPriority) {
            delete nextUpdates.status;
          }
        }
      }

      if (typeof nextUpdates.progress === 'number') {
        const currentProgress = typeof oldJob.progress === 'number' ? oldJob.progress : 0;
        const effectiveStatus = (nextUpdates.status as string | undefined) ?? currentStatus;
        if (!isNewerRun && !['queued', 'preparing'].includes(effectiveStatus || '') && nextUpdates.progress < currentProgress) {
          delete nextUpdates.progress;
        }
      }

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

      if (
        typeof oldJob.eta_seconds === 'number'
        && typeof nextUpdates.eta_seconds === 'number'
        && ['running', 'processing', 'finalizing'].includes(effectiveStatus || '')
      ) {
        const currentEta = oldJob.eta_seconds;
        const nextEta = nextUpdates.eta_seconds;
        if (Math.abs(nextEta - currentEta) < 1) {
          delete nextUpdates.eta_seconds;
        }
      }

      const newJob = { ...oldJob, ...nextUpdates };
      return { ...prev, [job_id]: newJob };
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

        case 'queue.items': {
          recordWebsocketDebugMessage('useJobs', data, raw, envelope);
          if (event.eventKind === 'queue_item_invalidated') {
            refreshJobs();
            if (onQueueUpdate) onQueueUpdate();
          } else {
            recordLiveEventSubscriberObservation(envelope?.frameId, 'main-queue', 'handled');
            if (event.eventKind === 'queue_paused') {
              if (onPauseUpdate) onPauseUpdate(payload.paused ?? data.paused);
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
          recordLiveEventSubscriberObservation(envelope?.frameId, 'chapter-state', 'handled');
          if (event.jobId) {
            applyJobUpdatedEvent({
              job_id: event.jobId,
              updates: adaptEventToJobUpdates(event),
            });
          }
          break;
        }

        case 'chapters.lifecycle': {
          recordWebsocketDebugMessage('useJobs', data, raw, envelope);
          recordLiveEventSubscriberObservation(envelope?.frameId, 'chapter-state', 'handled');
          const chapterId = event.chapterId || data.chapter_id;
          if (onChapterUpdate && chapterId) onChapterUpdate(chapterId);
          break;
        }

        case 'segments.progress': {
          recordWebsocketDebugMessage('useJobs', data, raw, envelope);
          recordLiveEventSubscriberObservation(envelope?.frameId, 'segment-state', 'handled');

          const getVal = (keyCamel: string, keySnake: string) => {
            if (payload[keyCamel] !== undefined) return payload[keyCamel];
            if (payload[keySnake] !== undefined) return payload[keySnake];
            return undefined;
          };

          const segmentProg = getVal('activeSegmentProgress', 'active_segment_progress') ?? payload.progress;

          if (event.segmentId) {
            const next: SegmentProgress = {
              job_id: event.jobId || '',
              chapter_id: event.chapterId || '',
              segment_id: event.segmentId,
              progress: segmentProg,
            };
            setSegmentProgress(prev => ({ ...prev, [next.segment_id]: next }));
          }
          if (event.jobId) {
            recordLiveEventSubscriberObservation(envelope?.frameId, 'chapter-state', 'handled');

            const rawStatus = getVal('status', 'status');
            const projectedStatus = (rawStatus && rawStatus !== 'done' && rawStatus !== 'failed' && rawStatus !== 'cancelled')
              ? rawStatus
              : undefined;

            const rawUpdatedAt = getVal('updatedAt', 'updated_at');
            const rawStartedAt = getVal('startedAt', 'started_at');

            const rawEta = getVal('etaSeconds', 'eta_seconds');
            const rawEtaBasis = getVal('etaBasis', 'eta_basis');
            const rawStarted = getVal('startedAt', 'started_at');

            const projectedUpdates: any = {
              source_topic: 'segments.progress',
              project_id: event.projectId,
              chapter_id: event.chapterId,
              active_segment_id: event.segmentId || null,
              active_segment_progress: segmentProg ?? null,
              active_segment_eta_seconds: segmentProg != null && rawEta !== undefined ? (typeof rawEta === 'number' ? rawEta : Number(rawEta)) : null,
              active_segment_eta_basis: segmentProg != null ? (rawEtaBasis || 'remaining_from_update') : null,
              active_segment_updated_at: segmentProg != null ? resolveEventUpdatedAt(event, payload) : null,
              status: projectedStatus,
              reason_code: getVal('reasonCode', 'reason_code'),
              log: payload.message || payload.log,
              updated_at: resolveEventUpdatedAt(event, payload),
              db_updated_at: typeof rawUpdatedAt === 'number' ? rawUpdatedAt : (typeof rawUpdatedAt === 'string' ? Date.parse(rawUpdatedAt) / 1000 : undefined),
              db_started_at: typeof rawStartedAt === 'number' ? rawStartedAt : (typeof rawStartedAt === 'string' ? Date.parse(rawStartedAt) / 1000 : undefined),
            };

            if (rawEta !== undefined) {
              projectedUpdates.eta_seconds = typeof rawEta === 'number' ? rawEta : Number(rawEta);
              projectedUpdates.eta_basis = rawEtaBasis || 'remaining_from_update';
            } else if (rawEtaBasis !== undefined) {
              projectedUpdates.eta_basis = rawEtaBasis;
            }

            if (rawStarted !== undefined) {
              projectedUpdates.started_at = typeof rawStarted === 'number'
                ? rawStarted
                : (typeof rawStarted === 'string' ? Date.parse(rawStarted) / 1000 : rawStarted);
            }

            const trace = {
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
                etaSeconds: projectedUpdates.eta_seconds !== undefined ? projectedUpdates.eta_seconds : null,
                eta_basis: projectedUpdates.eta_basis || null,
                started_at: projectedUpdates.started_at || null,
                status: projectedStatus || null,
                progress: payload.progress ?? null,
                reasonCode: getVal('reasonCode', 'reason_code') || null,
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
                  'updatedAt', 'updated_at'
                ].includes(k)
              )
            };
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
          if (onSegmentsUpdate && chapterId) onSegmentsUpdate(chapterId);
          break;
        }

        case 'voice.test': {
          recordWebsocketDebugMessage('useJobs', data, raw, envelope);
          recordLiveEventSubscriberObservation(envelope?.frameId, 'voice-test-state', 'handled');
          const nameVal = payload.voiceName || data.name || '';
          const progVal = typeof payload.progress === 'number' ? payload.progress : (data.progress ?? 0);
          const startedVal = payload.startedAt || data.started_at || 0;
          if (nameVal) {
            setTestProgress(prev => ({ ...prev, [nameVal]: { progress: progVal, started_at: startedVal } }));
          }
          break;
        }
      }
    });
  }, [
    applyJobUpdatedEvent,
    refreshJobs,
    onQueueUpdate,
    onPauseUpdate,
    onSegmentsUpdate,
    onChapterUpdate,
  ]);


  // Monitor jobs for completions to trigger global data refresh
  useEffect(() => {
    const hasNewCompletion = Object.values(jobs).some(j => {
      // Find this job in a ref of previous jobs to see if it just finished
      const wasDone = prevJobsRef.current[j.id]?.status === 'done';
      return !wasDone && j.status === 'done';
    });

    if (hasNewCompletion) {
      onJobComplete?.();
    }
    prevJobsRef.current = jobs;
  }, [jobs, onJobComplete]);

  useEffect(() => {
    refreshJobs();
    // Fallback polling: infrequent if WS is up, frequent if down
    const timer = setInterval(refreshJobs, connected ? 60000 : 5000);
    return () => clearInterval(timer);
  }, [refreshJobs, connected]);

  return { jobs, loading, refreshJobs, testProgress, segmentProgress, segmentProgressUpdates: globalSegmentProgressUpdates };
};
