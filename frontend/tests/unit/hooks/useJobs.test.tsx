import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useJobs } from '@/hooks/useJobs';
import { useWebSocket } from '@/hooks/useWebSocket';

// Mock useWebSocket
vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(),
}));

describe('useJobs', () => {
  let wsHandler: (data: any) => void = () => {};
  let sendMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    sendMessage = vi.fn();
    (useWebSocket as any).mockImplementation((_url: string, handler: any) => {
      wsHandler = handler;
      return { connected: true, sendMessage };
    });
  });

  it('refreshes jobs on mount by sending a snapshot request', async () => {
    const { result } = renderHook(() => useJobs());

    expect(result.current.loading).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith({ type: 'jobs_snapshot_request' });

    const mockJobs = [{ id: 'job1', status: 'running', progress: 0.5 }];
    act(() => {
      wsHandler({ type: 'jobs_snapshot', jobs: mockJobs });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.jobs).toEqual({
      job1: mockJobs[0]
    });
  });

  it('handles job updates via WebSocket', async () => {
    const { result } = renderHook(() => useJobs());

    // Bootstrap with snapshot
    act(() => {
      wsHandler({ type: 'jobs_snapshot', jobs: [{ id: 'job1', status: 'running', progress: 0.1 }] });
    });
    expect(result.current.loading).toBe(false);

    // Simulate WS update
    act(() => {
      wsHandler({
        type: 'job_updated',
        job_id: 'job1',
        updates: { progress: 0.2, status: 'running' }
      });
    });

    expect(result.current.jobs.job1.progress).toBe(0.2);
  });

  it('handles normalized studio_job_event websocket payloads', async () => {
    const { result } = renderHook(() => useJobs());

    // Bootstrap
    act(() => {
      wsHandler({ type: 'jobs_snapshot', jobs: [{ id: 'job1', status: 'queued', progress: 0 }] });
    });

    act(() => {
      wsHandler({
        type: 'studio_job_event',
        job_id: 'job1',
        scope: 'job',
        status: 'running',
        progress: 0.42,
        eta_seconds: 12,
        message: 'Rendering chapter',
        updated_at: 123,
      });
    });

    expect(result.current.jobs.job1).toMatchObject({
      status: 'running',
      progress: 0.42,
      eta_seconds: 12,
      log: 'Rendering chapter',
    });
  });

  it('does not fall back to fetchJobs when a new websocket job appears', async () => {
    const { result } = renderHook(() => useJobs());

    // Bootstrap empty
    act(() => {
      wsHandler({ type: 'jobs_snapshot', jobs: [] });
    });

    act(() => {
      wsHandler({
        type: 'job_updated',
        job_id: 'job-new',
        updates: {
          status: 'queued',
          progress: 0,
          chapter_id: 'chap-1',
          project_id: 'proj-1',
          engine: 'mixed',
          segment_ids: ['seg-1', 'seg-2'],
        }
      });
    });

    expect(result.current.jobs['job-new']).toMatchObject({
      id: 'job-new',
      status: 'queued',
      chapter_id: 'chap-1',
      project_id: 'proj-1',
      engine: 'mixed',
      segment_ids: ['seg-1', 'seg-2'],
    });
  });

  it('triggers onJobComplete when a job finishes', async () => {
    const onJobComplete = vi.fn();
    const { result } = renderHook(() => useJobs(onJobComplete));

    // Bootstrap
    act(() => {
      wsHandler({ type: 'jobs_snapshot', jobs: [{ id: 'job1', status: 'running', progress: 0.9 }] });
    });

    // Simulate WS update to 'done'
    act(() => {
      wsHandler({
        type: 'job_updated',
        job_id: 'job1',
        updates: { status: 'done', progress: 1.0 }
      });
    });

    expect(onJobComplete).toHaveBeenCalled();
  });

  it('handles queue_updated by requesting a new snapshot', async () => {
    const onQueueUpdate = vi.fn();
    renderHook(() => useJobs(undefined, onQueueUpdate));

    act(() => {
      wsHandler({ type: 'queue_updated' });
    });

    expect(onQueueUpdate).toHaveBeenCalled();
    // One for mount, one for queue_updated
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenLastCalledWith({ type: 'jobs_snapshot_request' });
  });

  it('handles pause_updated, segments_updated, and chapter_updated', async () => {
    const onPauseUpdate = vi.fn();
    const onSegmentsUpdate = vi.fn();
    const onChapterUpdate = vi.fn();

    renderHook(() => useJobs(undefined, undefined, onPauseUpdate, onSegmentsUpdate, onChapterUpdate));

    act(() => {
      wsHandler({ type: 'pause_updated', paused: true });
      wsHandler({ type: 'segments_updated', chapter_id: 'chap1' });
      wsHandler({ type: 'chapter_updated', chapter_id: 'chap1' });
    });

    expect(onPauseUpdate).toHaveBeenCalledWith(true);
    expect(onSegmentsUpdate).toHaveBeenCalledWith('chap1');
    expect(onChapterUpdate).toHaveBeenCalledWith('chap1');
  });

  it('stores dedicated segment progress websocket updates separately from job progress', async () => {
    const { result } = renderHook(() => useJobs());

    act(() => {
      wsHandler({ type: 'jobs_snapshot', jobs: [{ id: 'job1', status: 'running', progress: 0.35, active_segment_id: 'seg-2' }] });
    });

    act(() => {
      wsHandler({
        type: 'segment_progress',
        job_id: 'job1',
        chapter_id: 'chap-1',
        segment_id: 'seg-2',
        progress: 0.75,
      });
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

    act(() => {
      wsHandler({ type: 'jobs_snapshot', jobs: [{ id: 'job-1', status: 'done', progress: 1, created_at: 1 } as any] });
    });

    act(() => {
      wsHandler({ type: 'job_updated', job_id: 'job-1', updates: { status: 'running', progress: 0.5 } });
    });

    expect(result.current.jobs['job-1']?.status).toBe('done');
    expect(result.current.jobs['job-1']?.progress).toBe(1);
  });

  it('ignores stale normalized websocket updates by updated_at', async () => {
    const { result } = renderHook(() => useJobs());

    act(() => {
      wsHandler({ type: 'jobs_snapshot', jobs: [{ id: 'job-1', status: 'running', progress: 0.7, created_at: 1, updated_at: 200 } as any] });
    });

    act(() => {
      wsHandler({
        type: 'studio_job_event',
        job_id: 'job-1',
        scope: 'job',
        status: 'running',
        progress: 0.4,
        updated_at: 100,
      });
    });

    expect(result.current.jobs['job-1']?.progress).toBe(0.7);
    expect(result.current.jobs['job-1']?.updated_at).toBe(200);
  });

  it('feeds done progress=1 followed by finalizing progress=0.99 for the same job_id and proves the frontend keeps done/progress=1', async () => {
    const { result } = renderHook(() => useJobs());

    act(() => {
      wsHandler({ type: 'jobs_snapshot', jobs: [{ id: 'job-term', status: 'running', progress: 0.9, created_at: 1, updated_at: 100 } as any] });
    });

    act(() => {
      wsHandler({
        type: 'studio_job_event',
        job_id: 'job-term',
        scope: 'job',
        status: 'done',
        progress: 1.0,
        updated_at: 200,
      });
    });

    expect(result.current.jobs['job-term']?.status).toBe('done');
    expect(result.current.jobs['job-term']?.progress).toBe(1.0);

    // Now send the delayed regressive finalizing update
    act(() => {
      wsHandler({
        type: 'studio_job_event',
        job_id: 'job-term',
        scope: 'job',
        status: 'finalizing',
        progress: 0.99,
        updated_at: 210, // Even if it claims to be newer
      });
      wsHandler({
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

    act(() => {
      wsHandler({ type: 'jobs_snapshot', jobs: [{ id: 'job-live', status: 'running', progress: 0.5 } as any] });
    });

    act(() => {
      wsHandler({ type: 'queue_updated' });
      wsHandler({ type: 'project_updated', project_id: 'proj1' });
      wsHandler({ type: 'chapter_updated', chapter_id: 'chap1' });
    });

    // It should still be exactly as it was
    expect(result.current.jobs['job-live']?.status).toBe('running');
    expect(result.current.jobs['job-live']?.progress).toBe(0.5);
  });

  it('updates live job progress and status entirely from job_updated or studio_job_event alone without requiring full refetches', async () => {
    const { result } = renderHook(() => useJobs());

    // 1. Initial snapshot has progress = 0.1
    act(() => {
      wsHandler({ type: 'jobs_snapshot', jobs: [{ id: 'job-1', status: 'preparing', progress: 0.1 } as any] });
    });
    expect(result.current.jobs['job-1']?.progress).toBe(0.1);
    expect(result.current.jobs['job-1']?.status).toBe('preparing');

    // Reset calls count on mock
    sendMessage.mockClear();

    // 2. Receive studio_job_event status-only updates (queued -> preparing -> running)
    act(() => {
      wsHandler({
        type: 'studio_job_event',
        job_id: 'job-1',
        status: 'running',
        progress: 0.33,
      });
    });

    // Verify progress and status updated immediately
    expect(result.current.jobs['job-1']?.progress).toBe(0.33);
    expect(result.current.jobs['job-1']?.status).toBe('running');

    // Proves that we didn't request a new jobs snapshot (no full refetch)
    expect(sendMessage).not.toHaveBeenCalled();

    // 3. Receive job_updated status-only updates
    act(() => {
      wsHandler({
        type: 'job_updated',
        job_id: 'job-1',
        updates: {
          status: 'running',
          progress: 0.66,
        }
      });
    });

    // Verify progress updated
    expect(result.current.jobs['job-1']?.progress).toBe(0.66);

    // Again, no full refetch requested
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
