import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useJobs } from './useJobs';
import { api } from '../api';
import { useWebSocket } from './useWebSocket';

// Mock API
vi.mock('../api', () => ({
  api: {
    fetchJobs: vi.fn(),
  },
}));

// Mock useWebSocket
vi.mock('./useWebSocket', () => ({
  useWebSocket: vi.fn(),
}));

describe('useJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useWebSocket as any).mockReturnValue({ connected: true });
  });

  it('refreshes jobs on mount', async () => {
    const mockJobs = [{ id: 'job1', status: 'running', progress: 0.5 }];
    (api.fetchJobs as any).mockResolvedValue(mockJobs);

    const { result } = renderHook(() => useJobs());

    expect(result.current.loading).toBe(true);
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.jobs).toEqual({
      job1: mockJobs[0]
    });
  });

  it('handles job updates via WebSocket', async () => {
    let wsHandler: (data: any) => void = () => {};
    (useWebSocket as any).mockImplementation((_url: string, handler: any) => {
      wsHandler = handler;
      return { connected: true };
    });

    const mockInitialJobs = [{ id: 'job1', status: 'running', progress: 0.1 }];
    (api.fetchJobs as any).mockResolvedValue(mockInitialJobs);

    const { result } = renderHook(() => useJobs());

    await waitFor(() => expect(result.current.loading).toBe(false));

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
    let wsHandler: (data: any) => void = () => {};
    (useWebSocket as any).mockImplementation((_url: string, handler: any) => {
      wsHandler = handler;
      return { connected: true };
    });

    (api.fetchJobs as any).mockResolvedValue([
      { id: 'job1', status: 'queued', progress: 0 } as any,
    ]);

    const { result } = renderHook(() => useJobs());
    await waitFor(() => expect(result.current.loading).toBe(false));

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
    let wsHandler: (data: any) => void = () => {};
    (useWebSocket as any).mockImplementation((_url: string, handler: any) => {
      wsHandler = handler;
      return { connected: true };
    });

    (api.fetchJobs as any).mockResolvedValue([]);

    const { result } = renderHook(() => useJobs());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(api.fetchJobs).toHaveBeenCalledTimes(1);

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
    expect(api.fetchJobs).toHaveBeenCalledTimes(1);
  });

  it('triggers onJobComplete when a job finishes', async () => {
    let wsHandler: (data: any) => void = () => {};
    (useWebSocket as any).mockImplementation((_url: string, handler: any) => {
      wsHandler = handler;
      return { connected: true };
    });

    const onJobComplete = vi.fn();
    const mockInitialJobs = [{ id: 'job1', status: 'running', progress: 0.9 }];
    (api.fetchJobs as any).mockResolvedValue(mockInitialJobs);

    const { result } = renderHook(() => useJobs(onJobComplete));

    await waitFor(() => expect(result.current.loading).toBe(false));

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

  it('handles queue_updated, pause_updated, segments_updated, and chapter_updated', async () => {
    let wsHandler: (data: any) => void = () => {};
    (useWebSocket as any).mockImplementation((_url: string, handler: any) => {
      wsHandler = handler;
      return { connected: true };
    });

    const onQueueUpdate = vi.fn();
    const onPauseUpdate = vi.fn();
    const onSegmentsUpdate = vi.fn();
    const onChapterUpdate = vi.fn();
    
    (api.fetchJobs as any).mockResolvedValue([]);

    renderHook(() => useJobs(undefined, onQueueUpdate, onPauseUpdate, onSegmentsUpdate, onChapterUpdate));

    act(() => {
      wsHandler({ type: 'queue_updated' });
      wsHandler({ type: 'pause_updated', paused: true });
      wsHandler({ type: 'segments_updated', chapter_id: 'chap1' });
      wsHandler({ type: 'chapter_updated', chapter_id: 'chap1' });
    });

    expect(onQueueUpdate).toHaveBeenCalled();
    expect(onPauseUpdate).toHaveBeenCalledWith(true);
    expect(onSegmentsUpdate).toHaveBeenCalledWith('chap1');
    expect(onChapterUpdate).toHaveBeenCalledWith('chap1');
  });

  it('stores dedicated segment progress websocket updates separately from job progress', async () => {
    let wsHandler: (data: any) => void = () => {};
    (useWebSocket as any).mockImplementation((_url: string, handler: any) => {
      wsHandler = handler;
      return { connected: true };
    });

    (api.fetchJobs as any).mockResolvedValue([
      { id: 'job1', status: 'running', progress: 0.35, active_segment_id: 'seg-2' }
    ]);

    const { result } = renderHook(() => useJobs());
    await waitFor(() => expect(result.current.loading).toBe(false));

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
    let wsHandler: ((data: any) => void) | undefined;
    vi.mocked(useWebSocket).mockImplementation((_path: string, handler: any) => {
      wsHandler = handler;
      return { connected: true } as any;
    });

    vi.mocked(api.fetchJobs).mockResolvedValue([
      { id: 'job-1', status: 'done', progress: 1, created_at: 1 } as any,
    ]);

    const { result } = renderHook(() => useJobs());
    await waitFor(() => expect(result.current.jobs['job-1']?.status).toBe('done'));

    wsHandler?.({ type: 'job_updated', job_id: 'job-1', updates: { status: 'running', progress: 0.5 } });

    expect(result.current.jobs['job-1']?.status).toBe('done');
    expect(result.current.jobs['job-1']?.progress).toBe(1);
  });
});
