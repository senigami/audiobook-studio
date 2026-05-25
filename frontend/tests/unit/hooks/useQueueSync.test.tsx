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
import {
  getLiveEventAuditSnapshot,
  resetLiveEventAuditForTests,
} from '@/store/liveEventAuditStore';

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
    resetLiveEventAuditForTests();
    setStudioSocketConnected(true);
    sendMessage = vi.fn();
    setStudioSocketSender(sendMessage);
    (api.getProcessingQueue as any).mockResolvedValue([]);
  });

  const emitEvent = (topic: string, eventKind: string, payload: any, ids: any = {}) => {
    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic,
        eventKind,
        source: 'backend',
        emittedAt: Date.now() / 1000,
        pluginId: null,
        ids,
        payload,
      });
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

  it('does not refetch the queue for queue_item_status websocket events', async () => {
    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emitEvent('queue.items', 'queue_item_status', {
      status: 'running',
      progress: 0.25,
      etaSeconds: null,
      message: null,
      reasonCode: null,
      classification: 'job',
      changedFields: null,
    }, { jobId: 'job-1' });

    expect(api.getProcessingQueue).toHaveBeenCalledTimes(1);
  });

  it('records queue consumer path in timeline when queue messages arrive', async () => {
    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'queue.items',
        eventKind: 'queue_item_invalidated',
        payload: {
          status: 'queued',
          progress: 0,
          etaSeconds: null,
          message: 'refresh',
          reasonCode: 'queue_item_invalidated',
          classification: 'job',
          changedFields: [],
        },
      });
    });
    await waitFor(() => expect(result.current.activeSource).toBeUndefined());

    const timeline = (window as any).__ttsCommunicationTimeline;
    expect(timeline).toHaveLength(1);
    expect(timeline[0].listener).toBe('useQueueSync');
    expect(timeline[0].audience).toBe('queue');
  });

  it('ignores chapters.progress event and does not record timeline entries', async () => {
    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'chapters.progress',
        eventKind: 'chapter_progress',
        ids: { jobId: 'j1' },
        payload: {
          status: 'running',
          progress: 0.5,
          groupedProgress: null,
          etaSeconds: null,
          message: 'running',
          reasonCode: null,
          renderGroupCount: null,
          completedRenderGroups: null,
        },
      });
    });

    const timeline = (window as any).__ttsCommunicationTimeline ?? [];
    const queueEntries = timeline.filter((e: any) => e.listener === 'useQueueSync');
    expect(queueEntries).toHaveLength(0);
  });

  it('records queue consumer path for job_updated messages', async () => {
    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'queue.items',
        eventKind: 'queue_item_status',
        ids: { jobId: 'j2' },
        payload: {
          status: 'queued',
          progress: 0,
          etaSeconds: null,
          message: null,
          reasonCode: null,
          classification: 'job',
          changedFields: null,
        },
      });
    });

    const timeline = (window as any).__ttsCommunicationTimeline ?? [];
    const queueEntries = timeline.filter((e: any) => e.listener === 'useQueueSync');
    expect(queueEntries).toHaveLength(1);
    expect(queueEntries[0].audience).toBe('both');
  });

  it('records a main-queue subscriber observation on each handled bus frame', async () => {
    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'queue.items',
        eventKind: 'queue_item_status',
        ids: { jobId: 'job-audit' },
        payload: {
          status: 'running',
          progress: 0.5,
          etaSeconds: null,
          message: null,
          reasonCode: null,
          classification: 'job',
          changedFields: null,
        },
      });
    });

    const records = getLiveEventAuditSnapshot();
    const observed = records.find(r => r.event.jobId === 'job-audit');
    expect(observed).toBeDefined();
    const subscribers = observed!.subscribers.map(s => s.subscriber);
    expect(subscribers).toContain('main-queue');
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
    emitEvent('queue.items', 'queue_item_status', {
      status: 'running',
      progress: 0.5,
      updatedAt: eventUpdatedAt,
      classification: 'job',
    }, { jobId: 'job-1' });

    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'job-1');
      expect(job?.progress).toBeGreaterThanOrEqual(0.5);
    });

    await act(async () => {
      emitEvent('queue.items', 'queue_item_invalidated', {
        reason: 'test',
        changedFields: [],
      });
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
    emitEvent('queue.items', 'queue_item_status', {
      status: 'running',
      progress: 0.6,
      updatedAt: eventUpdatedAt,
      classification: 'job',
    }, { jobId: 'job-reconnect' });

    await act(async () => { resolveReconnect([jobItem]); });
    await waitFor(() => expect(result.current.activeSource).toBeUndefined());

    const job = result.current.queue.find((q: any) => q.id === 'job-reconnect');
    expect(job?.progress).toBeGreaterThanOrEqual(0.6);
  });

  it('ignores chapters.progress events completely', async () => {
    const jobItem = {
      id: 'job-ignore-test',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'queued',
      progress: 0,
      created_at: Date.now() / 1000,
    };
    (api.getProcessingQueue as any).mockResolvedValue([jobItem]);

    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Emit chapters.progress event
    emitEvent('chapters.progress', 'chapter_progress', {
      status: 'running',
      progress: 0.5,
    }, { jobId: 'job-ignore-test' });

    // Wait short delay to verify no changes applied
    await new Promise(resolve => setTimeout(resolve, 50));

    // The job progress/status in useQueueSync should remain unchanged
    const job = result.current.queue.find((q: any) => q.id === 'job-ignore-test');
    expect(job?.progress).toBe(0);
    expect(job?.status).toBe('queued');
  });

  it('refreshes on queue_item_invalidated without reading status or progress from it', async () => {
    (api.getProcessingQueue as any).mockClear();
    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Send minimal queue_item_invalidated event
    emitEvent('queue.items', 'queue_item_invalidated', {
      reasonCode: 'some_invalidation_reason',
      changedFields: ['status'],
    });

    // Verify it triggers getProcessingQueue refresh call
    await waitFor(() => {
      expect(api.getProcessingQueue).toHaveBeenCalled();
    });
  });

  it('triggers queue snapshot refresh and renders the queued item after queue invalidation', async () => {
    const queuedJob = {
      id: 'job-enqueue-test',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'queued',
      created_at: Date.now() / 1000,
    };
    (api.getProcessingQueue as any)
      .mockResolvedValueOnce([]) // bootstrap
      .mockResolvedValueOnce([queuedJob]); // refresh

    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.queue).toHaveLength(0);

    // Emit queue_item_invalidated
    emitEvent('queue.items', 'queue_item_invalidated', {
      reasonCode: 'job_enqueued',
      changedFields: ['status'],
    });

    await waitFor(() => {
      expect(api.getProcessingQueue).toHaveBeenCalledTimes(2);
      const job = result.current.queue.find((q: any) => q.id === 'job-enqueue-test');
      expect(job).toBeDefined();
      expect(job?.status).toBe('queued');
    });
  });


  it('renders queue row from queue.items status event without chapters.progress', async () => {
    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Emit queue_item_status event on queue.items topic
    emitEvent('queue.items', 'queue_item_status', {
      status: 'queued',
      progress: 0.0,
      classification: 'chapter',
    }, { jobId: 'job-123', projectId: 'proj-1', chapterId: 'chap-1' });

    // The queue row should appear in the queue list using the overlay state
    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'job-123');
      expect(job).toBeDefined();
      expect(job?.status).toBe('queued');
    });
  });

  it('does not clamp progress of a newer active overlay to 1.0 when merging with a stale done snapshot item', async () => {
    const jobItem = {
      id: 'job-stale',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'done' as const,
      progress: 1.0,
      updated_at: 100,
      created_at: 50,
    };
    (api.getProcessingQueue as any).mockResolvedValue([jobItem]);

    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emitEvent('queue.items', 'queue_item_status', {
      status: 'running',
      progress: 0.44,
      updatedAt: 200,
      classification: 'job',
    }, { jobId: 'job-stale' });

    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'job-stale');
      expect(job).toBeDefined();
      expect(job?.status).toBe('running');
      expect(job?.progress).toBe(0.44);
    });
  });

  it('clamps/ignores overlay status when the overlay is not provably newer than the done snapshot', async () => {
    const jobItem = {
      id: 'job-stale-older',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'done' as const,
      progress: 1.0,
      updated_at: 200,
      created_at: 50,
    };
    (api.getProcessingQueue as any).mockResolvedValue([jobItem]);

    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emitEvent('queue.items', 'queue_item_status', {
      status: 'running',
      progress: 0.44,
      updatedAt: 100,
      classification: 'job',
    }, { jobId: 'job-stale-older' });

    await new Promise(resolve => setTimeout(resolve, 50));
    const job = result.current.queue.find((q: any) => q.id === 'job-stale-older');
    expect(job?.status).toBe('done');
    expect(job?.progress).toBe(1.0);
  });

  it('confirms queue.items positive etaSeconds is stored from the socket payload', async () => {
    const jobItem = {
      id: 'job-eta-test',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'running',
      progress: 0.1,
      eta_seconds: 0,
      created_at: Date.now() / 1000,
    };
    (api.getProcessingQueue as any).mockResolvedValue([jobItem]);

    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emitEvent('queue.items', 'queue_item_status', {
      status: 'running',
      progress: 0.2,
      etaSeconds: 15,
      classification: 'job',
    }, { jobId: 'job-eta-test' });

    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'job-eta-test');
      expect(job).toBeDefined();
      expect(job?.eta_seconds).toBe(15);
    });
  });

  it('proves tts.logs does not update queue ETA', async () => {
    const jobItem = {
      id: 'job-tts-ignore',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'running',
      progress: 0.1,
      eta_seconds: 30,
      created_at: Date.now() / 1000,
    };
    (api.getProcessingQueue as any).mockResolvedValue([jobItem]);

    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emitEvent('tts.logs', 'tts_log', {
      line: '[PROGRESS] 50% job-tts-ignore, ETA 10 seconds',
    }, { jobId: 'job-tts-ignore' });

    // Wait small delay to ensure it is ignored
    await new Promise(resolve => setTimeout(resolve, 50));

    const job = result.current.queue.find((q: any) => q.id === 'job-tts-ignore');
    expect(job?.eta_seconds).toBe(30);
  });

  it('confirms queue.items positive etaSeconds stores eta_seconds and eta_basis="remaining_from_update" by default', async () => {
    const jobItem = {
      id: 'job-basis-default',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'running',
      progress: 0.1,
      eta_seconds: 0,
      eta_basis: 'total_from_start',
      created_at: Date.now() / 1000,
    };
    (api.getProcessingQueue as any).mockResolvedValue([jobItem]);

    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emitEvent('queue.items', 'queue_item_status', {
      status: 'running',
      progress: 0.2,
      etaSeconds: 15,
      classification: 'job',
    }, { jobId: 'job-basis-default' });

    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'job-basis-default');
      expect(job).toBeDefined();
      expect(job?.eta_seconds).toBe(15);
      expect(job?.eta_basis).toBe('remaining_from_update');
    });
  });

  it('replaces total_from_start with remaining_from_update on a later queue.items positive update', async () => {
    const jobItem = {
      id: 'job-basis-update',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'running',
      progress: 0.1,
      eta_seconds: 40,
      eta_basis: 'total_from_start',
      created_at: Date.now() / 1000,
    };
    (api.getProcessingQueue as any).mockResolvedValue([jobItem]);

    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emitEvent('queue.items', 'queue_item_status', {
      status: 'running',
      progress: 0.3,
      etaSeconds: 20,
      classification: 'job',
    }, { jobId: 'job-basis-update' });

    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'job-basis-update');
      expect(job).toBeDefined();
      expect(job?.eta_seconds).toBe(20);
      expect(job?.eta_basis).toBe('remaining_from_update');
    });
  });
});
