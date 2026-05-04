import { describe, it, expect } from 'vitest';
import { createLiveJobsStore } from './live-jobs';

describe('LiveJobsStore', () => {
  it('applies studio_job_event updates correctly', () => {
    const store = createLiveJobsStore();
    store.applyEvent({
      type: 'studio_job_event',
      job_id: 'job1',
      status: 'running',
      progress: 0.5,
      updated_at: 1000,
      scope: 'job'
    });

    const state = store.getState();
    expect(state.eventsById['job1'].progress).toBe(0.5);
    expect(state.eventsById['job1'].status).toBe('running');
  });

  it('applies job_updated updates correctly via applyJobUpdated', () => {
    const store = createLiveJobsStore();
    store.applyJobUpdated('job1', {
      status: 'running',
      progress: 0.7,
      updated_at: 2000
    });

    const state = store.getState();
    expect(state.eventsById['job1'].progress).toBe(0.7);
    expect(state.eventsById['job1'].status).toBe('running');
  });

  it('prevents stale updates based on updated_at', () => {
    const store = createLiveJobsStore();
    store.applyEvent({
      type: 'studio_job_event',
      job_id: 'job1',
      status: 'running',
      progress: 0.5,
      updated_at: 1000,
      scope: 'job'
    });

    // Older event arrives
    store.applyEvent({
      type: 'studio_job_event',
      job_id: 'job1',
      status: 'running',
      progress: 0.3,
      updated_at: 500,
      scope: 'job'
    });

    const state = store.getState();
    expect(state.eventsById['job1'].progress).toBe(0.5); // Preserved
  });

  it('maintains monotonic progress for active jobs', () => {
    const store = createLiveJobsStore();
    store.applyEvent({
      type: 'studio_job_event',
      job_id: 'job1',
      status: 'running',
      progress: 0.5,
      updated_at: 1000,
      scope: 'job'
    });

    // Newer event with lower progress (regression)
    store.applyEvent({
      type: 'studio_job_event',
      job_id: 'job1',
      status: 'running',
      progress: 0.4,
      updated_at: 1100,
      scope: 'job'
    });

    const state = store.getState();
    expect(state.eventsById['job1'].progress).toBe(0.5); // Regressed progress ignored
  });

  it('allows progress reset on rollback status (queued/preparing)', () => {
    const store = createLiveJobsStore();
    store.applyEvent({
      type: 'studio_job_event',
      job_id: 'job1',
      status: 'running',
      progress: 0.5,
      updated_at: 1000,
      scope: 'job'
    });

    // Requeued
    store.applyEvent({
      type: 'studio_job_event',
      job_id: 'job1',
      status: 'queued',
      progress: 0,
      updated_at: 1100,
      scope: 'job'
    });

    const state = store.getState();
    expect(state.eventsById['job1'].status).toBe('queued');
    expect(state.eventsById['job1'].progress).toBe(0); // Allowed reset
  });
});
