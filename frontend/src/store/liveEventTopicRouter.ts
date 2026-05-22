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
    const handler = handlers[record.event.topic] as LiveEventTopicHandler | undefined;
    if (!handler) return;
    handler(record.event, { rawData: data, raw, envelope });
  });
};
