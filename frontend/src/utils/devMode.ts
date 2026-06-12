import { useSyncExternalStore } from 'react';

export const STORAGE_KEY = 'studio-dev-mode';

// ---------------------------------------------------------------------------
// Module-level subscriber set (mirror of studioSocketBus pattern)
// ---------------------------------------------------------------------------

const _listeners = new Set<() => void>();

function _notify() {
  for (const fn of _listeners) fn();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isDevModeEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setDevModeEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
  _notify();
}

export function subscribeDevMode(listener: () => void): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export function useDevMode(): boolean {
  return useSyncExternalStore(subscribeDevMode, isDevModeEnabled, () => false);
}
