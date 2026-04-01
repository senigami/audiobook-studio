import type { Engine, Job } from '../types';

type SegmentScopedShape = {
  segment_ids?: string[];
  active_segment_id?: string | null;
  custom_title?: string | null;
};

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

export function isSegmentScopedJob(job: SegmentScopedShape): boolean {
  if ((job.segment_ids?.length ?? 0) > 0) return true;
  if (job.active_segment_id) return true;
  return /segment\s*#/i.test(job.custom_title || '');
}

export function shouldShowIndeterminateProgress(job: SegmentScopedShape & { engine?: Engine }): boolean {
  if (job.engine === 'voxtral') return true;
  if (job.engine !== 'mixed') return false;
  return !isSegmentScopedJob(job);
}

export function isChapterScopedJob(job: Job): boolean {
  return !isSegmentScopedJob(job);
}

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
