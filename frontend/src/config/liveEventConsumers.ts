import type { LiveEvent } from '@/api/contracts/liveEvents';
import type { TopicFilterId } from '@/config/liveEventTopics';

export interface LiveEventConsumer {
  id: 'main-queue' | 'chapter-state' | 'segment-state' | 'project-state' | 'tts-diagnostics' | 'voice-test-state' | string;
  label: string;
  listensTo: (event: LiveEvent) => boolean;
}

export const LIVE_EVENT_CONSUMER_TOPIC_IDS: Record<string, TopicFilterId[]> = {
  'main-queue': ['jobs.lifecycle', 'queue.items', 'chapters.lifecycle', 'chapters.progress'],
  'chapter-state': ['jobs.lifecycle', 'chapters.lifecycle', 'chapters.progress', 'segments.progress'],
  'segment-state': ['jobs.lifecycle', 'segments.lifecycle', 'segments.progress'],
  'tts-diagnostics': ['tts.logs'],
  'voice-test-state': ['voice.test'],
  'project-state': ['projects.lifecycle'],
};

export const LIVE_EVENT_CONSUMERS: LiveEventConsumer[] = [
  {
    id: 'main-queue',
    label: 'main-queue',
    listensTo: (event: LiveEvent) => LIVE_EVENT_CONSUMER_TOPIC_IDS['main-queue'].includes(event.topic as TopicFilterId),
  },
  {
    id: 'chapter-state',
    label: 'chapter-state',
    listensTo: (event: LiveEvent) => LIVE_EVENT_CONSUMER_TOPIC_IDS['chapter-state'].includes(event.topic as TopicFilterId),
  },
  {
    id: 'segment-state',
    label: 'segment-state',
    listensTo: (event: LiveEvent) => LIVE_EVENT_CONSUMER_TOPIC_IDS['segment-state'].includes(event.topic as TopicFilterId),
  },
  {
    id: 'tts-diagnostics',
    label: 'tts-diagnostics',
    listensTo: (event: LiveEvent) => LIVE_EVENT_CONSUMER_TOPIC_IDS['tts-diagnostics'].includes(event.topic as TopicFilterId),
  },
  {
    id: 'voice-test-state',
    label: 'voice-test-state',
    listensTo: (event: LiveEvent) => LIVE_EVENT_CONSUMER_TOPIC_IDS['voice-test-state'].includes(event.topic as TopicFilterId),
  },
  {
    id: 'project-state',
    label: 'project-state',
    listensTo: (event: LiveEvent) => LIVE_EVENT_CONSUMER_TOPIC_IDS['project-state'].includes(event.topic as TopicFilterId),
  },
];

export const getLiveEventConsumer = (id: string): LiveEventConsumer | undefined => {
  const staticConsumer = LIVE_EVENT_CONSUMERS.find(c => c.id === id);
  if (staticConsumer) return staticConsumer;

  if (id.startsWith('plugin:')) {
    const parts = id.split(':');
    if (parts.length === 3) {
      const [, pluginId, area] = parts;
      return {
        id,
        label: id,
        listensTo: (event: LiveEvent) => event.topic === `plugins.${pluginId}.${area}`,
      };
    }
  }

  if (id === 'plugin-private') {
    return {
      id,
      label: 'Plugin Private',
      listensTo: (event: LiveEvent) => event.topic.startsWith('plugins.'),
    };
  }

  return undefined;
};
