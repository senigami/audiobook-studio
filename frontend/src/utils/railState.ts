import { useSyncExternalStore } from 'react';

export const STORAGE_KEY = 'studio-rail-collapsed';

const _listeners = new Set<() => void>();

function _notify(): void {
  for (const fn of _listeners) fn();
}

export function isRailCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setRailCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) {
      localStorage.setItem(STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
  _notify();
}

export function requestRailAutoCollapse(): () => void {
  const previousCollapsed = isRailCollapsed();
  setRailCollapsed(true);

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    setRailCollapsed(previousCollapsed);
  };
}

export function subscribeRailState(listener: () => void): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

export function useRailCollapsed(): boolean {
  return useSyncExternalStore(subscribeRailState, isRailCollapsed, () => false);
}
