/**
 * Typed `useTranslation`-style hook wrapping the scaffold i18n instance.
 *
 * This intentionally does NOT use `react-i18next`'s `I18nextProvider` /
 * `useTranslation` directly, because that would require wrapping the app in
 * a provider — out of scope for this foundation-only pass (see
 * frontend/src/i18n/index.ts). Instead this hook reads directly from the
 * lazily-initialized instance and falls back to a pure passthrough (the key
 * itself, or an explicit default) when `initI18n()` has not been called.
 *
 * Importing this module has no side effects: it does not call `initI18n()`.
 */
import { useCallback } from 'react';

import { getI18n, type Namespace } from './index';

export interface TranslateOptions {
  /** Values to interpolate into `{{placeholders}}` in the source string. */
  vars?: Record<string, string | number>;
  /** Value to return if the key is missing and i18n is not initialized. */
  defaultValue?: string;
}

export type TranslateFn = (key: string, options?: TranslateOptions) => string;

/**
 * Returns a `t()` function scoped to `namespace`.
 *
 * Behavior when i18n has not been initialized (the default, unwired state):
 *   - returns `options.defaultValue` if provided
 *   - otherwise returns the raw key, so lookups never throw and never
 *     silently render blank text.
 */
export function useTranslation(namespace: Namespace): { t: TranslateFn } {
  const t = useCallback<TranslateFn>(
    (key, options) => {
      const i18n = getI18n();

      if (!i18n) {
        return options?.defaultValue ?? key;
      }

      const result = i18n.t(key, {
        ns: namespace,
        defaultValue: options?.defaultValue ?? key,
        ...(options?.vars ?? {}),
      });

      return typeof result === 'string' ? result : key;
    },
    [namespace],
  );

  return { t };
}
