import type { Engine, Job } from '@/types';

type SegmentScopedShape = {
  segment_ids?: string[];
  active_segment_id?: string | null;
  custom_title?: string | null;
  render_group_count?: number;
  parent_job_id?: string | null;
  classification?: 'job' | 'chapter' | 'segment' | null;
  engine?: string | null;
  has_segment_support?: boolean | null;
  hasSegmentSupport?: boolean | null;
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
  if (job.classification === 'segment') return true;
  if (job.classification === 'chapter') return false;
  if (job.engine === 'voice_build') return true;
  if ((job.segment_ids?.length ?? 0) > 0) return true;
  if (job.parent_job_id && job.parent_job_id.startsWith('job-')) return true;
  if ((job.render_group_count ?? 0) > 0) return false;
  return /segment\s*#/i.test(job.custom_title || '');
}

export function hasSegmentProgressCapability(job: SegmentScopedShape): boolean {
  if (typeof job.has_segment_support === 'boolean') return job.has_segment_support;
  if (typeof job.hasSegmentSupport === 'boolean') return job.hasSegmentSupport;
  return isSegmentScopedJob(job);
}

export function isMainQueueSegmentItem(job: SegmentScopedShape): boolean {
  if (job.classification === 'segment') return true;
  if (job.classification === 'chapter') return false;
  if ((job.segment_ids?.length ?? 0) > 0) return true;
  if (job.parent_job_id && job.parent_job_id.startsWith('job-')) return true;
  return /segment\s*#/i.test(job.custom_title || '');
}

export function shouldShowIndeterminateProgress(job: SegmentScopedShape & { engine?: Engine; engineMeta?: import('@/types').TtsEngine }): boolean {
  if (job.engineMeta) {
    const caps = Array.isArray(job.engineMeta.capabilities) ? job.engineMeta.capabilities : [];
    return !!(caps.includes('simulated_finalizing') || job.engineMeta.cloud);
  }
  return false;
}

export function isChapterScopedJob(job: Job): boolean {
  return !isSegmentScopedJob(job);
}

export function pickRelevantJob(candidates: Job[], includeDone = false): Job | undefined {
  return [...candidates]
    .filter(job => includeDone || ['queued', 'preparing', 'running', 'finalizing'].includes(job.status))
    .sort((a, b) => {
      const aIsTerminal = ['done', 'failed', 'cancelled', 'error'].includes(a.status);
      const bIsTerminal = ['done', 'failed', 'cancelled', 'error'].includes(b.status);

      if (aIsTerminal !== bIsTerminal) {
        const aTime = a.created_at ?? a.started_at ?? 0;
        const bTime = b.created_at ?? b.started_at ?? 0;
        if (aTime !== bTime) {
          return bTime - aTime;
        }
      }

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
