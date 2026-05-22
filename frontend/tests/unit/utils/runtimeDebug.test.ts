import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  recordStudioDebugSnapshot,
  recordWebsocketDebugMessage,
  shouldEnableStudioDebugLogging,
  wsAudienceForType,
  getTtsCommunicationTimeline,
  clearTtsCommunicationTimeline,
} from '@/utils/runtimeDebug';

describe('shouldEnableStudioDebugLogging', () => {
  const originalLocalStorage = window.localStorage;

  beforeEach(() => {
    const storageState = new Map<string, string>();
    const fakeLocalStorage = {
      getItem: (key: string) => storageState.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storageState.set(key, value);
      },
      removeItem: (key: string) => {
        storageState.delete(key);
      },
      clear: () => {
        storageState.clear();
      },
    } as Storage;

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: fakeLocalStorage,
    });
    delete (window as any).__studioDebugSnapshots;
    delete (window as any).__studioDebugLast;
    delete (window as any).__websocketRecentMessages;
    delete (window as any).__ttsCommunicationTimeline;
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
    delete (window as any).__studioDebugSnapshots;
    delete (window as any).__studioDebugLast;
    delete (window as any).__websocketRecentMessages;
    delete (window as any).__ttsCommunicationTimeline;
    window.history.replaceState({}, '', '/');
  });

  it('returns false by default', () => {
    expect(shouldEnableStudioDebugLogging()).toBe(false);
  });

  it('returns true when localStorage studioDebug is enabled', () => {
    window.localStorage.setItem('studioDebug', '1');

    expect(shouldEnableStudioDebugLogging()).toBe(true);
  });

  it('returns true when debug query param is present', () => {
    window.history.replaceState({}, '', '/?debug=1');

    expect(shouldEnableStudioDebugLogging()).toBe(true);
  });

  it('returns true when studioDebug query param is present', () => {
    window.history.replaceState({}, '', '/?studioDebug=true');

    expect(shouldEnableStudioDebugLogging()).toBe(true);
  });

  it('stores snapshots in the global debug buffer when enabled', () => {
    window.localStorage.setItem('studioDebug', '1');

    recordStudioDebugSnapshot('chapter', { chapterId: 'chap-1', status: 'processing' });

    expect((window as any).__studioDebugSnapshots).toHaveLength(1);
    expect((window as any).__studioDebugSnapshots[0]).toMatchObject({
      tag: 'chapter',
      payload: { chapterId: 'chap-1', status: 'processing' },
    });
    expect((window as any).__studioDebugLast).toMatchObject({
      tag: 'chapter',
      payload: { chapterId: 'chap-1', status: 'processing' },
    });
  });

  it('records tts log lines and websocket messages in one communication timeline', () => {
    recordWebsocketDebugMessage('useJobs', {
      type: 'tts_log_line',
      job_id: 'job-1',
      chapter_id: 'chap-1',
      line: '[PROGRESS] 40% job-1',
      marker: 'PROGRESS',
      sequence: 2,
      received_at: 123,
      source: 'test-source',
    });
    recordWebsocketDebugMessage('useJobs', {
      type: 'job_updated',
      job_id: 'job-1',
      chapter_id: 'chap-1',
      source: 'test-source',
      updates: {
        progress: 0.4,
        active_segment_id: 'seg-1',
        active_segment_progress: 0.4,
        active_render_group_index: 1,
        completed_render_groups: 2,
        render_group_count: 5,
        completed_render_weight: 20,
        total_render_weight: 50,
        active_render_group_weight: 10,
        grouped_progress: 0.4,
      },
    });

    expect((window as any).__ttsCommunicationTimeline).toEqual([
      expect.objectContaining({
        kind: 'tts_log',
        type: 'tts_log_line',
        job_id: 'job-1',
        chapter_id: 'chap-1',
        line: '[PROGRESS] 40% job-1',
        marker: 'PROGRESS',
        sequence: 2,
      }),
      expect.objectContaining({
        kind: 'socket',
        type: 'job_updated',
        job_id: 'job-1',
        chapter_id: 'chap-1',
        progress: 0.4,
        active_segment_id: 'seg-1',
        active_segment_progress: 0.4,
        active_render_group_index: 1,
        completed_render_groups: 2,
        render_group_count: 5,
        completed_render_weight: 20,
        total_render_weight: 50,
        active_render_group_weight: 10,
        grouped_progress: 0.4,
      }),
    ]);
  });

  it('flattens nested job_updated updates into the recorded timeline entry', () => {
    recordWebsocketDebugMessage('useJobs', {
      type: 'job_updated',
      job_id: 'job-1',
      source: 'test-source',
      updates: {
        status: 'running',
        progress: 0.4,
        active_segment_id: 'seg-1',
        active_segment_progress: 0.4,
        active_render_group_index: 1,
        completed_render_groups: 2,
        render_group_count: 5,
        completed_render_weight: 20,
        total_render_weight: 50,
        active_render_group_weight: 10,
        grouped_progress: 0.4,
      },
    });

    expect((window as any).__ttsCommunicationTimeline).toEqual([
      expect.objectContaining({
        kind: 'socket',
        type: 'job_updated',
        status: 'running',
        progress: 0.4,
        active_segment_id: 'seg-1',
        active_segment_progress: 0.4,
        active_render_group_index: 1,
        completed_render_groups: 2,
        render_group_count: 5,
        completed_render_weight: 20,
        total_render_weight: 50,
        active_render_group_weight: 10,
        grouped_progress: 0.4,
      }),
    ]);
  });

  it('records legacy segment_progress events with the explicit segment id', () => {
    recordWebsocketDebugMessage('useJobs', {
      type: 'segment_progress',
      job_id: 'job-1',
      chapter_id: 'chap-1',
      segment_id: 'seg-legacy',
      progress: 0.75,
    });

    expect((window as any).__ttsCommunicationTimeline).toEqual([
      expect.objectContaining({
        type: 'segment_progress',
        job_id: 'job-1',
        chapter_id: 'chap-1',
        active_segment_id: 'seg-legacy',
        progress: 0.75,
      }),
    ]);
  });
});

