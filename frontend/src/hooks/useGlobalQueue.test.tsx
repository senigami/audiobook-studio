import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useGlobalQueue } from './useGlobalQueue';
import { api } from '../api';

// Mock API
vi.mock('../api', () => ({
  api: {
    getProcessingQueue: vi.fn(),
    reorderProcessingQueue: vi.fn(),
    removeProcessingQueue: vi.fn(),
    clearCompletedJobs: vi.fn(),
    clearProcessingQueue: vi.fn(),
  },
}));

describe('useGlobalQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ status: 'success' }),
    });
  });

  it('fetches queue on mount and when refreshTrigger changes', async () => {
    const mockQueue = [{ id: 'job1', status: 'queued', title: 'Chapter 1' }];
    (api.getProcessingQueue as any).mockResolvedValue(mockQueue);

    const { result, rerender } = renderHook(({ paused, jobs, refreshTrigger }) => 
      useGlobalQueue(paused, jobs, refreshTrigger), {
      initialProps: { paused: false, jobs: {}, refreshTrigger: 0 }
    });

    expect(result.current.loading).toBe(true);
    
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.queue).toEqual(mockQueue);

    // Change trigger
    (api.getProcessingQueue as any).mockResolvedValue([...mockQueue, { id: 'job2', status: 'queued' }]);
    rerender({ paused: false, jobs: {}, refreshTrigger: 1 });
    
    await waitFor(() => expect(result.current.queue).toHaveLength(2));
  });

  it('handles pause/resume toggle', async () => {
    (api.getProcessingQueue as any).mockResolvedValue([]);
    const onRefresh = vi.fn();
    const { result } = renderHook(() => useGlobalQueue(false, {}, 0, onRefresh));

    await act(async () => {
      await result.current.handlePauseToggle();
    });

    expect(global.fetch).toHaveBeenCalledWith('/queue/pause', { method: 'POST' });
    expect(result.current.localPaused).toBe(true);
    expect(onRefresh).toHaveBeenCalled();

    await act(async () => {
      await result.current.handlePauseToggle();
    });

    expect(global.fetch).toHaveBeenCalledWith('/queue/resume', { method: 'POST' });
    expect(result.current.localPaused).toBe(false);
  });

  it('updates queue status when jobs update', async () => {
    const mockQueue = [{ id: 'job1', status: 'queued', title: 'Chapter 1' }];
    (api.getProcessingQueue as any).mockResolvedValue(mockQueue);

    const { result, rerender } = renderHook(({ jobs }) => 
      useGlobalQueue(false, jobs, 0), {
      initialProps: { jobs: {} }
    });

    await waitFor(() => expect(result.current.queue).toEqual(mockQueue));

    // Update job status
    const updatedJobs = { job1: { id: 'job1', status: 'running' } as any };
    rerender({ jobs: updatedJobs });

    expect(result.current.queue[0].status).toBe('running');
  });

  it('holds a completed chapter job in finalizing until chapter audio is visible', async () => {
    const mockQueue = [{
      id: 'job1',
      status: 'running',
      chapter_id: 'chap1',
      chapter_audio_status: 'processing',
      chapter_audio_file_path: null,
      completed_at: Date.now() / 1000
    }] as any;
    (api.getProcessingQueue as any).mockResolvedValue(mockQueue);

    const { result, rerender } = renderHook(({ jobs }) =>
      useGlobalQueue(false, jobs, 0), {
      initialProps: { jobs: {} }
    });

    await waitFor(() => expect(result.current.queue).toHaveLength(1));

    rerender({
      jobs: { job1: { id: 'job1', status: 'done', progress: 1, engine: 'voxtral' } as any }
    });

    expect(result.current.queue[0].status).toBe('finalizing');
    expect(result.current.queue[0].progress).toBe(1);
  });

  it('does not hold a completed segment-scoped mixed job in finalizing', async () => {
    const mockQueue = [{
      id: 'job-segment',
      status: 'done',
      chapter_id: 'chap1',
      engine: 'mixed',
      segment_ids: ['seg-1'],
      chapter_audio_status: 'unprocessed',
      chapter_audio_file_path: null,
      completed_at: Date.now() / 1000,
    }] as any;
    (api.getProcessingQueue as any).mockResolvedValue(mockQueue);

    const { result, rerender } = renderHook(({ jobs }) =>
      useGlobalQueue(false, jobs, 0), {
      initialProps: { jobs: {} }
    });

    await waitFor(() => expect(result.current.queue).toHaveLength(1));

    rerender({
      jobs: { job1: { id: 'job-segment', status: 'done', progress: 1, engine: 'mixed', segment_ids: ['seg-1'] } as any }
    });

    expect(result.current.queue[0].status).toBe('done');
  });

  it('keeps an older done Voxtral row in history when a newer run for the same chapter is already queued', async () => {
    const mockQueue = [
      {
        id: 'job-old',
        status: 'done',
        chapter_id: 'chap1',
        engine: 'voxtral',
        chapter_audio_status: 'processing',
        chapter_audio_file_path: null,
        completed_at: Date.now() / 1000,
      },
      {
        id: 'job-new',
        status: 'queued',
        chapter_id: 'chap1',
        engine: 'voxtral',
        chapter_audio_status: 'processing',
        chapter_audio_file_path: null,
        created_at: Date.now() / 1000,
      }
    ] as any;
    (api.getProcessingQueue as any).mockResolvedValue(mockQueue);

    const { result } = renderHook(() => useGlobalQueue(false, {}, 0));
    await waitFor(() => expect(result.current.queue).toHaveLength(2));

    expect(result.current.queue.find(q => q.id === 'job-old')?.status).toBe('done');
    expect(result.current.queue.find(q => q.id === 'job-new')?.status).toBe('queued');
  });

  it('handles reordering', async () => {
    const mockQueue = [
      { id: 'job1', status: 'queued' },
      { id: 'job2', status: 'queued' }
    ] as any;
    (api.getProcessingQueue as any).mockResolvedValue(mockQueue);

    const { result } = renderHook(() => useGlobalQueue(false, {}, 0));
    await waitFor(() => expect(result.current.queue).toHaveLength(2));

    const newOrder = [mockQueue[1], mockQueue[0]];
    
    // Simulate drag and drop flow
    act(() => {
      result.current.handleDragStart();
      result.current.handleReorder(newOrder);
    });

    expect(result.current.queue).toEqual(newOrder);
    expect(api.reorderProcessingQueue).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.handleDragEnd();
    });

    expect(api.reorderProcessingQueue).toHaveBeenCalledWith(['job2', 'job1']);
  });

  it('handles removal and cancellation', async () => {
    const mockQueue = [{ id: 'job1', status: 'running', chapter_id: 'chap1' }] as any;
    (api.getProcessingQueue as any).mockResolvedValue(mockQueue);

    const { result } = renderHook(() => useGlobalQueue(false, {}, 0));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleRemove('job1');
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/chapters/chap1/cancel', { method: 'POST' });
    expect(api.removeProcessingQueue).toHaveBeenCalledWith('job1');
  });

  it('handles clear all with confirmation', async () => {
    (api.getProcessingQueue as any).mockResolvedValue([]);
    const { result } = renderHook(() => useGlobalQueue(false, {}, 0));

    act(() => {
      result.current.handleClearAll();
    });

    expect(result.current.confirmConfig).not.toBeNull();
    expect(result.current.confirmConfig?.title).toBe('Clear Queue');

    await act(async () => {
      await result.current.confirmConfig?.onConfirm();
    });

    expect(api.clearProcessingQueue).toHaveBeenCalled();
    expect(result.current.confirmConfig).toBeNull();
  });
});
