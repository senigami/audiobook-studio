import { useSyncExternalStore } from 'react';

export const STORAGE_KEY = 'studio-rail-collapsed';
export const WIDTH_STORAGE_KEY = 'studio-rail-width';
export const DEFAULT_RAIL_WIDTH = 190;
export const MIN_RAIL_WIDTH = 160;
export const MAX_RAIL_WIDTH = 360;

const _listeners = new Set<() => void>();

function _notify(): void {
  for (const fn of _listeners) fn();
}

export function clampRailWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return DEFAULT_RAIL_WIDTH;
  }

  return Math.min(MAX_RAIL_WIDTH, Math.max(MIN_RAIL_WIDTH, Math.round(width)));
}

export function isRailCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function getRailWidth(): number {
  try {
    const storedWidth = localStorage.getItem(WIDTH_STORAGE_KEY);
    if (storedWidth == null) {
      return DEFAULT_RAIL_WIDTH;
    }

    return clampRailWidth(Number(storedWidth));
  } catch {
    return DEFAULT_RAIL_WIDTH;
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

export function setRailWidth(width: number): void {
  const nextWidth = clampRailWidth(width);

  try {
    localStorage.setItem(WIDTH_STORAGE_KEY, String(nextWidth));
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

export function useRailWidth(): number {
  return useSyncExternalStore(subscribeRailState, getRailWidth, () => DEFAULT_RAIL_WIDTH);
}
