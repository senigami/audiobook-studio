export interface StudioSocketEnvelope<T = unknown> {
  frameId: number;
  receivedAt: string;
  data: T;
  raw?: string;
}

export type LiveEventTopic =
  | 'queue.items'
  | 'chapters.lifecycle'
  | 'chapters.progress'
  | 'segments.lifecycle'
  | 'segments.progress'
  | 'tts.logs'
  | 'voice.test'
  | 'system.events'
  | 'projects.lifecycle'
  | `plugins.${string}.${string}`
  | string;

export type LiveEventCategory =
  | 'log'
  | 'queue'
  | 'job'
  | 'chapter'
  | 'segment'
  | 'voice'
  | 'system'
  | 'plugin'
  | 'project';

export type LiveEventSubscriber =
  | 'main-queue'
  | 'chapter-state'
  | 'segment-state'
  | 'tts-diagnostics'
  | 'voice-test-state'
  | 'live-output'
  | `plugin:${string}:${string}`
  | string;

export type LiveEventKind =
  | 'queue_item_status'
  | 'queue_item_invalidated'
  | 'queue_paused'
  | 'chapter_lifecycle'
  | 'chapter_progress'
  | 'segment_lifecycle'
  | 'segment_progress'
  | 'segment_saved'
  | 'segment_started'
  | 'tts_log'
  | 'voice_test_progress'
  | 'system_event'
  | 'plugin_event'
  | 'unknown'
  | string;

export interface LiveEventBase<TPayload = unknown> {
  frameId: number;
  receivedAt: string;
  rawType: string;
  topic: LiveEventTopic;
  category: LiveEventCategory;
  eventKind: LiveEventKind;
  source?: string | null;
  jobId?: string | null;
  projectId?: string | null;
  chapterId?: string | null;
  segmentId?: string | null;
  pluginId?: string | null;
  payload: TPayload;
  raw?: string;
}

export interface QueueItemPayload {
  status: 'queued' | 'preparing' | 'running' | 'finalizing' | 'done' | 'failed' | 'cancelled';
  progress: number;
  etaSeconds: number | null;
  message: string | null;
  reasonCode: string | null;
  classification: 'job' | 'chapter' | 'segment';
  changedFields: string[] | null;
  paused?: boolean | null;
  // Legacy duplicate fields for backward compatibility
  eta_seconds?: number | null;
  reason_code?: string | null;
  changed_fields?: string[] | null;
}

export interface QueueItemLiveEvent extends LiveEventBase<QueueItemPayload> {
  topic: 'queue.items';
  category: 'queue';
  eventKind: 'queue_item_status' | 'queue_item_invalidated' | 'queue_paused';
}

export interface ChapterLifecyclePayload {
  reason: string;
  changedFields: string[];
  // Legacy compatibility
  changed_fields?: string[];
}

export interface ChapterLifecycleLiveEvent extends LiveEventBase<ChapterLifecyclePayload> {
  topic: 'chapters.lifecycle';
  category: 'chapter';
  eventKind: 'chapter_lifecycle';
}

export interface ChapterProgressPayload {
  status: 'queued' | 'preparing' | 'running' | 'finalizing' | 'done' | 'failed' | 'cancelled';
  progress: number;
  groupedProgress: number | null;
  etaSeconds: number | null;
  message: string | null;
  reasonCode: string | null;
  renderGroupCount: number | null;
  completedRenderGroups: number | null;
  // Legacy duplicate fields
  eta_seconds?: number | null;
  grouped_progress?: number | null;
  reason_code?: string | null;
  render_group_count?: number | null;
  completed_render_groups?: number | null;
}

export interface ChapterProgressLiveEvent extends LiveEventBase<ChapterProgressPayload> {
  topic: 'chapters.progress';
  category: 'chapter';
  eventKind: 'chapter_progress';
}

export interface SegmentLifecyclePayload {
  reason: string;
  changedFields: string[];
  // Legacy compatibility
  changed_fields?: string[];
}

export interface SegmentLifecycleLiveEvent extends LiveEventBase<SegmentLifecyclePayload> {
  topic: 'segments.lifecycle';
  category: 'segment';
  eventKind: 'segment_lifecycle';
}

export interface SegmentProgressPayload {
  status: 'preparing' | 'running' | 'processing' | 'finalizing' | 'done' | 'failed';
  progress: number;
  segmentIndex: number | null;
  segmentCount: number | null;
  message: string | null;
  reasonCode: string | null;
  // Legacy duplicate fields for active segment mapping
  etaSeconds?: number | null;
  eta_seconds?: number | null;
  reason_code?: string | null;
  activeSegmentId?: string | null;
  activeSegmentProgress?: number | null;
  active_segment_id?: string | null;
  active_segment_progress?: number | null;
}

export interface SegmentProgressLiveEvent extends LiveEventBase<SegmentProgressPayload> {
  topic: 'segments.progress';
  category: 'segment';
  eventKind: 'segment_progress' | 'segment_started' | 'segment_saved';
}

export interface TtsLogPayload {
  line: string;
  level?: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
  sequence?: number | null;
  pluginId?: string;
  pluginShortName?: string;
  jobId?: string | null;
  chapterId?: string | null;
  source?: string;
  backendReceivedAt?: number | null;
  // Legacy fields
  marker?: string | null;
}

export interface TtsLogLiveEvent extends LiveEventBase<TtsLogPayload> {
  topic: 'tts.logs';
  category: 'log';
  eventKind: 'tts_log';
}

export interface VoiceTestPayload {
  voiceName: string;
  status: 'preparing' | 'running' | 'done' | 'failed';
  progress: number;
  startedAt: number;
  message: string | null;
  // Legacy duplicate/raw fields
  name?: string;
  started_at?: number;
}

