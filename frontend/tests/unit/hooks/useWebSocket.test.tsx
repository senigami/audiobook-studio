import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useWebSocket } from '@/hooks/useWebSocket';

describe('useWebSocket', () => {
  let mockSocket: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockSocket = {
      send: vi.fn(),
      close: vi.fn(),
      readyState: WebSocket.CONNECTING,
      onopen: null as any,
      onclose: null as any,
      onmessage: null as any,
      onerror: null as any,
    };

    global.WebSocket = vi.fn().mockImplementation(() => {
      setTimeout(() => {
        if (mockSocket.onopen) {
          mockSocket.onopen();
          mockSocket.readyState = WebSocket.OPEN;
        }
      }, 0);
      return mockSocket;
    }) as any;

    (global.WebSocket as any).CONNECTING = 0;
    (global.WebSocket as any).OPEN = 1;
    (global.WebSocket as any).CLOSING = 2;
    (global.WebSocket as any).CLOSED = 3;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects on mount', async () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() => useWebSocket('/ws', onMessage));

    expect(global.WebSocket).toHaveBeenCalledWith(expect.stringContaining('/ws'));

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current.connected).toBe(true);
  });

  it('handles message parsing', async () => {
    const onMessage = vi.fn();
    renderHook(() => useWebSocket('/ws', onMessage));

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    const mockEvent = { data: JSON.stringify({ type: 'test' }) };
    act(() => {
      mockSocket.onmessage(mockEvent);
    });

    expect(onMessage).toHaveBeenCalledWith({ type: 'test' }, mockEvent.data);
  });

  it('handles reconnection on close', async () => {
    const onMessage = vi.fn();
    renderHook(() => useWebSocket('/ws', onMessage));

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    // Simulate close
    act(() => {
      mockSocket.onclose();
    });

    // Advance to reconnection timer
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(global.WebSocket).toHaveBeenCalledTimes(2);
  });

  it('closes socket on unmount', () => {
    const { unmount } = renderHook(() => useWebSocket('/ws', vi.fn()));
    unmount();
    expect(mockSocket.close).toHaveBeenCalled();
  });

  it('sends messages when socket is open', async () => {
    const { result } = renderHook(() => useWebSocket('/ws', vi.fn()));

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    act(() => {
      result.current.sendMessage({ type: 'hello' });
    });

    expect(mockSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'hello' }));
  });

  it('does not write to the websocket ring buffer by itself', async () => {
    // Clear any previous global state
    delete (window as any).__websocketRecentMessages;

    const onMessage = vi.fn();
    renderHook(() => useWebSocket('/ws', onMessage));

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    const payload = {
      type: 'studio_event',
      version: 1,
      topic: 'queue.items',
      eventKind: 'queue_item_status',
      source: 'backend',
      ids: { jobId: 'job-123', projectId: 'proj-456', chapterId: 'chap-789' },
      payload: {
        status: 'running',
        progress: 0.5,
        classification: 'chapter',
      },
    };
    const mockEvent = { data: JSON.stringify(payload) };

    act(() => {
      mockSocket.onmessage(mockEvent);
    });

    expect((window as any).__websocketRecentMessages).toBeUndefined();
    expect(onMessage).toHaveBeenCalledWith(payload, mockEvent.data);
  });

  // Reconnect leak / unmount safety tests
  it('does not reconnect after unmount when close event fires post-unmount', async () => {
    const { unmount } = renderHook(() => useWebSocket('/ws', vi.fn()));

    await act(async () => { vi.advanceTimersByTime(1); });
    expect(global.WebSocket).toHaveBeenCalledTimes(1);

    // Unmount — cleanup strips onclose and closes socket
    unmount();

    // Simulate the server closing the socket after unmount (onclose is null now)
    // but also test if onclose were somehow still called
    act(() => {
      if (mockSocket.onclose) {
        mockSocket.onclose();
      }
    });

    // Advance past the reconnect delay — no new socket should be created
    act(() => { vi.advanceTimersByTime(10000); });

    expect(global.WebSocket).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending reconnect timer when unmounted before it fires', async () => {
    const { unmount } = renderHook(() => useWebSocket('/ws', vi.fn()));

    await act(async () => { vi.advanceTimersByTime(1); });

    // Trigger close while mounted — schedules 5 s reconnect timer
    act(() => { mockSocket.onclose?.(); });

    // Unmount before the timer fires
    unmount();

    act(() => { vi.advanceTimersByTime(10000); });

    // Still only 1 WebSocket — reconnect was cancelled
    expect(global.WebSocket).toHaveBeenCalledTimes(1);
  });
});
