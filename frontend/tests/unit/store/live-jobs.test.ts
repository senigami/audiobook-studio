import { describe, it, expect } from 'vitest';
import { createLiveJobsStore } from '@/store/live-jobs';

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

  it('keeps render-group context from studio_job_event updates', () => {
    const store = createLiveJobsStore();
    store.applyEvent({
      type: 'studio_job_event',
      job_id: 'job1',
      status: 'running',
      progress: 0.42,
      updated_at: 1000,
      scope: 'job',
      render_group_count: 3,
      completed_render_groups: 1,
      active_render_group_index: 2,
      total_render_weight: 100,
      completed_render_weight: 40,
      active_render_group_weight: 20,
      grouped_progress: 0.42,
    } as any);

    const state = store.getState();
    expect(state.eventsById['job1']).toMatchObject({
      render_group_count: 3,
      completed_render_groups: 1,
      active_render_group_index: 2,
      total_render_weight: 100,
      completed_render_weight: 40,
      active_render_group_weight: 20,
      grouped_progress: 0.42,
    });
  });

  it('applies job_updated updates correctly via applyJobUpdated', () => {
    const store = createLiveJobsStore();
    store.applyJobUpdated('job1', {
      status: 'running',
      progress: 0.7,
      updated_at: 2000,
      render_group_count: 4,
      completed_render_groups: 2,
      active_render_group_index: 1,
      total_render_weight: 120,
      completed_render_weight: 60,
      active_render_group_weight: 30,
      grouped_progress: 0.7,
    });

    const state = store.getState();
    expect(state.eventsById['job1'].progress).toBe(0.7);
    expect(state.eventsById['job1'].status).toBe('running');
    expect(state.eventsById['job1']).toMatchObject({
      render_group_count: 4,
      completed_render_groups: 2,
      active_render_group_index: 1,
      total_render_weight: 120,
      completed_render_weight: 60,
      active_render_group_weight: 30,
      grouped_progress: 0.7,
    });
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

  it('handles active segment/batch id and progress events and clearing', () => {
    const store = createLiveJobsStore();

    // 1. Initial event sets segment and batch info
    store.applyEvent({
      type: 'studio_job_event',
      job_id: 'job1',
      status: 'running',
      updated_at: 1000,
      scope: 'segment',
      active_segment_id: 'seg1',
      active_segment_progress: 0.4,
      active_render_batch_id: 'batch1',
      active_render_batch_progress: 0.3,
    } as any);

    let state = store.getState();
    expect(state.eventsById['job1'].active_segment_id).toBe('seg1');
    expect(state.eventsById['job1'].active_segment_progress).toBe(0.4);
    expect(state.eventsById['job1'].active_render_batch_id).toBe('batch1');
    expect(state.eventsById['job1'].active_render_batch_progress).toBe(0.3);

    // 2. Omitted fields in newer event should preserve existing values
    store.applyEvent({
      type: 'studio_job_event',
      job_id: 'job1',
      status: 'running',
      updated_at: 1100,
      scope: 'segment',
      // active_segment_id/progress omitted
    } as any);

    state = store.getState();
    expect(state.eventsById['job1'].active_segment_id).toBe('seg1');
    expect(state.eventsById['job1'].active_segment_progress).toBe(0.4);

    // 3. Clear fields via null in applyEvent
    store.applyEvent({
      type: 'studio_job_event',
      job_id: 'job1',
      status: 'running',
      updated_at: 1200,
      scope: 'segment',
      active_segment_id: null,
      active_segment_progress: null,
      active_render_batch_id: null,
      active_render_batch_progress: null,
    } as any);

    state = store.getState();
    expect(state.eventsById['job1'].active_segment_id).toBeNull();
    expect(state.eventsById['job1'].active_segment_progress).toBeNull();
    expect(state.eventsById['job1'].active_render_batch_id).toBeNull();
    expect(state.eventsById['job1'].active_render_batch_progress).toBeNull();

    // 4. Re-set and clear via applyJobUpdated
    store.applyJobUpdated('job1', {
      active_segment_id: 'seg2',
      active_segment_progress: 0.8,
    });
    state = store.getState();
    expect(state.eventsById['job1'].active_segment_id).toBe('seg2');
    expect(state.eventsById['job1'].active_segment_progress).toBe(0.8);

    store.applyJobUpdated('job1', {
      active_segment_id: null,
      active_segment_progress: null,
    });
    state = store.getState();
    expect(state.eventsById['job1'].active_segment_id).toBeNull();
    expect(state.eventsById['job1'].active_segment_progress).toBeNull();
  });

  it('unifies merge rules: applyJobUpdated enforces monotonic progress and requeued resets', () => {
    const store = createLiveJobsStore();

    // 1. Initial active update
    store.applyJobUpdated('job1', {
      status: 'running',
      progress: 0.5,
      updated_at: 1000,
    });
    expect(store.getState().eventsById['job1'].progress).toBe(0.5);

    // 2. Newer update with lower progress (should be ignored due to monotonic progress rule)
    store.applyJobUpdated('job1', {
      status: 'running',
      progress: 0.4,
      updated_at: 1100,
    });
    expect(store.getState().eventsById['job1'].progress).toBe(0.5);

    // 3. Newer update with rollback status (queued) (should reset progress to 0)
    store.applyJobUpdated('job1', {
      status: 'queued',
      progress: 0,
      updated_at: 1200,
    });
    expect(store.getState().eventsById['job1'].status).toBe('queued');
    expect(store.getState().eventsById['job1'].progress).toBe(0);
  });
});
