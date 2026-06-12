export const STORAGE_KEY = 'studio-theme';

export type Theme = 'light' | 'dark' | 'system';

export function getEffectiveTheme(pref: Theme): 'light' | 'dark' {
  if (pref === 'system') {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return pref;
}

export function applyTheme(pref: Theme): void {
  if (typeof document === 'undefined') return;
  const effective = getEffectiveTheme(pref);
  document.documentElement.setAttribute('data-theme', effective);
}

export function loadThemePref(): Theme {
  try {
    return (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'system';
  } catch {
    return 'system';
  }
}

export function saveThemePref(pref: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // ignore storage errors (e.g. private browsing quota)
  }
  applyTheme(pref);
}
