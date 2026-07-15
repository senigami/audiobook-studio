import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGlobalQueue } from '@/hooks/useGlobalQueue';
import { api } from '@/api';
import { APP_TOAST_EVENT } from '@/utils/toast';
import type { ProcessingQueueItem } from '@/types';

vi.mock('@/api', () => ({
  api: {
    reorderProcessingQueue: vi.fn().mockResolvedValue({}),
    removeProcessingQueue: vi.fn().mockResolvedValue({}),
    clearCompletedJobs: vi.fn().mockResolvedValue({}),
    clearProcessingQueue: vi.fn().mockResolvedValue({}),
    toggleQueuePause: vi.fn().mockResolvedValue({}),
    cancelChapterGeneration: vi.fn().mockResolvedValue({}),
  },
}));

// A stable empty-array reference for tests that don't care about queue
// contents. Passing a fresh `[]` literal straight into renderHook's render
// callback creates a new array on every render, which — combined with
// useGlobalQueue's `useEffect(() => setQueue(initialQueue), [initialQueue])`
// resync effect — retriggers the effect every render and deadlocks the test
// in an infinite render loop. Always pass a reference that's stable across
// re-renders (a module-level const, same as mockQueue below).
const EMPTY_QUEUE: ProcessingQueueItem[] = [];

describe('useGlobalQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Ensure fake timers are always restored to avoid cross-test leakage
    vi.useRealTimers();
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
    vi.useFakeTimers();

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

    // Advance timers so drag ends
    act(() => {
        vi.advanceTimersByTime(11000);
    });

    // The drag-suspend guard only re-checks on the next incoming
    // initialQueue reference (mirrors the real sync hook delivering a new
    // merged array on its next poll tick) — so re-deliver the same queue
    // contents as a fresh reference now that dragging has ended.
    rerender({ q: [...updatedQueue] });

    expect(result.current.queue).toEqual(updatedQueue);
  });

  it('handles pause/resume toggle', async () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => useGlobalQueue(EMPTY_QUEUE, false, onRefresh));

    await act(async () => {
      await result.current.handlePauseToggle();
    });

    expect(api.toggleQueuePause).toHaveBeenCalled();
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

  it('handles removal — defers the actual remove behind an undo toast', async () => {
    const onRefresh = vi.fn();
    const toastHandler = vi.fn();
    window.addEventListener(APP_TOAST_EVENT, toastHandler);

    const { result } = renderHook(() => useGlobalQueue(mockQueue, false, onRefresh));

    vi.useFakeTimers();
    act(() => {
      result.current.handleRemove('job1');
    });

    // Not removed yet — the request is deferred behind the toast's undo window.
    expect(api.removeProcessingQueue).not.toHaveBeenCalled();
    expect(toastHandler).toHaveBeenCalledTimes(1);
    const detail = (toastHandler.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.message).toMatch(/removed "chapter 1" from queue/i);
    expect(detail.action).toEqual({ label: 'Undo', onClick: expect.any(Function) });

    await act(async () => {
      vi.advanceTimersByTime(4000);
      await Promise.resolve();
    });
    vi.useRealTimers();

    expect(api.removeProcessingQueue).toHaveBeenCalledWith('job1');
    expect(onRefresh).toHaveBeenCalled();

    window.removeEventListener(APP_TOAST_EVENT, toastHandler);
  });

  it('cancels the deferred removal when Undo is clicked', async () => {
    const onRefresh = vi.fn();
    const toastHandler = vi.fn();
    window.addEventListener(APP_TOAST_EVENT, toastHandler);

    const { result } = renderHook(() => useGlobalQueue(mockQueue, false, onRefresh));

    vi.useFakeTimers();
    act(() => {
      result.current.handleRemove('job1');
    });

    const detail = (toastHandler.mock.calls[0][0] as CustomEvent).detail;
    act(() => {
      detail.action.onClick();
    });

    await act(async () => {
      vi.advanceTimersByTime(4000);
      await Promise.resolve();
    });
    vi.useRealTimers();

    expect(api.removeProcessingQueue).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();

    window.removeEventListener(APP_TOAST_EVENT, toastHandler);
  });

  it('handles clear all with confirmation', async () => {
    const { result } = renderHook(() => useGlobalQueue(EMPTY_QUEUE, false));

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
