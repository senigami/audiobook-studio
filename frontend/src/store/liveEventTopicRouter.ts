import type { LiveEvent, LiveEventTopic } from '@/api/contracts/liveEvents';
import { getLiveEventAuditRecordByFrameId } from '@/store/liveEventAuditStore';
import {
  subscribeStudioSocketMessages,
  type StudioSocketEnvelope,
} from '@/store/studioSocketBus';

export interface LiveEventTopicContext {
  rawData: any;
  raw?: string;
  envelope?: StudioSocketEnvelope;
}

export type LiveEventTopicHandler<E extends LiveEvent = LiveEvent> = (
  event: E,
  context: LiveEventTopicContext,
) => void;

export type LiveEventTopicHandlers = {
  [K in LiveEventTopic]?: LiveEventTopicHandler<Extract<LiveEvent, { topic: K }>>;
};

export const subscribeToLiveEventTopics = (handlers: LiveEventTopicHandlers) => {
  return subscribeStudioSocketMessages((data, raw, envelope) => {
    const record = getLiveEventAuditRecordByFrameId(envelope?.frameId);
    if (!record) return;

    const topic = record.event.topic;
    const rawType = record.event.rawType;

    const invokeHandler = (targetTopic: string, event: LiveEvent) => {
      const handler = handlers[targetTopic as LiveEventTopic] as LiveEventTopicHandler | undefined;
      if (handler) {
        handler(event, { rawData: data, raw, envelope });
      }
    };

    // 1. Dispatch to exact topic handler
    invokeHandler(topic, record.event);

    // 2. Compatibility shim: route new topics to legacy handlers for backward compatibility
    if (topic === 'segments.progress' || topic === 'chapters.progress' || topic === 'queue.items') {
      if (['studio_job_event', 'job_updated', 'segment_progress'].includes(rawType)) {
        const category = topic === 'segments.progress' ? 'segment' : (topic === 'chapters.progress' ? 'chapter' : 'job');
        const compatibleEvent = {
          ...record.event,
          topic: 'jobs.progress',
          category,
        } as LiveEvent;
        invokeHandler('jobs.progress', compatibleEvent);
      }
    }

    if (topic === 'queue.items') {
      if (['queue_updated', 'pause_updated'].includes(rawType)) {
        const compatibleEvent = {
          ...record.event,
          topic: 'queue.lifecycle',
          eventKind: record.event.eventKind === 'queue_paused' ? 'queue_pause_changed' : 'queue_invalidated',
        } as LiveEvent;
        invokeHandler('queue.lifecycle', compatibleEvent);
      }
    }

    if (topic === 'chapters.lifecycle') {
      if (['chapter_updated'].includes(rawType)) {
        const compatibleEvent = {
          ...record.event,
          topic: 'chapter.invalidate',
          eventKind: 'chapter_invalidated',
        } as LiveEvent;
        invokeHandler('chapter.invalidate', compatibleEvent);
      }
    }

    if (topic === 'segments.lifecycle') {
      if (['segments_updated'].includes(rawType)) {
        const compatibleEvent = {
          ...record.event,
          topic: 'segments.invalidate',
          eventKind: 'segments_invalidated',
        } as LiveEvent;
        invokeHandler('segments.invalidate', compatibleEvent);
      }
    }
  });
};
