import type { Job } from '../types';

const STATUS_RANK: Record<string, number> = {
  running: 5,
  finalizing: 4,
  preparing: 3,
  queued: 2,
  done: 1,
  failed: 0,
  cancelled: 0,
  error: 0,
};

export function pickRelevantJob(candidates: Job[], includeDone = false): Job | undefined {
  return [...candidates]
    .filter(job => includeDone || ['queued', 'preparing', 'running', 'finalizing'].includes(job.status))
    .sort((a, b) => {
      const aRank = STATUS_RANK[a.status] ?? 0;
      const bRank = STATUS_RANK[b.status] ?? 0;
      if (aRank !== bRank) return bRank - aRank;

      if (a.status === 'queued' && b.status === 'queued') {
        const aCreated = a.created_at ?? 0;
        const bCreated = b.created_at ?? 0;
        if (aCreated !== bCreated) return aCreated - bCreated;
      }

      const aActivity = a.started_at ?? a.finished_at ?? a.created_at ?? 0;
      const bActivity = b.started_at ?? b.finished_at ?? b.created_at ?? 0;
      if (aActivity !== bActivity) return bActivity - aActivity;

      const aCreated = a.created_at ?? 0;
      const bCreated = b.created_at ?? 0;
      return bCreated - aCreated;
    })[0];
}
