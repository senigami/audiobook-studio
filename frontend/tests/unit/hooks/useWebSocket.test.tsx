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

  it('captures raw incoming messages into the global ring buffer', async () => {
    // Clear any previous global state
    delete (window as any).__websocketRecentMessages;

    const onMessage = vi.fn();
    renderHook(() => useWebSocket('/ws', onMessage));

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    const payload = {
      type: 'studio_job_event',
      job_id: 'job-123',
      project_id: 'proj-456',
      chapter_id: 'chap-789',
      status: 'running',
      progress: 0.5,
      reason_code: 'none',
      extra_field: 'ignored'
    };
    const mockEvent = { data: JSON.stringify(payload) };

    act(() => {
      mockSocket.onmessage(mockEvent);
    });

    const recent = (window as any).__websocketRecentMessages;
    expect(recent).toBeDefined();
    expect(recent.length).toBe(1);
    expect(recent[0].raw).toBe(mockEvent.data);
    expect(recent[0].receivedAt).toBeDefined();
    expect(recent[0].type).toBe(payload.type);
    expect(recent[0].job_id).toBe(payload.job_id);
    expect(recent[0].project_id).toBe(payload.project_id);
    expect(recent[0].chapter_id).toBe(payload.chapter_id);
    expect(recent[0].status).toBe(payload.status);
    expect(recent[0].progress).toBe(payload.progress);
    expect(recent[0].reason_code).toBe(payload.reason_code);
    expect(recent[0].extra_field).toBeUndefined();
  });

  it('can disable debug capture for a websocket consumer', async () => {
    delete (window as any).__websocketRecentMessages;
    const onMessage = vi.fn();
    renderHook(() => useWebSocket('/ws', onMessage, { captureDebugMessages: false }));

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    act(() => {
      mockSocket.onmessage({ data: JSON.stringify({ type: 'test', index: 1 }) });
    });

    expect((window as any).__websocketRecentMessages).toBeUndefined();
  });

  it('caps the ring buffer at 400 messages', async () => {
    delete (window as any).__websocketRecentMessages;
    const onMessage = vi.fn();
    renderHook(() => useWebSocket('/ws', onMessage));

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    // Send 405 messages
    for (let i = 0; i < 405; i++) {
      act(() => {
        mockSocket.onmessage({ data: JSON.stringify({ type: 'msg', index: i }) });
      });
    }

    const recent = (window as any).__websocketRecentMessages;
    expect(recent.length).toBe(400);
    // Since it's a FIFO queue, the oldest messages (0 to 4) should be pruned
    expect(JSON.parse(recent[0].raw).index).toBe(5);
    expect(JSON.parse(recent[399].raw).index).toBe(404);
  });
});
