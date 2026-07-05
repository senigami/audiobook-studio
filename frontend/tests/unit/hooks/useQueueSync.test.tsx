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

  it('updates the queue overlay from chapters.progress frames (progress/ETA only; status is queue.items authority)', async () => {
    // CONTRACT: chapters.progress may update progress and ETA overlay on an existing row
    // but must NOT change the row's status — only queue.items is status authority.
    // The snapshot must already have status: 'running' for progress to be visible
    // (the merge layer zeros out progress when status is 'queued' or 'preparing').
    const jobItem = {
      id: 'j1',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'running',
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
      // progress and eta should update from the overlay
      expect(job?.progress).toBe(0.5);
      expect(job?.eta_seconds).toBe(25);
      // status must NOT be changed by chapters.progress — queue.items is the only status authority
      expect(job?.status).toBe('running');
    });

    const records = getLiveEventAuditSnapshot();
    const observed = records.find(r => r.event.topic === 'chapters.progress');
    expect(observed?.subscribers.map(s => s.subscriber)).toContain('main-queue');
  });

  it('T5 coverage gap: does not record a main-queue observation for a skipped overlay-only frame', async () => {
    // CONTRACT: chapters.progress is overlay-only — dispatchQueueEvent returns
    // {action: 'skipped'} for a job unknown to both the snapshot and the store
    // (queue.items is row authority). useQueueSync's applyEvent must NOT record
    // a main-queue subscriber observation in that case.
    (api.getProcessingQueue as any).mockResolvedValue([]);
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
    }, { jobId: 'unknown-job', projectId: 'proj-1', chapterId: 'chap-1' });

    await waitFor(() => {
      const records = getLiveEventAuditSnapshot();
      expect(records.find(r => r.event.topic === 'chapters.progress')).toBeTruthy();
    });

    const records = getLiveEventAuditSnapshot();
    const observed = records.find(r => r.event.topic === 'chapters.progress');
    expect(observed?.subscribers.map(s => s.subscriber)).not.toContain('main-queue');
  });

  it('T5 coverage gap: does not record a main-queue observation for an unhandled frame', async () => {
    // CONTRACT: a queue.items frame with no jobId and a non-invalidation
    // eventKind falls through dispatchQueueEvent to {action: 'unhandled'}.
    // useQueueSync's applyEvent must NOT record a main-queue observation.
    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emitEvent('queue.items', 'queue_item_status', {
      status: 'running',
    }, {});

    await waitFor(() => {
      const records = getLiveEventAuditSnapshot();
      expect(records.find(r => r.event.topic === 'queue.items')).toBeTruthy();
    });

    const records = getLiveEventAuditSnapshot();
    const observed = records.find(r => r.event.topic === 'queue.items');
    expect(observed?.subscribers.map(s => s.subscriber)).not.toContain('main-queue');
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

    // segments.progress should be ignored by main queue — assert state is unchanged
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

  it('jobs.lifecycle for an unknown job does NOT create a row (queue.items is row authority)', async () => {
    // CONTRACT CHANGE (Slice 5): jobs.lifecycle is overlay-only on existing rows.
    // It must not create a new queue row — only queue.items has that authority.
    // Old behavior: jobs.lifecycle for an unknown jobId created a live overlay row.
    // New behavior: the frame is silently dropped if the job does not already exist.
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

    // No new row must appear — the job does not exist in the snapshot
    const job = result.current.queue.find((q: any) => q.id === 'job-chapter-parent-project');
    expect(job).toBeUndefined();
    expect(result.current.queue).toHaveLength(0);
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

    // Stale overlay (updatedAt=100 < snapshot updated_at=200) must not overwrite the done snapshot
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

    // tts.logs should not affect queue ETA — assert state is unchanged
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

  // F3 — Events buffered during bootstrap hydration
  it('reflects a progress event that arrives mid-bootstrap after the snapshot resolves', async () => {
    const jobItem = {
      id: 'job-bootstrap-buffered',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'running',
      progress: 0,
      created_at: Date.now() / 1000,
    };

    let resolveBootstrap!: (items: any[]) => void;
    (api.getProcessingQueue as any).mockImplementationOnce(
      () => new Promise(res => { resolveBootstrap = res; })
    );

    const { result } = renderHook(() => useQueueSync());

    // Snapshot has NOT landed yet — emit event while still bootstrapping
    emitEvent('queue.items', 'queue_item_status', {
      status: 'running',
      progress: 0.77,
      updatedAt: Date.now() / 1000,
      classification: 'job',
    }, { jobId: 'job-bootstrap-buffered' });

    // Now resolve the bootstrap snapshot
    await act(async () => {
      resolveBootstrap([jobItem]);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const job = result.current.queue.find((q: any) => q.id === 'job-bootstrap-buffered');
    expect(job).toBeDefined();
    expect(job?.progress).toBe(0.77);
  });

  // F4 — Concurrent hydrations: later-started wins even if earlier resolves last
  it('applies only the later-started hydration result when two overlap and the earlier resolves last', async () => {
    // Bootstrap resolves quickly
    (api.getProcessingQueue as any).mockResolvedValueOnce([]);
    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Simulate disconnect → reconnect to start hydration #1 (generation 2)
    act(() => { setStudioSocketConnected(false); });

    let resolveFirst!: (items: any[]) => void;
    const firstPromise = new Promise<any[]>(res => { resolveFirst = res; });
    (api.getProcessingQueue as any).mockImplementationOnce(() => firstPromise);

    act(() => { setStudioSocketConnected(true); });
    await waitFor(() => expect(result.current.activeSource).toBe('reconnect'));

    // Second disconnect → reconnect immediately starts hydration #2 (generation 3)
    act(() => { setStudioSocketConnected(false); });

    let resolveSecond!: (items: any[]) => void;
    const secondPromise = new Promise<any[]>(res => { resolveSecond = res; });
    (api.getProcessingQueue as any).mockImplementationOnce(() => secondPromise);

    act(() => { setStudioSocketConnected(true); });

    // Resolve the SECOND (newer) hydration first, with a distinct queue item
    await act(async () => {
      resolveSecond([{
        id: 'job-newer-hydration',
        project_id: 'proj-newer',
        chapter_id: null,
        status: 'queued',
        progress: 0,
        created_at: Date.now() / 1000,
      }]);
    });

    // Now resolve the FIRST (older) hydration with a different item — should be discarded
    await act(async () => {
      resolveFirst([{
        id: 'job-older-hydration',
        project_id: 'proj-older',
        chapter_id: null,
        status: 'queued',
        progress: 0,
        created_at: Date.now() / 1000,
      }]);
    });

    await waitFor(() => expect(result.current.activeSource).toBeUndefined());

    const newerJob = result.current.queue.find((q: any) => q.id === 'job-newer-hydration');
    const olderJob = result.current.queue.find((q: any) => q.id === 'job-older-hydration');

    // The newer hydration's result must be present; the stale one must not overwrite it
    expect(newerJob).toBeDefined();
    expect(olderJob).toBeUndefined();
  });

  it('keeps a voice-build job-scoped item in the queue when jobs.lifecycle terminal frame clears active segment fields', async () => {
    // CONTRACT: jobs.lifecycle is overlay-only; it clears ETA/active-segment fields
    // on a terminal status but does NOT change the row's status — queue.items is
    // the only status authority. The row must remain visible and retain its classification.
    const jobItem = {
      id: 'voice-build-1',
      project_id: null,
      chapter_id: null,
      status: 'running' as const,
      progress: 0.7,
      created_at: Date.now() / 1000,
      classification: 'job' as const,
      engine: 'voice_build',
      active_segment_id: 'seg-active',
      active_segment_progress: 0.5,
    };
    (api.getProcessingQueue as any).mockResolvedValue([jobItem]);

    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Emit jobs.lifecycle terminal done event — should clear active segment overlay fields
    // but must NOT change status (status comes from queue.items)
    emitEvent('jobs.lifecycle', 'job_lifecycle', {
      status: 'done',
      active_segment_id: null,
      active_segment_progress: 0,
      updatedAt: Date.now() / 1000 + 10,
    }, { jobId: 'voice-build-1' });

    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'voice-build-1');
      expect(job).toBeDefined();
      // Row must still be visible with its original classification
      expect(job?.classification).toBe('job');
      // status must NOT change — jobs.lifecycle is not status authority
      expect(job?.status).toBe('running');
    });
  });

  // ── Slice 5: Row-Authority Guardrails ────────────────────────────────────

  it('[S5] chapters.progress frame for an UNKNOWN job id does NOT create a queue row', async () => {
    (api.getProcessingQueue as any).mockResolvedValue([]);
    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emitEvent('chapters.progress', 'chapter_progress', {
      status: 'running',
      progress: 0.5,
      groupedProgress: null,
      etaSeconds: 20,
      message: null,
      reasonCode: null,
      renderGroupCount: null,
      completedRenderGroups: null,
    }, { jobId: 'unknown-chapters-job', projectId: 'proj-1', chapterId: 'chap-1' });

    // No row must appear in the queue
    const job = result.current.queue.find((q: any) => q.id === 'unknown-chapters-job');
    expect(job).toBeUndefined();
    expect(result.current.queue).toHaveLength(0);
  });

  it('[S5] voice.test frame for an unknown job id does NOT create a queue row', async () => {
    (api.getProcessingQueue as any).mockResolvedValue([]);
    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emitEvent('voice.test', 'voice_test_progress', {
      voiceName: 'Narrator',
      status: 'running',
      progress: 0.4,
      startedAt: Date.now() / 1000,
      message: null,
    }, { jobId: 'unknown-voice-job' });

    const job = result.current.queue.find((q: any) => q.id === 'unknown-voice-job');
    expect(job).toBeUndefined();
    expect(result.current.queue).toHaveLength(0);
  });

  it('[S5] segments.progress frame never creates a main-queue row', async () => {
    (api.getProcessingQueue as any).mockResolvedValue([]);
    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emitEvent('segments.progress', 'segment_progress', {
      status: 'running',
      progress: 0.6,
      etaSeconds: 5,
      reasonCode: null,
      activeSegmentId: 'seg-x',
      activeSegmentProgress: 0.6,
    }, { jobId: 'unknown-segment-job', projectId: 'proj-1', chapterId: 'chap-1', segmentId: 'seg-x' });

    const job = result.current.queue.find((q: any) => q.id === 'unknown-segment-job');
    expect(job).toBeUndefined();
    expect(result.current.queue).toHaveLength(0);
  });

  it('[S5] queue.items frame DOES create a row (authority regression guard)', async () => {
    (api.getProcessingQueue as any).mockResolvedValue([]);
    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emitEvent('queue.items', 'queue_item_status', {
      status: 'queued',
      progress: 0,
      classification: 'job',
      message: null,
      reasonCode: null,
    }, { jobId: 'new-queue-job', projectId: 'proj-1' });

    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'new-queue-job');
      expect(job).toBeDefined();
      expect(job?.status).toBe('queued');
    });
  });

  it('[S5] chapters.progress can update progress on an EXISTING row but cannot change its classification', async () => {
    const jobItem = {
      id: 'existing-chapter-job',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'running',
      progress: 0.1,
      classification: 'chapter',
      created_at: Date.now() / 1000,
    };
    (api.getProcessingQueue as any).mockResolvedValue([jobItem]);
    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emitEvent('chapters.progress', 'chapter_progress', {
      status: 'running',
      progress: 0.65,
      groupedProgress: null,
      etaSeconds: 15,
      message: null,
      reasonCode: null,
      renderGroupCount: null,
      completedRenderGroups: null,
    }, { jobId: 'existing-chapter-job', projectId: 'proj-1', chapterId: 'chap-1' });

    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'existing-chapter-job');
      expect(job?.progress).toBeGreaterThanOrEqual(0.65);
    });

    // Classification must not be reclassified by chapters.progress
    const job = result.current.queue.find((q: any) => q.id === 'existing-chapter-job');
    expect(job?.classification).toBe('chapter');
  });

  it('[S5] jobs.lifecycle terminal frame for an existing row does not remove it, change its status, or change its classification', async () => {
    // CONTRACT: jobs.lifecycle is overlay-only. On an existing row it must not:
    //   - remove the row
    //   - change the row's status (queue.items is the only status authority)
    //   - change the row's classification
    const jobItem = {
      id: 'lifecycle-guard-job',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'running',
      progress: 0.8,
      classification: 'chapter',
      created_at: Date.now() / 1000,
    };
    (api.getProcessingQueue as any).mockResolvedValue([jobItem]);
    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // jobs.lifecycle terminal frame — overlay-only; status and classification must not change
    emitEvent('jobs.lifecycle', 'job_lifecycle', {
      status: 'done',
      reasonCode: 'JOB_DONE',
      message: null,
      updatedAt: Date.now() / 1000 + 5,
    }, { jobId: 'lifecycle-guard-job', projectId: 'proj-1', chapterId: 'chap-1' });

    await waitFor(() => {
      // Row must still exist (no removal by jobs.lifecycle)
      const job = result.current.queue.find((q: any) => q.id === 'lifecycle-guard-job');
      expect(job).toBeDefined();
    });

    const job = result.current.queue.find((q: any) => q.id === 'lifecycle-guard-job');
    // Status must NOT be changed by jobs.lifecycle — queue.items is the only status authority
    expect(job?.status).toBe('running');
    // Classification must not be changed by jobs.lifecycle
    expect(job?.classification).toBe('chapter');
  });

  // ── Terminal jobs.lifecycle refetch safety net ────────────────────────────

  it('refetches the queue when a TERMINAL jobs.lifecycle frame arrives for a known job', async () => {
    // DEFENSE-IN-DEPTH: terminal jobs.lifecycle frames trigger a queue refetch in
    // addition to (not instead of) their overlay handling. Refetching is legal under
    // the row-authority rules — it re-reads the durable SQLite rows rather than
    // mutating a row from the frame — and guarantees eventual consistency even if a
    // queue.items frame is dropped.
    const jobItem = {
      id: 'terminal-refetch-job',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'running',
      progress: 0.9,
      classification: 'chapter',
      created_at: Date.now() / 1000,
    };
    (api.getProcessingQueue as any)
      .mockResolvedValueOnce([jobItem]) // bootstrap
      .mockResolvedValueOnce([{ ...jobItem, status: 'done', progress: 1.0 }]); // terminal refetch

    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.getProcessingQueue).toHaveBeenCalledTimes(1);

    emitEvent('jobs.lifecycle', 'job_lifecycle', {
      status: 'done',
      reasonCode: 'JOB_DONE',
      message: null,
      updatedAt: Date.now() / 1000 + 5,
    }, { jobId: 'terminal-refetch-job', projectId: 'proj-1', chapterId: 'chap-1' });

    await waitFor(() => {
      expect(api.getProcessingQueue).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'terminal-refetch-job');
      expect(job?.status).toBe('done');
    });
  });

  it('does NOT refetch the queue for a non-terminal jobs.lifecycle frame', async () => {
    const jobItem = {
      id: 'nonterminal-no-refetch-job',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'running',
      progress: 0.4,
      classification: 'chapter',
      created_at: Date.now() / 1000,
    };
    (api.getProcessingQueue as any).mockResolvedValue([jobItem]);

    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.getProcessingQueue).toHaveBeenCalledTimes(1);

    emitEvent('jobs.lifecycle', 'job_lifecycle', {
      status: 'running',
      reasonCode: 'JOB_RUNNING',
      message: null,
      updatedAt: Date.now() / 1000 + 5,
    }, { jobId: 'nonterminal-no-refetch-job', projectId: 'proj-1', chapterId: 'chap-1' });

    // Overlay handling still applies; the row exists, but no refetch fires.
    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'nonterminal-no-refetch-job');
      expect(job).toBeDefined();
    });
    expect(api.getProcessingQueue).toHaveBeenCalledTimes(1);
  });

  // ── P7 — Fallback-poll interval hygiene ──────────────────────────────────

  it('[P7] fallback-poll interval is cleared on unmount (no leak)', async () => {
    vi.useFakeTimers();

    try {
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

      // Disconnect so the fallback interval effect is active
      act(() => { setStudioSocketConnected(false); });

      const { unmount } = renderHook(() => useQueueSync());

      // Flush microtasks so the hook fully mounts and the interval is registered
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      // Unmount — the fallback-poll effect cleanup must call clearInterval
      const clearCallsBefore = clearIntervalSpy.mock.calls.length;
      unmount();

      // At least one clearInterval call must have been made on unmount
      expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(clearCallsBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  it('[P7] reconnecting removes the fallback interval so no overlap fires', async () => {
    vi.useFakeTimers();

    try {
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

      // Start disconnected so the fallback interval is created
      act(() => { setStudioSocketConnected(false); });

      renderHook(() => useQueueSync());

      // Flush microtasks so the hook fully mounts
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      const clearCallsBefore = clearIntervalSpy.mock.calls.length;

      // Reconnect — the effect dep array includes `connected`, so React will run the
      // cleanup (clearInterval) before re-running the effect; with connected=true the
      // new effect body returns early without creating an interval.
      act(() => { setStudioSocketConnected(true); });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      // clearInterval must have been called (the old interval was torn down)
      expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(clearCallsBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  // ── Integration: indeterminate / loadingElapsedSeconds survive pickOverlayFields ──

  it('[W3-integration] chapters.progress frame carries indeterminate+loadingElapsedSeconds through pickOverlayFields to the store overlay', async () => {
    // This test exercises the REAL dispatch path:
    //   socket → useQueueSync dispatchQueueEvent → pickOverlayFields → applyJobUpdated → store
    // If indeterminate / loadingElapsedSeconds are absent from QUEUE_OVERLAY_FIELDS the
    // fields are stripped before reaching the store and this test goes red.
    const jobItem = {
      id: 'job-indeterminate',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'preparing',
      progress: 0,
      created_at: Date.now() / 1000,
    };
    (api.getProcessingQueue as any).mockResolvedValue([jobItem]);

    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Publish a chapters.progress frame via the live-event bus (R3 — typed payload)
    emitEvent('chapters.progress', 'chapter_progress', {
      status: 'preparing',
      progress: 0,
      groupedProgress: null,
      etaSeconds: null,
      message: 'Loading model…',
      reasonCode: 'LOADING_MODEL',
      renderGroupCount: null,
      completedRenderGroups: null,
      indeterminate: true,
      loadingElapsedSeconds: 5,
    }, { jobId: 'job-indeterminate', projectId: 'proj-1', chapterId: 'chap-1' });

    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'job-indeterminate');
      expect(job?.indeterminate).toBe(true);
      expect(job?.loadingElapsedSeconds).toBe(5);
    });

    // Follow-up frame clears the flag — must not stay latched
    emitEvent('chapters.progress', 'chapter_progress', {
      status: 'running',
      progress: 0.1,
      groupedProgress: null,
      etaSeconds: 30,
      message: null,
      reasonCode: null,
      renderGroupCount: null,
      completedRenderGroups: null,
      indeterminate: false,
      loadingElapsedSeconds: null,
    }, { jobId: 'job-indeterminate', projectId: 'proj-1', chapterId: 'chap-1' });

    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'job-indeterminate');
      expect(job?.indeterminate).toBe(false);
      expect(job?.loadingElapsedSeconds).toBeNull();
    });
  });

  // ── W-PAR 006: multi-active segments (active_segments_map four-point wire) ──

  it('[W-PAR 006] chapters.progress frame with active_segments_map lands both segments in the store overlay', async () => {
    // This exercises the REAL dispatch path (socket -> useQueueSync -> pickOverlayFields
    // -> applyJobUpdated -> store) per the C7 wire-integrity rule. If the field is not
    // extracted (jobEventAdapters.ts) AND whitelisted (queueOverlayFields.ts) AND merged
    // (hydration/index.ts) it is dead at runtime and this test goes red.
    const jobItem = {
      id: 'job-multi-active',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'running',
      progress: 0.2,
      created_at: Date.now() / 1000,
    };
    (api.getProcessingQueue as any).mockResolvedValue([jobItem]);

    const { result } = renderHook(() => useQueueSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    emitEvent('chapters.progress', 'chapter_progress', {
      status: 'running',
      progress: 0.4,
      groupedProgress: null,
      etaSeconds: 20,
      message: null,
      reasonCode: null,
      renderGroupCount: null,
      completedRenderGroups: null,
      active_segments_map: {
        S1: { phase: 'rendering', progress: 0.3, eta_seconds: 10 },
        S2: { phase: 'rendering', progress: 0.6, eta_seconds: 5 },
      },
    }, { jobId: 'job-multi-active', projectId: 'proj-1', chapterId: 'chap-1' });

    await waitFor(() => {
      const job = result.current.queue.find((q: any) => q.id === 'job-multi-active');
      expect(job?.active_segments_map).toBeDefined();
      expect(job?.active_segments_map?.S1).toMatchObject({ phase: 'rendering', progress: 0.3, eta_seconds: 10 });
      expect(job?.active_segments_map?.S2).toMatchObject({ phase: 'rendering', progress: 0.6, eta_seconds: 5 });
    });
  });
});
