import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useWebSocket } from './useWebSocket';

describe('useWebSocket', () => {
  let mockSocket: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockSocket = {
      send: vi.fn(),
      close: vi.fn(),
      readyState: WebSocket.CONNECTING,
    };

    global.WebSocket = vi.fn().mockImplementation(() => {
      setTimeout(() => {
        if (mockSocket.onopen) mockSocket.onopen();
        mockSocket.readyState = WebSocket.OPEN;
      }, 0);
      return mockSocket;
    }) as any;
    
    // Set up standard WebSocket constants if they aren't there
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

    expect(onMessage).toHaveBeenCalledWith({ type: 'test' });
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
});