describe('wsAudienceForType', () => {
  it('classifies queue-only message types', () => {
    expect(wsAudienceForType('queue_updated')).toBe('queue');
    expect(wsAudienceForType('pause_updated')).toBe('queue');
  });

  it('classifies chapter-only message types', () => {
    expect(wsAudienceForType('tts_log_line')).toBe('chapter');
    expect(wsAudienceForType('segment_progress')).toBe('chapter');
    expect(wsAudienceForType('segments_updated')).toBe('chapter');
    expect(wsAudienceForType('chapter_updated')).toBe('chapter');
    expect(wsAudienceForType('test_progress')).toBe('chapter');
  });

  it('classifies dual-audience message types as both', () => {
    expect(wsAudienceForType('studio_job_event')).toBe('both');
    expect(wsAudienceForType('job_updated')).toBe('both');
  });

  it('classifies unknown types as other', () => {
    expect(wsAudienceForType(undefined)).toBe('other');
    expect(wsAudienceForType('jobs_snapshot')).toBe('other');
  });
});

describe('timeline entry audience field', () => {
  beforeEach(() => {
    clearTtsCommunicationTimeline();
    delete (window as any).__ttsCommunicationTimeline;
  });

  afterEach(() => {
    clearTtsCommunicationTimeline();
    delete (window as any).__ttsCommunicationTimeline;
  });

  it('stamps audience=both on studio_job_event entries', () => {
    recordWebsocketDebugMessage('useJobs', { type: 'studio_job_event', job_id: 'j1', status: 'running' });
    const timeline = getTtsCommunicationTimeline();
    expect(timeline).toHaveLength(1);
    expect(timeline[0].audience).toBe('both');
  });

  it('stamps audience=queue on queue_updated entries', () => {
    recordWebsocketDebugMessage('useJobs', { type: 'queue_updated', reason: 'job_status_change' });
    const timeline = getTtsCommunicationTimeline();
    expect(timeline[0].audience).toBe('queue');
  });

  it('stamps audience=chapter on tts_log_line entries', () => {
    recordWebsocketDebugMessage('useJobs', { type: 'tts_log_line', job_id: 'j1', line: 'hello', marker: 'raw', sequence: 1 });
    const timeline = getTtsCommunicationTimeline();
    expect(timeline[0].audience).toBe('chapter');
  });
});

describe('timeline entry frameId merging', () => {
  beforeEach(() => {
    clearTtsCommunicationTimeline();
    delete (window as any).__ttsCommunicationTimeline;
  });

  afterEach(() => {
    clearTtsCommunicationTimeline();
    delete (window as any).__ttsCommunicationTimeline;
  });

  it('two distinct studio_job_event frames with the same job_id inside 1 second remain two timeline rows', () => {
    recordWebsocketDebugMessage('useJobs', { type: 'studio_job_event', job_id: 'job-1', status: 'queued' }, undefined, { frameId: 1, receivedAt: '2026-05-21T10:00:00.000Z', data: {} });
    recordWebsocketDebugMessage('useJobs', { type: 'studio_job_event', job_id: 'job-1', status: 'running' }, undefined, { frameId: 2, receivedAt: '2026-05-21T10:00:00.500Z', data: {} });

    const timeline = getTtsCommunicationTimeline();
    expect(timeline).toHaveLength(2);
    expect(timeline[0].status).toBe('queued');
    expect(timeline[1].status).toBe('running');
  });

  it('the same frame recorded by useJobs and useQueueSync becomes one timeline row with listeners useJobs, useQueueSync exactly once each', () => {
    recordWebsocketDebugMessage('useJobs', { type: 'studio_job_event', job_id: 'job-1', status: 'running' }, undefined, { frameId: 3, receivedAt: '2026-05-21T10:00:00.000Z', data: {} });
    recordWebsocketDebugMessage('useQueueSync', { type: 'studio_job_event', job_id: 'job-1', status: 'running' }, undefined, { frameId: 3, receivedAt: '2026-05-21T10:00:00.000Z', data: {} });

    const timeline = getTtsCommunicationTimeline();
    expect(timeline).toHaveLength(1);
    expect(timeline[0].listener).toBe('useJobs, useQueueSync');
  });

  it('queue_updated frames without job_id but different frameIds remain separate rows', () => {
    recordWebsocketDebugMessage('useJobs', { type: 'queue_updated' }, undefined, { frameId: 4, receivedAt: '2026-05-21T10:00:00.000Z', data: {} });
    recordWebsocketDebugMessage('useJobs', { type: 'queue_updated' }, undefined, { frameId: 5, receivedAt: '2026-05-21T10:00:00.100Z', data: {} });

    const timeline = getTtsCommunicationTimeline();
    expect(timeline).toHaveLength(2);
  });
});
