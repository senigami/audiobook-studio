import { describe, it, expect, beforeEach } from 'vitest';
import { createLiveJobsStore } from './live-jobs';
import type { StudioJobEvent } from '../api/contracts/events';

describe('LiveJobsStore', () => {
  let store: ReturnType<typeof createLiveJobsStore>;

  beforeEach(() => {
    store = createLiveJobsStore();
  });

  it('initializes with empty state', () => {
    expect(store.getState().eventsById).toEqual({});
  });

  it('applies a new event', () => {
    const event: StudioJobEvent = {
      type: 'studio_job_event',
      job_id: 'job1',
      status: 'running',
      progress: 0.1,
      scope: 'job',
      updated_at: 1000,
    };
    store.applyEvent(event);
    expect(store.getState().eventsById['job1']).toMatchObject({
      status: 'running',
      progress: 0.1,
      updated_at: 1000,
    });
  });

  it('rejects stale events based on updated_at (Anti-Regression)', () => {
    store.applyEvent({
      type: 'studio_job_event',
      job_id: 'job1',
      status: 'running',
      progress: 0.2,
      scope: 'job',
      updated_at: 2000,
    });
    
    store.applyEvent({
      type: 'studio_job_event',
      job_id: 'job1',
      status: 'running',
      progress: 0.1,
      scope: 'job',
      updated_at: 1000, // Older
    });

    expect(store.getState().eventsById['job1']?.progress).toBe(0.2);
  });

  it('respects status precedence (cannot go backwards to running from done)', () => {
    store.applyEvent({
      type: 'studio_job_event',
      job_id: 'job1',
      status: 'done',
      scope: 'job',
      updated_at: 1000,
    });
    
    store.applyEvent({
      type: 'studio_job_event',
      job_id: 'job1',
      status: 'running',
      scope: 'job',
      updated_at: 2000, // Newer timestamp but lower priority status
    });

    expect(store.getState().eventsById['job1']?.status).toBe('done');
  });

  it('allows status rollback for queued/preparing', () => {
     store.applyEvent({
      type: 'studio_job_event',
      job_id: 'job1',
      status: 'running',
      progress: 0.5,
      scope: 'job',
      updated_at: 1000,
    });
    
    store.applyEvent({
      type: 'studio_job_event',
      job_id: 'job1',
      status: 'queued',
      progress: 0,
      scope: 'job',
      updated_at: 2000, 
    });

    expect(store.getState().eventsById['job1']?.status).toBe('queued');
    expect(store.getState().eventsById['job1']?.progress).toBe(0);
  });

  it('enforces monotonic progress for active states (Anti-Regression)', () => {
    store.applyEvent({
      type: 'studio_job_event',
      job_id: 'job1',
      status: 'running',
      progress: 0.3,
      scope: 'job',
      updated_at: 1000,
    });
    
    store.applyEvent({
      type: 'studio_job_event',
      job_id: 'job1',
      status: 'running',
      progress: 0.2,
      scope: 'job',
      updated_at: 2000,
    });

    expect(store.getState().eventsById['job1']?.progress).toBe(0.3);
  });

  it('stabilizes ETA jitter', () => {
    store.applyEvent({
      type: 'studio_job_event',
      job_id: 'job1',
      status: 'running',
      eta_seconds: 40.5,
      scope: 'job',
      updated_at: 1000,
    });
    
    store.applyEvent({
      type: 'studio_job_event',
      job_id: 'job1',
      status: 'running',
      eta_seconds: 41.2, // < 1s difference
      scope: 'job',
      updated_at: 2000,
    });

    expect(store.getState().eventsById['job1']?.eta_seconds).toBe(40.5);
  });

  it('prunes older events using correct second-based units (P1 Fix Check)', () => {
    // Both backend updated_at and snapshot.hydratedAt are now in seconds
    const snapshotTime = 1713210000; // Seconds
    
    store.applyEvent({ 
      type: 'studio_job_event', 
      job_id: 'job-old', 
      status: 'running', 
      scope: 'job', 
      updated_at: snapshotTime - 10 
    });
    store.applyEvent({ 
      type: 'studio_job_event', 
      job_id: 'job-new', 
      status: 'running', 
      scope: 'job', 
      updated_at: snapshotTime + 10 
    });
    
    store.pruneOlderThan(snapshotTime);
    
    expect(store.getState().eventsById['job-old']).toBeUndefined();
    expect(store.getState().eventsById['job-new']).toBeDefined();
  });
});
