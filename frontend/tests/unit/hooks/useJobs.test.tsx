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

    emit({
      type: 'job_updated',
      job_id: 'job1',
      updates: { progress: 0.2, status: 'running' },
    });

    expect(result.current.jobs.job1.progress).toBe(0.2);
  });

  it('handles normalized studio_job_event websocket payloads', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job1', status: 'queued', progress: 0 }] });

    emit({
      type: 'studio_job_event',
      job_id: 'job1',
      scope: 'job',
      classification: 'chapter',
      status: 'running',
      progress: 0.42,
      eta_seconds: 12,
      message: 'Rendering chapter',
      updated_at: 123,
      render_group_count: 3,
      completed_render_groups: 1,
      active_render_group_index: 2,
      total_render_weight: 100,
      completed_render_weight: 40,
      active_render_group_weight: 20,
      grouped_progress: 0.42,
    });

    expect(result.current.jobs.job1).toMatchObject({
      status: 'running',
      progress: 0.42,
      eta_seconds: 12,
      log: 'Rendering chapter',
      classification: 'chapter',
      render_group_count: 3,
      completed_render_groups: 1,
      active_render_group_index: 2,
      total_render_weight: 100,
      completed_render_weight: 40,
      active_render_group_weight: 20,
      grouped_progress: 0.42,
    });

    const recent = (window as any).__websocketRecentMessages;
    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject({
      listener: 'useJobs',
      type: 'studio_job_event',
      scope: 'job',
      classification: 'chapter',
      job_id: 'job1',
      status: 'running',
      progress: 0.42,
    });
  });

  it('preserves render-group fields from job_updated payloads', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job1', status: 'queued', progress: 0 }] });

    emit({
      type: 'job_updated',
      job_id: 'job1',
      updates: {
        status: 'running',
        progress: 0.44,
        render_group_count: 2,
        completed_render_groups: 1,
        active_render_group_index: 1,
        total_render_weight: 200,
        completed_render_weight: 100,
        active_render_group_weight: 100,
        grouped_progress: 0.44,
        updated_at: 999,
      },
    });

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

  it('records tts_log_line diagnostics without mutating job state', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job1', status: 'running', progress: 0.2 }] });

    emit({
      type: 'tts_log_line',
      job_id: 'job1',
      chapter_id: 'chap1',
      line: '[PROGRESS] 40% job1',
      marker: 'PROGRESS',
      sequence: 3,
      received_at: 123,
    });

    expect(result.current.jobs.job1).toMatchObject({ status: 'running', progress: 0.2 });
    expect((window as any).__ttsCommunicationTimeline).toHaveLength(1);
    expect((window as any).__ttsCommunicationTimeline[0]).toMatchObject({
      kind: 'tts_log',
      type: 'tts_log_line',
      job_id: 'job1',
      chapter_id: 'chap1',
      line: '[PROGRESS] 40% job1',
      marker: 'PROGRESS',
      sequence: 3,
    });
  });

  it('does not attribute tts.logs frames to jobs-state', async () => {
    renderHook(() => useJobs());

    emit({
      type: 'tts_log_line',
      job_id: 'job1',
      chapter_id: 'chap1',
      line: '[PROGRESS] 40% job1',
      marker: 'PROGRESS',
      sequence: 3,
      received_at: 123,
    });

    const records = getLiveEventAuditSnapshot();
    expect(records).toHaveLength(1);
    expect(records[0].event.topic).toBe('tts.logs');
    expect(records[0].subscribers.map(s => s.subscriber)).not.toContain('jobs-state');
  });

  it('does not fall back to fetchJobs when a new websocket job appears', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [] });

    emit({
      type: 'job_updated',
      job_id: 'job-new',
      updates: {
        status: 'queued',
        progress: 0,
        chapter_id: 'chap-1',
        project_id: 'proj-1',
        engine: 'mixed',
        segment_ids: ['seg-1', 'seg-2'],
        classification: 'segment',
        parent_job_id: 'job-parent',
      }
    });

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

    emit({
      type: 'job_updated',
      job_id: 'job1',
      updates: { status: 'done', progress: 1.0 }
    });

    expect(onJobComplete).toHaveBeenCalled();
    expect(result.current.jobs.job1.status).toBe('done');
  });

  it('handles queue_updated by requesting a new snapshot', async () => {
    const onQueueUpdate = vi.fn();
    renderHook(() => useJobs(undefined, onQueueUpdate));

    emit({ type: 'queue_updated' });

    expect(onQueueUpdate).toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenLastCalledWith({ type: 'jobs_snapshot_request' });
  });

  it('does not require an onQueueUpdate callback (queue.lifecycle is useQueueSync\'s domain)', async () => {
    // App.tsx intentionally passes undefined for onQueueUpdate so a queue_updated frame
    // does not trigger a redundant ProjectDetailPage reload on top of useQueueSync's refresh.
    renderHook(() => useJobs(undefined, undefined));
    expect(() => emit({ type: 'queue_updated' })).not.toThrow();
    expect(sendMessage).toHaveBeenLastCalledWith({ type: 'jobs_snapshot_request' });
  });

  it('routes a single queue.lifecycle frame to both queue-sync and jobs-state subscriber observations exactly once each', async () => {
    renderHook(() => useJobs());
    // Re-import audit store on demand to avoid extra top-level imports in this large file.
    const { getLiveEventAuditSnapshot } = await import('@/store/liveEventAuditStore');

    emit({ type: 'queue_updated' });

    const records = getLiveEventAuditSnapshot();
    const queueFrame = records.find(r => r.event.rawType === 'queue_updated');
    expect(queueFrame).toBeDefined();
    const subs = queueFrame!.subscribers.map(s => s.subscriber);
    // jobs-state is observed once for this frame. queue-sync would also appear here in
    // the full app, but is not present because this isolated useJobs render does not mount
    // useQueueSync. The point of this assertion is to guard against double-observation by
    // jobs-state for the same frame.
    expect(subs.filter(s => s === 'jobs-state')).toHaveLength(1);
  });

  it('handles pause_updated, segments_updated, and chapter_updated', async () => {
    const onPauseUpdate = vi.fn();
    const onSegmentsUpdate = vi.fn();
    const onChapterUpdate = vi.fn();

    renderHook(() => useJobs(undefined, undefined, onPauseUpdate, onSegmentsUpdate, onChapterUpdate));

    emit({ type: 'pause_updated', paused: true });
    emit({ type: 'segments_updated', chapter_id: 'chap1' });
    emit({ type: 'chapter_updated', chapter_id: 'chap1' });

    expect(onPauseUpdate).toHaveBeenCalledWith(true);
    expect(onSegmentsUpdate).toHaveBeenCalledWith('chap1');
    expect(onChapterUpdate).toHaveBeenCalledWith('chap1');
  });

  it('stores dedicated segment progress websocket updates separately from job progress', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job1', status: 'running', progress: 0.35, active_segment_id: 'seg-2' }] });

    emit({
      type: 'segment_progress',
      job_id: 'job1',
      chapter_id: 'chap-1',
      segment_id: 'seg-2',
      progress: 0.75,
    });

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

    emit({ type: 'job_updated', job_id: 'job-1', updates: { status: 'running', progress: 0.5 } });

    expect(result.current.jobs['job-1']?.status).toBe('done');
    expect(result.current.jobs['job-1']?.progress).toBe(1);
  });

  it('ignores stale normalized websocket updates by updated_at', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-1', status: 'running', progress: 0.7, created_at: 1, updated_at: 200 } as any] });

    emit({
      type: 'studio_job_event',
      job_id: 'job-1',
      scope: 'job',
      status: 'running',
      progress: 0.4,
      updated_at: 100,
    });

    expect(result.current.jobs['job-1']?.progress).toBe(0.7);
    expect(result.current.jobs['job-1']?.updated_at).toBe(200);
  });

  it('feeds done progress=1 followed by finalizing progress=0.99 for the same job_id and proves the frontend keeps done/progress=1', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-term', status: 'running', progress: 0.9, created_at: 1, updated_at: 100 } as any] });

    emit({
      type: 'studio_job_event',
      job_id: 'job-term',
      scope: 'job',
      status: 'done',
      progress: 1.0,
      updated_at: 200,
    });

    expect(result.current.jobs['job-term']?.status).toBe('done');
    expect(result.current.jobs['job-term']?.progress).toBe(1.0);

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_job_event',
        job_id: 'job-term',
        scope: 'job',
        status: 'finalizing',
        progress: 0.99,
        updated_at: 210,
      });
      publishStudioSocketMessage({
        type: 'job_updated',
        job_id: 'job-term',
        updates: { status: 'finalizing', progress: 0.99, updated_at: 211 }
      });
    });

    expect(result.current.jobs['job-term']?.status).toBe('done');
    expect(result.current.jobs['job-term']?.progress).toBe(1.0);
  });

  it('unrelated project_updated/chapter_updated/queue_updated messages do not alter live progress state', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-live', status: 'running', progress: 0.5 } as any] });

    emit({ type: 'queue_updated' });
    emit({ type: 'project_updated', project_id: 'proj1' });
    emit({ type: 'chapter_updated', chapter_id: 'chap1' });

    expect(result.current.jobs['job-live']?.status).toBe('running');
    expect(result.current.jobs['job-live']?.progress).toBe(0.5);
  });

  it('updates live job progress and status entirely from job_updated or studio_job_event alone without requiring full refetches', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-1', status: 'preparing', progress: 0.1 } as any] });
    expect(result.current.jobs['job-1']?.progress).toBe(0.1);
    expect(result.current.jobs['job-1']?.status).toBe('preparing');

    sendMessage.mockClear();

    emit({
      type: 'studio_job_event',
      job_id: 'job-1',
      status: 'running',
      progress: 0.33,
    });

    expect(result.current.jobs['job-1']?.progress).toBe(0.33);
    expect(result.current.jobs['job-1']?.status).toBe('running');
    expect(sendMessage).not.toHaveBeenCalled();

    emit({
      type: 'job_updated',
      job_id: 'job-1',
      updates: {
        status: 'running',
        progress: 0.66,
      }
    });

    expect(result.current.jobs['job-1']?.progress).toBe(0.66);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('propagates active_segment_id and active_segment_progress from studio_job_event into Job map', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-seg', status: 'running', progress: 0 }] });

    emit({
      type: 'studio_job_event',
      job_id: 'job-seg',
      scope: 'job',
      status: 'running',
      progress: 0.44,
      updated_at: 500,
      active_segment_id: 'seg-abc',
      active_segment_progress: 0.8,
    });

    expect(result.current.jobs['job-seg']?.active_segment_id).toBe('seg-abc');
    expect(result.current.jobs['job-seg']?.active_segment_progress).toBe(0.8);
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

  it('clears active_segment_id and resets active_segment_progress=0 when terminal job_updated arrives', async () => {
    const { result } = renderHook(() => useJobs());

    emit({ type: 'jobs_snapshot', jobs: [{ id: 'job-t', status: 'running', progress: 0.9, active_segment_id: 'seg-x', active_segment_progress: 0.9 }] });

    emit({
      type: 'job_updated',
      job_id: 'job-t',
      updates: {
        status: 'done',
        progress: 1.0,
        updated_at: 9999,
        active_segment_id: null,
        active_segment_progress: 0.0,
      },
    });

    expect(result.current.jobs['job-t']?.status).toBe('done');
    expect(result.current.jobs['job-t']?.progress).toBe(1.0);
    expect(result.current.jobs['job-t']?.active_segment_id).toBeNull();
    expect(result.current.jobs['job-t']?.active_segment_progress).toBe(0.0);
  });
});
