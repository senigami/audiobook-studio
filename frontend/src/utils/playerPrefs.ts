/**
 * playerPrefs.ts — persisted player UI preferences.
 *
 * Pattern mirrors utils/theme.ts: simple localStorage read/write with
 * try/catch for private-browsing safety. Each preference has a well-known
 * key constant + load/save pair.
 */

export const WAVEFORM_PREF_KEY = 'studio-player-waveform';

/**
 * Load the persisted waveform-on/off preference.
 * Returns `false` (off) by default — waveform is hidden until the user
 * explicitly enables it.
 */
export function loadWaveformPref(): boolean {
  try {
    return localStorage.getItem(WAVEFORM_PREF_KEY) === 'true';
  } catch {
    // ignore storage errors (e.g. private browsing quota)
    return false;
  }
}

/**
 * Persist the waveform-on/off preference.
 */
export function saveWaveformPref(on: boolean): void {
  try {
    localStorage.setItem(WAVEFORM_PREF_KEY, String(on));
  } catch {
    // ignore storage errors (e.g. private browsing quota)
  }
}
