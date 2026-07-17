import { useCallback, useEffect, useState, type RefObject } from 'react';

export interface UseFullscreenResult {
  isFullscreen: boolean;
  /** Whether the Fullscreen API is available on the ref'd element (feature-detected). */
  isSupported: boolean;
  enter: () => void;
  exit: () => void;
  toggle: () => void;
}

/**
 * Wraps the browser Fullscreen API (`element.requestFullscreen()` /
 * `document.exitFullscreen()` / `document.fullscreenElement` /
 * `fullscreenchange`) for a single ref'd element (synced-reader plan, Task 8
 * — the "OS fullscreen" display state of `ReaderContainer`). Net-new code:
 * confirmed no existing fullscreen helper anywhere in this frontend
 * (design-docs/plans/active/synced_reader/01-findings.md).
 *
 * `document.fullscreenElement === elementRef.current` is the single source
 * of truth for `isFullscreen`, kept in sync purely by listening for the
 * browser's own `fullscreenchange` event rather than tracked independently
 * — so a native Escape-driven exit (which fires `fullscreenchange` without
 * ever calling through this hook) still updates state correctly.
 *
 * `requestFullscreen` isn't available in every environment (feature-detect,
 * don't crash): `isSupported` reflects that so callers (`ReaderContainer`)
 * can hide the fullscreen control instead of offering a dead button.
 */
export function useFullscreen(elementRef: RefObject<HTMLElement | null>): UseFullscreenResult {
  // Refs must not be read during render (react-hooks/refs) -- both start at
  // a safe default and are corrected by effects below, which run after
  // commit (i.e. after the ref has actually attached to its DOM node).
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  // Deliberately no dependency array: `elementRef` (a stable ref object,
  // e.g. from useRef) never changes identity, so a `[elementRef]`-keyed
  // effect would only ever run once, on the commit *before* the ref's
  // `.current` is attached to a real element for callers (like
  // ReaderContainer) that mount the ref'd node conditionally (embedded ->
  // expanded). Running on every commit instead means this always picks up
  // `.current` once it's actually attached, at negligible cost (one typeof
  // check per render).
  useEffect(() => {
    setIsSupported(typeof elementRef.current?.requestFullscreen === 'function');
  });

  useEffect(() => {
    setIsFullscreen(elementRef.current != null && document.fullscreenElement === elementRef.current);
    const handleFullscreenChange = () => {
      setIsFullscreen(elementRef.current != null && document.fullscreenElement === elementRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [elementRef]);

  const enter = useCallback(() => {
    elementRef.current?.requestFullscreen?.();
  }, [elementRef]);

  const exit = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    }
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      exit();
    } else {
      enter();
    }
  }, [enter, exit]);

  return { isFullscreen, isSupported, enter, exit, toggle };
}
