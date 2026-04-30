import React from 'react';
import { SlidersHorizontal, PlugZap, Server, BadgeInfo } from 'lucide-react';

export type SettingsTabId = 'general' | 'engines' | 'api' | 'about';

export interface SettingsTab {
  id: SettingsTabId;
  label: string;
  path: string;
  description: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}

export const SETTINGS_TABS: SettingsTab[] = [
  {
    id: 'general',
    label: 'General',
    path: '/settings',
    description: 'Core synthesis defaults and maintenance actions.',
    icon: SlidersHorizontal,
  },
  {
    id: 'engines',
    label: 'TTS Engines',
    path: '/settings/engines',
    description: 'Plugin cards, verification state, and engine-specific settings.',
    icon: PlugZap,
  },
  {
    id: 'api',
    label: 'API',
    path: '/settings/api',
    description: 'Local API access, authentication, and queue priority.',
    icon: Server,
  },
  {
    id: 'about',
    label: 'About',
    path: '/settings/about',
    description: 'Studio version, runtime health, and system information.',
    icon: BadgeInfo,
  },
];

export const VALID_SETTINGS_PATHS = new Set(SETTINGS_TABS.map((tab) => tab.path));

export const getActiveSettingsTab = (pathname: string): SettingsTab => {
  if (pathname === '/settings/engines') return SETTINGS_TABS[1];
  if (pathname === '/settings/api') return SETTINGS_TABS[2];
  if (pathname === '/settings/about') return SETTINGS_TABS[3];
  return SETTINGS_TABS[0];
};

export const normalizeSettingsPath = (pathname: string) => {
  if (!pathname) {
    return '/settings';
  }
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
};
