import type { LiveEvent } from '@/api/contracts/liveEvents';

export interface LiveEventConsumer {
  id: 'main-queue' | 'chapter-state' | 'segment-state' | 'project-state' | 'tts-diagnostics' | 'voice-test-state' | string;
  label: string;
  listensTo: (event: LiveEvent) => boolean;
}

export const LIVE_EVENT_CONSUMERS: LiveEventConsumer[] = [
  {
    id: 'main-queue',
    label: 'main-queue',
    listensTo: (event: LiveEvent) =>
      ['queue.items'].includes(event.topic),
  },
  {
    id: 'chapter-state',
    label: 'chapter-state',
    listensTo: (event: LiveEvent) =>
      ['chapters.lifecycle', 'chapters.progress', 'segments.progress'].includes(event.topic),
  },
  {
    id: 'segment-state',
    label: 'segment-state',
    listensTo: (event: LiveEvent) =>
      ['segments.lifecycle', 'segments.progress'].includes(event.topic),
  },
  {
    id: 'tts-diagnostics',
    label: 'tts-diagnostics',
    listensTo: (event: LiveEvent) => event.topic === 'tts.logs',
  },
  {
    id: 'voice-test-state',
    label: 'voice-test-state',
    listensTo: (event: LiveEvent) => event.topic === 'voice.test',
  },
  {
    id: 'project-state',
    label: 'project-state',
    listensTo: (event: LiveEvent) => event.topic === 'projects.lifecycle',
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
