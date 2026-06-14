/**
 * playerPrefs.test.ts — unit tests for frontend/src/utils/playerPrefs.ts
 *
 * Mocks: localStorage (external storage boundary only).
 * Does NOT mock the module under test.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadWaveformPref, saveWaveformPref, WAVEFORM_PREF_KEY } from '@/utils/playerPrefs';

describe('loadWaveformPref / saveWaveformPref', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns false (default off) when nothing is stored', () => {
    expect(loadWaveformPref()).toBe(false);
  });

  it('saveWaveformPref(true) persists; loadWaveformPref reads it back as true', () => {
    saveWaveformPref(true);
    expect(loadWaveformPref()).toBe(true);
    expect(localStorage.getItem(WAVEFORM_PREF_KEY)).toBe('true');
  });

  it('saveWaveformPref(false) persists; loadWaveformPref reads it back as false', () => {
    saveWaveformPref(true);
    saveWaveformPref(false);
    expect(loadWaveformPref()).toBe(false);
    expect(localStorage.getItem(WAVEFORM_PREF_KEY)).toBe('false');
  });

  it('round-trips true → false → true correctly', () => {
    saveWaveformPref(true);
    expect(loadWaveformPref()).toBe(true);
    saveWaveformPref(false);
    expect(loadWaveformPref()).toBe(false);
    saveWaveformPref(true);
    expect(loadWaveformPref()).toBe(true);
  });
});
