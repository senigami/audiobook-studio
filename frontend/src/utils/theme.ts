import { useState } from 'react';
import { Moon, SunMedium } from 'lucide-react';

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

// Owner-requested (2026-07-16): default to light mode for first-time users
// instead of following the OS preference, which was landing new users in
// dark mode more often than not.
export function loadThemePref(): Theme {
  try {
    return (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'light';
  } catch {
    return 'light';
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

function getCurrentTheme(): 'light' | 'dark' {
  if (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark') {
    return 'dark';
  }

  return 'light';
}

export function useThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => getCurrentTheme());
  const ThemeIcon = theme === 'dark' ? SunMedium : Moon;
  const themeLabel = theme === 'dark' ? 'Light mode' : 'Dark mode';
  const themeAriaLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  const handleThemeToggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';

    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = next;
    }

    saveThemePref(next);
    setTheme(next);
  };

  return {
    theme,
    ThemeIcon,
    themeLabel,
    themeAriaLabel,
    handleThemeToggle,
  };
}
