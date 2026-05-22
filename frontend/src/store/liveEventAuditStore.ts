import {
  appendLiveEventSubscriber,
  normalizeStudioSocketEnvelope,
  type LiveEventRecord,
  type LiveEventSubscriber,
  type LiveEventSubscriberObservation,
  type StudioSocketEnvelope,
} from '@/api/contracts/liveEvents';

const RECORD_LIMIT = 1000;

let records: LiveEventRecord[] = [];
const recordsByFrameId = new Map<number, LiveEventRecord>();
const listeners = new Set<() => void>();

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

export const getLiveEventAuditSnapshot = (): LiveEventRecord[] => records;

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