export interface VoiceTestLiveEvent extends LiveEventBase<VoiceTestPayload> {
  topic: 'voice.test';
  category: 'voice';
  eventKind: 'voice_test_progress';
}

export interface SystemEventPayload {
  eventKind?: string;
  message?: string;
  details?: Record<string, unknown>;
}

export interface SystemEventLiveEvent extends LiveEventBase<SystemEventPayload> {
  topic: 'system.events';
  category: 'system';
  eventKind: string;
}

export interface PluginLiveEvent extends LiveEventBase<unknown> {
  topic: string; // plugins.<plugin_id>.<area>
  category: 'plugin';
  eventKind: string;
}

export interface ProjectLifecyclePayload {
  reason: string;
  changedFields: string[];
  // Legacy compatibility
  changed_fields?: string[];
}

export interface ProjectLifecycleLiveEvent extends LiveEventBase<ProjectLifecyclePayload> {
  topic: 'projects.lifecycle';
  category: 'project';
  eventKind: 'project_invalidated';
}

export interface UnknownLiveEvent extends LiveEventBase<unknown> {
  topic: 'system.events';
  category: 'system';
  eventKind: 'unknown';
}

export type LiveEvent =
  | QueueItemLiveEvent
  | ChapterLifecycleLiveEvent
  | ChapterProgressLiveEvent
  | SegmentLifecycleLiveEvent
  | SegmentProgressLiveEvent
  | TtsLogLiveEvent
  | VoiceTestLiveEvent
  | SystemEventLiveEvent
  | PluginLiveEvent
  | ProjectLifecycleLiveEvent
  | UnknownLiveEvent;

export interface LiveEventSubscriberObservation {
  subscriber: LiveEventSubscriber;
  observedAt: string;
  action: 'handled' | 'ignored' | 'recorded' | 'refreshed' | 'errored';
  detail?: string;
}

export interface LiveEventRecord<T extends LiveEvent = LiveEvent> {
  event: T;
  subscribers: LiveEventSubscriberObservation[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

const stringOrNull = (value: unknown): string | null | undefined => {
  if (typeof value === 'string') return value;
  if (value === null) return null;
  return undefined;
};

const rawTypeFor = (data: Record<string, unknown>) =>
  typeof data.type === 'string' ? data.type : 'unknown';

const segmentIdFromData = (data: Record<string, unknown>) =>
  data.active_segment_id !== undefined
    ? (data.active_segment_id as string | null)
    : (data.segment_id as string | null | undefined);

const categoryForTopic = (topic: string): LiveEventCategory => {
  if (topic === 'queue.items') return 'queue';
  if (topic === 'projects.lifecycle') return 'project';
  if (topic === 'chapters.lifecycle' || topic === 'chapters.progress') return 'chapter';
  if (topic === 'segments.lifecycle' || topic === 'segments.progress') return 'segment';
  if (topic === 'tts.logs') return 'log';
  if (topic === 'voice.test') return 'voice';
  if (topic === 'system.events') return 'system';
  if (topic.startsWith('plugins.')) return 'plugin';
  return 'system';
};

const baseEvent = <TPayload>(
  envelope: StudioSocketEnvelope,
  data: Record<string, unknown>,
  fields: Pick<LiveEventBase<TPayload>, 'topic' | 'category' | 'eventKind' | 'payload'>,
  pluginId?: string | null,
): LiveEventBase<TPayload> => ({
  frameId: envelope.frameId,
  receivedAt: envelope.receivedAt,
  rawType: rawTypeFor(data),
  topic: fields.topic,
  category: fields.category,
  eventKind: fields.eventKind,
  source: stringOrNull(data.source),
  jobId: stringOrNull(data.job_id),
  projectId: stringOrNull(data.project_id),
  chapterId: stringOrNull(data.chapter_id),
  segmentId: segmentIdFromData(data),
  pluginId: pluginId || stringOrNull(data.plugin_id) || stringOrNull(data.pluginId) || null,
  payload: fields.payload,
  raw: envelope.raw,
});

const normalizeUnknown = (
  envelope: StudioSocketEnvelope,
  data: unknown,
): LiveEvent => {
  const record = isRecord(data) ? data : { value: data };
  return baseEvent(envelope, record, {
    topic: 'system.events',
    category: 'system',
    eventKind: 'unknown',
    payload: data,
  }) as any;
};

export const normalizeStudioSocketEnvelope = (envelope: StudioSocketEnvelope): LiveEvent => {
  if (!isRecord(envelope.data)) return normalizeUnknown(envelope, envelope.data);

  const type = rawTypeFor(envelope.data);

  if (type === 'studio_event') {
    const data = envelope.data as any;
    const ids = data.ids || {};
    return {
      frameId: envelope.frameId,
      receivedAt: envelope.receivedAt,
      rawType: 'studio_event',
      topic: data.topic,
      category: categoryForTopic(data.topic),
      eventKind: data.eventKind,
      source: data.source || null,
      pluginId: data.pluginId || null,
      projectId: ids.projectId || null,
      chapterId: ids.chapterId || null,
      jobId: ids.jobId || null,
      segmentId: ids.segmentId || null,
      payload: data.payload,
      raw: envelope.raw,
    } as any;
  }

  return normalizeUnknown(envelope, envelope.data);
};

export const appendLiveEventSubscriber = (
  record: LiveEventRecord,
  subscriber: LiveEventSubscriber,
  action: LiveEventSubscriberObservation['action'],
  detail?: string,
) => {
  if (record.subscribers.some(observation => observation.subscriber === subscriber)) return;

  const observation: LiveEventSubscriberObservation = {
    subscriber,
    observedAt: new Date().toISOString(),
    action,
  };
  if (detail !== undefined) {
    observation.detail = detail;
  }
  record.subscribers.push(observation);
};
