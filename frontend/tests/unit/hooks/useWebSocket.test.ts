import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useWebSocket } from '@/hooks/useWebSocket';

describe('useWebSocket reconnect leak (post-unmount)', () => {
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
      // Simulate async open
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
