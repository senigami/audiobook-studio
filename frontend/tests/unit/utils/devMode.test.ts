/**
 * devMode.test.ts — unit tests for frontend/src/utils/devMode.ts
 *
 * Mocks: localStorage (external storage boundary).
 * Does NOT mock the module under test.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isDevModeEnabled, setDevModeEnabled, subscribeDevMode, STORAGE_KEY } from '@/utils/devMode';

describe('isDevModeEnabled', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns false when nothing is stored', () => {
    expect(isDevModeEnabled()).toBe(false);
  });

  it('returns true after setDevModeEnabled(true)', () => {
    setDevModeEnabled(true);
    expect(isDevModeEnabled()).toBe(true);
  });

  it('returns false after setDevModeEnabled(false)', () => {
    setDevModeEnabled(true);
    setDevModeEnabled(false);
    expect(isDevModeEnabled()).toBe(false);
  });
});

describe('setDevModeEnabled', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('writes "true" to localStorage when enabled', () => {
    setDevModeEnabled(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('removes the key from localStorage when disabled', () => {
    setDevModeEnabled(true);
    setDevModeEnabled(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('subscribeDevMode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('calls the listener when dev mode is toggled on', () => {
    let callCount = 0;
    const unsubscribe = subscribeDevMode(() => { callCount++; });

    setDevModeEnabled(true);
    expect(callCount).toBe(1);

    unsubscribe();
  });

  it('calls the listener when dev mode is toggled off', () => {
    setDevModeEnabled(true);
    let callCount = 0;
    const unsubscribe = subscribeDevMode(() => { callCount++; });

    setDevModeEnabled(false);
    expect(callCount).toBe(1);

    unsubscribe();
  });

  it('does not call the listener after unsubscribing', () => {
    let callCount = 0;
    const unsubscribe = subscribeDevMode(() => { callCount++; });
    unsubscribe();

    setDevModeEnabled(true);
    expect(callCount).toBe(0);
  });

  it('supports multiple independent listeners', () => {
    let calls1 = 0;
    let calls2 = 0;
    const unsub1 = subscribeDevMode(() => { calls1++; });
    const unsub2 = subscribeDevMode(() => { calls2++; });

    setDevModeEnabled(true);
    expect(calls1).toBe(1);
    expect(calls2).toBe(1);

    unsub1();
    unsub2();
  });
});
