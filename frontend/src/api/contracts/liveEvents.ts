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
  | 'plugin';

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

const TERMINAL_STATUSES = new Set(['done', 'failed', 'cancelled']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

const stringOrNull = (value: unknown): string | null | undefined => {
  if (typeof value === 'string') return value;
  if (value === null) return null;
  return undefined;
};

const numberOrNull = (value: unknown): number | null | undefined => {
  if (typeof value === 'number') return value;
  if (value === null) return null;
  return undefined;
};

const stringArrayOrNull = (value: unknown): string[] | null | undefined => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (value === null) return null;
  return undefined;
};

const booleanOrNull = (value: unknown): boolean | null | undefined => {
  if (typeof value === 'boolean') return value;
  if (value === null) return null;
  return undefined;
};

const rawTypeFor = (data: Record<string, unknown>) =>
  typeof data.type === 'string' ? data.type : 'unknown';

const normalizeSourceData = (data: Record<string, unknown>) => {
  if (data.type === 'job_updated' && isRecord(data.updates)) {
    return { ...data, ...data.updates };
  }
  return data;
};

const segmentIdFromData = (data: Record<string, unknown>) =>
  data.active_segment_id !== undefined
    ? (data.active_segment_id as string | null)
    : (data.segment_id as string | null | undefined);

