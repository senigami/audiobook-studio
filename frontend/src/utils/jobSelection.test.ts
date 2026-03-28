import { describe, expect, it } from 'vitest';
import type { Job } from '../types';
import { pickRelevantJob } from './jobSelection';

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
});
