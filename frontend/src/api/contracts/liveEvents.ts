export interface StudioSocketEnvelope<T = unknown> {
  frameId: number;
  receivedAt: string;
  data: T;
  raw?: string;
}

export type LiveEventTopic =
  | 'tts.logs'
  | 'jobs.progress'
  | 'queue.lifecycle'
  | 'chapter.invalidate'
  | 'segments.invalidate'
  | 'voice.test'
  | 'system.unknown';

export type LiveEventCategory =
  | 'log'
  | 'queue'
  | 'job'
  | 'chapter'
  | 'segment'
  | 'voice'
  | 'system';

export type LiveEventSubscriber =
  | 'queue-sync'
  | 'jobs-state'
  | 'tts-diagnostics'
  | 'live-output';

export type LiveEventKind =
  | 'tts_log'
  | 'job_status'
  | 'job_progress'
  | 'job_terminal'
  | 'segment_started'
  | 'segment_progress'
  | 'segment_saved'
  | 'queue_invalidated'
  | 'queue_pause_changed'
  | 'chapter_invalidated'
  | 'segments_invalidated'
  | 'voice_test_progress'
  | 'unknown';

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
  payload: TPayload;
  raw?: string;
}

export interface TtsLogLiveEvent extends LiveEventBase<{
  line: string;
  marker?: string | null;
  sequence?: number | null;
  backendReceivedAt?: number | null;
}> {
  topic: 'tts.logs';
  category: 'log';
  eventKind: 'tts_log';
}

export interface JobProgressPayload {
  status?: string | null;
  progress?: number | null;
  eta_seconds?: number | null;
  estimated_end_at?: number | null;
  eta_basis?: string | null;
  eta_confidence?: string | null;
  started_at?: number | null;
  updated_at?: number | null;
  reason_code?: string | null;
  message?: string | null;
  active_segment_id?: string | null;
  active_segment_progress?: number | null;
  render_group_count?: number | null;
  completed_render_groups?: number | null;
  active_render_group_index?: number | null;
  total_render_weight?: number | null;
  completed_render_weight?: number | null;
  active_render_group_weight?: number | null;
  grouped_progress?: number | null;
}

export interface JobProgressLiveEvent extends LiveEventBase<JobProgressPayload> {
  topic: 'jobs.progress';
  category: 'job' | 'segment';
  eventKind:
    | 'job_status'
    | 'job_progress'
    | 'job_terminal'
    | 'segment_started'
    | 'segment_progress'
    | 'segment_saved';
}

export interface QueueLifecycleLiveEvent extends LiveEventBase<{
  reason?: string | null;
  changed_fields?: string[] | null;
  paused?: boolean | null;
}> {
  topic: 'queue.lifecycle';
  category: 'queue';
  eventKind: 'queue_invalidated' | 'queue_pause_changed';
}

export interface ChapterInvalidationLiveEvent extends LiveEventBase<{
  reason?: string | null;
}> {
  topic: 'chapter.invalidate';
  category: 'chapter';
  eventKind: 'chapter_invalidated';
}

export interface SegmentsInvalidationLiveEvent extends LiveEventBase<{
  reason?: string | null;
}> {
  topic: 'segments.invalidate';
  category: 'segment';
  eventKind: 'segments_invalidated';
}

export interface VoiceTestLiveEvent extends LiveEventBase<Record<string, unknown>> {
  topic: 'voice.test';
  category: 'voice';
  eventKind: 'voice_test_progress';
}

export interface UnknownLiveEvent extends LiveEventBase<unknown> {
  topic: 'system.unknown';
  category: 'system';
  eventKind: 'unknown';
}

export type LiveEvent =
  | TtsLogLiveEvent
  | JobProgressLiveEvent
  | QueueLifecycleLiveEvent
  | ChapterInvalidationLiveEvent
  | SegmentsInvalidationLiveEvent
  | VoiceTestLiveEvent
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

const baseEvent = <TPayload>(
  envelope: StudioSocketEnvelope,
  data: Record<string, unknown>,
  fields: Pick<LiveEventBase<TPayload>, 'topic' | 'category' | 'eventKind' | 'payload'>,
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
  payload: fields.payload,
  raw: envelope.raw,
});

const normalizeTtsLog = (
  envelope: StudioSocketEnvelope,
  data: Record<string, unknown>,
): TtsLogLiveEvent => baseEvent(envelope, data, {
  topic: 'tts.logs',
  category: 'log',
  eventKind: 'tts_log',
  payload: {
    line: typeof data.line === 'string' ? data.line : '',
    marker: stringOrNull(data.marker),
    sequence: numberOrNull(data.sequence),
    backendReceivedAt: numberOrNull(data.received_at),
  },
}) as TtsLogLiveEvent;

