import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useQueueSync } from '@/hooks/useQueueSync';
import { api } from '@/api';
import { useWebSocket } from '@/hooks/useWebSocket';

vi.mock('@/api', () => ({
  api: {
    getProcessingQueue: vi.fn(),
  },
}));

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(),
}));

describe('useQueueSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useWebSocket as any).mockReturnValue({ connected: true });
    (api.getProcessingQueue as any).mockResolvedValue([]);
  });

  it('reports hydration source as bootstrap during initial load', async () => {
    // We need to control the timing of the API response
    let resolveQueue: any;
    const queuePromise = new Promise(resolve => { resolveQueue = resolve; });
    (api.getProcessingQueue as any).mockReturnValue(queuePromise);

    const { result } = renderHook(() => useQueueSync());

    // Initially, before resolution, it should show bootstrap
    expect(result.current.activeSource).toBe('bootstrap');
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveQueue([{ id: '1', status: 'queued' }]);
    });

    await waitFor(() => {
      expect(result.current.activeSource).toBeUndefined();
      expect(result.current.loading).toBe(false);
      expect(result.current.queueCount).toBe(1);
    });
  });

  it('reports hydration source as reconnect when WS reconnects after being lost', async () => {
    const { result, rerender } = renderHook(() => useQueueSync());

    // Wait for bootstrap to finish
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Simulate WS loss
    (useWebSocket as any).mockReturnValue({ connected: false });
    rerender();

    expect(result.current.connected).toBe(false);
    expect(result.current.isReconnecting).toBe(true);

    // Simulate WS restore
    (useWebSocket as any).mockReturnValue({ connected: true });
    
    let resolveQueue: any;
    const controlledPromise = new Promise(resolve => { resolveQueue = resolve; });
    (api.getProcessingQueue as any).mockReturnValue(controlledPromise);

    rerender();

    // Should now show 'reconnect' source
    await waitFor(() => expect(result.current.activeSource).toBe('reconnect'));

    await act(async () => {
      resolveQueue([]);
    });

    await waitFor(() => {
      expect(result.current.activeSource).toBeUndefined();
      expect(result.current.isReconnecting).toBe(false);
    });
  });

  it('reports hydration source as refresh during manual refresh', async () => {
    const { result } = renderHook(() => useQueueSync());

    await waitFor(() => expect(result.current.loading).toBe(false));

    let resolveQueue: any;
    const controlledPromise = new Promise(resolve => { resolveQueue = resolve; });
    (api.getProcessingQueue as any).mockReturnValue(controlledPromise);

    // Trigger manual refresh
    act(() => {
      result.current.refreshQueue('refresh');
    });

    expect(result.current.activeSource).toBe('refresh');

    await act(async () => {
      resolveQueue([]);
    });

    await waitFor(() => expect(result.current.activeSource).toBeUndefined());
  });

  it('does not refetch the queue for job_updated websocket events', async () => {
    let handler: (data: any) => void = () => {};
    (useWebSocket as any).mockImplementation((_url: string, onMessage: any) => {
      handler = onMessage;
      return { connected: true };
    });

    renderHook(() => useQueueSync());

    await waitFor(() => expect(api.getProcessingQueue).toHaveBeenCalledTimes(1));

    act(() => {
      handler({
        type: 'job_updated',
        job_id: 'job-1',
        updates: { status: 'running', progress: 0.25 },
      });
    });

    expect(api.getProcessingQueue).toHaveBeenCalledTimes(1);
  });

  it('disables websocket debug capture for queue sync', async () => {
    renderHook(() => useQueueSync());

    await waitFor(() => {
      expect(useWebSocket).toHaveBeenCalledWith(
        '/ws',
        expect.any(Function),
        { captureDebugMessages: false }
      );
    });
  });

  it('reserves steady-state connected sessions for ready status', async () => {
    const { result } = renderHook(() => useQueueSync());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.connected).toBe(true);
      expect(result.current.activeSource).toBeUndefined();
      expect(result.current.isReconnecting).toBe(false);
    });

    // In App.tsx, this combined state translates to 'ready'
  });
});
