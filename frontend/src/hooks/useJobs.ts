import { useState, useEffect, useCallback, useRef } from 'react';
import type { Job } from '../types';
import { api } from '../api';
import { useWebSocket } from './useWebSocket';
import { logVoxtralDebug } from '../utils/debugVoxtral';

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
    if (data.type === 'job_updated') {
      const { job_id, updates } = data;
      if ((updates?.engine === 'voxtral') || ['queued', 'preparing', 'running', 'finalizing', 'done'].includes(updates?.status || '') || (job_id && String(job_id).startsWith('job-'))) {
        logVoxtralDebug('ws-job-updated', { jobId: job_id, updates });
      }
      setJobs(prev => {
        const oldJob = prev[job_id];
        if (!oldJob) {
          // Bootstrap unknown jobs directly from the websocket payload instead of
          // falling back to /api/jobs. Queue creation broadcasts include the
          // chapter/project context we need for UI wiring.
          return { ...prev, [job_id]: { id: job_id, ...updates } as Job };
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

        const newJob = { ...oldJob, ...nextUpdates };
        return { ...prev, [job_id]: newJob };
      });
    } else if (data.type === 'queue_updated') {
        logVoxtralDebug('ws-queue-updated', data);
        if (onQueueUpdate) onQueueUpdate();
    } else if (data.type === 'pause_updated') {
        if (onPauseUpdate) onPauseUpdate(data.paused);
    } else if (data.type === 'test_progress') {
      const { name, progress, started_at } = data;
      setTestProgress(prev => ({ ...prev, [name]: { progress, started_at } }));
    } else if (data.type === 'segments_updated') {
      if (onSegmentsUpdate) onSegmentsUpdate(data.chapter_id);
    } else if (data.type === 'chapter_updated') {
      logVoxtralDebug('ws-chapter-updated', data);
      if (onChapterUpdate) onChapterUpdate(data.chapter_id);
    }
  }, [refreshJobs, onQueueUpdate, onPauseUpdate, onSegmentsUpdate, onChapterUpdate]);

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

  return { jobs, loading, refreshJobs, testProgress };
};
