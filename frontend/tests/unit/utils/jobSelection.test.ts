import { describe, expect, it } from 'vitest';
import type { Job } from '@/types';
import { hasSegmentProgressCapability, isSegmentScopedJob, pickRelevantJob, isMainQueueSegmentItem } from '@/utils/jobSelection';

function makeJob(overrides: Partial<Job>): Job {
  return {
    id: overrides.id || 'job',
    engine: overrides.engine || 'xtts',
    chapter_file: overrides.chapter_file || 'chapter.txt',
    status: overrides.status || 'queued',
    created_at: overrides.created_at ?? 0,
    safe_mode: false,
    make_mp3: true,
    progress: overrides.progress ?? 0,
    warning_count: overrides.warning_count ?? 0,
    ...overrides,
  };
}

describe('pickRelevantJob', () => {
  it('prefers a running job over a newer queued job for the same chapter', () => {
    const runningJob = makeJob({
      id: 'running-job',
      status: 'running',
      created_at: 100,
      started_at: 110,
      progress: 0.42,
    });
    const newerQueuedJob = makeJob({
      id: 'queued-job',
      status: 'queued',
      created_at: 200,
      progress: 0,
    });

    expect(pickRelevantJob([runningJob, newerQueuedJob])?.id).toBe('running-job');
  });

  it('prefers the oldest queued job when only queued jobs remain', () => {
    const firstQueued = makeJob({ id: 'queued-1', status: 'queued', created_at: 100 });
    const secondQueued = makeJob({ id: 'queued-2', status: 'queued', created_at: 200 });

    expect(pickRelevantJob([secondQueued, firstQueued])?.id).toBe('queued-1');
  });

  it('prefers a newer terminal job over an older running job when includeDone is true', () => {
    const olderRunning = makeJob({ id: 'running-old', status: 'running', created_at: 100 });
    const newerDone = makeJob({ id: 'done-new', status: 'done', created_at: 200 });

    expect(pickRelevantJob([olderRunning, newerDone], true)?.id).toBe('done-new');
  });
});

describe('isSegmentScopedJob', () => {
  it('does not treat chapter render progress markers as segment-scoped jobs', () => {
    expect(isSegmentScopedJob({
      custom_title: 'chapter 1',
      render_group_count: 2,
      active_segment_id: 'seg-1',
    })).toBe(false);
  });

  it('treats explicit segment jobs as segment-scoped', () => {
    expect(isSegmentScopedJob({
      custom_title: 'chapter 1 * Part 2: segment #7',
      segment_ids: ['seg-7'],
    })).toBe(true);
  });

  it('does not treat a segment-capable chapter job as a segment sub-job', () => {
    expect(isSegmentScopedJob({
      classification: 'chapter',
      has_segment_support: true,
      active_segment_id: 'seg-1',
    })).toBe(false);
  });
});

describe('hasSegmentProgressCapability', () => {
  it('treats has_segment_support as capability without changing job scope', () => {
    const job = {
      classification: 'chapter' as const,
      has_segment_support: true,
      active_segment_id: 'seg-1',
    };

    expect(hasSegmentProgressCapability(job)).toBe(true);
    expect(isSegmentScopedJob(job)).toBe(false);
  });
});

describe('classification logic rules', () => {
  it('returns false for isMainQueueSegmentItem and isSegmentScopedJob if classification is chapter', () => {
    const job = {
      classification: 'chapter' as const,
      parent_job_id: 'job-parent',
      segment_ids: ['seg-1'],
    };
    expect(isSegmentScopedJob(job)).toBe(false);
  });

  it('checks segment_ids first and parent_job_id startsWith job- fallback last', () => {
    // parent_job_id that does not start with job- should return false (it's a projectUUID)
    const jobProjectParent = {
      parent_job_id: 'project-uuid-1234',
    };
    expect(isSegmentScopedJob(jobProjectParent)).toBe(false);

    // parent_job_id starting with job- fallback returns true
    const jobTaskParent = {
      parent_job_id: 'job-parent-1234',
    };
    expect(isSegmentScopedJob(jobTaskParent)).toBe(true);
  });

  it('returns false for chapter jobs with project parent_job_id and active_segment_id', () => {
    const job = {
      parent_job_id: 'project-uuid-1234',
      active_segment_id: 'seg-1',
    };
    expect(isMainQueueSegmentItem(job)).toBe(false);
  });
});
