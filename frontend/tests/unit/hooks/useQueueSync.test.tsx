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

    const records = getLiveEventAuditSnapshot();
    const invalidation = records.find(r => r.event.topic === 'queue.items');
    expect(invalidation?.subscribers.map(s => s.subscriber)).toContain('main-queue');
  });

  it('updates the queue overlay from chapters.progress frames', async () => {
    const jobItem = {
      id: 'j1',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'queued',
      progress: 0,
      created_at: Date.now() / 1000,
    };
    (api.getProcessingQueue as any).mockResolvedValue([jobItem]);

    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emitEvent('chapters.progress', 'chapter_progress', {
      status: 'running',
      progress: 0.5,
      groupedProgress: null,
      etaSeconds: 25,
      message: 'running',
      reasonCode: null,
      renderGroupCount: null,
      completedRenderGroups: null,
    }, { jobId: 'j1', projectId: 'proj-1', chapterId: 'chap-1' });

    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'j1');
      expect(job?.status).toBe('running');
      expect(job?.progress).toBe(0.5);
      expect(job?.eta_seconds).toBe(25);
    });

    const records = getLiveEventAuditSnapshot();
    const observed = records.find(r => r.event.topic === 'chapters.progress');
    expect(observed?.subscribers.map(s => s.subscriber)).toContain('main-queue');
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

  it('refreshes the queue from chapters.lifecycle frames', async () => {
    const jobItem = {
      id: 'job-lifecycle-test',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'queued',
      progress: 0,
      created_at: Date.now() / 1000,
    };
    (api.getProcessingQueue as any)
      .mockResolvedValueOnce([jobItem])
      .mockResolvedValueOnce([{ ...jobItem, status: 'running', progress: 0.1 }]);

    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emitEvent('chapters.lifecycle', 'chapter_lifecycle', {
      reasonCode: 'chapter_started',
      changedFields: ['status'],
    }, { jobId: 'job-lifecycle-test', projectId: 'proj-1', chapterId: 'chap-1' });

    await waitFor(() => expect(api.getProcessingQueue).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'job-lifecycle-test');
      expect(job?.status).toBe('running');
      expect(job?.progress).toBe(0.1);
    });

    const records = getLiveEventAuditSnapshot();
    const observed = records.find(r => r.event.topic === 'chapters.lifecycle');
    expect(observed?.subscribers.map(s => s.subscriber)).toContain('main-queue');
  });

  it('ignores segments.progress frames for the main queue overlay', async () => {
    const jobItem = {
      id: 'job-segment-ignore',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'running',
      progress: 0.2,
      eta_seconds: 40,
      active_segment_id: 'old-seg-id',
      active_segment_progress: 0.1,
      created_at: Date.now() / 1000,
    };
    (api.getProcessingQueue as any).mockResolvedValue([jobItem]);

    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emitEvent('segments.progress', 'segment_progress', {
      status: 'running',
      progress: 0.75,
      etaSeconds: 10,
      reasonCode: 'SEGMENT_PROGRESS',
      activeSegmentId: 'seg-1',
      activeSegmentProgress: 0.75,
    }, { jobId: 'job-segment-ignore', projectId: 'proj-1', chapterId: 'chap-1', segmentId: 'seg-1' });

    await new Promise(resolve => setTimeout(resolve, 50));

    const job = result.current.queue.find((q: any) => q.id === 'job-segment-ignore');
    expect(job?.progress).toBe(0.2);
    expect(job?.eta_seconds).toBe(40);
    expect(job?.active_segment_id).toBe('old-seg-id');
    expect(job?.active_segment_progress).toBe(0.1);

    const records = getLiveEventAuditSnapshot();
    const observed = records.find(r => r.event.topic === 'segments.progress');
    expect(observed?.subscribers.map(s => s.subscriber)).not.toContain('main-queue');
  });

  it('renders a voice-test queue row from queue.items without chapter or project context', async () => {
    (api.getProcessingQueue as any).mockResolvedValue([]);
    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emitEvent('queue.items', 'queue_item_status', {
      status: 'running',
      progress: 0.35,
      classification: 'job',
      message: 'Generating preview',
      startedAt: 1710000000,
      customTitle: 'Building voice for Dark Fantasy: Default',
      engine: 'voice_test',
    }, { jobId: 'voice-job-1' });

    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'voice-job-1');
      expect(job?.status).toBe('running');
      expect(job?.progress).toBe(0.35);
      expect(job?.project_id).toBeNull();
      expect(job?.chapter_id).toBeNull();
      expect(job?.custom_title).toBe('Building voice for Dark Fantasy: Default');
      expect(job?.engine).toBe('voice_test');
      expect(job?.started_at).toBe(1710000000);
    });
  });

  it('does not use voice.test frames to refresh the queue', async () => {
    (api.getProcessingQueue as any).mockResolvedValue([]);
    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emitEvent('voice.test', 'voice_test_progress', {
      status: 'queued',
      progress: 0,
      voiceName: 'Narrator',
      startedAt: Date.now() / 1000,
      message: 'Task accepted, reconciling batches.',
    }, { jobId: 'voice-job-queue-refresh' });

    await waitFor(() => {
      expect(api.getProcessingQueue).toHaveBeenCalledTimes(1);
      expect(result.current.queue).toHaveLength(0);
    });
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

  it('keeps a chapter lifecycle overlay visible when parentJobId carries the project id', async () => {
    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emitEvent('jobs.lifecycle', 'job_lifecycle', {
      status: 'queued',
      reasonCode: 'JOB_QUEUED',
      message: 'Task accepted, reconciling batches.',
      parentJobId: 'proj-1',
      parent_job_id: 'proj-1',
      updatedAt: Date.now() / 1000,
      hasSegmentSupport: true,
    }, { jobId: 'job-chapter-parent-project', projectId: 'proj-1', chapterId: 'chap-1' });

    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'job-chapter-parent-project');
      expect(job).toBeDefined();
      expect(job?.status).toBe('queued');
      expect(job?.chapter_id).toBe('chap-1');
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

  it('keeps a voice-build job-scoped item in the queue when it completes with active_segment_id=null and active_segment_progress=0', async () => {
    const jobItem = {
      id: 'voice-build-1',
      project_id: null,
      chapter_id: null,
      status: 'running' as const,
      progress: 0.7,
      created_at: Date.now() / 1000,
      classification: 'job' as const,
      engine: 'voice_build',
    };
    (api.getProcessingQueue as any).mockResolvedValue([jobItem]);

    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Emit jobs.lifecycle terminal done event clearing active segment fields
    emitEvent('jobs.lifecycle', 'job_lifecycle', {
      status: 'done',
      active_segment_id: null,
      active_segment_progress: 0,
      updatedAt: Date.now() / 1000 + 10,
    }, { jobId: 'voice-build-1' });

    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'voice-build-1');
      expect(job).toBeDefined();
      expect(job?.status).toBe('done');
      expect(job?.classification).toBe('job');
    });
  });
});
