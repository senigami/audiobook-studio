import type { LiveEvent } from '@/api/contracts/liveEvents';

export interface LiveEventConsumer {
  id: 'jobs-state' | 'queue-sync' | 'tts-diagnostics';
  label: string;
  listensTo: (event: LiveEvent) => boolean;
}

export const LIVE_EVENT_CONSUMERS: LiveEventConsumer[] = [
  {
    id: 'jobs-state',
    label: 'jobs-state',
    listensTo: (event: LiveEvent) =>
      ['jobs.progress', 'queue.lifecycle', 'chapter.invalidate', 'segments.invalidate', 'voice.test'].includes(event.topic),
  },
  {
    id: 'queue-sync',
    label: 'queue-sync',
    listensTo: (event: LiveEvent) =>
      ['jobs.progress', 'queue.lifecycle'].includes(event.topic),
  },
  {
    id: 'tts-diagnostics',
    label: 'tts-diagnostics',
    listensTo: (event: LiveEvent) => event.topic === 'tts.logs',
  },
];
