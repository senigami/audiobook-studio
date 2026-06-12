import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isRailCollapsed,
  setRailCollapsed,
  STORAGE_KEY,
  subscribeRailState,
  useRailCollapsed,
} from '@/utils/railState';

describe('railState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to expanded when no persisted value exists', () => {
    expect(isRailCollapsed()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('persists collapsed state under the exact storage key', () => {
    setRailCollapsed(true);

    expect(isRailCollapsed()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');

    setRailCollapsed(false);

    expect(isRailCollapsed()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('notifies subscribers when the collapse state changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRailState(listener);

    setRailCollapsed(true);

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setRailCollapsed(false);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('exposes collapse changes through useRailCollapsed', () => {
    const { result } = renderHook(() => useRailCollapsed());

    expect(result.current).toBe(false);

    act(() => {
      setRailCollapsed(true);
    });

    expect(result.current).toBe(true);
  });
});
