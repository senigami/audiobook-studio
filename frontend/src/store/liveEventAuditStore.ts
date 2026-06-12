import {
  appendLiveEventSubscriber,
  normalizeStudioSocketEnvelope,
  type LiveEventRecord,
  type LiveEventSubscriber,
  type LiveEventSubscriberObservation,
  type StudioSocketEnvelope,
} from '@/api/contracts/liveEvents';

// P2: ring buffer cap — 200 entries (was 1000); eviction keeps the Map consistent.
const RECORD_LIMIT = 200;

let records: LiveEventRecord[] = [];
const recordsByFrameId = new Map<number, LiveEventRecord>();
const listeners = new Set<() => void>();

// notify() is synchronous so useSyncExternalStore works correctly everywhere.
const notify = () => {
  listeners.forEach(listener => listener());
};

export const recordLiveEventEnvelope = (envelope: StudioSocketEnvelope): LiveEventRecord => {
  const existing = recordsByFrameId.get(envelope.frameId);
  if (existing) return existing;

  const event = normalizeStudioSocketEnvelope(envelope);
  const record: LiveEventRecord = { event, subscribers: [] };

  records = [...records, record];
  recordsByFrameId.set(envelope.frameId, record);

  while (records.length > RECORD_LIMIT) {
    const evicted = records[0];
    records = records.slice(1);
    recordsByFrameId.delete(evicted.event.frameId);
  }

  notify();
  return record;
};

export const recordLiveEventSubscriberObservation = (
  frameId: number | undefined,
  subscriber: LiveEventSubscriber,
  action: LiveEventSubscriberObservation['action'],
  detail?: string,
) => {
  if (typeof frameId !== 'number') return;
  const record = recordsByFrameId.get(frameId);
  if (!record) return;
  const before = record.subscribers.length;
  appendLiveEventSubscriber(record, subscriber, action, detail);
  if (record.subscribers.length === before) return;
  // Replace the record reference so React subscribers see a new identity for this row.
  const next: LiveEventRecord = { event: record.event, subscribers: [...record.subscribers] };
  recordsByFrameId.set(frameId, next);
  records = records.map(r => (r.event.frameId === frameId ? next : r));
  notify();
};

export const subscribeLiveEventAudit = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// True when running under a real browser (not jsdom / SSR).
// jsdom sets navigator.userAgent to include "jsdom".
const IS_REAL_BROWSER =
  typeof requestAnimationFrame === 'function' &&
  typeof navigator !== 'undefined' &&
  !navigator.userAgent.includes('jsdom');

/**
 * P1: rAF-throttled subscription for UI components that render the full audit
 * table (e.g. LiveOutputTable). A burst of N publishes within one animation
 * frame coalesces to a single re-render in real browsers. In jsdom / SSR the
 * listener fires synchronously so existing tests don't need `waitFor`.
 */
export const subscribeThrottled = (listener: () => void) => {
  let rafId: ReturnType<typeof requestAnimationFrame> | null = null;
  const throttled = () => {
    if (!IS_REAL_BROWSER) {
      listener();
      return;
    }
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      listener();
    });
  };
  listeners.add(throttled);
  return () => {
    listeners.delete(throttled);
    if (rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
};

export const getLiveEventAuditSnapshot = (): LiveEventRecord[] => records;

export const getLiveEventAuditRecordByFrameId = (frameId: number | undefined): LiveEventRecord | undefined => {
  if (typeof frameId !== 'number') return undefined;
  return recordsByFrameId.get(frameId);
};

export const clearLiveEventAudit = () => {
  records = [];
  recordsByFrameId.clear();
  notify();
};

export const resetLiveEventAuditForTests = () => {
  records = [];
  recordsByFrameId.clear();
  listeners.clear();
};
