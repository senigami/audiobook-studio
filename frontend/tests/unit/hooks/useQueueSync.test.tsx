import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useQueueSync } from '@/hooks/useQueueSync';
import { api } from '@/api';
import { useWebSocket } from '@/hooks/useWebSocket';
import { clearTtsCommunicationTimeline } from '@/utils/runtimeDebug';

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
    clearTtsCommunicationTimeline();
    delete (window as any).__ttsCommunicationTimeline;
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
        { captureDebugMessages: true }
      );
    });
  });

  it('records queue consumer path in timeline when queue messages arrive', async () => {
    let handler: (data: any) => void = () => {};
    (useWebSocket as any).mockImplementation((_url: string, onMessage: any) => {
      handler = onMessage;
      return { connected: true };
    });
    renderHook(() => useQueueSync());
    // send queue_updated message
    act(() => {
      handler({ type: 'queue_updated' });
    });
    // timeline should have entry with listener 'useQueueSync' and audience 'queue'
    const timeline = (window as any).__ttsCommunicationTimeline;
    expect(timeline).toHaveLength(1);
    expect(timeline[0].listener).toBe('useQueueSync');
    expect(timeline[0].audience).toBe('queue');
  });

  it('records queue consumer path for studio_job_event messages', async () => {
    let handler: (data: any) => void = () => {};
    (useWebSocket as any).mockImplementation((_url: string, onMessage: any) => {
      handler = onMessage;
      return { connected: true };
    });
    renderHook(() => useQueueSync());
    act(() => {
      handler({ type: 'studio_job_event', job_id: 'j1', status: 'running', progress: 0.5 });
    });
    const timeline = (window as any).__ttsCommunicationTimeline ?? [];
    const queueEntries = timeline.filter((e: any) => e.listener === 'useQueueSync');
    expect(queueEntries).toHaveLength(1);
    expect(queueEntries[0].audience).toBe('both');
  });

  it('records queue consumer path for job_updated messages', async () => {
    let handler: (data: any) => void = () => {};
    (useWebSocket as any).mockImplementation((_url: string, onMessage: any) => {
      handler = onMessage;
      return { connected: true };
    });
    renderHook(() => useQueueSync());
    act(() => {
      handler({ type: 'job_updated', job_id: 'j2', updates: { status: 'queued' } });
    });
    const timeline = (window as any).__ttsCommunicationTimeline ?? [];
    const queueEntries = timeline.filter((e: any) => e.listener === 'useQueueSync');
    expect(queueEntries).toHaveLength(1);
    expect(queueEntries[0].audience).toBe('both');
  });

  it('preserves overlay progress after a queue_updated triggered refresh', async () => {
    // Regression test: queue_updated triggers refreshQueue('refresh') which previously
    // called pruneOlderThan(hydratedAtSeconds), wiping live overlays whose server-side
    // updated_at pre-dates the moment the API response arrived.
    let handler: (data: any) => void = () => {};
    (useWebSocket as any).mockImplementation((_url: string, onMessage: any) => {
      handler = onMessage;
      return { connected: true };
    });

    const jobItem = {
      id: 'job-1',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'running',
      progress: 0,
      created_at: Date.now() / 1000 - 5,
    };
    (api.getProcessingQueue as any).mockResolvedValue([jobItem]);

    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Simulate a studio_job_event with progress 0.5 (server timestamp slightly in the past)
    const eventUpdatedAt = Date.now() / 1000 - 0.1;
    act(() => {
      handler({
        type: 'studio_job_event',
        job_id: 'job-1',
        status: 'running',
        progress: 0.5,
        updated_at: eventUpdatedAt,
        scope: 'job',
      });
    });

    // Overlay progress is visible immediately
    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'job-1');
      expect(job?.progress).toBeGreaterThanOrEqual(0.5);
    });

    // Trigger a queue_updated-style refresh
    await act(async () => {
      handler({ type: 'queue_updated' });
    });

    // MUST still see 0.5 — the overlay should NOT be pruned by refreshQueue('refresh')
    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'job-1');
      expect(job?.progress).toBeGreaterThanOrEqual(0.5);
    });
  });
  it('preserves overlays that arrive during reconnect API call (grace window)', async () => {
    // This tests the race: WS reconnects, events start flowing, but the API call takes
    // some time. Events received DURING the API call have updated_at values stamped
    // by the server just-now — but if hydratedAtSeconds is slightly newer (because the
    // API call completed after those events arrived), pruneOlderThan would discard them.
    // The fix is a PRUNE_GRACE_SECONDS buffer subtracted from hydratedAtSeconds.
    let handler: (data: any) => void = () => {};
    let connectedState = true;
    (useWebSocket as any).mockImplementation((_url: string, onMessage: any) => {
      handler = onMessage;
      return { connected: connectedState };
    });

    const jobItem = {
      id: 'job-reconnect',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'running',
      progress: 0,
      created_at: Date.now() / 1000 - 10,
    };

    // Hold the API response so we can inject an event during the "call"
    let resolveApi!: (items: any[]) => void;
    (api.getProcessingQueue as any).mockImplementation(
      () => new Promise(res => { resolveApi = res; })
    );

    const { result, rerender } = renderHook(() => useQueueSync());

    // Bootstrap resolves immediately
    await act(async () => { resolveApi([jobItem]); });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Simulate disconnect → reconnect cycle
    connectedState = false;
    rerender();
    connectedState = true;

    // Queue a fresh API promise for the reconnect call
    let resolveReconnect!: (items: any[]) => void;
    (api.getProcessingQueue as any).mockImplementation(
      () => new Promise(res => { resolveReconnect = res; })
    );
    rerender();

    // Wait for reconnect fetch to start
    await waitFor(() => expect(result.current.activeSource).toBe('reconnect'));

    // Simulate a live event arriving DURING the reconnect API call
    // updated_at is now (server clock), but hydratedAtSeconds will be slightly newer
    const eventUpdatedAt = Date.now() / 1000;
    act(() => {
      handler({
        type: 'studio_job_event',
        job_id: 'job-reconnect',
        status: 'running',
        progress: 0.6,
        updated_at: eventUpdatedAt,
        scope: 'job',
      });
    });

    // Resolve the reconnect API call (hydratedAtSeconds = now + epsilon)
    await act(async () => { resolveReconnect([jobItem]); });
    await waitFor(() => expect(result.current.activeSource).toBeUndefined());

    // The overlay MUST survive — pruning should apply a grace window so that
    // events stamped at eventUpdatedAt ≈ now are not erased.
    const job = result.current.queue.find((q: any) => q.id === 'job-reconnect');
    expect(job?.progress).toBeGreaterThanOrEqual(0.6);
  });
});
