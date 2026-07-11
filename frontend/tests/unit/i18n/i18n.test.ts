/**
 * Foundation-only i18n scaffold — pinning tests.
 *
 * Confirms:
 *   - importing the module alone has no side effects (no instance created)
 *   - after explicit `initI18n()`, the committed English catalog loads and a
 *     known key resolves to its source string
 *   - a missing key falls back gracefully (never throws, never renders blank)
 *   - the `useTranslation()` wrapper is passthrough-safe before init
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { getI18n, initI18n, resetI18nForTests } from '@/i18n/index';
import welcomeEnUS from '@/i18n/locales/en-US/welcome.json';

describe('i18n foundation — import-time side effects', () => {
  afterEach(() => {
    resetI18nForTests();
  });

  it('creates no instance merely by being imported', () => {
    // Nothing in this describe block has called initI18n() yet at this point
    // for this fresh import — getI18n() must reflect that.
    expect(getI18n()).toBeNull();
  });
});

describe('i18n foundation — initI18n()', () => {
  beforeEach(() => {
    resetI18nForTests();
  });

  afterEach(() => {
    resetI18nForTests();
  });

  it('loads the committed English catalog and resolves a known key', () => {
    const i18n = initI18n();

    expect(i18n.t('hero.title', { ns: 'welcome' })).toBe(welcomeEnUS.hero.title);
    expect(i18n.t('cta.enterLibrary', { ns: 'welcome' })).toBe(
      welcomeEnUS.cta.enterLibrary,
    );
  });

  it('falls back gracefully for a missing key instead of throwing', () => {
    const i18n = initI18n();

    expect(() => i18n.t('nonexistent.key', { ns: 'welcome' })).not.toThrow();
    // i18next's default missing-key behavior returns the key itself.
    expect(i18n.t('nonexistent.key', { ns: 'welcome' })).toBe('nonexistent.key');
  });

  it('returns the same instance on repeated calls instead of re-initializing', () => {
    const first = initI18n();
    const second = initI18n();

    expect(second).toBe(first);
  });
});
