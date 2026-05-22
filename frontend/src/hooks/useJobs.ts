import { useState, useEffect, useCallback, useRef } from 'react';
import type { Job, SegmentProgress } from '@/types';
import { recordWebsocketDebugMessage } from '@/utils/runtimeDebug';
import { recordLiveEventSubscriberObservation } from '@/store/liveEventAuditStore';
import {
  sendStudioSocketMessage,
  subscribeStudioSocketMessages,
} from '@/store/studioSocketBus';
import { subscribeToLiveEventTopics } from '@/store/liveEventTopicRouter';
import { useStudioSocketConnection } from '@/hooks/useStudioSocketConnection';

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

  const applyStudioJobEvent = useCallback((data: any) => {
    const job_id = data.job_id;
    const nextUpdates: Record<string, any> = {
      status: data.status,
      progress: data.progress,
      eta_seconds: data.eta_seconds,
      started_at: data.started_at,
    };
    copyRenderGroupFields(nextUpdates, data);
    if (data.classification) nextUpdates.classification = data.classification;
    if (data.parent_job_id) nextUpdates.parent_job_id = data.parent_job_id;
    if (data.message) nextUpdates.log = data.message;
    if (data.reason_code) nextUpdates.reason_code = data.reason_code;
    if (data.active_render_batch_id) nextUpdates.active_render_batch_id = data.active_render_batch_id;
    if (typeof data.active_render_batch_progress === 'number') {
      nextUpdates.active_render_batch_progress = data.active_render_batch_progress;
    }

    setJobs(prev => {
      const oldJob = prev[job_id];
      if (!oldJob) {
        return { ...prev, [job_id]: { id: job_id, ...nextUpdates } as Job };
      }

      if (
        typeof oldJob.updated_at === 'number'
        && typeof data.updated_at === 'number'
        && data.updated_at < oldJob.updated_at
      ) {
        return prev;
      }

      const normalizedUpdates = { ...nextUpdates };
      if (typeof data.updated_at === 'number') {
        normalizedUpdates.updated_at = data.updated_at;
      }
      const currentStatus = typeof oldJob.status === 'string' ? oldJob.status : undefined;
      const incomingStatus = typeof normalizedUpdates.status === 'string' ? normalizedUpdates.status : undefined;
      if (incomingStatus && currentStatus) {
        const incomingPriority = STATUS_PRIORITY[incomingStatus] ?? 0;
        const currentPriority = STATUS_PRIORITY[currentStatus] ?? 0;
        if (currentPriority >= 5 && incomingPriority < currentPriority) {
          return prev;
        }
        if (incomingPriority < currentPriority) {
          delete normalizedUpdates.status;
        }
      }

      if (typeof normalizedUpdates.progress === 'number') {
        const currentProgress = typeof oldJob.progress === 'number' ? oldJob.progress : 0;
        const effectiveStatus = (normalizedUpdates.status as string | undefined) ?? currentStatus;
        if (!['queued', 'preparing'].includes(effectiveStatus || '') && normalizedUpdates.progress < currentProgress) {
          delete normalizedUpdates.progress;
        }
      }

      const effectiveStatus = (normalizedUpdates.status as string | undefined) ?? currentStatus;
      if (
        typeof oldJob.started_at === 'number'
        && typeof normalizedUpdates.started_at === 'number'
        && ['running', 'processing', 'finalizing', 'done'].includes(effectiveStatus || '')
        && normalizedUpdates.started_at !== oldJob.started_at
      ) {
        delete normalizedUpdates.started_at;
      }

      if (
        typeof oldJob.eta_seconds === 'number'
        && typeof normalizedUpdates.eta_seconds === 'number'
        && ['running', 'processing', 'finalizing'].includes(effectiveStatus || '')
      ) {
        const currentEta = oldJob.eta_seconds;
        const nextEta = normalizedUpdates.eta_seconds;
        if (Math.abs(nextEta - currentEta) < 1) {
          delete normalizedUpdates.eta_seconds;
        }
      }

      const newJob = { ...oldJob, ...normalizedUpdates };
      return { ...prev, [job_id]: newJob };
    });
  }, []);

  const applyJobUpdatedEvent = useCallback((data: any) => {
    const { job_id, updates } = data;
    setJobs(prev => {
      const oldJob = prev[job_id];
      if (!oldJob) {
        return { ...prev, [job_id]: { id: job_id, ...updates } as Job };
      }

      if (
        typeof oldJob.updated_at === 'number'
        && typeof updates?.updated_at === 'number'
        && updates.updated_at < oldJob.updated_at
      ) {
        return prev;
      }

      const nextUpdates = { ...updates } as Record<string, any>;
      copyRenderGroupFields(nextUpdates, updates as Record<string, any>);
      const incomingStatus = typeof nextUpdates.status === 'string' ? nextUpdates.status : undefined;
      const currentStatus = typeof oldJob.status === 'string' ? oldJob.status : undefined;
      if (incomingStatus && currentStatus) {
        const incomingPriority = STATUS_PRIORITY[incomingStatus] ?? 0;
        const currentPriority = STATUS_PRIORITY[currentStatus] ?? 0;
        if (currentPriority >= 5 && incomingPriority < currentPriority) {
          return prev;
        }
        if (incomingPriority < currentPriority) {
          delete nextUpdates.status;
        }
      }

      if (typeof nextUpdates.progress === 'number') {
        const currentProgress = typeof oldJob.progress === 'number' ? oldJob.progress : 0;
        const effectiveStatus = (nextUpdates.status as string | undefined) ?? currentStatus;
        if (!['queued', 'preparing'].includes(effectiveStatus || '') && nextUpdates.progress < currentProgress) {
          delete nextUpdates.progress;
        }
      }

      const effectiveStatus = (nextUpdates.status as string | undefined) ?? currentStatus;
      if (
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

  const applyLegacySegmentProgress = useCallback((data: any) => {
    const next: SegmentProgress = {
      job_id: data.job_id,
      chapter_id: data.chapter_id,
      segment_id: data.segment_id,
      progress: data.progress,
    };
    setSegmentProgress(prev => ({ ...prev, [next.segment_id]: next }));
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
    return subscribeToLiveEventTopics({
      'tts.logs': (_event, { rawData, raw, envelope }) => {
        recordWebsocketDebugMessage('useJobs', rawData, raw, envelope);
      },
      'jobs.progress': (event, { rawData, raw, envelope }) => {
        recordWebsocketDebugMessage('useJobs', rawData, raw, envelope);
        recordLiveEventSubscriberObservation(envelope?.frameId, 'jobs-state', 'handled');
        if (event.rawType === 'studio_job_event') {
          applyStudioJobEvent(rawData);
        } else if (event.rawType === 'job_updated') {
          applyJobUpdatedEvent(rawData);
        } else if (event.rawType === 'segment_progress') {
          applyLegacySegmentProgress(rawData);
        }
      },
      'queue.lifecycle': (event, { rawData, raw, envelope }) => {
        recordWebsocketDebugMessage('useJobs', rawData, raw, envelope);
        recordLiveEventSubscriberObservation(envelope?.frameId, 'jobs-state', 'handled');
        if (event.rawType === 'queue_updated') {
          refreshJobs();
          if (onQueueUpdate) onQueueUpdate();
        } else if (event.rawType === 'pause_updated') {
          if (onPauseUpdate) onPauseUpdate(rawData.paused);
        }
      },
      'chapter.invalidate': (_event, { rawData, raw, envelope }) => {
        recordWebsocketDebugMessage('useJobs', rawData, raw, envelope);
        recordLiveEventSubscriberObservation(envelope?.frameId, 'jobs-state', 'handled');
        if (onChapterUpdate && rawData.chapter_id) onChapterUpdate(rawData.chapter_id);
      },
      'segments.invalidate': (_event, { rawData, raw, envelope }) => {
        recordWebsocketDebugMessage('useJobs', rawData, raw, envelope);
        recordLiveEventSubscriberObservation(envelope?.frameId, 'jobs-state', 'handled');
        if (onSegmentsUpdate && rawData.chapter_id) onSegmentsUpdate(rawData.chapter_id);
      },
      'voice.test': (_event, { rawData, raw, envelope }) => {
        recordWebsocketDebugMessage('useJobs', rawData, raw, envelope);
        recordLiveEventSubscriberObservation(envelope?.frameId, 'jobs-state', 'handled');
        const { name, progress, started_at } = rawData;
        setTestProgress(prev => ({ ...prev, [name]: { progress, started_at } }));
      },
    });
  }, [
    applyStudioJobEvent,
    applyJobUpdatedEvent,
    applyLegacySegmentProgress,
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

  return { jobs, loading, refreshJobs, testProgress, segmentProgress };
};
