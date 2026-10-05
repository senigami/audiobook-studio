/**
 * Typed frame builders — each returns a raw socket message shaped to the
 * real studio_event contract (frontend/src/api/contracts/liveEvents.ts).
 * The shape mirrors what publishStudioSocketMessage receives before wrapping.
 */

// ---------------------------------------------------------------------------
// Studio event envelope helpers
// ---------------------------------------------------------------------------

interface StudioEventBase {
  type: 'studio_event';
  version: 1;
  topic: string;
  eventKind: string;
  ids: Record<string, string | null | undefined>;
  payload: Record<string, unknown>;
}

const studioEvent = (
  topic: string,
  eventKind: string,
  ids: Record<string, string | null | undefined>,
  payload: Record<string, unknown>,
): StudioEventBase => ({
  type: 'studio_event',
  version: 1,
  topic,
  eventKind,
  ids,
  payload,
});

// ---------------------------------------------------------------------------
// queueItemStatus
// ---------------------------------------------------------------------------

export interface QueueItemStatusParams {
  jobId: string;
  projectId?: string | null;
  chapterId?: string | null;
  status: 'queued' | 'preparing' | 'running' | 'finalizing' | 'done' | 'failed' | 'cancelled';
  progress?: number;
  etaSeconds?: number | null;
  customTitle?: string | null;
  engine?: string | null;
  message?: string | null;
  reasonCode?: string | null;
  hasSegmentSupport?: boolean;
  startedAt?: number | null;
  completedAt?: number | null;
}

export const queueItemStatus = (p: QueueItemStatusParams) =>
  studioEvent(
    'queue.items',
    'queue_item_status',
    { jobId: p.jobId, projectId: p.projectId ?? null, chapterId: p.chapterId ?? null },
    {
      status: p.status,
      progress: p.progress ?? 0,
      etaSeconds: p.etaSeconds ?? null,
      message: p.message ?? null,
      reasonCode: p.reasonCode ?? null,
      customTitle: p.customTitle ?? null,
      engine: p.engine ?? null,
      hasSegmentSupport: p.hasSegmentSupport ?? true,
      startedAt: p.startedAt ?? null,
      completedAt: p.completedAt ?? null,
    },
  );

// ---------------------------------------------------------------------------
// jobLifecycle
// ---------------------------------------------------------------------------

export interface JobLifecycleParams {
  jobId: string;
  projectId?: string | null;
  chapterId?: string | null;
  status: 'queued' | 'preparing' | 'running' | 'finalizing' | 'done' | 'failed' | 'cancelled';
  message?: string | null;
  reasonCode?: string | null;
  startedAt?: number | null;
  updatedAt?: number | null;
  hasSegmentSupport?: boolean;
}

export const jobLifecycle = (p: JobLifecycleParams) =>
  studioEvent(
    'jobs.lifecycle',
    'job_lifecycle',
    { jobId: p.jobId, projectId: p.projectId ?? null, chapterId: p.chapterId ?? null },
    {
      status: p.status,
      reasonCode: p.reasonCode ?? null,
      message: p.message ?? null,
      startedAt: p.startedAt ?? null,
      updatedAt: p.updatedAt ?? null,
      hasSegmentSupport: p.hasSegmentSupport ?? true,
    },
  );

// ---------------------------------------------------------------------------
// chapterProgress
// ---------------------------------------------------------------------------

export interface ChapterProgressParams {
  jobId: string;
  chapterId: string;
  projectId?: string | null;
  status: 'queued' | 'preparing' | 'running' | 'finalizing' | 'done' | 'failed' | 'cancelled';
  progress: number;
  groupedProgress?: number | null;
  etaSeconds?: number | null;
  reasonCode?: string | null;
  renderGroupCount?: number | null;
  completedRenderGroups?: number | null;
  message?: string | null;
  hasSegmentSupport?: boolean;
}

export const chapterProgress = (p: ChapterProgressParams) =>
  studioEvent(
    'chapters.progress',
    'chapter_progress',
    { jobId: p.jobId, chapterId: p.chapterId, projectId: p.projectId ?? null },
    {
      status: p.status,
      progress: p.progress,
      groupedProgress: p.groupedProgress ?? null,
      etaSeconds: p.etaSeconds ?? null,
      message: p.message ?? null,
      reasonCode: p.reasonCode ?? null,
      renderGroupCount: p.renderGroupCount ?? null,
      completedRenderGroups: p.completedRenderGroups ?? null,
      hasSegmentSupport: p.hasSegmentSupport ?? true,
    },
  );

// ---------------------------------------------------------------------------
// segmentProgress
// ---------------------------------------------------------------------------

export interface SegmentProgressParams {
  segmentId: string;
  jobId: string;
  chapterId: string;
  projectId?: string | null;
  status: 'preparing' | 'running' | 'processing' | 'finalizing' | 'done' | 'failed';
  progress: number;
  segmentIndex?: number | null;
  segmentCount?: number | null;
  reasonCode?: string | null;
  activeSegmentId?: string | null;
  activeSegmentProgress?: number | null;
  etaSeconds?: number | null;
  message?: string | null;
  hasSegmentSupport?: boolean;
}

export const segmentProgress = (p: SegmentProgressParams) =>
  studioEvent(
    'segments.progress',
    'segment_progress',
    { jobId: p.jobId, chapterId: p.chapterId, segmentId: p.segmentId, projectId: p.projectId ?? null },
    {
      status: p.status,
      progress: p.progress,
      segmentIndex: p.segmentIndex ?? null,
      segmentCount: p.segmentCount ?? null,
      message: p.message ?? null,
      reasonCode: p.reasonCode ?? null,
      etaSeconds: p.etaSeconds ?? null,
      activeSegmentId: p.activeSegmentId ?? p.segmentId,
      activeSegmentProgress: p.activeSegmentProgress ?? p.progress,
      hasSegmentSupport: p.hasSegmentSupport ?? true,
    },
  );

// ---------------------------------------------------------------------------
// segmentsLifecycle
// ---------------------------------------------------------------------------

export interface SegmentsLifecycleParams {
  chapterId: string;
  jobId?: string | null;
  projectId?: string | null;
}

export const segmentsLifecycle = (p: SegmentsLifecycleParams) =>
  studioEvent(
    'segments.lifecycle',
    'segment_lifecycle',
    { chapterId: p.chapterId, jobId: p.jobId ?? null, projectId: p.projectId ?? null },
    {
      reasonCode: 'segments_updated',
      changedFields: [],
    },
  );

// ---------------------------------------------------------------------------
// ttsLog
// ---------------------------------------------------------------------------

export interface TtsLogParams {
  jobId?: string | null;
  chapterId?: string | null;
  projectId?: string | null;
  line: string;
  pluginId?: string | null;
  level?: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
}

export const ttsLog = (p: TtsLogParams) =>
  studioEvent(
    'tts.logs',
    'tts_log',
    { jobId: p.jobId ?? null, chapterId: p.chapterId ?? null, projectId: p.projectId ?? null },
    {
      line: p.line,
      level: p.level ?? 'INFO',
      pluginId: p.pluginId ?? null,
    },
  );

// ---------------------------------------------------------------------------
// jobsSnapshot  (control message — not a studio_event envelope)
// ---------------------------------------------------------------------------

export const jobsSnapshot = (jobs: any[]) => ({
  type: 'jobs_snapshot' as const,
  jobs,
});
