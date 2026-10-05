/**
 * useMediaQuery.test.ts — unit tests for frontend/src/hooks/useMediaQuery.ts
 *
 * Mocks: window.matchMedia (external OS API, jsdom does not implement it).
 * Does NOT mock the module under test.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from '@/hooks/useMediaQuery';

// ---------------------------------------------------------------------------
// matchMedia mock with real listener dispatch (so we can simulate 'change')
// ---------------------------------------------------------------------------

type Listener = (event: { matches: boolean }) => void;

const mockMatchMedia = (initialMatches: boolean) => {
  let matches = initialMatches;
  const listeners = new Set<Listener>();

  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: (_event: string, callback: Listener) => {
      listeners.add(callback);
    },
    removeEventListener: (_event: string, callback: Listener) => {
      listeners.delete(callback);
    },
    dispatchEvent: vi.fn(),
  }));

  const setMatches = (next: boolean) => {
    matches = next;
    for (const listener of listeners) listener({ matches: next });
  };

  return { setMatches };
};

// ---------------------------------------------------------------------------

describe('useMediaQuery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when the query currently matches', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(max-width: 640px)'));
    expect(result.current).toBe(true);
  });

  it('returns false when the query does not match', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(max-width: 640px)'));
    expect(result.current).toBe(false);
  });

  it('re-renders the consuming component when the match state changes', () => {
    const { setMatches } = mockMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(max-width: 640px)'));

    expect(result.current).toBe(false);

    act(() => {
      setMatches(true);
    });

    expect(result.current).toBe(true);
  });
});
