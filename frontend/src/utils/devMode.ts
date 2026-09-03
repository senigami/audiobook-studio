/**
 * devMode.ts — localStorage-backed dev-mode toggle.
 *
 * Owner convention (2026-07-17): use `useDevMode()` / `isDevModeEnabled()` as
 * the DEFAULT gate for anything we want to build and keep in the codebase
 * without exposing it to ordinary users yet — not just debug affordances.
 * That covers three overlapping cases:
 *   - Contributor/maintainer tooling that isn't harmful if seen, but isn't
 *     meant for normal use (e.g. the "copy visual prompt" button in
 *     ArchetypeQuickPick.tsx — a convenience for whoever is curating the
 *     character library, not something an end user needs).
 *   - Features still in progress: land the code, gate the surface, iterate
 *     with dev mode on, flip the gate off (or remove it) once it's ready.
 *   - Beta features: ship behind dev mode for early/opt-in testing before a
 *     full rollout, without needing a separate flag system.
 * Prefer this over inventing a new one-off flag when the surface is
 * genuinely fine to leave in place, just not ready (or not meant) for
 * everyone by default — reach for a real feature-flag/permission system
 * instead only when the surface would be harmful or misleading if exposed.
 */
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
