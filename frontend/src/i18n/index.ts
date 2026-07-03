/**
 * i18n foundation — inert until explicitly initialized.
 *
 * Studio 2.0 does not yet localize any rendered surface. This module exists
 * as a scaffold for a future localization pass (see
 * design-docs/specs/interface-localization.md and
 * design-docs/plans/master_fix_plan/tasks/012-deferred-and-open-questions.md).
 *
 * Per .agent/rules/modular_architecture.md, importing a module must not start
 * threads, register listeners, mutate global settings, or reconcile state.
 * Accordingly:
 *   - Importing this file has ZERO side effects — no i18next instance is
 *     created and no catalogs are loaded at module-load time.
 *   - `initI18n()` is the explicit, opt-in entry point that creates and
 *     configures the i18next instance. It is not called anywhere in the app
 *     yet — a future task wires it into App.tsx.
 *   - `getI18n()` / `useTranslation()` (see ./useTranslation.ts) fall back to
 *     a pure passthrough (returns the key / English default itself) when
 *     `initI18n()` has not been called, so accidental use before init never
 *     throws.
 */
import i18next, { type i18n as I18nInstance } from 'i18next';

import welcomeEnUS from './locales/en-US/welcome.json';

/** Source (fallback) locale — see interface-localization.md 2.1. */
export const SOURCE_LOCALE = 'en-US';

/** Namespaces available in the source catalog. Extend as more are added. */
export const NAMESPACES = ['welcome'] as const;
export type Namespace = (typeof NAMESPACES)[number];

/** Committed source-locale resources, keyed by namespace. */
const sourceResources: Record<Namespace, Record<string, unknown>> = {
  welcome: welcomeEnUS,
};

let instance: I18nInstance | null = null;

export interface InitI18nOptions {
  /** Locale to activate. Defaults to the source locale. */
  locale?: string;
  /** Enable i18next debug logging. Defaults to false. */
  debug?: boolean;
}

/**
 * Explicitly create and configure the i18next instance. Safe to call more
 * than once — subsequent calls return the already-created instance rather
 * than re-initializing.
 *
 * This is intentionally NOT called from module scope or from any currently
 * rendered component — a future task decides when/where to invoke it
 * (typically once, near the app root).
 */
export function initI18n(options: InitI18nOptions = {}): I18nInstance {
  if (instance) {
    return instance;
  }

  const created = i18next.createInstance();
  created.init({
    lng: options.locale ?? SOURCE_LOCALE,
    fallbackLng: SOURCE_LOCALE,
    ns: NAMESPACES,
    defaultNS: 'welcome',
    resources: {
      [SOURCE_LOCALE]: sourceResources,
    },
    interpolation: {
      // React already escapes values.
      escapeValue: false,
    },
    debug: options.debug ?? false,
    returnEmptyString: false,
  });

  instance = created;
  return created;
}

/**
 * Returns the initialized i18next instance, or `null` if `initI18n()` has
 * not been called yet. Callers that need passthrough-safe behavior should
 * prefer `useTranslation()` from `./useTranslation` instead of calling this
 * directly.
 */
export function getI18n(): I18nInstance | null {
  return instance;
}

/** Test-only escape hatch to reset module state between test cases. */
export function resetI18nForTests(): void {
  instance = null;
}