const categoryForTopic = (topic: string): LiveEventCategory => {
  if (topic === 'queue.items') return 'queue';
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

const normalizeTtsLog = (
  envelope: StudioSocketEnvelope,
  data: Record<string, unknown>,
): LiveEvent => baseEvent(envelope, data, {
  topic: 'tts.logs',
  category: 'log',
  eventKind: 'tts_log',
  payload: {
    line: typeof data.line === 'string' ? data.line : '',
    marker: stringOrNull(data.marker) || null,
    sequence: numberOrNull(data.sequence) || 0,
    pluginId: stringOrNull(data.plugin_id) || stringOrNull(data.pluginId) || '',
    jobId: stringOrNull(data.job_id) || null,
    chapterId: stringOrNull(data.chapter_id) || null,
    source: stringOrNull(data.source) || 'tts.logs',
    backendReceivedAt: numberOrNull(data.received_at),
  },
}) as any;

const normalizeJobProgress = (
  envelope: StudioSocketEnvelope,
  data: Record<string, unknown>,
): LiveEvent => {
  const normalizedData = normalizeSourceData(data);
  const status = stringOrNull(normalizedData.status) || 'queued';
  const segmentId = segmentIdFromData(normalizedData) || null;
  const segmentProgress = numberOrNull(normalizedData.active_segment_progress);
  const progress = numberOrNull(normalizedData.progress) ?? 0;
  const reasonCode = stringOrNull(normalizedData.reason_code) || null;
  const isTerminal = typeof status === 'string' && TERMINAL_STATUSES.has(status);
  const hasSegment = typeof segmentId === 'string' && segmentId.length > 0;
  const hasSegmentProgress = typeof segmentProgress === 'number';

  const classification = stringOrNull(normalizedData.classification);
  const parentJobId = stringOrNull(normalizedData.parent_job_id);
  const chapterId = stringOrNull(normalizedData.chapter_id);

  let topic: LiveEventTopic = 'queue.items';
  let category: LiveEventCategory = 'queue';
  let eventKind: LiveEventKind = 'queue_item_status';

  if (classification === 'segment' || segmentId || parentJobId) {
    topic = 'segments.progress';
    category = 'segment';
    eventKind = 'segment_progress';
    if (reasonCode === 'segment_saved') {
      eventKind = 'segment_saved';
    } else if (hasSegment && !hasSegmentProgress) {
      eventKind = 'segment_started';
    }
  } else if (classification === 'chapter' || chapterId) {
    topic = 'chapters.progress';
    category = 'chapter';
    eventKind = 'chapter_progress';
  }

  if (isTerminal) {
    eventKind = 'queue_item_status';
    if (topic === 'chapters.progress') {
      eventKind = 'chapter_progress';
    } else if (topic === 'segments.progress') {
      eventKind = 'segment_progress';
    }
  }

  const payload: any = {
    status,
    progress,
    etaSeconds: numberOrNull(normalizedData.eta_seconds) ?? null,
    estimatedEndAt: numberOrNull(normalizedData.estimated_end_at) ?? null,
    etaBasis: stringOrNull(normalizedData.eta_basis) ?? null,
    etaConfidence: stringOrNull(normalizedData.eta_confidence) ?? null,
    startedAt: numberOrNull(normalizedData.started_at) ?? null,
    updatedAt: numberOrNull(normalizedData.updated_at) ?? null,
    reasonCode,
    message: stringOrNull(normalizedData.message) ?? null,
    activeSegmentId: segmentId,
    activeSegmentProgress: segmentProgress ?? null,
    renderGroupCount: numberOrNull(normalizedData.render_group_count) ?? null,
    completedRenderGroups: numberOrNull(normalizedData.completed_render_groups) ?? null,
    activeRenderGroupIndex: numberOrNull(normalizedData.active_render_group_index) ?? null,
    totalRenderWeight: numberOrNull(normalizedData.total_render_weight) ?? null,
    completedRenderWeight: numberOrNull(normalizedData.completed_render_weight) ?? null,
    activeRenderGroupWeight: numberOrNull(normalizedData.active_render_group_weight) ?? null,
    groupedProgress: numberOrNull(normalizedData.grouped_progress) ?? null,
    classification: classification || 'job',
    changedFields: null,

    // Legacy fields for backward compatibility with active hooks
    eta_seconds: numberOrNull(normalizedData.eta_seconds),
    estimated_end_at: numberOrNull(normalizedData.estimated_end_at),
    eta_basis: stringOrNull(normalizedData.eta_basis),
    eta_confidence: stringOrNull(normalizedData.eta_confidence),
    started_at: numberOrNull(normalizedData.started_at),
    updated_at: numberOrNull(normalizedData.updated_at),
    reason_code: reasonCode,
    active_segment_id: segmentId,
    active_segment_progress: segmentProgress,
    render_group_count: numberOrNull(normalizedData.render_group_count),
    completed_render_groups: numberOrNull(normalizedData.completed_render_groups),
    active_render_group_index: numberOrNull(normalizedData.active_render_group_index),
    total_render_weight: numberOrNull(normalizedData.total_render_weight),
    completed_render_weight: numberOrNull(normalizedData.completed_render_weight),
    active_render_group_weight: numberOrNull(normalizedData.active_render_group_weight),
    grouped_progress: numberOrNull(normalizedData.grouped_progress),
  };

  return baseEvent(envelope, normalizedData, {
    topic,
    category,
    eventKind,
    payload,
  }) as any;
};

const normalizeQueueLifecycle = (
  envelope: StudioSocketEnvelope,
  data: Record<string, unknown>,
): LiveEvent => {
  const isPause = rawTypeFor(data) === 'pause_updated';
  return baseEvent(envelope, data, {
    topic: 'queue.items',
    category: 'queue',
    eventKind: isPause ? 'queue_paused' : 'queue_item_invalidated',
    payload: {
      status: 'queued',
      progress: 0,
      etaSeconds: null,
      message: isPause ? 'Queue pause status changed' : (stringOrNull(data.reason) || 'Queue update'),
      reasonCode: isPause ? 'queue_paused' : (stringOrNull(data.reason) || 'queue_invalidated'),
      classification: 'job',
      changedFields: stringArrayOrNull(data.changed_fields) || null,
      paused: booleanOrNull(data.paused),
      // Legacy duplicate fields
      changed_fields: stringArrayOrNull(data.changed_fields),
    },
  }) as any;
};

const normalizeInvalidation = (
  envelope: StudioSocketEnvelope,
  data: Record<string, unknown>,
): LiveEvent => {
  if (rawTypeFor(data) === 'segments_updated') {
    return baseEvent(envelope, data, {
      topic: 'segments.lifecycle',
      category: 'segment',
      eventKind: 'segment_lifecycle',
      payload: {
        reason: stringOrNull(data.reason) || 'segments_updated',
        changedFields: stringArrayOrNull(data.changed_fields) || [],
      },
    }) as any;
  }

  return baseEvent(envelope, data, {
    topic: 'chapters.lifecycle',
    category: 'chapter',
    eventKind: 'chapter_lifecycle',
    payload: {
      reason: stringOrNull(data.reason) || 'chapter_updated',
      changedFields: stringArrayOrNull(data.changed_fields) || [],
    },
  }) as any;
};

const normalizeVoiceTest = (
  envelope: StudioSocketEnvelope,
  data: Record<string, unknown>,
): LiveEvent => baseEvent(envelope, data, {
  topic: 'voice.test',
  category: 'voice',
  eventKind: 'voice_test_progress',
  payload: {
    voiceName: stringOrNull(data.name) || '',
    status: 'running',
    progress: numberOrNull(data.progress) || 0,
    startedAt: numberOrNull(data.started_at) || 0,
    message: null,
  },
}) as any;

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

  switch (type) {
    case 'tts_log_line':
      return normalizeTtsLog(envelope, envelope.data);
    case 'studio_job_event':
    case 'job_updated':
    case 'segment_progress':
      return normalizeJobProgress(envelope, envelope.data);
    case 'queue_updated':
    case 'pause_updated':
      return normalizeQueueLifecycle(envelope, envelope.data);
    case 'chapter_updated':
    case 'segments_updated':
      return normalizeInvalidation(envelope, envelope.data);
    case 'test_progress':
      return normalizeVoiceTest(envelope, envelope.data);
    default:
      return normalizeUnknown(envelope, envelope.data);
  }
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
