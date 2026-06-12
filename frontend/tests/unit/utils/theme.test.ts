/**
 * theme.test.ts — unit tests for frontend/src/utils/theme.ts
 *
 * Mocks: window.matchMedia (external OS API), localStorage (external storage),
 * document.documentElement.setAttribute (external DOM attribute).
 * Does NOT mock the module under test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getEffectiveTheme, applyTheme, loadThemePref, saveThemePref, STORAGE_KEY } from '@/utils/theme';

// ---------------------------------------------------------------------------
// matchMedia mock (jsdom does not implement it)
// ---------------------------------------------------------------------------

const mockMatchMedia = (prefersDark: boolean) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('dark') ? prefersDark : !prefersDark,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

// ---------------------------------------------------------------------------

describe('getEffectiveTheme', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns "light" when pref is "light"', () => {
    mockMatchMedia(true); // OS is dark — should be ignored
    expect(getEffectiveTheme('light')).toBe('light');
  });

  it('returns "dark" when pref is "dark"', () => {
    mockMatchMedia(false); // OS is light — should be ignored
    expect(getEffectiveTheme('dark')).toBe('dark');
  });

  it('returns "dark" for system when OS prefers dark', () => {
    mockMatchMedia(true);
    expect(getEffectiveTheme('system')).toBe('dark');
  });

  it('returns "light" for system when OS prefers light', () => {
    mockMatchMedia(false);
    expect(getEffectiveTheme('system')).toBe('light');
  });
});

// ---------------------------------------------------------------------------

describe('applyTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    mockMatchMedia(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets data-theme="light" when pref is "light"', () => {
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('sets data-theme="dark" when pref is "dark"', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('sets data-theme based on OS when pref is "system"', () => {
    mockMatchMedia(true);
    applyTheme('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});

// ---------------------------------------------------------------------------

describe('loadThemePref / saveThemePref round-trip', () => {
  beforeEach(() => {
    localStorage.clear();
    mockMatchMedia(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('loadThemePref returns "system" when nothing is stored', () => {
    expect(loadThemePref()).toBe('system');
  });

  it('saveThemePref persists the value; loadThemePref reads it back', () => {
    saveThemePref('dark');
    expect(loadThemePref()).toBe('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });

  it('saveThemePref("light") persists "light"', () => {
    saveThemePref('light');
    expect(loadThemePref()).toBe('light');
  });

  it('saveThemePref also applies the theme to the document', () => {
    saveThemePref('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
