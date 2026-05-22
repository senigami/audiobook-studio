import { describe, it, expect, beforeEach } from 'vitest';
import {
  publishStudioSocketMessage,
  resetStudioSocketBusForTests,
} from '@/store/studioSocketBus';
import {
  clearLiveEventAudit,
  getLiveEventAuditSnapshot,
  recordLiveEventSubscriberObservation,
  resetLiveEventAuditForTests,
} from '@/store/liveEventAuditStore';

describe('liveEventAuditStore', () => {
  beforeEach(() => {
    resetStudioSocketBusForTests();
    resetLiveEventAuditForTests();
  });

  it('appends one normalized record per published frame before any consumer can filter', () => {
    publishStudioSocketMessage({ type: 'queue_updated', reason: 'job_started' });
    publishStudioSocketMessage({ type: 'studio_job_event', job_id: 'job-1', status: 'running', progress: 0.4 });

    const records = getLiveEventAuditSnapshot();
    expect(records).toHaveLength(2);
    expect(records[0].event.topic).toBe('queue.lifecycle');
    expect(records[0].event.frameId).toBe(1);
    expect(records[1].event.topic).toBe('jobs.progress');
    expect(records[1].event.frameId).toBe(2);
  });

  it('records unknown/unhandled frames as system.unknown audit events', () => {
    publishStudioSocketMessage({ type: 'totally_new_backend_event', payload: { foo: 'bar' } });

    const records = getLiveEventAuditSnapshot();
    expect(records).toHaveLength(1);
    expect(records[0].event.topic).toBe('system.unknown');
    expect(records[0].event.eventKind).toBe('unknown');
    expect(records[0].event.rawType).toBe('totally_new_backend_event');
  });

  it('attaches subscriber observations to the existing record by frameId and dedupes by subscriber name', () => {
    publishStudioSocketMessage({ type: 'studio_job_event', job_id: 'job-1', status: 'running' });
    const [record] = getLiveEventAuditSnapshot();

    recordLiveEventSubscriberObservation(record.event.frameId, 'jobs-state', 'handled');
    recordLiveEventSubscriberObservation(record.event.frameId, 'queue-sync', 'handled');
    recordLiveEventSubscriberObservation(record.event.frameId, 'jobs-state', 'handled', 'duplicate ignored');

    const subscribers = getLiveEventAuditSnapshot()[0].subscribers.map(s => s.subscriber);
    expect(subscribers).toEqual(['jobs-state', 'queue-sync']);
  });

  it('keeps distinct same-job studio_job_event frames as separate records even within milliseconds', () => {
    publishStudioSocketMessage({ type: 'studio_job_event', job_id: 'job-same', status: 'queued' });
    publishStudioSocketMessage({ type: 'studio_job_event', job_id: 'job-same', status: 'running' });

    const records = getLiveEventAuditSnapshot();
    expect(records).toHaveLength(2);
    expect(records[0].event.payload).toMatchObject({ status: 'queued' });
    expect(records[1].event.payload).toMatchObject({ status: 'running' });
  });

  it('clearLiveEventAudit removes all records and notifies subscribers', () => {
    publishStudioSocketMessage({ type: 'queue_updated' });
    expect(getLiveEventAuditSnapshot()).toHaveLength(1);

    clearLiveEventAudit();
    expect(getLiveEventAuditSnapshot()).toHaveLength(0);
  });
});
