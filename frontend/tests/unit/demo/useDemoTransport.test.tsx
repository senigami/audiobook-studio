import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDemoTransport } from '@/demo/useDemoTransport';
import type { DemoTimeline } from '@/demo/scenes/types';
import {
  subscribeStudioSocketMessages,
  resetStudioSocketBusForTests,
  getStudioSocketConnected,
} from '@/store/studioSocketBus';

// ---------------------------------------------------------------------------
// Minimal 2-frame timeline for tests
// ---------------------------------------------------------------------------
const makeTimeline = (overrides?: Partial<DemoTimeline>): DemoTimeline => ({
  scenes: [
    {
      id: 'scene-a',
      title: 'Scene A',
      caption: '',
      durationMs: 2000,
      frames: [
        { atMs: 0, data: { type: 'studio_event', version: 1, topic: 'queue.items', eventKind: 'queue_item_status', ids: { jobId: 'j1' }, payload: { status: 'queued' } } },
        { atMs: 1000, data: { type: 'studio_event', version: 1, topic: 'queue.items', eventKind: 'queue_item_status', ids: { jobId: 'j1' }, payload: { status: 'running' } } },
      ],
    },
    {
      id: 'scene-b',
      title: 'Scene B',
      caption: '',
      durationMs: 1000,
      frames: [
        { atMs: 0, data: { type: 'studio_event', version: 1, topic: 'queue.items', eventKind: 'queue_item_status', ids: { jobId: 'j2' }, payload: { status: 'done' } } },
      ],
    },
  ],
  totalMs: 3000,
  ...overrides,
});

