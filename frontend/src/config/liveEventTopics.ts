import type { LiveEvent } from '@/api/contracts/liveEvents';

export type TopicFilterId =
  | 'jobs.lifecycle'
  | 'queue.items'
  | 'chapters.lifecycle'
  | 'chapters.progress'
  | 'segments.lifecycle'
  | 'segments.progress'
  | 'tts.logs'
  | 'voice.test'
  | 'projects.lifecycle'
  | 'system.events'
  | 'plugins.*';

export type TopicFilter = {
  id: TopicFilterId;
  label: string;
  matches: (topic: LiveEvent['topic'] | string) => boolean;
};

export const TOPIC_FILTERS: TopicFilter[] = [
  { id: 'jobs.lifecycle', label: 'jobs.lifecycle', matches: topic => topic === 'jobs.lifecycle' },
  { id: 'queue.items', label: 'queue.items', matches: topic => topic === 'queue.items' },
  { id: 'chapters.lifecycle', label: 'chapters.lifecycle', matches: topic => topic === 'chapters.lifecycle' },
  { id: 'chapters.progress', label: 'chapters.progress', matches: topic => topic === 'chapters.progress' },
  { id: 'segments.lifecycle', label: 'segments.lifecycle', matches: topic => topic === 'segments.lifecycle' },
  { id: 'segments.progress', label: 'segments.progress', matches: topic => topic === 'segments.progress' },
  { id: 'tts.logs', label: 'tts.logs', matches: topic => topic === 'tts.logs' },
  { id: 'voice.test', label: 'voice.test', matches: topic => topic === 'voice.test' },
  { id: 'projects.lifecycle', label: 'projects.lifecycle', matches: topic => topic === 'projects.lifecycle' },
  { id: 'system.events', label: 'system.events', matches: topic => topic === 'system.events' },
  { id: 'plugins.*', label: 'plugins.*', matches: topic => topic.startsWith('plugins.') },
];

export const ALL_TOPIC_FILTER_IDS = TOPIC_FILTERS.map(filter => filter.id);
