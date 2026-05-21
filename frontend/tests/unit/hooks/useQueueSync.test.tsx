import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useQueueSync } from '@/hooks/useQueueSync';
import { api } from '@/api';
import {
  publishStudioSocketMessage,
  resetStudioSocketBusForTests,
  setStudioSocketConnected,
  setStudioSocketSender,
} from '@/store/studioSocketBus';
import { clearTtsCommunicationTimeline } from '@/utils/runtimeDebug';

vi.mock('@/api', () => ({
  api: {
    getProcessingQueue: vi.fn(),
  },
}));

describe('useQueueSync', () => {
  let sendMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    clearTtsCommunicationTimeline();
    delete (window as any).__ttsCommunicationTimeline;
    resetStudioSocketBusForTests();
    setStudioSocketConnected(true);
    sendMessage = vi.fn();
    setStudioSocketSender(sendMessage);
    (api.getProcessingQueue as any).mockResolvedValue([]);
  });

  const emit = (payload: any) => {
    act(() => {
      publishStudioSocketMessage(payload);
    });
  };

  it('reports hydration source as bootstrap during initial load', async () => {
    let resolveQueue: any;
    const queuePromise = new Promise(resolve => { resolveQueue = resolve; });
    (api.getProcessingQueue as any).mockReturnValue(queuePromise);

    const { result } = renderHook(() => useQueueSync());

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
    const { result } = renderHook(() => useQueueSync());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      setStudioSocketConnected(false);
    });

    await waitFor(() => {
      expect(result.current.connected).toBe(false);
      expect(result.current.isReconnecting).toBe(true);
    });

    let resolveQueue: any;
    const controlledPromise = new Promise(resolve => { resolveQueue = resolve; });
    (api.getProcessingQueue as any).mockReturnValue(controlledPromise);

    act(() => {
      setStudioSocketConnected(true);
    });

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
    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emit({
      type: 'job_updated',
      job_id: 'job-1',
      updates: { status: 'running', progress: 0.25 },
    });

    expect(api.getProcessingQueue).toHaveBeenCalledTimes(1);
  });

  it('records queue consumer path in timeline when queue messages arrive', async () => {
    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emit({ type: 'queue_updated' });
    await waitFor(() => expect(result.current.activeSource).toBeUndefined());

    const timeline = (window as any).__ttsCommunicationTimeline;
    expect(timeline).toHaveLength(1);
    expect(timeline[0].listener).toBe('useQueueSync');
    expect(timeline[0].audience).toBe('queue');
  });

  it('records queue consumer path for studio_job_event messages', async () => {
    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emit({ type: 'studio_job_event', job_id: 'j1', status: 'running', progress: 0.5 });

    const timeline = (window as any).__ttsCommunicationTimeline ?? [];
    const queueEntries = timeline.filter((e: any) => e.listener === 'useQueueSync');
    expect(queueEntries).toHaveLength(1);
    expect(queueEntries[0].audience).toBe('both');
  });

  it('records queue consumer path for job_updated messages', async () => {
    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emit({ type: 'job_updated', job_id: 'j2', updates: { status: 'queued' } });

    const timeline = (window as any).__ttsCommunicationTimeline ?? [];
    const queueEntries = timeline.filter((e: any) => e.listener === 'useQueueSync');
    expect(queueEntries).toHaveLength(1);
    expect(queueEntries[0].audience).toBe('both');
  });

  it('preserves overlay progress after a queue_updated triggered refresh', async () => {
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

    const eventUpdatedAt = Date.now() / 1000 - 0.1;
    emit({
      type: 'studio_job_event',
      job_id: 'job-1',
      status: 'running',
      progress: 0.5,
      updated_at: eventUpdatedAt,
      scope: 'job',
    });

    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'job-1');
      expect(job?.progress).toBeGreaterThanOrEqual(0.5);
    });

    await act(async () => {
      emit({ type: 'queue_updated' });
    });

    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'job-1');
      expect(job?.progress).toBeGreaterThanOrEqual(0.5);
    });
  });

  it('preserves overlays that arrive during reconnect API call (grace window)', async () => {
    const jobItem = {
      id: 'job-reconnect',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'running',
      progress: 0,
      created_at: Date.now() / 1000 - 10,
    };

    let resolveBootstrap!: (items: any[]) => void;
    (api.getProcessingQueue as any).mockImplementationOnce(
      () => new Promise(res => { resolveBootstrap = res; })
    );

    const { result } = renderHook(() => useQueueSync());

    await act(async () => {
      resolveBootstrap([jobItem]);
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      setStudioSocketConnected(false);
    });
    let resolveReconnect!: (items: any[]) => void;
    (api.getProcessingQueue as any).mockImplementationOnce(
      () => new Promise(res => { resolveReconnect = res; })
    );

    act(() => {
      setStudioSocketConnected(true);
    });

    await waitFor(() => expect(result.current.activeSource).toBe('reconnect'));

    const eventUpdatedAt = Date.now() / 1000;
    emit({
      type: 'studio_job_event',
      job_id: 'job-reconnect',
      status: 'running',
      progress: 0.6,
      updated_at: eventUpdatedAt,
      scope: 'job',
    });

    await act(async () => { resolveReconnect([jobItem]); });
    await waitFor(() => expect(result.current.activeSource).toBeUndefined());

    const job = result.current.queue.find((q: any) => q.id === 'job-reconnect');
    expect(job?.progress).toBeGreaterThanOrEqual(0.6);
  });
});
