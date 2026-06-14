import React from 'react';
import { SlidersHorizontal, BadgeInfo, FlaskConical } from 'lucide-react';

export type SettingsTabId = 'general' | 'about' | 'developer';

export interface SettingsTab {
  id: SettingsTabId;
  label: string;
  path: string;
  description: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  devOnly?: boolean;
}

/**
 * Active tabs: General / About / Developer (dev-gated).
 * TTS Engines and API have been re-homed to /engines and /integrations respectively.
 * Old bookmark paths (/settings/engines, /settings/api) redirect — see SETTINGS_REDIRECTS.
 */
export const SETTINGS_TABS: SettingsTab[] = [
  {
    id: 'general',
    label: 'General',
    path: '/settings',
    description: 'Core synthesis defaults and maintenance actions.',
    icon: SlidersHorizontal,
  },
  {
    id: 'about',
    label: 'About',
    path: '/settings/about',
    description: 'Studio version, runtime health, and system information.',
    icon: BadgeInfo,
  },
  {
    id: 'developer',
    label: 'Developer',
    path: '/settings/developer',
    description: 'Testing pages, debug tools, and API documentation.',
    icon: FlaskConical,
    devOnly: true,
  },
];

/**
 * Old Settings sub-paths that now redirect to standalone pages (R-G: old routes keep working).
 * Key = old path; value = redirect target.
 */
export const SETTINGS_REDIRECTS: Record<string, string> = {
  '/settings/engines': '/engines',
  '/settings/api': '/integrations',
};

export const VALID_SETTINGS_PATHS = new Set([
  ...SETTINGS_TABS.map((tab) => tab.path),
  ...Object.keys(SETTINGS_REDIRECTS),
]);

export const getActiveSettingsTab = (pathname: string): SettingsTab => {
  if (pathname === '/settings/about') return SETTINGS_TABS[1];
  if (pathname === '/settings/developer') return SETTINGS_TABS[2];
  return SETTINGS_TABS[0];
};

export const normalizeSettingsPath = (pathname: string) => {
  if (!pathname) {
    return '/settings';
  }
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
};