const normalizeJobProgress = (
  envelope: StudioSocketEnvelope,
  data: Record<string, unknown>,
): JobProgressLiveEvent => {
  const normalizedData = normalizeSourceData(data);
  const status = stringOrNull(normalizedData.status);
  const segmentId = segmentIdFromData(normalizedData);
  const segmentProgress = numberOrNull(normalizedData.active_segment_progress);
  const progress = numberOrNull(normalizedData.progress);
  const reasonCode = stringOrNull(normalizedData.reason_code);
  const isTerminal = typeof status === 'string' && TERMINAL_STATUSES.has(status);
  const hasSegment = typeof segmentId === 'string' && segmentId.length > 0;
  const hasSegmentProgress = typeof segmentProgress === 'number';

  let eventKind: JobProgressLiveEvent['eventKind'] = 'job_status';
  let category: JobProgressLiveEvent['category'] = 'job';

  if (isTerminal) {
    eventKind = 'job_terminal';
  } else if (reasonCode === 'segment_saved') {
    eventKind = 'segment_saved';
    category = 'segment';
  } else if (hasSegment && hasSegmentProgress) {
    eventKind = 'segment_progress';
    category = 'segment';
  } else if (hasSegment) {
    eventKind = 'segment_started';
    category = 'segment';
  } else if (typeof progress === 'number') {
    eventKind = 'job_progress';
  }

  return baseEvent(envelope, normalizedData, {
    topic: 'jobs.progress',
    category,
    eventKind,
    payload: {
      status,
      progress,
      eta_seconds: numberOrNull(normalizedData.eta_seconds),
      estimated_end_at: numberOrNull(normalizedData.estimated_end_at),
      eta_basis: stringOrNull(normalizedData.eta_basis),
      eta_confidence: stringOrNull(normalizedData.eta_confidence),
      started_at: numberOrNull(normalizedData.started_at),
      updated_at: numberOrNull(normalizedData.updated_at),
      reason_code: reasonCode,
      message: stringOrNull(normalizedData.message),
      active_segment_id: segmentId,
      active_segment_progress: segmentProgress,
      render_group_count: numberOrNull(normalizedData.render_group_count),
      completed_render_groups: numberOrNull(normalizedData.completed_render_groups),
      active_render_group_index: numberOrNull(normalizedData.active_render_group_index),
      total_render_weight: numberOrNull(normalizedData.total_render_weight),
      completed_render_weight: numberOrNull(normalizedData.completed_render_weight),
      active_render_group_weight: numberOrNull(normalizedData.active_render_group_weight),
      grouped_progress: numberOrNull(normalizedData.grouped_progress),
    },
  }) as JobProgressLiveEvent;
};

const normalizeQueueLifecycle = (
  envelope: StudioSocketEnvelope,
  data: Record<string, unknown>,
): QueueLifecycleLiveEvent => baseEvent(envelope, data, {
  topic: 'queue.lifecycle',
  category: 'queue',
  eventKind: rawTypeFor(data) === 'pause_updated' ? 'queue_pause_changed' : 'queue_invalidated',
  payload: {
    reason: stringOrNull(data.reason),
    changed_fields: stringArrayOrNull(data.changed_fields),
    paused: booleanOrNull(data.paused),
  },
}) as QueueLifecycleLiveEvent;

const normalizeInvalidation = (
  envelope: StudioSocketEnvelope,
  data: Record<string, unknown>,
): ChapterInvalidationLiveEvent | SegmentsInvalidationLiveEvent => {
  if (rawTypeFor(data) === 'segments_updated') {
    return baseEvent(envelope, data, {
      topic: 'segments.invalidate',
      category: 'segment',
      eventKind: 'segments_invalidated',
      payload: { reason: stringOrNull(data.reason) },
    }) as SegmentsInvalidationLiveEvent;
  }

  return baseEvent(envelope, data, {
    topic: 'chapter.invalidate',
    category: 'chapter',
    eventKind: 'chapter_invalidated',
    payload: { reason: stringOrNull(data.reason) },
  }) as ChapterInvalidationLiveEvent;
};

const normalizeVoiceTest = (
  envelope: StudioSocketEnvelope,
  data: Record<string, unknown>,
): VoiceTestLiveEvent => baseEvent(envelope, data, {
  topic: 'voice.test',
  category: 'voice',
  eventKind: 'voice_test_progress',
  payload: data,
}) as VoiceTestLiveEvent;

const normalizeUnknown = (
  envelope: StudioSocketEnvelope,
  data: unknown,
): UnknownLiveEvent => {
  const record = isRecord(data) ? data : { value: data };
  return baseEvent(envelope, record, {
    topic: 'system.unknown',
    category: 'system',
    eventKind: 'unknown',
    payload: data,
  }) as UnknownLiveEvent;
};

export const normalizeStudioSocketEnvelope = (envelope: StudioSocketEnvelope): LiveEvent => {
  if (!isRecord(envelope.data)) return normalizeUnknown(envelope, envelope.data);

  const type = rawTypeFor(envelope.data);
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
