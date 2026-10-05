/**
 * Pinning tests for P1 (rAF-throttle) and P2 (ring buffer cap).
 *
 * P1: subscribeThrottled — in jsdom (no real rAF) the listener fires
 *     synchronously, so this test proves the non-browser fallback path works;
 *     the rAF coalescing path is exercised in real browsers.
 *
 * P2: ring buffer never exceeds RECORD_LIMIT entries and the Map stays
 *     consistent (evicted frame IDs are removed).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getLiveEventAuditSnapshot,
  subscribeThrottled,
  resetLiveEventAuditForTests,
} from '@/store/liveEventAuditStore';
import { publishStudioSocketMessage, resetStudioSocketBusForTests } from '@/store/studioSocketBus';

const RECORD_LIMIT = 200; // must match the constant in liveEventAuditStore.ts

beforeEach(() => {
  resetStudioSocketBusForTests();
  resetLiveEventAuditForTests();
});

const publishN = (n: number) => {
  for (let i = 0; i < n; i++) {
    publishStudioSocketMessage({
      type: 'studio_event',
      version: 1,
      topic: 'segments.progress',
      eventKind: 'segment_progress',
      ids: { jobId: `job-${i}`, chapterId: 'ch-1', segmentId: `seg-${i}` },
      payload: { status: 'running', progress: i / n },
    });
  }
};

describe('P2 — ring buffer cap', () => {
  it(`never stores more than ${RECORD_LIMIT} records`, () => {
    publishN(RECORD_LIMIT + 50);
    expect(getLiveEventAuditSnapshot().length).toBe(RECORD_LIMIT);
  });

  it('evicts the oldest records first (FIFO)', () => {
    publishN(RECORD_LIMIT + 1);
    const records = getLiveEventAuditSnapshot();
    // After publishing RECORD_LIMIT+1 frames (frameIds 1…RECORD_LIMIT+1),
    // frame 1 should be evicted; the oldest retained frame is frame 2.
    expect(records[0].event.frameId).toBe(2);
    expect(records[records.length - 1].event.frameId).toBe(RECORD_LIMIT + 1);
  });
});

describe('P1 — subscribeThrottled', () => {
  it('calls the listener when a frame is published (jsdom synchronous path)', () => {
    const listener = vi.fn();
    const unsub = subscribeThrottled(listener);

    publishStudioSocketMessage({
      type: 'studio_event',
      version: 1,
      topic: 'queue.items',
      eventKind: 'queue_item_status',
      ids: { jobId: 'j1' },
      payload: { status: 'running' },
    });

    // In jsdom (no real rAF) subscribeThrottled calls synchronously.
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('cleans up on unsubscribe — no more calls after unsub', () => {
    const listener = vi.fn();
    const unsub = subscribeThrottled(listener);
    unsub();

    publishStudioSocketMessage({
      type: 'studio_event',
      version: 1,
      topic: 'queue.items',
      eventKind: 'queue_item_status',
      ids: { jobId: 'j2' },
      payload: { status: 'done' },
    });

    expect(listener).not.toHaveBeenCalled();
  });
});
