/**
 * Foundation-only i18n scaffold — useTranslation() wrapper pinning tests.
 *
 * The hook must be passthrough-safe: it should work (returning the raw key
 * or an explicit default) even when `initI18n()` has never been called, and
 * it must resolve real strings once the app opts in.
 */
import { renderHook } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';

import { initI18n, resetI18nForTests } from '@/i18n/index';
import { useTranslation } from '@/i18n/useTranslation';
import welcomeEnUS from '@/i18n/locales/en-US/welcome.json';

describe('useTranslation — passthrough before init', () => {
  afterEach(() => {
    resetI18nForTests();
  });

  it('returns the raw key when i18n has not been initialized', () => {
    const { result } = renderHook(() => useTranslation('welcome'));

    expect(result.current.t('hero.title')).toBe('hero.title');
  });

  it('returns an explicit defaultValue when provided and i18n is not initialized', () => {
    const { result } = renderHook(() => useTranslation('welcome'));

    expect(result.current.t('hero.title', { defaultValue: 'Audiobook Studio' })).toBe(
      'Audiobook Studio',
    );
  });
});

describe('useTranslation — after initI18n()', () => {
  afterEach(() => {
    resetI18nForTests();
  });

  it('resolves known keys from the committed English catalog', () => {
    initI18n();
    const { result } = renderHook(() => useTranslation('welcome'));

    expect(result.current.t('hero.title')).toBe(welcomeEnUS.hero.title);
    expect(result.current.t('gettingStarted.step1.heading')).toBe(
      welcomeEnUS.gettingStarted.step1.heading,
    );
  });

  it('falls back to the key for a missing key without throwing', () => {
    initI18n();
    const { result } = renderHook(() => useTranslation('welcome'));

    expect(() => result.current.t('nonexistent.key')).not.toThrow();
    expect(result.current.t('nonexistent.key')).toBe('nonexistent.key');
  });
});
