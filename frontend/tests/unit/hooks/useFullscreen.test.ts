/**
 * useFullscreen.test.ts — unit tests for frontend/src/hooks/useFullscreen.ts
 *
 * Mocks: the Fullscreen API (`element.requestFullscreen`, `document.exitFullscreen`,
 * `document.fullscreenElement`, the `fullscreenchange` event) — jsdom does not
 * implement it (confirmed by Task 1's findings, 01-findings.md). Does NOT mock
 * the hook under test.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFullscreen } from '@/hooks/useFullscreen';

function setFullscreenElement(el: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', {
    value: el,
    configurable: true,
  });
}

function dispatchFullscreenChange() {
  document.dispatchEvent(new Event('fullscreenchange'));
}

describe('useFullscreen', () => {
  afterEach(() => {
    setFullscreenElement(null);
    vi.restoreAllMocks();
  });

  it('enter() calls element.requestFullscreen()', () => {
    const el = document.createElement('div');
    el.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const ref = { current: el };

    const { result } = renderHook(() => useFullscreen(ref));
    act(() => {
      result.current.enter();
    });

    expect(el.requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('updates isFullscreen to true when fullscreenchange fires with this element as document.fullscreenElement', () => {
    const el = document.createElement('div');
    el.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const ref = { current: el };

    const { result } = renderHook(() => useFullscreen(ref));
    expect(result.current.isFullscreen).toBe(false);

    act(() => {
      setFullscreenElement(el);
      dispatchFullscreenChange();
    });

    expect(result.current.isFullscreen).toBe(true);
  });

  it('updates isFullscreen back to false when fullscreenchange fires with fullscreenElement cleared', () => {
    const el = document.createElement('div');
    el.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const ref = { current: el };

    const { result } = renderHook(() => useFullscreen(ref));
    act(() => {
      setFullscreenElement(el);
      dispatchFullscreenChange();
    });
    expect(result.current.isFullscreen).toBe(true);

    act(() => {
      setFullscreenElement(null);
      dispatchFullscreenChange();
    });
    expect(result.current.isFullscreen).toBe(false);
  });

  it('exit() calls document.exitFullscreen() when currently fullscreen', () => {
    const el = document.createElement('div');
    el.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    document.exitFullscreen = vi.fn().mockResolvedValue(undefined);
    const ref = { current: el };

    const { result } = renderHook(() => useFullscreen(ref));
    act(() => {
      setFullscreenElement(el);
      dispatchFullscreenChange();
    });

    act(() => {
      result.current.exit();
    });

    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('isSupported reflects whether requestFullscreen exists on the ref\'d element', () => {
    const supportedEl = document.createElement('div');
    supportedEl.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const { result: supportedResult } = renderHook(() => useFullscreen({ current: supportedEl }));
    expect(supportedResult.current.isSupported).toBe(true);

    const unsupportedEl = document.createElement('div');
    // @ts-expect-error -- simulating a browser without the Fullscreen API
    delete unsupportedEl.requestFullscreen;
    const { result: unsupportedResult } = renderHook(() => useFullscreen({ current: unsupportedEl }));
    expect(unsupportedResult.current.isSupported).toBe(false);
  });

  it('enter() does not crash when requestFullscreen is unavailable', () => {
    const el = document.createElement('div');
    // @ts-expect-error -- simulating a browser without the Fullscreen API
    delete el.requestFullscreen;
    const ref = { current: el };

    const { result } = renderHook(() => useFullscreen(ref));
    expect(() => act(() => result.current.enter())).not.toThrow();
  });

  it('toggle() enters fullscreen when not fullscreen, and exits when already fullscreen', () => {
    const el = document.createElement('div');
    el.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    document.exitFullscreen = vi.fn().mockResolvedValue(undefined);
    const ref = { current: el };

    const { result } = renderHook(() => useFullscreen(ref));

    act(() => {
      result.current.toggle();
    });
    expect(el.requestFullscreen).toHaveBeenCalledTimes(1);

    act(() => {
      setFullscreenElement(el);
      dispatchFullscreenChange();
    });

    act(() => {
      result.current.toggle();
    });
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
  });
});
