import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  recordStudioDebugSnapshot,
  recordWebsocketDebugMessage,
  shouldEnableStudioDebugLogging,
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
});
