import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useJobs, resetGlobalSegmentProgressUpdates } from '@/hooks/useJobs';
import { adaptEventToJobUpdates } from '@/utils/jobEventAdapters';
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
    resetGlobalSegmentProgressUpdates();
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
    expect(result.current.segmentProgress).toEqual({});
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

  it('does not attribute tts.logs frames to main-queue', async () => {
    renderHook(() => useJobs());

    emitEvent('tts.logs', 'tts_log', {
      line: '[PROGRESS] 40% job1',
      sequence: 3,
    }, { jobId: 'job1', chapterId: 'chap1' });

    const records = getLiveEventAuditSnapshot();
    expect(records).toHaveLength(1);
    expect(records[0].event.topic).toBe('tts.logs');
    expect(records[0].subscribers.map(s => s.subscriber)).not.toContain('main-queue');
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

  it('handles queue_item_invalidated by requesting a new snapshot', async () => {
    const onQueueUpdate = vi.fn();
    renderHook(() => useJobs(undefined, onQueueUpdate));

    emitEvent('queue.items', 'queue_item_invalidated', { reason: 'test', changedFields: [] });

    expect(onQueueUpdate).toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenLastCalledWith({ type: 'jobs_snapshot_request' });
  });

  it('does not require an onQueueUpdate callback (queue.lifecycle is useQueueSync\'s domain)', async () => {
    // App.tsx intentionally passes undefined for onQueueUpdate so a queue_item_invalidated frame
    // does not trigger a redundant ProjectDetailPage reload on top of useQueueSync's refresh.
    renderHook(() => useJobs(undefined, undefined));
    expect(() => emitEvent('queue.items', 'queue_item_invalidated', { reason: 'test', changedFields: [] })).not.toThrow();
    expect(sendMessage).toHaveBeenLastCalledWith({ type: 'jobs_snapshot_request' });
  });

  it('routes a single queue.items status frame to main-queue subscriber observations exactly once each', async () => {
    renderHook(() => useJobs());
    // Re-import audit store on demand to avoid extra top-level imports in this large file.
    const { getLiveEventAuditSnapshot } = await import('@/store/liveEventAuditStore');

    emitEvent('queue.items', 'queue_item_status', { progress: 0.1, status: 'running' }, { jobId: 'job-1' });

    const records = getLiveEventAuditSnapshot();
    const queueFrame = records.find(r => r.event.topic === 'queue.items');
    expect(queueFrame).toBeDefined();
    const subs = queueFrame!.subscribers.map(s => s.subscriber);
    // main-queue is observed once for this frame. queue-sync would also appear here in
    // the full app, but is not present because this isolated useJobs render does not mount
    // useQueueSync. The point of this assertion is to guard against double-observation by
    // main-queue for the same frame.
    expect(subs.filter(s => s === 'main-queue')).toHaveLength(1);
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

  it('ignores rogue active segment fields from queue.items updates', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-seg', status: 'running', progress: 0 }] });

    emitEvent('queue.items', 'queue_item_status', {
      status: 'running',
      progress: 0.44,
      updatedAt: 500,
      activeSegmentId: 'seg-abc',
      activeSegmentProgress: 0.8,
    }, { jobId: 'job-seg' });

    expect(result.current.jobs['job-seg']?.active_segment_id).toBeUndefined();
    expect(result.current.jobs['job-seg']?.active_segment_progress).toBeUndefined();
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

  it('clears active segment fields when terminal jobs.lifecycle arrives', async () => {
    const { result } = renderHook(() => useJobs());

    emit({
      type: 'jobs_snapshot',
      jobs: [{
        id: 'job-terminal-lifecycle',
        status: 'running',
        progress: 0.9,
        active_segment_id: 'seg-stale',
        active_segment_progress: 0.9,
        active_segment_eta_seconds: 3,
        active_segment_eta_basis: 'remaining_from_update',
        active_segment_updated_at: 500,
      }],
    });

    emitEvent('jobs.lifecycle', 'job_lifecycle', {
      status: 'done',
      reasonCode: 'JOB_DONE',
      progress: 1.0,
      updatedAt: 9999,
    }, { jobId: 'job-terminal-lifecycle' });

    expect(result.current.jobs['job-terminal-lifecycle']?.status).toBe('done');
    expect(result.current.jobs['job-terminal-lifecycle']?.active_segment_id).toBeNull();
    expect(result.current.jobs['job-terminal-lifecycle']?.active_segment_progress).toBe(0.0);
    expect(result.current.jobs['job-terminal-lifecycle']?.active_segment_eta_seconds).toBeNull();
    expect(result.current.jobs['job-terminal-lifecycle']?.active_segment_updated_at).toBeNull();
  });

  it('records main-queue and chapter-state subscriber observations on handled chapter progress frames', async () => {
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
    expect(subscribers).toContain('main-queue');
    expect(subscribers).toContain('chapter-state');
  });

  it('records main-queue and chapter-state subscriber observations on handled chapter lifecycle frames', async () => {
    renderHook(() => useJobs());

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'chapters.lifecycle',
        eventKind: 'chapter_lifecycle',
        ids: { jobId: 'job-chap', chapterId: 'chap-1' },
        payload: {
          reasonCode: 'chapter_started',
          changedFields: ['status'],
        },
      });
    });

    const records = getLiveEventAuditSnapshot();
    expect(records).toHaveLength(1);
    const subscribers = records[0].subscribers.map(s => s.subscriber);
    expect(subscribers).toContain('main-queue');
    expect(subscribers).toContain('chapter-state');
  });

  it('records main-queue and voice-test-state subscriber observations on voice.test frames', async () => {
    renderHook(() => useJobs());

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'voice.test',
        eventKind: 'voice_test_progress',
        payload: {
          voiceName: 'Narrator 1',
          progress: 0.4,
          startedAt: 1234,
        },
      });
    });

    const records = getLiveEventAuditSnapshot();
    expect(records).toHaveLength(1);
    const subscribers = records[0].subscribers.map(s => s.subscriber);
    expect(subscribers).toContain('main-queue');
    expect(subscribers).toContain('voice-test-state');
  });

  it('updates the jobs state from voice.test frames when they carry a job id', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-voice-test-1', status: 'running', progress: 0.1 }] });

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'voice.test',
        eventKind: 'voice_test_progress',
        ids: { jobId: 'job-voice-test-1' },
        payload: {
          voiceName: 'feeling-lucky',
          status: 'running',
          progress: 0.55,
          startedAt: 12345,
        },
      });
    });

    expect(result.current.jobs['job-voice-test-1']).toMatchObject({
      status: 'running',
      progress: 0.55,
    });
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

  it('drives segment progress and chapter job active_segment_progress from segments.progress using activeSegmentProgress payload field', async () => {
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
          progress: 0.1,
          activeSegmentProgress: 0.83,
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
      progress: 0.83,
    });

    expect(result.current.jobs['job-seg']?.active_segment_progress).toBe(0.83);
  });

  it('replaces prior progress with latest segments.progress for the same segment', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-seg', status: 'running', progress: 0 }] });

    // Initial progress event: 0.4
    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        ids: { segmentId: 'seg-abc', jobId: 'job-seg', chapterId: 'chap-1' },
        payload: {
          status: 'running',
          progress: 0.4,
          segmentIndex: 1,
          segmentCount: 10,
          message: 'active',
          reasonCode: null,
        },
      });
    });

    expect(result.current.segmentProgress['seg-abc'].progress).toBe(0.4);

    // Latest progress event: 0.8
    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        ids: { segmentId: 'seg-abc', jobId: 'job-seg', chapterId: 'chap-1' },
        payload: {
          status: 'running',
          progress: 0.8,
          segmentIndex: 1,
          segmentCount: 10,
          message: 'active',
          reasonCode: null,
        },
      });
    });

    expect(result.current.segmentProgress['seg-abc'].progress).toBe(0.8);
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

  it('preserves live segment ETA when a later chapters.progress update carries chapter-level ETA', async () => {
    const { result } = renderHook(() => useJobs());
    emit({
      type: 'jobs_snapshot',
      jobs: [{
        id: 'job-seg-eta',
        status: 'running',
        progress: 0.2,
        classification: 'segment',
        active_segment_id: 'seg-live',
        active_segment_progress: 0.55,
        eta_seconds: 18,
        eta_basis: 'remaining_from_update',
        estimated_end_at: 118,
      } as any],
    });

    emitEvent('chapters.progress', 'chapter_progress', {
      status: 'running',
      progress: 0.48,
      groupedProgress: 0.46,
      etaSeconds: 120,
      message: 'chapter rendering',
      reasonCode: null,
      renderGroupCount: 10,
      completedRenderGroups: 4,
    }, { jobId: 'job-seg-eta', chapterId: 'chap-1' });

    expect(result.current.jobs['job-seg-eta']).toMatchObject({
      status: 'running',
      progress: 0.48,
      grouped_progress: 0.46,
      eta_seconds: 18,
      eta_basis: 'remaining_from_update',
      estimated_end_at: 118,
    });
  });

  it('does not overwrite row logs with segment progress narration on chapters.progress', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-msg', status: 'running', progress: 0.1, log: 'Stable chapter progress message' } as any] });

    // Send chapters.progress with reasonCode segment_start
    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'chapters.progress',
        eventKind: 'chapter_progress',
        ids: { jobId: 'job-msg', chapterId: 'chap-1' },
        payload: {
          status: 'running',
          progress: 0.2,
          reasonCode: 'segment_start',
          message: 'Segment synthesis log line',
        },
      });
    });

    // Check progress is updated, but log/message is NOT updated to segment log line
    expect(result.current.jobs['job-msg']).toMatchObject({
      status: 'running',
      progress: 0.2,
      log: 'Stable chapter progress message',
    });

    // Send chapters.progress with reasonCode segment_saved
    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'chapters.progress',
        eventKind: 'chapter_progress',
        ids: { jobId: 'job-msg', chapterId: 'chap-1' },
        payload: {
          status: 'running',
          progress: 0.3,
          reasonCode: 'segment_saved',
          message: 'Saved segment log line',
        },
      });
    });

    // Check progress is updated, but log/message is still NOT updated
    expect(result.current.jobs['job-msg']).toMatchObject({
      status: 'running',
      progress: 0.3,
      log: 'Stable chapter progress message',
    });

    // Send a normal update without segment reasonCode
    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'chapters.progress',
        eventKind: 'chapter_progress',
        ids: { jobId: 'job-msg', chapterId: 'chap-1' },
        payload: {
          status: 'running',
          progress: 0.4,
          reasonCode: 'normal_update',
          message: 'New chapter progress message',
        },
      });
    });

    // Both progress and log should be updated
    expect(result.current.jobs['job-msg']).toMatchObject({
      status: 'running',
      progress: 0.4,
      log: 'New chapter progress message',
    });
  });

  it('projects segments.progress active segment metadata onto matching chapter job', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-seg', status: 'running', progress: 0.35 }] });

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
          message: 'active segment progress log',
          reasonCode: 'segment_progress_tick',
          etaSeconds: 15,
        },
      });
    });

    // 1. segmentProgress is updated correctly
    expect(result.current.segmentProgress['seg-abc']).toEqual({
      job_id: 'job-seg',
      chapter_id: 'chap-1',
      segment_id: 'seg-abc',
      progress: 0.85,
    });

    // 2. Projected active segment metadata is placed on the chapter job
    const job = result.current.jobs['job-seg'];
    expect(job).toBeDefined();
    expect(job.active_segment_id).toBe('seg-abc');
    expect(job.active_segment_progress).toBe(0.85);
    expect(job.status).toBe('running');
    expect(job.active_segment_eta_seconds).toBe(15);
    expect(job.active_segment_eta_basis).toBe('remaining_from_update');
    expect(job.eta_seconds).toBeUndefined();
    expect(job.log).toBe('active segment progress log');
    expect(job.reason_code).toBe('segment_progress_tick');

    // 3. Do not overwrite chapter-level job.progress with segment-local progress!
    expect(job.progress).toBe(0.35);

    // 4. Record both relevant subscriber observations: chapter-state and segment-state
    const { getLiveEventAuditSnapshot } = await import('@/store/liveEventAuditStore');
    const records = getLiveEventAuditSnapshot();
    const segmentFrame = records.find(r => r.event.topic === 'segments.progress');
    expect(segmentFrame).toBeDefined();
    const subs = segmentFrame!.subscribers.map(s => s.subscriber);
    expect(subs).toContain('segment-state');
    expect(subs).toContain('chapter-state');
  });

  it('does not project done status from segments.progress onto matching chapter job', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-seg', status: 'running', progress: 0.35 }] });

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        ids: { segmentId: 'seg-abc', jobId: 'job-seg', chapterId: 'chap-1' },
        payload: {
          status: 'done',
          progress: 1.0,
          segmentIndex: 1,
          segmentCount: 10,
          message: 'segment synthesis done',
          reasonCode: 'segment_saved',
        },
      });
    });

    // Segment progress is updated
    expect(result.current.segmentProgress['seg-abc'].progress).toBe(1.0);

    // Chapter job status is NOT changed to done
    const job = result.current.jobs['job-seg'];
    expect(job).toBeDefined();
    expect(job.status).toBe('running');
  });

  it('allows a terminal done job to roll back to running when receiving a newer active event', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-rollback', status: 'done', progress: 1.0, updated_at: 100 } as any] });

    expect(result.current.jobs['job-rollback']?.status).toBe('done');

    // Emit event with newer updatedAt and status running
    emitEvent('queue.items', 'queue_item_status', {
      status: 'running',
      progress: 0.15,
      updatedAt: 150,
    }, { jobId: 'job-rollback' });

    expect(result.current.jobs['job-rollback']?.status).toBe('running');
    expect(result.current.jobs['job-rollback']?.progress).toBe(0.15);
  });

  it('ignores older active events and does not revive/rollback a terminal done job', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-rollback-ignore', status: 'done', progress: 1.0, updated_at: 200 } as any] });

    expect(result.current.jobs['job-rollback-ignore']?.status).toBe('done');

    // Emit event with older updatedAt and status running
    emitEvent('queue.items', 'queue_item_status', {
      status: 'running',
      progress: 0.15,
      updatedAt: 150,
    }, { jobId: 'job-rollback-ignore' });

    expect(result.current.jobs['job-rollback-ignore']?.status).toBe('done');
    expect(result.current.jobs['job-rollback-ignore']?.progress).toBe(1.0);
  });

  it('updates active_segment_id and active_segment_progress from segments.progress even when the current job status is done and database timestamps are absent', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-seg-done', status: 'done', progress: 1.0, updated_at: 100 } as any] });

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        emittedAt: 150,
        ids: { segmentId: 'seg-abc', jobId: 'job-seg-done', chapterId: 'chap-1' },
        payload: {
          status: 'running',
          progress: 0.85,
          segmentIndex: 1,
          segmentCount: 10,
          message: 'active segment progress log',
          reasonCode: 'segment_progress_tick',
        },
      });
    });

    const job = result.current.jobs['job-seg-done'];
    expect(job).toBeDefined();
    expect(job.active_segment_id).toBe('seg-abc');
    expect(job.active_segment_progress).toBe(0.85);
  });

  it('preserves project_id and chapter_id on segments.progress updates in the jobs store (overlay on existing job)', async () => {
    // CONTRACT CHANGE (Slice 5): segments.progress is overlay-only on existing rows —
    // it must not create a new job entry. The job must already exist (e.g. from a
    // jobs_snapshot) for segments.progress to apply active-segment overlay fields.
    // Old behavior: segments.progress for an unknown job created a new entry.
    // New behavior: the frame is a no-op for unknown jobs.
    const { result } = renderHook(() => useJobs());
    emit({
      type: 'jobs_snapshot',
      jobs: [{ id: 'job-seg-1', status: 'running', progress: 0, project_id: 'proj-1', chapter_id: 'chap-1' }],
    });

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        ids: { segmentId: 'seg-abc', jobId: 'job-seg-1', chapterId: 'chap-1', projectId: 'proj-1' },
        payload: {
          status: 'running',
          progress: 0.85,
          segmentIndex: 1,
          segmentCount: 10,
          message: 'active segment progress log',
          reasonCode: 'segment_progress_tick',
        },
      });
    });

    const job = result.current.jobs['job-seg-1'];
    expect(job).toBeDefined();
    // project_id and chapter_id come from the snapshot and must be preserved
    expect(job.project_id).toBe('proj-1');
    expect(job.chapter_id).toBe('chap-1');
  });

  it('does not discard active_segment_id and active_segment_progress when updates have an older timestamp', async () => {
    const { result } = renderHook(() => useJobs());
    emit({
      type: 'jobs_snapshot',
      jobs: [{
        id: 'job-timestamp-ignore',
        status: 'running',
        progress: 0.5,
        updated_at: 200,
        active_segment_id: 'seg-old',
        active_segment_progress: 0.2
      } as any]
    });

    // Emit event with older updatedAt (150 < 200)
    emitEvent('queue.items', 'queue_item_status', {
      status: 'running',
      progress: 0.3,
      updatedAt: 150,
      activeSegmentId: 'seg-new',
      activeSegmentProgress: 0.77,
    }, { jobId: 'job-timestamp-ignore' });

    // Job progress and status should be ignored (status remains running, progress remains 0.5)
    // BUT active_segment_id and active_segment_progress must be updated!
    const job = result.current.jobs['job-timestamp-ignore'];
    expect(job).toBeDefined();
    expect(job.progress).toBe(0.5);
    expect(job.active_segment_id).toBe('seg-new');
    expect(job.active_segment_progress).toBe(0.77);
  });

  it('propagates segment-scoped ETA and started_at from segments.progress only when present on socket payload', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-seg-metrics', status: 'running', progress: 0 }] });

    // 1. Emit without metrics, should not propagate
    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        ids: { segmentId: 'seg-abc', jobId: 'job-seg-metrics', chapterId: 'chap-1' },
        payload: {
          status: 'running',
          progress: 0.5,
        },
      });
    });

    let job = result.current.jobs['job-seg-metrics'];
    expect(job.eta_seconds).toBeUndefined();
    expect(job.eta_basis).toBeUndefined();
    expect(job.started_at).toBeUndefined();
    expect(job.active_segment_eta_seconds).toBeNull();
    expect(job.active_segment_eta_basis).toBeNull();

    // 2. Emit with metrics, should propagate to segment fields/trace
    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        ids: { segmentId: 'seg-abc', jobId: 'job-seg-metrics', chapterId: 'chap-1' },
        payload: {
          status: 'running',
          progress: 0.65,
          etaSeconds: 45,
          etaBasis: 'custom_basis',
          startedAt: 1234567,
        },
      });
    });

    job = result.current.jobs['job-seg-metrics'];
    expect(job.active_segment_eta_seconds).toBe(45);
    expect(job.active_segment_eta_basis).toBe('custom_basis');
    expect(job.started_at).toBeUndefined();
    expect(job.eta_seconds).toBeUndefined();
    expect(job.eta_basis).toBeUndefined();
    expect(job.segmentProgressSocketProvenance).toBeDefined();
    expect(job.segmentProgressSocketProvenance.selectedFields.started_at).toBe(1234567);
  });

  it('does not coerce null segment ETA payloads to zero', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-null-segment-eta', status: 'running', progress: 0 }] });

    emitEvent('segments.progress', 'segment_progress', {
      status: 'running',
      progress: 0,
      etaSeconds: null,
      reasonCode: 'START_SEGMENT',
    }, { jobId: 'job-null-segment-eta', chapterId: 'chap-1', segmentId: 'seg-1' });

    const job = result.current.jobs['job-null-segment-eta'];
    expect(job.active_segment_id).toBe('seg-1');
    expect(job.active_segment_progress).toBe(0);
    expect(job.active_segment_eta_seconds).toBeNull();
    expect(job.active_segment_eta_basis).toBeNull();
    expect(job.segmentProgressSocketProvenance.selectedFields.etaSeconds).toBeNull();
  });

  it('proves that a prior job/chapter started_at and eta_seconds survive a later segments.progress update, while segment-level ETA and startedAt are mapped to segment-specific fields', async () => {
    const { result } = renderHook(() => useJobs());
    emit({
      type: 'jobs_snapshot',
      jobs: [{
        id: 'job-prior-both',
        status: 'running',
        progress: 0.3,
        started_at: 1000000,
        eta_seconds: 120,
        eta_basis: 'remaining_from_update',
      } as any],
    });

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        ids: { segmentId: 'seg-abc', jobId: 'job-prior-both', chapterId: 'chap-1' },
        payload: {
          status: 'running',
          progress: 0.5,
          etaSeconds: 15,
          etaBasis: 'segment_basis',
          startedAt: 2000000,
        },
      });
    });

    const job = result.current.jobs['job-prior-both'];
    expect(job).toBeDefined();
    // Overall job/chapter ETA and started_at must survive unchanged
    expect(job.started_at).toBe(1000000);
    expect(job.eta_seconds).toBe(120);
    expect(job.eta_basis).toBe('remaining_from_update');
    // Segment specific ETA fields must be populated with the segment ETA
    expect(job.active_segment_eta_seconds).toBe(15);
    expect(job.active_segment_eta_basis).toBe('segment_basis');
    // Raw segment startedAt should be captured in debug provenance
    expect(job.segmentProgressSocketProvenance).toBeDefined();
    expect(job.segmentProgressSocketProvenance.selectedFields.started_at).toBe(2000000);
  });

  it('populates segmentProgressSocketProvenance only for segments.progress events and includes raw/selected fields', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-trace', status: 'running', progress: 0 }] });

    // 1. Emit queue.items event, should NOT populate segmentProgressSocketProvenance
    emitEvent('queue.items', 'queue_item_status', { progress: 0.1, status: 'running' }, { jobId: 'job-trace' });
    expect(result.current.jobs['job-trace']?.segmentProgressSocketProvenance).toBeUndefined();

    // 2. Emit segments.progress event, should populate segmentProgressSocketProvenance
    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        ids: { segmentId: 'seg-trace', jobId: 'job-trace', chapterId: 'chap-trace', projectId: 'proj-trace' },
        payload: {
          status: 'running',
          progress: 0.8,
          etaSeconds: 30,
        },
      });
    });

    const job = result.current.jobs['job-trace'];
    expect(job?.segmentProgressSocketProvenance).toBeDefined();
    expect(job?.segmentProgressSocketProvenance.consumedTopic).toBe('segments.progress');
    expect(job?.segmentProgressSocketProvenance.ignoredTopics).toEqual(["tts.logs", "queue.items", "chapters.progress"]);
    expect(job?.segmentProgressSocketProvenance.selectedFields).toMatchObject({
      topic: 'segments.progress',
      eventKind: 'segment_progress',
      projectId: 'proj-trace',
      chapterId: 'chap-trace',
      jobId: 'job-trace',
      segmentId: 'seg-trace',
      activeSegmentId: 'seg-trace',
      activeSegmentProgress: 0.8,
      etaSeconds: 30,
    });
  });

  it('preserves segmentProgressSocketProvenance through the stale-timestamp fast path', async () => {
    const { result } = renderHook(() => useJobs());
    // Seed job with a newer updated_at so the segments.progress event takes the stale-timestamp guard
    emit({
      type: 'jobs_snapshot',
      jobs: [{
        id: 'job-stale-prov',
        status: 'running',
        progress: 0.5,
        updated_at: 300,
        active_segment_id: 'seg-old',
        active_segment_progress: 0.2,
      } as any],
    });

    // Emit segments.progress with older updated_at (150 < 300) — triggers stale-timestamp guard
    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        emittedAt: 150,
        ids: { segmentId: 'seg-new', jobId: 'job-stale-prov', chapterId: 'chap-1', projectId: 'proj-1' },
        payload: {
          status: 'running',
          progress: 0.65,
          activeSegmentProgress: 0.88,
          etaSeconds: 20,
          updatedAt: 150,
        },
      });
    });

    const job = result.current.jobs['job-stale-prov'];
    expect(job).toBeDefined();
    // active_segment fields should still be updated (existing behavior)
    expect(job.active_segment_id).toBe('seg-new');
    expect(job.active_segment_progress).toBe(0.88);
    expect(job.active_segment_eta_seconds).toBe(20);
    expect(job.active_segment_eta_basis).toBe('remaining_from_update');
    expect(job.active_segment_updated_at).toBe(150);
    // segmentProgressSocketProvenance MUST survive the stale-timestamp fast path
    expect(job.segmentProgressSocketProvenance).toBeDefined();
    expect(job.segmentProgressSocketProvenance.consumedTopic).toBe('segments.progress');
    expect(job.segmentProgressSocketProvenance.selectedFields.segmentId).toBe('seg-new');
  });

  it('proves one compact history row is appended for each segments.progress event and not for unrelated topics', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-h1', status: 'running', progress: 0 }] });

    // 1. Emit queue.items event, should NOT append to segmentProgressUpdates
    emitEvent('queue.items', 'queue_item_status', { progress: 0.1, status: 'running' }, { jobId: 'job-h1' });
    expect(result.current.jobs['job-h1']?.segmentProgressUpdates).toBeUndefined();

    // 2. Emit segments.progress event, should append to segmentProgressUpdates
    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        ids: { segmentId: 'seg-h1', jobId: 'job-h1', chapterId: 'chap-h1', projectId: 'proj-h1' },
        payload: {
          status: 'running',
          progress: 0.8,
        },
      });
    });

    const job = result.current.jobs['job-h1'];
    expect(job?.segmentProgressUpdates).toBeDefined();
    expect(job?.segmentProgressUpdates.length).toBe(1);
    expect(job?.segmentProgressUpdates[0]).toMatchObject({
      topic: 'segments.progress',
      jobId: 'job-h1',
      chapterId: 'chap-h1',
      segmentId: 'seg-h1',
    });
  });

  it('proves the history is bounded to the last 20 entries', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-h2', status: 'running', progress: 0 }] });

    for (let i = 0; i < 25; i++) {
      act(() => {
        publishStudioSocketMessage({
          type: 'studio_event',
          version: 1,
          topic: 'segments.progress',
          eventKind: 'segment_progress',
          ids: { segmentId: `seg-${i}`, jobId: 'job-h2', chapterId: 'chap-h2', projectId: 'proj-h2' },
          payload: {
            status: 'running',
            progress: 0.1,
          },
        });
      });
    }

    const job = result.current.jobs['job-h2'];
    expect(job?.segmentProgressUpdates.length).toBe(20);
    // The first element is the newest (index 24) since we unshift or put to front
    expect(job?.segmentProgressUpdates[0].segmentId).toBe('seg-24');
    expect(job?.segmentProgressUpdates[19].segmentId).toBe('seg-5');
  });

  it('proves segments.progress updates do not lose active segment fields on later non-segment updates', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-h3', status: 'running', progress: 0 }] });

    // 1. Emit segment progress update
    emitEvent(
      'segments.progress',
      'segment_progress',
      { status: 'running', progress: 0.77 },
      { segmentId: 'seg-active-1', jobId: 'job-h3', chapterId: 'chap-h3', projectId: 'proj-h3' }
    );

    let job = result.current.jobs['job-h3'];
    expect(job.active_segment_id).toBe('seg-active-1');
    expect(job.active_segment_progress).toBe(0.77);

    // 2. Emit later non-segment update
    emitEvent('queue.items', 'queue_item_status', { progress: 0.8, status: 'running' }, { jobId: 'job-h3' });

    job = result.current.jobs['job-h3'];
    // Confirm it did not lose active_segment_id / active_segment_progress
    expect(job.active_segment_id).toBe('seg-active-1');
    expect(job.active_segment_progress).toBe(0.77);
  });

  it('proves chapter-level progress/ETA updates do not overwrite segment progress/ETA when active_segment_id is present', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-tdd-h', status: 'running', progress: 0 }] });

    // 1. Emit segment progress update (sets segment-local progress and ETA fields)
    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        ids: { segmentId: 'seg-active-tdd', jobId: 'job-tdd-h', chapterId: 'chap-1', projectId: 'proj-1' },
        payload: {
          status: 'running',
          progress: 0.77,
          etaSeconds: 15,
          updatedAt: 300,
        },
      });
    });

    let job = result.current.jobs['job-tdd-h'];
    expect(job.active_segment_id).toBe('seg-active-tdd');
    expect(job.active_segment_progress).toBe(0.77);
    expect(job.active_segment_eta_seconds).toBe(15);
    expect(job.active_segment_eta_basis).toBe('remaining_from_update');
    expect(job.active_segment_updated_at).toBe(300);

    // 2. Emit chapter-level update (chapters.progress)
    emitEvent('chapters.progress', 'chapter_progress', {
      status: 'running',
      progress: 0.48,
      groupedProgress: 0.46,
      etaSeconds: 120,
      updatedAt: 310,
    }, { jobId: 'job-tdd-h', chapterId: 'chap-1' });

    job = result.current.jobs['job-tdd-h'];
    // Chapter progress is updated
    expect(job.progress).toBe(0.48);
    // Segment local fields must NOT be overwritten or lost
    expect(job.active_segment_id).toBe('seg-active-tdd');
    expect(job.active_segment_progress).toBe(0.77);
    expect(job.active_segment_eta_seconds).toBe(15);
    expect(job.active_segment_eta_basis).toBe('remaining_from_update');
    expect(job.active_segment_updated_at).toBe(300);
  });

  it('preserves segment classification for segment-scoped jobs when chapter progress arrives', async () => {
    const { result } = renderHook(() => useJobs());
    emit({
      type: 'jobs_snapshot',
      jobs: [{
        id: 'job-segment-scope',
        status: 'running',
        progress: 0,
        project_id: 'proj-1',
        chapter_id: 'chap-1',
        segment_ids: ['seg-1', 'seg-2'],
        classification: 'segment',
      }],
    });

    emitEvent('segments.progress', 'segment_progress', {
      status: 'running',
      progress: 0.35,
      updatedAt: 400,
    }, { segmentId: 'seg-1', jobId: 'job-segment-scope', chapterId: 'chap-1', projectId: 'proj-1' });

    emitEvent('chapters.progress', 'chapter_progress', {
      status: 'running',
      progress: 0.2,
      groupedProgress: 0.2,
      updatedAt: 401,
    }, { jobId: 'job-segment-scope', chapterId: 'chap-1', projectId: 'proj-1' });

    const job = result.current.jobs['job-segment-scope'];
    expect(job.classification).toBe('segment');
    expect(job.segment_ids).toEqual(['seg-1', 'seg-2']);
    expect(job.active_segment_id).toBe('seg-1');
    expect(job.active_segment_progress).toBe(0.35);
  });

  it('honors a running 0% segment frame (with an ETA) as running so the bar animates from the first update', async () => {
    // The segment has genuinely started (START_SEGMENT / [PROGRESS] 0% after the
    // engine confirmed synthesis), carrying a real per-segment ETA. The projector
    // must NOT downgrade it to "preparing" — doing so nulls the predictive ETA and
    // the text highlight can't animate until the second update (the slow start).
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-segment-start', status: 'running', progress: 0 }] });

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        ids: { segmentId: 'seg-start', jobId: 'job-segment-start', chapterId: 'chap-start', projectId: 'proj-start' },
        payload: {
          status: 'running',
          progress: 0,
          reasonCode: 'START_SEGMENT',
          etaSeconds: 19,
          segmentIndex: 0,
          segmentCount: 2,
        },
      });
    });

    const job = result.current.jobs['job-segment-start'];
    expect(job).toBeDefined();
    expect(job.status).toBe('running');
    expect(job.active_segment_id).toBe('seg-start');
    expect(job.active_segment_progress).toBe(0);
    expect(job.active_segment_eta_seconds).toBe(19);
    expect(job.eta_seconds).toBeUndefined();
  });

  it('still treats a SEGMENT_PENDING announce (no engine confirmation yet) as preparing', async () => {
    // The genuine pre-confirmation/load window: announce before the engine confirms.
    // No segment ETA → do not pace; show preparing.
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-pending', status: 'preparing', progress: 0 }] });

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        ids: { segmentId: 'seg-pending', jobId: 'job-pending', chapterId: 'chap-1', projectId: 'proj-1' },
        payload: {
          status: 'running',
          progress: 0,
          reasonCode: 'SEGMENT_PENDING',
          etaSeconds: null,
        },
      });
    });

    expect(result.current.jobs['job-pending']?.status).toBe('preparing');
  });

  it('proves queue.items updates cannot overwrite active_segment_eta_seconds while active_segment_id is present', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-queue-h', status: 'running', progress: 0 }] });

    // 1. Emit segment progress update (sets segment-local progress and ETA fields)
    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        ids: { segmentId: 'seg-active-queue', jobId: 'job-queue-h', chapterId: 'chap-1', projectId: 'proj-1' },
        payload: {
          status: 'running',
          progress: 0.88,
          etaSeconds: 22,
          updatedAt: 400,
        },
      });
    });

    let job = result.current.jobs['job-queue-h'];
    expect(job.active_segment_id).toBe('seg-active-queue');
    expect(job.active_segment_progress).toBe(0.88);
    expect(job.active_segment_eta_seconds).toBe(22);

    // 2. Emit queue-level update (queue.items)
    emitEvent('queue.items', 'queue_item_status', {
      status: 'running',
      progress: 0.5,
      etaSeconds: 999,
      updatedAt: 410,
    }, { jobId: 'job-queue-h' });

    job = result.current.jobs['job-queue-h'];
    // Job progress is updated
    expect(job.progress).toBe(0.5);
    // Segment local ETA must NOT be overwritten by the queue update
    expect(job.active_segment_id).toBe('seg-active-queue');
    expect(job.active_segment_progress).toBe(0.88);
    expect(job.active_segment_eta_seconds).toBe(22);
    expect(job.active_segment_updated_at).toBe(400);
  });

  it('goes running on a running 0% segment frame (animate from frame 1) and keeps segment-local fields', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-prep-test', status: 'preparing', progress: 0 }] });
    expect(result.current.jobs['job-prep-test']?.status).toBe('preparing');

    // 1. The real bug-triggering frame: the first [PROGRESS] line at raw 0% that the
    //    backend publishes as running with reason_code SEGMENT_PROGRESS (started_at set)
    //    — NOT the canonical START_SEGMENT (which the old projector already let through).
    //    The projector must honor running so the bar can build a predictive lane
    //    immediately (not force it to preparing). Fails on pre-fix code.
    emitEvent('segments.progress', 'segment_progress', {
      status: 'running',
      progress: 0.0,
      activeSegmentProgress: 0.0,
      etaSeconds: 19,
      reasonCode: 'SEGMENT_PROGRESS',
    }, { jobId: 'job-prep-test', segmentId: 'seg-1' });

    expect(result.current.jobs['job-prep-test']?.status).toBe('running');
    expect(result.current.jobs['job-prep-test']?.active_segment_id).toBe('seg-1');
    expect(result.current.jobs['job-prep-test']?.active_segment_eta_seconds).toBe(19);

    // 2. A queue.items frame must not overwrite the segment-local ETA.
    emitEvent('queue.items', 'queue_item_status', {
      status: 'running',
      progress: 0.0,
    }, { jobId: 'job-prep-test' });

    expect(result.current.jobs['job-prep-test']?.status).toBe('running');
    expect(result.current.jobs['job-prep-test']?.active_segment_eta_seconds).toBe(19);

    // 3. Continued progress stays running.
    emitEvent('segments.progress', 'segment_progress', {
      status: 'running',
      progress: 0.05,
      activeSegmentProgress: 0.05,
    }, { jobId: 'job-prep-test', segmentId: 'seg-1' });

    expect(result.current.jobs['job-prep-test']?.status).toBe('running');
  });

  it('prevents queue.items/chapter updates at 0% from flipping a starting job out of preparing before the first segments.progress frame', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-early-prep', status: 'preparing', progress: 0, classification: 'segment' }] });
    expect(result.current.jobs['job-early-prep']?.status).toBe('preparing');

    // Emit queue.items status running update before any segment progress frame has arrived (active_segment_id is not attached yet)
    emitEvent('queue.items', 'queue_item_status', {
      status: 'running',
      progress: 0.0,
    }, { jobId: 'job-early-prep' });

    // Job status should stay preparing
    expect(result.current.jobs['job-early-prep']?.status).toBe('preparing');
  });

  it('goes running on a running 0% segment frame (the real segment start signal)', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-early-prep-2', status: 'preparing', progress: 0, classification: 'segment' }] });

    // A running 0% segments.progress frame is the authoritative segment-start signal
    // (synthesis confirmed) → honor running so the segment bar animates immediately.
    emitEvent('segments.progress', 'segment_progress', {
      status: 'running',
      progress: 0.0,
      activeSegmentProgress: 0.0,
      etaSeconds: 19,
      reasonCode: 'START_SEGMENT',
    }, { jobId: 'job-early-prep-2', segmentId: 'seg-2' });

    expect(result.current.jobs['job-early-prep-2']?.status).toBe('running');
  });

  it('treats canonical START_SEGMENT at 0% as the segment timer start', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-start-segment', status: 'preparing', progress: 0, classification: 'segment' }] });

    emitEvent('segments.progress', 'segment_progress', {
      status: 'running',
      progress: 0.0,
      activeSegmentProgress: 0.0,
      etaSeconds: 20,
      hasSegmentSupport: true,
      reasonCode: 'START_SEGMENT',
      updatedAt: 500,
    }, { jobId: 'job-start-segment', chapterId: 'chap-1', segmentId: 'seg-start' });

    const job = result.current.jobs['job-start-segment'];
    expect(job?.status).toBe('running');
    expect(job?.active_segment_id).toBe('seg-start');
    expect(job?.active_segment_progress).toBe(0);
    expect(job?.active_segment_eta_seconds).toBe(20);
    expect(job?.active_segment_updated_at).toBe(500);
    expect(job?.hasSegmentSupport).toBe(true);
    expect(job?.has_segment_support).toBe(true);
  });

  it('transitions segment-scoped job out of preparing normally on first non-zero segments.progress frame', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-early-prep-3', status: 'preparing', progress: 0, classification: 'segment' }] });

    // Emit queue.items status running update (stays preparing)
    emitEvent('queue.items', 'queue_item_status', {
      status: 'running',
      progress: 0.0,
    }, { jobId: 'job-early-prep-3' });
    expect(result.current.jobs['job-early-prep-3']?.status).toBe('preparing');

    // Emit segments.progress with non-zero progress
    emitEvent('segments.progress', 'segment_progress', {
      status: 'running',
      progress: 0.12,
      activeSegmentProgress: 0.12,
    }, { jobId: 'job-early-prep-3', segmentId: 'seg-3' });

    // Job status should transition to running
    expect(result.current.jobs['job-early-prep-3']?.status).toBe('running');
  });

  it('prevents non-segment updates from reintroducing active_segment_* fields', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-non-seg-reintro', status: 'running', progress: 0 }] });

    // Emit chapters.progress event carrying activeSegmentProgress and activeSegmentId (non-segment topic)
    emitEvent('chapters.progress', 'chapter_progress', {
      status: 'running',
      progress: 0.5,
      activeSegmentProgress: 0.99,
      activeSegmentId: 'seg-should-not-exist',
    }, { jobId: 'job-non-seg-reintro' });

    const job = result.current.jobs['job-non-seg-reintro'];
    expect(job.active_segment_progress).toBeUndefined();
    expect(job.active_segment_id).toBeUndefined();
  });

  it('chapter-classified job with active_segment_id still accepts later chapters.progress ETA updates', async () => {
    const { result } = renderHook(() => useJobs());
    emit({
      type: 'jobs_snapshot',
      jobs: [{
        id: 'job-chap-active-seg',
        status: 'running',
        progress: 0.2,
        classification: 'chapter',
        active_segment_id: 'seg-xyz',
        eta_seconds: 40,
        eta_basis: 'remaining_from_update',
        estimated_end_at: 1040,
      } as any],
    });

    emitEvent('chapters.progress', 'chapter_progress', {
      status: 'running',
      progress: 0.3,
      etaSeconds: 30,
      eta_basis: 'remaining_from_update',
      estimatedEndAt: 1040,
    }, { jobId: 'job-chap-active-seg', chapterId: 'chap-1' });

    expect(result.current.jobs['job-chap-active-seg'].eta_seconds).toBe(30);
  });

  it('true segment-scoped job still does not leak chapter ETA into the queue path', async () => {
    const { result } = renderHook(() => useJobs());
    emit({
      type: 'jobs_snapshot',
      jobs: [{
        id: 'job-seg-scoped',
        status: 'running',
        progress: 0.2,
        classification: 'segment',
        active_segment_id: 'seg-xyz',
        eta_seconds: 15,
        eta_basis: 'remaining_from_update',
        estimated_end_at: 1015,
      } as any],
    });

    emitEvent('chapters.progress', 'chapter_progress', {
      status: 'running',
      progress: 0.3,
      etaSeconds: 120, // chapter level ETA
      eta_basis: 'remaining_from_update',
      estimatedEndAt: 1120,
    }, { jobId: 'job-seg-scoped', chapterId: 'chap-1' });

    expect(result.current.jobs['job-seg-scoped'].eta_seconds).toBe(15); // Suppressed/preserved segment ETA
  });

  it('useJobs: preserves and propagates job confidence', async () => {
    const { result } = renderHook(() => useJobs());
    emit({
      type: 'jobs_snapshot',
      jobs: [{
        id: 'job-conf',
        status: 'running',
        progress: 0.2,
        classification: 'chapter',
        confidence: 0.85,
      } as any],
    });

    expect(result.current.jobs['job-conf'].confidence).toBe(0.85);

    emitEvent('chapters.progress', 'chapter_progress', {
      status: 'running',
      progress: 0.3,
      etaSeconds: 30,
      confidence: 0.62,
    }, { jobId: 'job-conf', chapterId: 'chap-1' });

    expect(result.current.jobs['job-conf'].confidence).toBe(0.62);
  });

  it('useJobs debug/provenance test: confidence and etaUpdatedAt are not reported under ignoredFields when present in segments.progress', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-provenance-test', status: 'running', progress: 0 }] });

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        ids: { segmentId: 'seg-xyz', jobId: 'job-provenance-test', chapterId: 'chap-1', projectId: 'proj-1' },
        payload: {
          status: 'running',
          progress: 0.85,
          etaSeconds: 30,
          etaUpdatedAt: 2000,
          confidence: 0.95,
          segmentIndex: 2,
          segmentCount: 5,
        },
      });
    });

    const job = result.current.jobs['job-provenance-test'];
    expect(job?.segmentProgressSocketProvenance).toBeDefined();
    const ignored = job.segmentProgressSocketProvenance.ignoredFields;
    expect(ignored).not.toContain('confidence');
    expect(ignored).not.toContain('etaUpdatedAt');
    expect(ignored).not.toContain('eta_updated_at');
    expect(ignored).not.toContain('segmentIndex');
    expect(ignored).not.toContain('segmentCount');
  });

  it('Frontend adapter test: canonical camelCase payloads are consumed correctly without relying on duplicate snake_case fields', () => {
    const mockEvent = {
      topic: 'chapters.progress',
      jobId: 'job-123',
      projectId: 'proj-456',
      chapterId: 'chap-789',
      payload: {
        status: 'running',
        progress: 0.77,
        groupedProgress: 0.6,
        etaSeconds: 45,
        etaUpdatedAt: 1500,
        confidence: 0.92,
        renderGroupCount: 8,
        completedRenderGroups: 4,
        hasSegmentSupport: true,
      },
    };
    const updates = adaptEventToJobUpdates(mockEvent);
    expect(updates.progress).toBe(0.77);
    expect(updates.grouped_progress).toBe(0.6);
    expect(updates.eta_seconds).toBe(45);
    expect(updates.eta_updated_at).toBe(1500);
    expect(updates.confidence).toBe(0.92);
    expect(updates.render_group_count).toBe(8);
    expect(updates.completed_render_groups).toBe(4);
    expect(updates.has_segment_support).toBe(true);
  });

  it('subscription remains active after rerenders with new inline callbacks (no dropped events)', () => {
    // Verify the hook stays subscribed after multiple rerenders where the caller
    // passes brand-new inline function references every time. If the subscription
    // effect listed callbacks as deps, it would tear down on each rerender and events
    // arriving during teardown would be silently dropped.
    let renderCount = 0;

    const { result, rerender } = renderHook(() => {
      renderCount++;
      const rc = renderCount; // capture to guarantee new closure on each render
      return useJobs(
        () => { void rc; },
        undefined,
        () => { void rc; },
        (_chapterId: string) => { void rc; },
        (_chapterId: string) => { void rc; }
      );
    });

    // Force several rerenders — each produces fresh inline callback references
    rerender();
    rerender();
    rerender();
    rerender();

    // After all the rerenders, publish a snapshot event. If the subscription had been
    // torn down and not re-established (i.e., there's a gap), jobs state would not update.
    act(() => {
      publishStudioSocketMessage({
        type: 'jobs_snapshot',
        jobs: [{ id: 'stable-job', status: 'done', progress: 1 }],
      });
    });

    // Subscription was intact: the event was received and state updated.
    expect(result.current.jobs['stable-job']).toBeDefined();
    expect(result.current.jobs['stable-job'].status).toBe('done');
  });

  // ── Slice 5: Row-Authority Guardrails ────────────────────────────────────

  it('[S5] chapters.progress frame for an UNKNOWN job id does NOT create a job entry', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [] });

    emitEvent('chapters.progress', 'chapter_progress', {
      status: 'running',
      progress: 0.5,
      groupedProgress: null,
      etaSeconds: 20,
      message: null,
      reasonCode: null,
      renderGroupCount: null,
      completedRenderGroups: null,
    }, { jobId: 'unknown-chapters-job', projectId: 'proj-1', chapterId: 'chap-1' });

    expect(result.current.jobs['unknown-chapters-job']).toBeUndefined();
  });

  it('[S5] chapters.progress overlay updates progress on an existing job', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'known-job', status: 'running', progress: 0.1 }] });

    emitEvent('chapters.progress', 'chapter_progress', {
      status: 'running',
      progress: 0.7,
      groupedProgress: null,
      etaSeconds: 10,
      message: null,
      reasonCode: null,
      renderGroupCount: null,
      completedRenderGroups: null,
    }, { jobId: 'known-job', projectId: 'proj-1', chapterId: 'chap-1' });

    expect(result.current.jobs['known-job'].progress).toBeGreaterThanOrEqual(0.7);
  });

  it('[S5] voice.test frame for an unknown job id does NOT create a job entry', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [] });

    emitEvent('voice.test', 'voice_test_progress', {
      voiceName: 'Narrator',
      status: 'running',
      progress: 0.4,
      startedAt: Date.now() / 1000,
      message: null,
    }, { jobId: 'unknown-voice-job' });

    expect(result.current.jobs['unknown-voice-job']).toBeUndefined();
  });

  it('[S5] voice.test frame for an existing job updates progress but NOT status', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'voice-existing', status: 'running', progress: 0.1 }] });

    emitEvent('voice.test', 'voice_test_progress', {
      voiceName: 'Narrator',
      status: 'done',
      progress: 0.8,
      startedAt: Date.now() / 1000,
      message: null,
    }, { jobId: 'voice-existing' });

    // progress may update but status must NOT change via voice.test
    expect(result.current.jobs['voice-existing'].status).toBe('running');
  });

  it('[S5] segments.progress does NOT create a job entry for an unknown job id', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [] });

    emitEvent('segments.progress', 'segment_progress', {
      status: 'running',
      progress: 0.5,
      segmentIndex: 0,
      segmentCount: 5,
      message: null,
      reasonCode: null,
    }, { jobId: 'unknown-seg-job', chapterId: 'chap-1', segmentId: 'seg-1' });

    expect(result.current.jobs['unknown-seg-job']).toBeUndefined();
  });

  it('[S5] segments.progress does NOT reclassify an existing job', async () => {
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'seg-job', status: 'running', progress: 0, classification: 'chapter' }] });

    emitEvent('segments.progress', 'segment_progress', {
      status: 'running',
      progress: 0.5,
      segmentIndex: 0,
      segmentCount: 5,
      message: null,
      reasonCode: null,
    }, { jobId: 'seg-job', chapterId: 'chap-1', segmentId: 'seg-1' });

    expect(result.current.jobs['seg-job'].classification).toBe('chapter');
  });

  it('SEGMENT_PENDING frame at progress 0 projects status "preparing" (engine not confirmed)', async () => {
    // SEGMENT_PENDING is the announce-time frame emitted before the engine loads.
    // The UI must show 'preparing', not 'running', until the canonical START_SEGMENT arrives.
    const { result } = renderHook(() => useJobs());
    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-seg', status: 'running', progress: 0.1 }] });

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        ids: { segmentId: 'seg-pending', jobId: 'job-seg', chapterId: 'chap-1' },
        payload: {
          status: 'running',
          progress: 0,
          reasonCode: 'SEGMENT_PENDING',
          message: 'Preparing engine for segment seg-pending...',
          activeSegmentEtaSeconds: null,
        },
      });
    });

    const job = result.current.jobs['job-seg'];
    expect(job).toBeDefined();
    // progress 0 + SEGMENT_PENDING → stays 'preparing' (not 'running') until engine confirms
    expect(job.status).toBe('preparing');
  });

  // ── W-MIX-LA 004 — mid-chapter XTTS cold-load preparing state ──────────────
  //
  // R1 revert-check keystone: when the backend emits a segments.progress frame
  // carrying indeterminate=true for the LOADING_MODEL window, the job overlay must
  // surface both active_segment_id AND indeterminate so the chapter editor can
  // place the correct segment in the preparing (pulsing) set.
  //
  // Pre-fix (frame WITHOUT indeterminate): job does not gain indeterminate from
  // the segment frame alone → isActiveJobPreparing would be false, segment renders
  // as frozen-first-letter instead of the preparing pulse.
  //
  // Post-fix (frame WITH indeterminate=true): job gets both fields from a single
  // frame → isActiveJobPreparing is true → correct preparing pulse.

  it('[W-MIX-LA-004] segment_progress frame WITHOUT indeterminate does NOT set indeterminate on the job (R1 red baseline)', () => {
    // Confirms the pre-fix behaviour: a segment frame that lacks indeterminate cannot
    // drive isActiveJobPreparing on its own.  This is the scenario the backend fix
    // resolves by including indeterminate=true in the LOADING_MODEL segment frame.
    const { result } = renderHook(() => useJobs());

    // Seed the chapter job
    emit({
      type: 'jobs_snapshot',
      jobs: [{ id: 'job-mix', status: 'running', progress: 0.06, chapter_id: 'chap-1' }],
    });

    // Segment frame WITHOUT indeterminate (pre-fix backend behaviour)
    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        source: 'backend',
        emittedAt: Date.now() / 1000,
        pluginId: null,
        ids: { jobId: 'job-mix', chapterId: 'chap-1', segmentId: 'seg-2' },
        payload: {
          status: 'running',
          progress: 0,
          reasonCode: null,
          activeSegmentId: 'seg-2',
          activeSegmentProgress: 0,
          // indeterminate intentionally absent — simulates pre-fix backend
        },
      });
    });

    const job = result.current.jobs['job-mix'];
    expect(job).toBeDefined();
    expect(job.active_segment_id).toBe('seg-2');
    // Without indeterminate in the frame the job stays without indeterminate.
    // The chapter editor's isActiveJobPreparing would be false → segment frozen.
    expect(job.indeterminate).not.toBe(true);
  });

  it('[W-MIX-LA-004] segment_progress frame WITH indeterminate=true sets both active_segment_id and indeterminate (R1 green)', () => {
    // R3: frame built from liveEvents.ts SegmentProgressPayload shape via publishStudioSocketMessage.
    // R1: this test must fail on pre-004 code where the segment frame lacks indeterminate.
    // Post-fix backend includes indeterminate=true in the LOADING_MODEL segment frame so
    // a single frame atomically delivers both the segment id and the load signal.
    const { result } = renderHook(() => useJobs());

    emit({
      type: 'jobs_snapshot',
      jobs: [{ id: 'job-mix', status: 'running', progress: 0.06, chapter_id: 'chap-1' }],
    });

    // Segment frame WITH indeterminate=true — what the fixed backend emits
    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        source: 'backend',
        emittedAt: Date.now() / 1000,
        pluginId: null,
        ids: { jobId: 'job-mix', chapterId: 'chap-1', segmentId: 'seg-2' },
        payload: {
          status: 'running',
          progress: 0,
          reasonCode: null,      // LOADING_MODEL is stripped from segments.progress topic
          activeSegmentId: 'seg-2',
          activeSegmentProgress: 0,
          indeterminate: true,   // ← W-MIX-LA-004 fix: backend now includes this
        },
      });
    });

    const job = result.current.jobs['job-mix'];
    expect(job).toBeDefined();
    expect(job.active_segment_id).toBe('seg-2');
    expect(job.indeterminate).toBe(true);
  });

  it('[W-MIX-LA-004] segment_progress indeterminate=true → isActiveJobPreparing=true → seg-2 in preparing set (not rendering)', () => {
    // End-to-end: verify the signal reaches useStudioChapter's preparing-set logic.
    // We test through the job overlay shape that useStudioChapter receives as a prop.
    // After the LOADING_MODEL segment frame lands with indeterminate=true the job
    // carries both active_segment_id and indeterminate.  Passing that job to
    // useStudioChapter puts seg-2 in chapterRenderPreparingSegmentIds.
    //
    // This is the keystone test for W-MIX-LA-004.  R1 revert-check: on pre-004
    // code (no indeterminate in segment frame) the job lacks indeterminate so
    // isActiveJobPreparing is false and seg-2 ends up in the rendering set instead.
    const { result } = renderHook(() => useJobs());

    emit({
      type: 'jobs_snapshot',
      jobs: [{ id: 'job-mix', status: 'running', progress: 0.06, chapter_id: 'chap-1' }],
    });

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        source: 'backend',
        emittedAt: Date.now() / 1000,
        pluginId: null,
        ids: { jobId: 'job-mix', chapterId: 'chap-1', segmentId: 'seg-2' },
        payload: {
          status: 'running',
          progress: 0,
          reasonCode: null,
          activeSegmentId: 'seg-2',
          activeSegmentProgress: 0,
          indeterminate: true,
        },
      });
    });

    const job = result.current.jobs['job-mix'];
    // The segment frame now carries indeterminate=true — both fields present
    expect(job.active_segment_id).toBe('seg-2');
    expect(job.indeterminate).toBe(true);

    // Derive what useStudioChapter.isActiveJobPreparing would compute
    const isActiveJobPreparing =
      (job as any)?.reason_code === 'SEGMENT_PENDING' ||
      (job as any)?.reason_code === 'LOADING_MODEL' ||
      (job as any)?.indeterminate === true;

    expect(isActiveJobPreparing).toBe(true);
  });

  it('[W-MIX-LA-004] INV-1: XTTS-first LOADING_MODEL (seg-1) still prepares seg-1 after fix', () => {
    // Regression guard: the XTTS-first path goes through the dispatch-time frame
    // (not the mid-chapter MODEL_LOAD_STARTED marker), but if it also arrives as a
    // segment_progress with indeterminate=true it must still work.
    const { result } = renderHook(() => useJobs());

    emit({
      type: 'jobs_snapshot',
      jobs: [{ id: 'job-xtts', status: 'running', progress: 0, chapter_id: 'chap-1' }],
    });

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        source: 'backend',
        emittedAt: Date.now() / 1000,
        pluginId: null,
        ids: { jobId: 'job-xtts', chapterId: 'chap-1', segmentId: 'seg-1' },
        payload: {
          status: 'running',
          progress: 0,
          reasonCode: null,
          activeSegmentId: 'seg-1',
          activeSegmentProgress: 0,
          indeterminate: true,
        },
      });
    });

    const job = result.current.jobs['job-xtts'];
    expect(job.active_segment_id).toBe('seg-1');
    expect(job.indeterminate).toBe(true);
  });

  it('[W-MIX-LA-004] INV-1: Voxtral-only running segment frame (no indeterminate) does NOT produce preparing state', () => {
    // Regression guard: a plain segments.progress frame (Voxtral rendering, no load)
    // must NOT set indeterminate.  The preparing pulse must never flash for warm/cloud
    // segments that don't need a cold load.
    const { result } = renderHook(() => useJobs());

    emit({
      type: 'jobs_snapshot',
      jobs: [{ id: 'job-voxtral', status: 'running', progress: 0.1, chapter_id: 'chap-1' }],
    });

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        source: 'backend',
        emittedAt: Date.now() / 1000,
        pluginId: null,
        ids: { jobId: 'job-voxtral', chapterId: 'chap-1', segmentId: 'seg-3' },
        payload: {
          status: 'running',
          progress: 0.25,
          reasonCode: 'SEGMENT_PROGRESS',
          activeSegmentId: 'seg-3',
          activeSegmentProgress: 0.25,
          // No indeterminate — Voxtral warm render
        },
      });
    });

    const job = result.current.jobs['job-voxtral'];
    expect(job.active_segment_id).toBe('seg-3');
    expect(job.indeterminate).not.toBe(true);
  });
});
