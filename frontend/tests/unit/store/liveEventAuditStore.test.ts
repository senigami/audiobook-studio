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
    publishStudioSocketMessage({
      type: 'studio_event',
      version: 1,
      topic: 'queue.items',
      eventKind: 'queue_item_invalidated',
      payload: { reason: 'job_started', changedFields: [] },
    });
    publishStudioSocketMessage({
      type: 'studio_event',
      version: 1,
      topic: 'queue.items',
      eventKind: 'queue_item_status',
      ids: { jobId: 'job-1' },
      payload: { status: 'running', progress: 0.4 },
    });

    const records = getLiveEventAuditSnapshot();
    expect(records).toHaveLength(2);
    expect(records[0].event.topic).toBe('queue.items');
    expect(records[0].event.frameId).toBe(1);
    expect(records[1].event.topic).toBe('queue.items');
    expect(records[1].event.frameId).toBe(2);
  });

  it('records unknown/unhandled frames as system.events audit events', () => {
    publishStudioSocketMessage({ type: 'totally_new_backend_event', payload: { foo: 'bar' } });

    const records = getLiveEventAuditSnapshot();
    expect(records).toHaveLength(1);
    expect(records[0].event.topic).toBe('system.events');
    expect(records[0].event.eventKind).toBe('unknown');
    expect(records[0].event.rawType).toBe('totally_new_backend_event');
  });

  it('attaches subscriber observations to the existing record by frameId and dedupes by subscriber name', () => {
    publishStudioSocketMessage({
      type: 'studio_event',
      version: 1,
      topic: 'queue.items',
      eventKind: 'queue_item_status',
      ids: { jobId: 'job-1' },
      payload: { status: 'running' },
    });
    const [record] = getLiveEventAuditSnapshot();

    recordLiveEventSubscriberObservation(record.event.frameId, 'chapter-state', 'handled');
    recordLiveEventSubscriberObservation(record.event.frameId, 'main-queue', 'handled');
    recordLiveEventSubscriberObservation(record.event.frameId, 'chapter-state', 'handled', 'duplicate ignored');

    const subscribers = getLiveEventAuditSnapshot()[0].subscribers.map(s => s.subscriber);
    expect(subscribers).toEqual(['chapter-state', 'main-queue']);
  });

  it('keeps distinct same-job studio_job_event frames as separate records even within milliseconds', () => {
    publishStudioSocketMessage({
      type: 'studio_event',
      version: 1,
      topic: 'queue.items',
      eventKind: 'queue_item_status',
      ids: { jobId: 'job-same' },
      payload: { status: 'queued' },
    });
    publishStudioSocketMessage({
      type: 'studio_event',
      version: 1,
      topic: 'queue.items',
      eventKind: 'queue_item_status',
      ids: { jobId: 'job-same' },
      payload: { status: 'running' },
    });

    const records = getLiveEventAuditSnapshot();
    expect(records).toHaveLength(2);
    expect(records[0].event.payload).toMatchObject({ status: 'queued' });
    expect(records[1].event.payload).toMatchObject({ status: 'running' });
  });

  it('clearLiveEventAudit removes all records and notifies subscribers', () => {
    publishStudioSocketMessage({
      type: 'studio_event',
      version: 1,
      topic: 'queue.items',
      eventKind: 'queue_item_invalidated',
      payload: { reason: 'test', changedFields: [] },
    });
    expect(getLiveEventAuditSnapshot()).toHaveLength(1);

    clearLiveEventAudit();
    expect(getLiveEventAuditSnapshot()).toHaveLength(0);
  });
});
