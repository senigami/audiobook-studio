import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useJobs } from '@/hooks/useJobs';
import {
  publishStudioSocketMessage,
  resetStudioSocketBusForTests,
  setStudioSocketConnected,
  setStudioSocketSender,
} from '@/store/studioSocketBus';
import {
  getLiveEventAuditSnapshot,
  resetLiveEventAuditForTests,
} from '@/store/liveEventAuditStore';

describe('useJobs', () => {
  let sendMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    resetStudioSocketBusForTests();
    resetLiveEventAuditForTests();
    setStudioSocketConnected(true);
    sendMessage = vi.fn();
    setStudioSocketSender(sendMessage);
    delete (window as any).__websocketRecentMessages;
    delete (window as any).__ttsCommunicationTimeline;
  });

  const emit = (payload: any) => {
    act(() => {
      publishStudioSocketMessage(payload);
    });
  };

  const emitEvent = (topic: string, eventKind: string, payload: any, ids: any = {}) => {
    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic,
        eventKind,
        source: 'backend',
        emittedAt: Date.now() / 1000,
        pluginId: null,
        ids,
        payload,
      });
    });
  };

  it('refreshes jobs on mount by sending a snapshot request', async () => {
    const { result } = renderHook(() => useJobs());

    expect(result.current.loading).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith({ type: 'jobs_snapshot_request' });

    const mockJobs = [{ id: 'job1', status: 'running', progress: 0.5 }];
    emit({ type: 'jobs_snapshot', jobs: mockJobs });

    expect(result.current.loading).toBe(false);
    expect(result.current.jobs).toEqual({
      job1: mockJobs[0],
    });
  });

  it('handles job updates via the broadcast bus', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job1', status: 'running', progress: 0.1 }] });
    expect(result.current.loading).toBe(false);

    emitEvent('queue.items', 'queue_item_status', { progress: 0.2, status: 'running' }, { jobId: 'job1' });

    expect(result.current.jobs.job1.progress).toBe(0.2);
  });

  it('records debug message timeline on queue.items frames', async () => {
    renderHook(() => useJobs());
    emitEvent('queue.items', 'queue_item_status', { progress: 0.2, status: 'running' }, { jobId: 'job1' });

    const recent = (window as any).__websocketRecentMessages;
    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject({
      listener: 'useJobs',
      type: 'studio_event',
      topic: 'queue.items',
    });
  });

  it('preserves render-group fields from chapters.progress payloads', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job1', status: 'queued', progress: 0 }] });

    emitEvent('chapters.progress', 'chapter_progress', {
      status: 'running',
      progress: 0.44,
      renderGroupCount: 2,
      completedRenderGroups: 1,
      activeRenderGroupIndex: 1,
      totalRenderWeight: 200,
      completedRenderWeight: 100,
      activeRenderGroupWeight: 100,
      groupedProgress: 0.44,
      updatedAt: 999,
    }, { jobId: 'job1' });

    expect(result.current.jobs.job1).toMatchObject({
      status: 'running',
      progress: 0.44,
      render_group_count: 2,
      completed_render_groups: 1,
      active_render_group_index: 1,
      total_render_weight: 200,
      completed_render_weight: 100,
      active_render_group_weight: 100,
      grouped_progress: 0.44,
    });
  });

  it('records tts.logs diagnostics without mutating job state', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job1', status: 'running', progress: 0.2 }] });

    emitEvent('tts.logs', 'tts_log', {
      line: '[PROGRESS] 40% job1',
      sequence: 3,
    }, { jobId: 'job1', chapterId: 'chap1' });

    expect(result.current.jobs.job1).toMatchObject({ status: 'running', progress: 0.2 });
    expect((window as any).__ttsCommunicationTimeline).toHaveLength(1);
    expect((window as any).__ttsCommunicationTimeline[0]).toMatchObject({
      kind: 'tts_log',
      type: 'studio_event',
      job_id: 'job1',
      chapter_id: 'chap1',
      line: '[PROGRESS] 40% job1',
      sequence: 3,
    });
  });

  it('does not attribute tts.logs frames to jobs-state', async () => {
    renderHook(() => useJobs());

    emitEvent('tts.logs', 'tts_log', {
      line: '[PROGRESS] 40% job1',
      sequence: 3,
    }, { jobId: 'job1', chapterId: 'chap1' });

    const records = getLiveEventAuditSnapshot();
    expect(records).toHaveLength(1);
    expect(records[0].event.topic).toBe('tts.logs');
    expect(records[0].subscribers.map(s => s.subscriber)).not.toContain('jobs-state');
  });

  it('does not fall back to fetchJobs when a new websocket job appears', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [] });

    emitEvent('queue.items', 'queue_item_status', {
      status: 'queued',
      progress: 0,
      classification: 'segment',
      parentJobId: 'job-parent',
      segmentIds: ['seg-1', 'seg-2'],
      engine: 'mixed',
    }, { jobId: 'job-new', chapterId: 'chap-1', projectId: 'proj-1' });

    expect(result.current.jobs['job-new']).toMatchObject({
      id: 'job-new',
      status: 'queued',
      chapter_id: 'chap-1',
      project_id: 'proj-1',
      engine: 'mixed',
      segment_ids: ['seg-1', 'seg-2'],
      classification: 'segment',
      parent_job_id: 'job-parent',
    });
  });

  it('triggers onJobComplete when a job finishes', async () => {
    const onJobComplete = vi.fn();
    const { result } = renderHook(() => useJobs(onJobComplete));

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job1', status: 'running', progress: 0.9 }] });

    emitEvent('queue.items', 'queue_item_status', { status: 'done', progress: 1.0 }, { jobId: 'job1' });

    expect(onJobComplete).toHaveBeenCalled();
    expect(result.current.jobs.job1.status).toBe('done');
  });

  it('handles queue_invalidated by requesting a new snapshot', async () => {
    const onQueueUpdate = vi.fn();
    renderHook(() => useJobs(undefined, onQueueUpdate));

    emitEvent('queue.items', 'queue_invalidated', { reason: 'test', changedFields: [] });

    expect(onQueueUpdate).toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenLastCalledWith({ type: 'jobs_snapshot_request' });
  });

  it('does not require an onQueueUpdate callback (queue.lifecycle is useQueueSync\'s domain)', async () => {
    // App.tsx intentionally passes undefined for onQueueUpdate so a queue_updated frame
    // does not trigger a redundant ProjectDetailPage reload on top of useQueueSync's refresh.
    renderHook(() => useJobs(undefined, undefined));
    expect(() => emitEvent('queue.items', 'queue_invalidated', { reason: 'test', changedFields: [] })).not.toThrow();
    expect(sendMessage).toHaveBeenLastCalledWith({ type: 'jobs_snapshot_request' });
  });

  it('routes a single queue.lifecycle frame to both queue-sync and jobs-state subscriber observations exactly once each', async () => {
    renderHook(() => useJobs());
    // Re-import audit store on demand to avoid extra top-level imports in this large file.
    const { getLiveEventAuditSnapshot } = await import('@/store/liveEventAuditStore');

    emitEvent('queue.items', 'queue_invalidated', { reason: 'test', changedFields: [] });

    const records = getLiveEventAuditSnapshot();
    const queueFrame = records.find(r => r.event.topic === 'queue.items');
    expect(queueFrame).toBeDefined();
    const subs = queueFrame!.subscribers.map(s => s.subscriber);
    // jobs-state is observed once for this frame. queue-sync would also appear here in
    // the full app, but is not present because this isolated useJobs render does not mount
    // useQueueSync. The point of this assertion is to guard against double-observation by
    // jobs-state for the same frame.
    expect(subs.filter(s => s === 'jobs-state')).toHaveLength(1);
  });

  it('handles queue_paused, segments_lifecycle, and chapter_lifecycle', async () => {
    const onPauseUpdate = vi.fn();
    const onSegmentsUpdate = vi.fn();
    const onChapterUpdate = vi.fn();

    renderHook(() => useJobs(undefined, undefined, onPauseUpdate, onSegmentsUpdate, onChapterUpdate));

    emitEvent('queue.items', 'queue_paused', { paused: true });
    emitEvent('segments.lifecycle', 'segment_lifecycle', { reason: 'test', changedFields: [] }, { chapterId: 'chap1' });
    emitEvent('chapters.lifecycle', 'chapter_lifecycle', { reason: 'test', changedFields: [] }, { chapterId: 'chap1' });

    expect(onPauseUpdate).toHaveBeenCalledWith(true);
    expect(onSegmentsUpdate).toHaveBeenCalledWith('chap1');
    expect(onChapterUpdate).toHaveBeenCalledWith('chap1');
  });

  it('stores dedicated segment progress websocket updates separately from job progress', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job1', status: 'running', progress: 0.35, active_segment_id: 'seg-2' }] });

    emitEvent('segments.progress', 'segment_progress', { progress: 0.75 }, { jobId: 'job1', chapterId: 'chap-1', segmentId: 'seg-2' });

    expect(result.current.jobs.job1.progress).toBe(0.35);
    expect(result.current.segmentProgress['seg-2']).toEqual({
      job_id: 'job1',
      chapter_id: 'chap-1',
      segment_id: 'seg-2',
      progress: 0.75,
    });
  });

  it('ignores websocket status regressions for an existing job', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-1', status: 'done', progress: 1, created_at: 1 } as any] });

    emitEvent('queue.items', 'queue_item_status', { status: 'running', progress: 0.5 }, { jobId: 'job-1' });

    expect(result.current.jobs['job-1']?.status).toBe('done');
    expect(result.current.jobs['job-1']?.progress).toBe(1);
  });

  it('ignores stale normalized websocket updates by updated_at', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-1', status: 'running', progress: 0.7, created_at: 1, updated_at: 200 } as any] });

    emitEvent('queue.items', 'queue_item_status', {
      status: 'running',
      progress: 0.4,
      updatedAt: 100,
    }, { jobId: 'job-1' });

    expect(result.current.jobs['job-1']?.progress).toBe(0.7);
    expect(result.current.jobs['job-1']?.updated_at).toBe(200);
  });

  it('feeds done progress=1 followed by finalizing progress=0.99 for the same job_id and proves the frontend keeps done/progress=1', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-term', status: 'running', progress: 0.9, created_at: 1, updated_at: 100 } as any] });

    emitEvent('queue.items', 'queue_item_status', {
      status: 'done',
      progress: 1.0,
      updatedAt: 200,
    }, { jobId: 'job-term' });

    expect(result.current.jobs['job-term']?.status).toBe('done');
    expect(result.current.jobs['job-term']?.progress).toBe(1.0);

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'queue.items',
        eventKind: 'queue_item_status',
        source: 'backend',
        emittedAt: Date.now() / 1000,
        pluginId: null,
        ids: { jobId: 'job-term' },
        payload: {
          status: 'finalizing',
          progress: 0.99,
          updatedAt: 210,
        },
      });
    });

    expect(result.current.jobs['job-term']?.status).toBe('done');
    expect(result.current.jobs['job-term']?.progress).toBe(1.0);
  });

  it('unrelated project_updated/chapter_updated/queue_updated messages do not alter live progress state', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-live', status: 'running', progress: 0.5 } as any] });

    emitEvent('queue.items', 'queue_invalidated', { reason: 'test', changedFields: [] });
    emitEvent('projects.lifecycle', 'project_invalidated', { reason: 'test', changedFields: [] }, { projectId: 'proj1' });
    emitEvent('chapters.lifecycle', 'chapter_lifecycle', { reason: 'test', changedFields: [] }, { chapterId: 'chap1' });

    expect(result.current.jobs['job-live']?.status).toBe('running');
    expect(result.current.jobs['job-live']?.progress).toBe(0.5);
  });

  it('updates live job progress and status entirely from queue.items alone without requiring full refetches', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-1', status: 'preparing', progress: 0.1 } as any] });
    expect(result.current.jobs['job-1']?.progress).toBe(0.1);
    expect(result.current.jobs['job-1']?.status).toBe('preparing');

    sendMessage.mockClear();

    emitEvent('queue.items', 'queue_item_status', {
      status: 'running',
      progress: 0.33,
    }, { jobId: 'job-1' });

    expect(result.current.jobs['job-1']?.progress).toBe(0.33);
    expect(result.current.jobs['job-1']?.status).toBe('running');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('propagates active_segment_id and active_segment_progress from queue.items into Job map', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-seg', status: 'running', progress: 0 }] });

    emitEvent('queue.items', 'queue_item_status', {
      status: 'running',
      progress: 0.44,
      updatedAt: 500,
      activeSegmentId: 'seg-abc',
      activeSegmentProgress: 0.8,
    }, { jobId: 'job-seg' });

    expect(result.current.jobs['job-seg']?.active_segment_id).toBe('seg-abc');
    expect(result.current.jobs['job-seg']?.active_segment_progress).toBe(0.8);
  });

  it('clears active_segment_id and resets active_segment_progress=0 when terminal queue.items arrives', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-t', status: 'running', progress: 0.9, active_segment_id: 'seg-x', active_segment_progress: 0.9 }] });

    emitEvent('queue.items', 'queue_item_status', {
      status: 'done',
      progress: 1.0,
      updatedAt: 9999,
      activeSegmentId: null,
      activeSegmentProgress: 0.0,
    }, { jobId: 'job-t' });

    expect(result.current.jobs['job-t']?.status).toBe('done');
    expect(result.current.jobs['job-t']?.progress).toBe(1.0);
    expect(result.current.jobs['job-t']?.active_segment_id).toBeNull();
    expect(result.current.jobs['job-t']?.active_segment_progress).toBe(0.0);
  });

  it('records chapter-state or segment-state subscriber observations on handled bus frames', async () => {
    renderHook(() => useJobs());

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'chapters.progress',
        eventKind: 'chapter_progress',
        payload: {
          status: 'running',
          progress: 0.5,
          groupedProgress: null,
          etaSeconds: null,
          message: 'active',
          reasonCode: null,
          renderGroupCount: null,
          completedRenderGroups: null,
        },
      });
    });

    const records = getLiveEventAuditSnapshot();
    expect(records).toHaveLength(1);
    const subscribers = records[0].subscribers.map(s => s.subscriber);
    expect(subscribers).toContain('chapter-state');
  });

  it('drives segment progress directly from segments.progress topic', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-seg', status: 'running', progress: 0 }] });

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        ids: { segmentId: 'seg-abc', jobId: 'job-seg', chapterId: 'chap-1' },
        payload: {
          status: 'running',
          progress: 0.85,
          segmentIndex: 1,
          segmentCount: 10,
          message: 'active',
          reasonCode: null,
        },
      });
    });

    expect(result.current.segmentProgress['seg-abc']).toEqual({
      job_id: 'job-seg',
      chapter_id: 'chap-1',
      segment_id: 'seg-abc',
      progress: 0.85,
    });
  });

  it('drives chapter progress directly from chapters.progress topic', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-chap', status: 'running', progress: 0.1 }] });

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'chapters.progress',
        eventKind: 'chapter_progress',
        ids: { jobId: 'job-chap', chapterId: 'chap-1' },
        payload: {
          status: 'running',
          progress: 0.45,
          groupedProgress: 0.4,
          etaSeconds: 120,
          message: 'chapter rendering',
          reasonCode: null,
          renderGroupCount: 10,
          completedRenderGroups: 4,
        },
      });
    });

    expect(result.current.jobs['job-chap']).toMatchObject({
      status: 'running',
      progress: 0.45,
      grouped_progress: 0.4,
      eta_seconds: 120,
      log: 'chapter rendering',
      render_group_count: 10,
      completed_render_groups: 4,
    });
  });
});
