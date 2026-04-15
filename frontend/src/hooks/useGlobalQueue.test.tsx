import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useGlobalQueue } from './useGlobalQueue';
import { api } from '../api';
import type { ProcessingQueueItem } from '../types';

// Mock API
vi.mock('../api', () => ({
  api: {
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

  const mockQueue: ProcessingQueueItem[] = [
    { id: 'job1', status: 'queued', chapter_title: 'Chapter 1' } as any,
    { id: 'job2', status: 'queued', chapter_title: 'Chapter 2' } as any,
  ];

  it('initializes with provided queue', () => {
    const { result } = renderHook(() => useGlobalQueue(mockQueue, false));
    expect(result.current.queue).toEqual(mockQueue);
  });

  it('syncs with initialQueue updates when not dragging', () => {
    const { result, rerender } = renderHook(({ q }) => useGlobalQueue(q, false), {
      initialProps: { q: mockQueue }
    });

    const updatedQueue = [...mockQueue, { id: 'job3', status: 'queued' } as any];
    rerender({ q: updatedQueue });
    
    expect(result.current.queue).toEqual(updatedQueue);
  });

  it('suspends sync during drag', () => {
    const { result, rerender } = renderHook(({ q }) => useGlobalQueue(q, false), {
      initialProps: { q: mockQueue }
    });

    act(() => {
        result.current.handleDragStart();
    });

    const updatedQueue = [...mockQueue, { id: 'job3', status: 'queued' } as any];
    rerender({ q: updatedQueue });
    
    // Should still be old queue because dragging
    expect(result.current.queue).toEqual(mockQueue);
  });

  it('handles pause/resume toggle', async () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => useGlobalQueue([], false, onRefresh));

    await act(async () => {
      await result.current.handlePauseToggle();
    });

    expect(global.fetch).toHaveBeenCalledWith('/queue/pause', { method: 'POST' });
    expect(result.current.localPaused).toBe(true);
    expect(onRefresh).toHaveBeenCalled();
  });

  it('handles reordering and commit', async () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => useGlobalQueue(mockQueue, false, onRefresh));

    const newOrder = [mockQueue[1], mockQueue[0]];
    
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
    expect(onRefresh).toHaveBeenCalled();
  });

  it('handles removal', async () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => useGlobalQueue(mockQueue, false, onRefresh));

    await act(async () => {
      await result.current.handleRemove('job1');
    });

    expect(api.removeProcessingQueue).toHaveBeenCalledWith('job1');
    expect(onRefresh).toHaveBeenCalled();
  });

  it('handles clear all with confirmation', async () => {
    const { result } = renderHook(() => useGlobalQueue([], false));

    act(() => {
      result.current.handleClearAll();
    });

    expect(result.current.confirmConfig).not.toBeNull();

    await act(async () => {
      await result.current.confirmConfig?.onConfirm();
    });

    expect(api.clearProcessingQueue).toHaveBeenCalled();
  });
});
