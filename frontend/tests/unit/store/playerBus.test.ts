import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadAndPlay,
  play,
  pause,
  stop,
  seek,
  skip,
  reportTime,
  notifyEnded,
  notifyError,
  notifyPrev,
  notifyNext,
  subscribe,
  getSnapshot,
  resetPlayerBusForTests,
} from '@/store/playerBus';

describe('playerBus', () => {
  beforeEach(() => {
    resetPlayerBusForTests();
  });

  // 1. Initial state
  it('returns idle initial state', () => {
    const state = getSnapshot();
    expect(state.audioUrl).toBeNull();
    expect(state.scope).toBeNull();
    expect(state.title).toBe('');
    expect(state.subtitle).toBeUndefined();
    expect(state.playing).toBe(false);
    expect(state.position).toBe(0);
    expect(state.duration).toBe(0);
    expect(state.queue).toEqual({ hasPrev: false, hasNext: false });
    expect(state.requestId).toBe(0);
  });

  // 2. loadAndPlay sets state
  it('loadAndPlay sets audioUrl, scope, title, and playing: true', () => {
    loadAndPlay({
      scope: 'segment',
      title: 'Segment 1',
      subtitle: 'Chapter A',
      audioUrl: 'http://example.com/audio.mp3',
    });
    const state = getSnapshot();
    expect(state.audioUrl).toBe('http://example.com/audio.mp3');
    expect(state.scope).toBe('segment');
    expect(state.title).toBe('Segment 1');
    expect(state.subtitle).toBe('Chapter A');
    expect(state.playing).toBe(true);
  });

  // 2b. initialDuration sets duration up front (avoids the "unknown
  // duration" bootstrap window that PlayerBar's fitsLegibly() treats as
  // "show the waveform" — dangerous for a multi-hour book-scope file).
  it('loadAndPlay sets duration from initialDuration when supplied', () => {
    loadAndPlay({
      scope: 'book',
      title: 'Full Audiobook',
      audioUrl: 'http://example.com/book.mp3',
      initialDuration: 48540,
    });
    expect(getSnapshot().duration).toBe(48540);
  });

  it('loadAndPlay defaults duration to 0 when initialDuration is omitted', () => {
    loadAndPlay({
      scope: 'segment',
      title: 'Segment 1',
      audioUrl: 'http://example.com/seg.mp3',
    });
    expect(getSnapshot().duration).toBe(0);
  });

  // 3. requestId increments on each loadAndPlay
  it('increments requestId on each loadAndPlay call', () => {
    expect(getSnapshot().requestId).toBe(0);
    loadAndPlay({ scope: 'segment', title: 'A', audioUrl: 'http://a.com/1.mp3' });
    expect(getSnapshot().requestId).toBe(1);
    loadAndPlay({ scope: 'chapter', title: 'B', audioUrl: 'http://a.com/2.mp3' });
    expect(getSnapshot().requestId).toBe(2);
  });

  // 4. Replace source — new loadAndPlay replaces state
  it('loadAndPlay while playing replaces state with new audioUrl and requestId', () => {
    loadAndPlay({ scope: 'segment', title: 'First', audioUrl: 'http://a.com/first.mp3' });
    const firstRequestId = getSnapshot().requestId;
    loadAndPlay({ scope: 'preview', title: 'Second', audioUrl: 'http://a.com/second.mp3' });
    const state = getSnapshot();
    expect(state.audioUrl).toBe('http://a.com/second.mp3');
    expect(state.scope).toBe('preview');
    expect(state.title).toBe('Second');
    expect(state.requestId).toBe(firstRequestId + 1);
  });

  // 5. pause/play toggle
  it('pause sets playing: false and play sets playing: true', () => {
    loadAndPlay({ scope: 'segment', title: 'T', audioUrl: 'http://a.com/t.mp3' });
    expect(getSnapshot().playing).toBe(true);
    pause();
    expect(getSnapshot().playing).toBe(false);
    play();
    expect(getSnapshot().playing).toBe(true);
  });

  // 6. stop resets all state
  it('stop resets all state to idle', () => {
    loadAndPlay({ scope: 'chapter', title: 'T', audioUrl: 'http://a.com/t.mp3' });
    reportTime(30, 120);
    stop();
    const state = getSnapshot();
    expect(state.audioUrl).toBeNull();
    expect(state.scope).toBeNull();
    expect(state.playing).toBe(false);
    expect(state.position).toBe(0);
    expect(state.duration).toBe(0);
  });

  // 7. reportTime updates position and duration
  it('reportTime updates position and duration', () => {
    loadAndPlay({ scope: 'segment', title: 'T', audioUrl: 'http://a.com/t.mp3' });
    reportTime(45.5, 180);
    const state = getSnapshot();
    expect(state.position).toBe(45.5);
    expect(state.duration).toBe(180);
  });

  // 8. seek updates position
  it('seek updates position', () => {
    loadAndPlay({ scope: 'segment', title: 'T', audioUrl: 'http://a.com/t.mp3' });
    seek(60);
    expect(getSnapshot().position).toBe(60);
  });

  // 9. notifyEnded calls stored onEnded callback
  it('notifyEnded calls the onEnded callback from loadAndPlay', () => {
    const onEnded = vi.fn();
    loadAndPlay({ scope: 'segment', title: 'T', audioUrl: 'http://a.com/t.mp3', onEnded });
    notifyEnded();
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  // 10. notifyEnded with no callback does not throw
  it('notifyEnded with no callback does not throw', () => {
    loadAndPlay({ scope: 'segment', title: 'T', audioUrl: 'http://a.com/t.mp3' });
    expect(() => notifyEnded()).not.toThrow();
  });

  // 11. notifyPrev / notifyNext
  it('notifyPrev calls the onPrev callback', () => {
    const onPrev = vi.fn();
    loadAndPlay({ scope: 'chapter', title: 'T', audioUrl: 'http://a.com/t.mp3', onPrev });
    notifyPrev();
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('notifyNext calls the onNext callback', () => {
    const onNext = vi.fn();
    loadAndPlay({ scope: 'chapter', title: 'T', audioUrl: 'http://a.com/t.mp3', onNext });
    notifyNext();
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  // 12. notifyError calls stored onError callback
  it('notifyError calls the onError callback', () => {
    const onError = vi.fn();
    loadAndPlay({ scope: 'segment', title: 'T', audioUrl: 'http://a.com/t.mp3', onError });
    notifyError();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  // 13. Snapshot stability — same reference when no state change
  it('getSnapshot returns the same object reference when state has not changed', () => {
    const snap1 = getSnapshot();
    const snap2 = getSnapshot();
    expect(snap1).toBe(snap2);
  });

  // 14. Snapshot changes after mutation
  it('getSnapshot returns a new object reference after loadAndPlay', () => {
    const snap1 = getSnapshot();
    loadAndPlay({ scope: 'segment', title: 'T', audioUrl: 'http://a.com/t.mp3' });
    const snap2 = getSnapshot();
    expect(snap1).not.toBe(snap2);
  });

  // 15. subscribe/unsubscribe
  it('listener is called on state change and not called after unsubscribe', () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    loadAndPlay({ scope: 'segment', title: 'T', audioUrl: 'http://a.com/t.mp3' });
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    pause();
    // listener was unsubscribed before pause — should still be 1
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // 16. resetPlayerBusForTests resets to idle and clears listeners
  it('resetPlayerBusForTests resets state and clears listeners', () => {
    const listener = vi.fn();
    subscribe(listener);
    loadAndPlay({ scope: 'segment', title: 'T', audioUrl: 'http://a.com/t.mp3' });
    resetPlayerBusForTests();
    // After reset, state is idle
    expect(getSnapshot().audioUrl).toBeNull();
    expect(getSnapshot().requestId).toBe(0);
    // After reset, listener is cleared — further mutations don't call it
    loadAndPlay({ scope: 'segment', title: 'T2', audioUrl: 'http://a.com/t2.mp3' });
    expect(listener).toHaveBeenCalledTimes(1); // only the first call before reset
  });

  // 17. skip() — seeks relative to current position
  it('skip() advances position by delta and increments seekRequestId', () => {
    loadAndPlay({ scope: 'segment', title: 'T', audioUrl: 'http://a.com/t.mp3' });
    reportTime(30, 120);
    const beforeSeekId = getSnapshot().seekRequestId;
    skip(10);
    const state = getSnapshot();
    expect(state.position).toBe(40);
    expect(state.seekRequestId).toBe(beforeSeekId + 1);
  });

  it('skip() clamps to 0 when delta would go negative', () => {
    loadAndPlay({ scope: 'segment', title: 'T', audioUrl: 'http://a.com/t.mp3' });
    reportTime(5, 120);
    skip(-10);
    expect(getSnapshot().position).toBe(0);
  });

  it('skip() clamps to duration when delta would exceed it', () => {
    loadAndPlay({ scope: 'segment', title: 'T', audioUrl: 'http://a.com/t.mp3' });
    reportTime(115, 120);
    skip(10);
    expect(getSnapshot().position).toBe(120);
  });

  it('skip() clamps to position (not below 0) when duration is 0', () => {
    loadAndPlay({ scope: 'segment', title: 'T', audioUrl: 'http://a.com/t.mp3' });
    // duration is 0 — skip forward should stay at position (clamp to position = 0)
    skip(10);
    expect(getSnapshot().position).toBe(0);
  });

  // 18. queue flags
  it('loadAndPlay sets queue.hasPrev and queue.hasNext flags', () => {
    loadAndPlay({
      scope: 'chapter',
      title: 'Chapter 3',
      audioUrl: 'http://a.com/ch3.mp3',
      hasPrev: true,
      hasNext: false,
    });
    const state = getSnapshot();
    expect(state.queue.hasPrev).toBe(true);
    expect(state.queue.hasNext).toBe(false);
  });

  // 19. switchScope — RETIRED (audio-player.md 1.6.0): the scope/altScope toggle
  // is removed entirely; the player is scope-agnostic and representation is
  // duration-driven (see playerRepresentation.test.ts for the replacement
  // contract: fitsLegibly()). The `switchScope is not exported` / `altScope is
  // not present on the snapshot` assertions now live there.

  // 20. bookId — marks book-continuous-playback loads (bookContinuousPlayback.ts)
  // vs. one-off plays (e.g. ChapterTable.tsx), which must never set it.
  it('defaults bookId to null', () => {
    expect(getSnapshot().bookId).toBeNull();
  });

  it('sets bookId when passed to loadAndPlay', () => {
    loadAndPlay({
      scope: 'chapter',
      title: 'Chapter 1',
      audioUrl: 'http://example.com/ch1.wav',
      bookId: 'book-1',
    });
    expect(getSnapshot().bookId).toBe('book-1');
  });

  it('resets bookId to null on a subsequent loadAndPlay call that omits it', () => {
    loadAndPlay({
      scope: 'chapter',
      title: 'Chapter 1',
      audioUrl: 'http://example.com/ch1.wav',
      bookId: 'book-1',
    });
    expect(getSnapshot().bookId).toBe('book-1');

    loadAndPlay({
      scope: 'segment',
      title: 'Segment 1',
      audioUrl: 'http://example.com/seg.mp3',
    });
    expect(getSnapshot().bookId).toBeNull();
  });
});
