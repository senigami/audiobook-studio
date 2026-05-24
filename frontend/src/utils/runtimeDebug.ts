import type { StudioSocketEnvelope } from '@/store/studioSocketBus';

const isTruthy = (value: string | null | undefined) => {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const readStorageFlag = (key: string) => {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
};

const readQueryFlag = () => {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return (
    isTruthy(params.get('debug'))
    || isTruthy(params.get('studioDebug'))
    || isTruthy(params.get('studio-debug'))
  );
};

export const shouldEnableStudioDebugLogging = () =>
  isTruthy(readStorageFlag('studioDebug'))
  || isTruthy(readStorageFlag('studio-debug'))
  || readQueryFlag();

export type StudioDebugSnapshot = {
  tag: string;
  timestamp: number;
  payload: unknown;
};

export type WebsocketDebugSnapshot = {
  listener: string;
  receivedAt: string;
  raw: string;
  type?: string;
  topic?: string;
  category?: string;
  eventKind?: string;
  pluginId?: string | null;
  source?: string;
  scope?: string;
  classification?: string;
  job_id?: string;
  project_id?: string;
  chapter_id?: string;
  segment_id?: string;
  status?: string;
  progress?: number;
  reason_code?: string;
  render_group_count?: number | null;
  completed_render_groups?: number | null;
  active_render_group_index?: number | null;
  total_render_weight?: number | null;
  completed_render_weight?: number | null;
  active_render_group_weight?: number | null;
  grouped_progress?: number | null;
};

/**
 * Which hook(s) consume a given websocket message type.
 *
 * - `queue`   → only useQueueSync reads it  (queue_updated, pause_updated)
 * - `chapter` → only useJobs reads it for chapter/segment context
 *               (tts_log_line, segment_progress, segments_updated,
 *                chapter_updated, test_progress)
 * - `both`    → both hooks react to it (studio_job_event, job_updated)
 * - `other`   → unknown / unclassified type
 */
export type WsAudience = 'queue' | 'chapter' | 'both' | 'other';

/** Derive the audience from the websocket message type string or studio_event properties. */
export const wsAudienceForType = (type: string | undefined, data?: Record<string, any>): WsAudience => {
  if (type === 'studio_event' && data) {
    const topic = data.topic;
    const eventKind = data.eventKind;
    if (topic === 'queue.items') {
      if (eventKind === 'queue_item_invalidated' || eventKind === 'queue_invalidated' || eventKind === 'queue_paused') {
        return 'queue';
      }
      return 'both';
    }
    if (topic === 'chapters.progress' || topic === 'chapters.lifecycle') {
      return 'both';
    }
    return 'chapter';
  }
  switch (type) {
    case 'queue_item_invalidated':
    case 'queue_updated':
    case 'pause_updated':
      return 'queue';
    case 'tts_log_line':
    case 'segment_progress':
    case 'segments_updated':
    case 'chapter_updated':
    case 'test_progress':
      return 'chapter';
    case 'studio_job_event':
    case 'job_updated':
      return 'both';
    default:
      return 'other';
  }
};

export type TtsCommunicationTimelineEntry = {
  kind: 'tts_log' | 'socket';
  listener: string;
  receivedAt: string;
  raw: string;
  type?: string;
  topic?: string;
  category?: string;
  eventKind?: string;
  source?: string;
  scope?: string;
  classification?: string;
  job_id?: string;
  project_id?: string;
  chapter_id?: string;
  segment_id?: string;
  status?: string;
  progress?: number;
  reason_code?: string;
  line?: string;
  marker?: string;
  sequence?: number;
  active_segment_id?: string | null;
  active_segment_progress?: number | null;
  active_render_group_index?: number | null;
  render_group_count?: number | null;
  completed_render_groups?: number | null;
  active_render_group_weight?: number | null;
  completed_render_weight?: number | null;
  total_render_weight?: number | null;
  grouped_progress?: number | null;
  message?: string | null;
  /** Debug-only: which hook(s) consume this message type. */
  audience: WsAudience;
  frameId?: number;
};

type StudioDebugWindow = Window & {
  __studioDebugSnapshots?: StudioDebugSnapshot[];
  __studioDebugLast?: StudioDebugSnapshot | null;
};

type WebsocketDebugWindow = Window & {
  __websocketRecentMessages?: WebsocketDebugSnapshot[];
  __websocketLastMessage?: WebsocketDebugSnapshot | null;
  __ttsCommunicationTimeline?: TtsCommunicationTimelineEntry[];
  __ttsCommunicationLast?: TtsCommunicationTimelineEntry | null;
};

const TIMELINE_EVENT_NAME = 'tts-communication-timeline-updated';
const TIMELINE_LIMIT = 1000;

export const getTtsCommunicationTimeline = (): TtsCommunicationTimelineEntry[] => {
  if (typeof window === 'undefined') return [];
  const win = window as WebsocketDebugWindow;
  return Array.isArray(win.__ttsCommunicationTimeline) ? [...win.__ttsCommunicationTimeline] : [];
};

export const clearTtsCommunicationTimeline = () => {
  if (typeof window === 'undefined') return;
  const win = window as WebsocketDebugWindow;
  win.__ttsCommunicationTimeline = [];
  win.__ttsCommunicationLast = null;
  window.dispatchEvent(new CustomEvent(TIMELINE_EVENT_NAME));
};

export const subscribeTtsCommunicationTimeline = (listener: () => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(TIMELINE_EVENT_NAME, listener);
  return () => window.removeEventListener(TIMELINE_EVENT_NAME, listener);
};

const pickValue = (data: Record<string, any>, updateData: Record<string, any>, key: string) => {
  if (data[key] !== undefined) return data[key];
  return updateData[key];
};

const appendTimelineEntry = (listener: string, payload: unknown, raw: string, envelope?: StudioSocketEnvelope) => {
  if (!payload || typeof payload !== 'object' || typeof window === 'undefined') return;

  const data = payload as Record<string, any>;
  const normalizedData = data.type === 'job_updated' && data.updates && typeof data.updates === 'object'
    ? { ...data, ...data.updates }
    : data;
  const updates = normalizedData.updates && typeof normalizedData.updates === 'object' ? normalizedData.updates as Record<string, any> : {};
  const receivedAt = envelope?.receivedAt ?? new Date().toISOString();
  const type = typeof normalizedData.type === 'string' ? normalizedData.type : undefined;

  const isStudioEvent = type === 'studio_event';
  const innerPayload = isStudioEvent && normalizedData.payload && typeof normalizedData.payload === 'object'
    ? normalizedData.payload as Record<string, any>
    : {};
  const innerIds = isStudioEvent && normalizedData.ids && typeof normalizedData.ids === 'object'
    ? normalizedData.ids as Record<string, any>
    : {};

  const segmentId = normalizedData.active_segment_id !== undefined
    ? normalizedData.active_segment_id
    : (normalizedData.segment_id ?? innerIds.segmentId ?? innerIds.segment_id);

  const entry: TtsCommunicationTimelineEntry = {
    kind: (type === 'tts_log_line' || (isStudioEvent && normalizedData.topic === 'tts.logs')) ? 'tts_log' : 'socket',
    listener,
    receivedAt,
    raw,
    audience: wsAudienceForType(type, normalizedData),
  };

  if (envelope?.frameId !== undefined) {
    entry.frameId = envelope.frameId;
  }

  if (type !== undefined) entry.type = type;
  if (normalizedData.topic !== undefined) entry.topic = normalizedData.topic;
  if (normalizedData.category !== undefined) entry.category = normalizedData.category;
  if (normalizedData.eventKind !== undefined) entry.eventKind = normalizedData.eventKind;
  if (normalizedData.source !== undefined) entry.source = normalizedData.source;
  if (normalizedData.scope !== undefined) entry.scope = normalizedData.scope;
  if (normalizedData.classification !== undefined) entry.classification = normalizedData.classification;

  const jobId = normalizedData.job_id ?? innerIds.jobId ?? innerIds.job_id;
  const projectId = normalizedData.project_id ?? innerIds.projectId ?? innerIds.project_id;
  const chapterId = normalizedData.chapter_id ?? innerIds.chapterId ?? innerIds.chapter_id;

  if (jobId !== undefined) entry.job_id = jobId;
  if (projectId !== undefined) entry.project_id = projectId;
  if (chapterId !== undefined) entry.chapter_id = chapterId;
  if (segmentId !== undefined) {
    entry.segment_id = segmentId;
    entry.active_segment_id = segmentId;
  }
  if (normalizedData.status !== undefined) entry.status = normalizedData.status;
  if (normalizedData.reason_code !== undefined) entry.reason_code = normalizedData.reason_code;
  if (normalizedData.message !== undefined) entry.message = normalizedData.message;
  if (typeof normalizedData.progress === 'number') entry.progress = normalizedData.progress;

  const line = normalizedData.line ?? innerPayload.line;
  const marker = normalizedData.marker ?? innerPayload.marker;
  const sequence = typeof normalizedData.sequence === 'number' ? normalizedData.sequence : innerPayload.sequence;

  if (line !== undefined) entry.line = line;
  if (marker !== undefined) entry.marker = marker;
  if (typeof sequence === 'number') entry.sequence = sequence;

  const summaryFields = [
    'active_segment_id',
    'active_segment_progress',
    'active_render_group_index',
    'render_group_count',
    'completed_render_groups',
    'active_render_group_weight',
    'completed_render_weight',
    'total_render_weight',
    'grouped_progress',
    'progress',
  ];
  for (const key of summaryFields) {
    const value = pickValue(normalizedData, updates, key);
    if (value !== undefined) {
      (entry as Record<string, any>)[key] = value;
    }
  }
  if (entry.message === undefined && updates.message !== undefined) {
    entry.message = updates.message;
  }
  if (entry.chapter_id === undefined && updates.chapter_id !== undefined) {
    entry.chapter_id = updates.chapter_id;
  }
  if (entry.project_id === undefined && updates.project_id !== undefined) {
    entry.project_id = updates.project_id;
  }
  if (entry.status === undefined && updates.status !== undefined) {
    entry.status = updates.status;
  }
  if (entry.reason_code === undefined && updates.reason_code !== undefined) {
    entry.reason_code = updates.reason_code;
  }

  const win = window as WebsocketDebugWindow;
  if (!Array.isArray(win.__ttsCommunicationTimeline)) {
    win.__ttsCommunicationTimeline = [];
  }
  // Find existing entry with the same frameId (if frameId is present).
  // Distinct messages must not be collapsed, and lossless append-only behavior is used if no frameId.
  const existingIdx = entry.frameId !== undefined
    ? win.__ttsCommunicationTimeline.findIndex(e => e.frameId === entry.frameId)
    : -1;

  if (existingIdx !== -1) {
    const existing = win.__ttsCommunicationTimeline[existingIdx];
    const existingListeners = existing.listener.split(',').map(s => s.trim()).filter(Boolean);
    if (!existingListeners.includes(listener)) {
      existingListeners.push(listener);
    }
    existing.listener = existingListeners.join(', ');
    existing.audience = 'both';
  } else {
    win.__ttsCommunicationTimeline.push(entry);
  }
  while (win.__ttsCommunicationTimeline.length > TIMELINE_LIMIT) {
    win.__ttsCommunicationTimeline.shift();
  }
  win.__ttsCommunicationLast = entry;
  window.dispatchEvent(new CustomEvent(TIMELINE_EVENT_NAME, { detail: entry }));

};

export const recordStudioDebugSnapshot = (tag: string, payload: unknown) => {
  if (!shouldEnableStudioDebugLogging() || typeof window === 'undefined') return;

  const win = window as StudioDebugWindow;
  const entry: StudioDebugSnapshot = {
    tag,
    timestamp: Date.now(),
    payload,
  };

  if (!Array.isArray(win.__studioDebugSnapshots)) {
    win.__studioDebugSnapshots = [];
  }

  win.__studioDebugSnapshots.push(entry);
  if (win.__studioDebugSnapshots.length > 200) {
    win.__studioDebugSnapshots.shift();
  }
  win.__studioDebugLast = entry;
  console.warn(`[${tag}]`, payload);
};

export const recordWebsocketDebugMessage = (listener: string, payload: unknown, raw?: string, envelope?: StudioSocketEnvelope) => {
  if (typeof window === 'undefined') return;

  const win = window as WebsocketDebugWindow;
  const serializedRaw = raw ?? (typeof payload === 'string' ? payload : JSON.stringify(payload));
  const receivedAt = envelope?.receivedAt ?? new Date().toISOString();
  const entry: WebsocketDebugSnapshot = {
    listener,
    receivedAt,
    raw: serializedRaw,
  };

  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, any>;
    if (data.type !== undefined) entry.type = data.type;
    if (data.topic !== undefined) entry.topic = data.topic;
    if (data.category !== undefined) entry.category = data.category;
    if (data.eventKind !== undefined) entry.eventKind = data.eventKind;
    if (data.pluginId !== undefined) entry.pluginId = data.pluginId;
    if (data.source !== undefined) entry.source = data.source;
    if (data.scope !== undefined) entry.scope = data.scope;
    if (data.classification !== undefined) entry.classification = data.classification;
    if (data.job_id !== undefined) entry.job_id = data.job_id;
    if (data.project_id !== undefined) entry.project_id = data.project_id;
    if (data.chapter_id !== undefined) entry.chapter_id = data.chapter_id;
    if (data.status !== undefined) entry.status = data.status;
    if (data.progress !== undefined) entry.progress = data.progress;
    if (data.reason_code !== undefined) entry.reason_code = data.reason_code;
    if (data.render_group_count !== undefined) entry.render_group_count = data.render_group_count;
    if (data.completed_render_groups !== undefined) entry.completed_render_groups = data.completed_render_groups;
    if (data.active_render_group_index !== undefined) entry.active_render_group_index = data.active_render_group_index;
    if (data.total_render_weight !== undefined) entry.total_render_weight = data.total_render_weight;
    if (data.completed_render_weight !== undefined) entry.completed_render_weight = data.completed_render_weight;
    if (data.active_render_group_weight !== undefined) entry.active_render_group_weight = data.active_render_group_weight;
    if (data.grouped_progress !== undefined) entry.grouped_progress = data.grouped_progress;
  }

  if (!Array.isArray(win.__websocketRecentMessages)) {
    win.__websocketRecentMessages = [];
  }

  win.__websocketRecentMessages.push(entry);
  if (win.__websocketRecentMessages.length > 400) {
    win.__websocketRecentMessages.shift();
  }
  win.__websocketLastMessage = entry;
  appendTimelineEntry(listener, payload, serializedRaw, envelope);
};