beforeEach(() => {
  resetStudioSocketBusForTests();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// 1. autoPlay publishes scene frames in order through the bus
// ---------------------------------------------------------------------------
describe('useDemoTransport — autoPlay publishes frames in order', () => {
  it('publishes both scene-A frames as time advances', () => {
    const timeline = makeTimeline();
    const received: any[] = [];
    const unsub = subscribeStudioSocketMessages((data) => received.push(data));

    const { result } = renderHook(() =>
      useDemoTransport(timeline, { autoPlay: true }),
    );
    expect(result.current.state.playing).toBe(true);

    // advance 100ms — frame at 0ms should be published
    act(() => { vi.advanceTimersByTime(100); });
    expect(received.filter(d => d.type === 'studio_event' && d.payload?.status === 'queued').length).toBeGreaterThanOrEqual(1);

    // advance to 1100ms total — frame at 1000ms should now be published
    act(() => { vi.advanceTimersByTime(1000); });
    const statuses = received
      .filter(d => d.type === 'studio_event' && d.ids?.jobId === 'j1')
      .map(d => d.payload.status);
    expect(statuses).toContain('queued');
    expect(statuses).toContain('running');
    // Order preserved
    expect(statuses.indexOf('queued')).toBeLessThan(statuses.indexOf('running'));

    unsub();
  });
});

// ---------------------------------------------------------------------------
// 2. pause stops publication; play resumes from position
// ---------------------------------------------------------------------------
describe('useDemoTransport — pause / play', () => {
  it('pause stops frame publication', () => {
    const timeline = makeTimeline();
    const received: any[] = [];
    const unsub = subscribeStudioSocketMessages((data) => received.push(data));

    const { result } = renderHook(() => useDemoTransport(timeline, { autoPlay: true }));

    // Let first frame publish
    act(() => { vi.advanceTimersByTime(100); });
    const countAfterStart = received.length;

    // Pause
    act(() => { result.current.controls.pause(); });
    expect(result.current.state.playing).toBe(false);

    // Advance 2000ms — nothing new should publish
    act(() => { vi.advanceTimersByTime(2000); });
    expect(received.length).toBe(countAfterStart);

    // Resume — more frames should come through
    act(() => { result.current.controls.play(); });
    act(() => { vi.advanceTimersByTime(1100); });
    expect(received.length).toBeGreaterThan(countAfterStart);

    unsub();
  });
});

// ---------------------------------------------------------------------------
// 3. rate=4 crosses frames ~4x faster
// ---------------------------------------------------------------------------
describe('useDemoTransport — rate=4 crosses frames faster', () => {
  it('advancing 1000ms real time at rate=4 publishes frames up to ~4000ms', () => {
    // Build a timeline with frames spread over 4s
    const timeline: DemoTimeline = {
      scenes: [
        {
          id: 'rate-scene',
          title: 'Rate Scene',
          caption: '',
          durationMs: 5000,
          frames: [
            { atMs: 0, data: { type: 'jobs_snapshot', jobs: ['f0'] } },
            { atMs: 1000, data: { type: 'jobs_snapshot', jobs: ['f1'] } },
            { atMs: 2000, data: { type: 'jobs_snapshot', jobs: ['f2'] } },
            { atMs: 3000, data: { type: 'jobs_snapshot', jobs: ['f3'] } },
            { atMs: 4000, data: { type: 'jobs_snapshot', jobs: ['f4'] } },
          ],
        },
      ],
      totalMs: 5000,
    };

    const received: any[] = [];
    const unsub = subscribeStudioSocketMessages((data) => received.push(data));

    const { result } = renderHook(() => useDemoTransport(timeline, { autoPlay: true }));
    act(() => { result.current.controls.setRate(4); });

    // Advance 1100ms real time → 4400ms simulated
    act(() => { vi.advanceTimersByTime(1100); });

    // Frames at 0, 1000, 2000, 3000, 4000 should all be published (4400ms > 4000ms)
    const snapshotFrames = received.filter(d => d.type === 'jobs_snapshot');
    expect(snapshotFrames.length).toBeGreaterThanOrEqual(4);

    unsub();
  });
});

// ---------------------------------------------------------------------------
// 4. loop pass publishes the jobs_snapshot reset frame between passes
// ---------------------------------------------------------------------------
describe('useDemoTransport — looping publishes reset between passes', () => {
  it('publishes jobs_snapshot reset after last scene ends (looping=true)', () => {
    const timeline: DemoTimeline = {
      scenes: [
        {
          id: 'loop-scene',
          title: 'Loop',
          caption: '',
          durationMs: 500,
          frames: [
            { atMs: 0, data: { type: 'jobs_snapshot', jobs: ['initial'] } },
          ],
        },
      ],
      totalMs: 500,
    };

    const received: any[] = [];
    const unsub = subscribeStudioSocketMessages((data) => received.push(data));

    renderHook(() => useDemoTransport(timeline, { autoPlay: true }));

    // Advance past end of timeline to trigger loop reset (600ms > 500ms)
    act(() => { vi.advanceTimersByTime(600); });

    // A jobs_snapshot with empty jobs array should have been published as the reset
    const resets = received.filter(
      d => d.type === 'jobs_snapshot' && Array.isArray(d.jobs) && d.jobs.length === 0,
    );
    expect(resets.length).toBeGreaterThanOrEqual(1);

    unsub();
  });
});

// ---------------------------------------------------------------------------
// 6. restart while playing keeps playing (does not silently pause)
// ---------------------------------------------------------------------------
describe('useDemoTransport — restart preserves playing state', () => {
  it('stays playing after restart() when called mid-playback', () => {
    const timeline = makeTimeline();
    const { result } = renderHook(() => useDemoTransport(timeline, { autoPlay: true }));

    // Advance into scene A so position/sceneIndex are non-zero
    act(() => { vi.advanceTimersByTime(1100); });
    expect(result.current.state.playing).toBe(true);

    act(() => { result.current.controls.restart(); });

    // Restart should reset position to the top but keep playing.
    expect(result.current.state.sceneIndex).toBe(0);
    expect(result.current.state.scenePositionMs).toBe(0);
    expect(result.current.state.playing).toBe(true);
  });

  it('stays paused after restart() when called while paused', () => {
    const timeline = makeTimeline();
    const { result } = renderHook(() => useDemoTransport(timeline, { autoPlay: true }));

    act(() => { vi.advanceTimersByTime(1100); });
    act(() => { result.current.controls.pause(); });
    expect(result.current.state.playing).toBe(false);

    act(() => { result.current.controls.restart(); });

    expect(result.current.state.sceneIndex).toBe(0);
    expect(result.current.state.playing).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. play() at non-looping timeline end restarts from the top instead of no-op
// ---------------------------------------------------------------------------
describe('useDemoTransport — play() at non-looping end', () => {
  it('restarts from the beginning and resumes playing when called after the timeline finished', () => {
    const timeline = makeTimeline();
    const received: any[] = [];
    const unsub = subscribeStudioSocketMessages((data) => received.push(data));

    const { result } = renderHook(() => useDemoTransport(timeline, { autoPlay: true }));
    act(() => { result.current.controls.setLooping(false); });

    // Advance well past the end of the (non-looping) timeline.
    act(() => { vi.advanceTimersByTime(3500); });
    expect(result.current.state.playing).toBe(false);
    expect(result.current.state.sceneIndex).toBe(timeline.scenes.length - 1);

    const countAtEnd = received.length;

    // Pressing Play here used to be a no-op — it should now restart from scene 0.
    act(() => { result.current.controls.play(); });
    expect(result.current.state.playing).toBe(true);
    expect(result.current.state.sceneIndex).toBe(0);
    expect(result.current.state.scenePositionMs).toBe(0);

    // Advancing should publish scene-A frames again (proof playback actually resumed).
    act(() => { vi.advanceTimersByTime(100); });
    expect(received.length).toBeGreaterThan(countAtEnd);

    unsub();
  });
});

// ---------------------------------------------------------------------------
// 5. unmount clears timers and sets socket disconnected
// ---------------------------------------------------------------------------
describe('useDemoTransport — unmount cleanup', () => {
  it('sets socket disconnected on unmount', () => {
    const timeline = makeTimeline();
    const { result, unmount } = renderHook(() => useDemoTransport(timeline, { autoPlay: true }));

    // Should be connected while mounted
    expect(getStudioSocketConnected()).toBe(true);
    expect(result.current.state.playing).toBe(true);

    // Unmount
    act(() => { unmount(); });

    expect(getStudioSocketConnected()).toBe(false);

    // No frames should be published after unmount
    const received: any[] = [];
    const unsub = subscribeStudioSocketMessages((data) => received.push(data));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(received.length).toBe(0);
    unsub();
  });
});
