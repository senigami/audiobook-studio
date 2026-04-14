import { useState, useEffect, useCallback, useRef } from 'react';
import type { Job, SegmentProgress } from '../types';
import { api } from '../api';
import { useWebSocket } from './useWebSocket';
import { isStudioJobEvent } from '../api/contracts/events';

const STATUS_PRIORITY: Record<string, number> = {
  done: 5,
  failed: 5,
  cancelled: 5,
  finalizing: 4,
  running: 3,
  preparing: 2,
  queued: 1,
};

export const useJobs = (onJobComplete?: () => void, onQueueUpdate?: () => void, onPauseUpdate?: (paused: boolean) => void, onSegmentsUpdate?: (chapterId: string) => void, onChapterUpdate?: (chapterId: string) => void) => {
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [segmentProgress, setSegmentProgress] = useState<Record<string, SegmentProgress>>({});
  const [loading, setLoading] = useState(true);
  const prevJobsRef = useRef<Record<string, Job>>({});

  const refreshJobs = useCallback(async () => {
    try {
      const data = await api.fetchJobs();
      const jobMap = data.reduce((acc, job) => {
        acc[job.id] = job;
        return acc;
      }, {} as Record<string, Job>);

      setJobs(jobMap);
    } catch (e) {
      console.error('Failed to refresh jobs', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const [testProgress, setTestProgress] = useState<Record<string, { progress: number; started_at?: number }>>({});

  const handleUpdate = useCallback((data: any) => {
    if (data.type === 'studio_job_event' || isStudioJobEvent(data)) {
      const job_id = data.job_id;
      const nextUpdates: Record<string, any> = {
        status: data.status,
        progress: data.progress,
        eta_seconds: data.eta_seconds,
        started_at: data.started_at,
      };
      if (data.message) {
        nextUpdates.log = data.message;
      }
      if (data.reason_code) {
        nextUpdates.reason_code = data.reason_code;
      }
      if (data.active_render_batch_id) {
        nextUpdates.active_render_batch_id = data.active_render_batch_id;
      }
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
    } else if (data.type === 'job_updated') {
      const { job_id, updates } = data;
      setJobs(prev => {
        const oldJob = prev[job_id];
        if (!oldJob) {
          // Bootstrap unknown jobs directly from the websocket payload instead of
          // falling back to /api/jobs. Queue creation broadcasts include the
          // chapter/project context we need for UI wiring.
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
        const incomingStatus = typeof nextUpdates.status === 'string' ? nextUpdates.status : undefined;
        const currentStatus = typeof oldJob.status === 'string' ? oldJob.status : undefined;
        if (incomingStatus && currentStatus) {
          const incomingPriority = STATUS_PRIORITY[incomingStatus] ?? 0;
          const currentPriority = STATUS_PRIORITY[currentStatus] ?? 0;
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
    } else if (data.type === 'queue_updated') {
        if (onQueueUpdate) onQueueUpdate();
    } else if (data.type === 'pause_updated') {
        if (onPauseUpdate) onPauseUpdate(data.paused);
    } else if (data.type === 'test_progress') {
      const { name, progress, started_at } = data;
      setTestProgress(prev => ({ ...prev, [name]: { progress, started_at } }));
    } else if (data.type === 'segment_progress') {
      const next: SegmentProgress = {
        job_id: data.job_id,
        chapter_id: data.chapter_id,
        segment_id: data.segment_id,
        progress: data.progress,
      };
      setSegmentProgress(prev => ({ ...prev, [next.segment_id]: next }));
    } else if (data.type === 'segments_updated') {
      if (onSegmentsUpdate) onSegmentsUpdate(data.chapter_id);
    } else if (data.type === 'chapter_updated') {
      if (onChapterUpdate) onChapterUpdate(data.chapter_id);
    }
  }, [onQueueUpdate, onPauseUpdate, onSegmentsUpdate, onChapterUpdate]);

  const { connected } = useWebSocket('/ws', handleUpdate);

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
