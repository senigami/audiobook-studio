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
    (useWebSocket as any).mockImplementation((url: string, handler: any) => {
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

  it('triggers onJobComplete when a job finishes', async () => {
    let wsHandler: (data: any) => void = () => {};
    (useWebSocket as any).mockImplementation((url: string, handler: any) => {
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

  it('handles queue_updated, pause_updated, and segments_updated', async () => {
    let wsHandler: (data: any) => void = () => {};
    (useWebSocket as any).mockImplementation((url: string, handler: any) => {
      wsHandler = handler;
      return { connected: true };
    });

    const onQueueUpdate = vi.fn();
    const onPauseUpdate = vi.fn();
    const onSegmentsUpdate = vi.fn();
    
    (api.fetchJobs as any).mockResolvedValue([]);

    renderHook(() => useJobs(undefined, onQueueUpdate, onPauseUpdate, onSegmentsUpdate));

    act(() => {
      wsHandler({ type: 'queue_updated' });
      wsHandler({ type: 'pause_updated', paused: true });
      wsHandler({ type: 'segments_updated', chapter_id: 'chap1' });
    });

    expect(onQueueUpdate).toHaveBeenCalled();
    expect(onPauseUpdate).toHaveBeenCalledWith(true);
    expect(onSegmentsUpdate).toHaveBeenCalledWith('chap1');
  });
});
