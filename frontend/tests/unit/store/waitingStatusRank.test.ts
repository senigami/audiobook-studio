import { describe, it, expect, vi } from 'vitest';
import type { Job } from '@/types';
import { createLiveJobsStore } from '@/store/live-jobs';
import { applyJobUpdated } from '@/utils/jobUpdateReducer';
import { createHydrationCoordinator } from '@/api/hydration';
import { publishStudioSocketMessage, subscribeStudioSocketMessages } from '@/store/studioSocketBus';
import {
  normalizeStudioSocketEnvelope,
  type QueueItemLiveEvent,
  type QueueItemPayload,
} from '@/api/contracts/liveEvents';

const WAITING = 'waiting_for_resources';

function makeJob(status: string): Job {
  return {
    id: 'job-1', updated_at: 100, engine: 'xtts', chapter_file: 'ch.txt', status, progress: 0, created_at: 0,
    safe_mode: false, make_mp3: false, warning_count: 0,
  } as Job;
}

describe('waiting_for_resources ranks with queued in every frontend status-rank map', () => {
  describe('live overlay store', () => {
    it('accepts a waiting frame after a queued frame', () => {
      const store = createLiveJobsStore();
      store.applyJobUpdated('j1', { status: 'queued', updated_at: 100 });
      store.applyJobUpdated('j1', { status: WAITING, updated_at: 101 });
      expect(store.getState().eventsById['j1']?.status).toBe(WAITING);
    });

    it('treats a queued frame after a waiting frame like queued after queued', () => {
      const store = createLiveJobsStore();
      store.applyJobUpdated('j1', { status: WAITING, updated_at: 100 });
      store.applyJobUpdated('j1', { status: 'queued', updated_at: 101 });
      expect(store.getState().eventsById['j1']?.status).toBe('queued');
    });

    it('shows the waiting overlay on the merged queue row', () => {
      const store = createLiveJobsStore();
      store.applyJobUpdated('j1', { status: 'queued', updated_at: 100 });
      store.applyJobUpdated('j1', { status: WAITING, updated_at: 101 });
      const merged = createHydrationCoordinator().mergeQueueWithOverlays(
        { items: [{ id: 'j1', status: 'queued', progress: 0, created_at: 1, updated_at: 50 } as any] } as any,
        store.getState(),
      );
      expect(merged[0]?.status).toBe(WAITING);
    });
  });

  describe('job update reducer', () => {
    it('accepts a waiting update on a queued job', () => {
      const next = applyJobUpdated({ 'job-1': makeJob('queued') }, 'job-1', { status: WAITING, updated_at: 101 });
      expect(next!['job-1'].status).toBe(WAITING);
    });

    it('treats a queued update on a waiting job like queued on queued', () => {
      const next = applyJobUpdated({ 'job-1': makeJob(WAITING) }, 'job-1', { status: 'queued', updated_at: 101 });
      expect(next!['job-1'].status).toBe('queued');
    });
  });

  describe('hydration chapter dedup', () => {
    function winner(statuses: string[]): string {
      const items = statuses.map((status, i) => (
        { id: `j${i}`, chapter_id: 'c1', status, progress: 0, created_at: 5 } as any
      ));
      const merged = createHydrationCoordinator().mergeQueueWithOverlays(
        { items } as any, { eventsById: {} } as any,
      );
      return merged[0].status;
    }

    it.each([[WAITING], ['queued']])('%s outranks done and yields to preparing', (status) => {
      expect(winner([status, 'done'])).toBe(status);
      expect(winner([status, 'preparing'])).toBe('preparing');
    });
  });
});

describe('queue.items contract carries waiting_for_resources', () => {
  it('delivers a typed waiting queue.items frame through the socket bus', () => {
    const payload: QueueItemPayload = { status: WAITING, progress: 0, classification: 'job' };
    const listener = vi.fn();
    const unsubscribe = subscribeStudioSocketMessages(listener);
    publishStudioSocketMessage({
      type: 'studio_event',
      version: 1,
      topic: 'queue.items',
      eventKind: 'queue_item_status',
      ids: { jobId: 'j1' },
      payload,
    });
    unsubscribe();

    const [data, , envelope] = listener.mock.calls[0];
    const event = normalizeStudioSocketEnvelope(envelope) as QueueItemLiveEvent;
    expect(event.topic).toBe('queue.items');
    expect(event.payload.status).toBe(WAITING);
    expect(data.payload.status).toBe(WAITING);
  });
});
