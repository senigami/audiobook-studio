import type { LucideIcon } from 'lucide-react';
import {
  BarChart2,
  FlaskConical,
  Library,
  Mic,
  Plug,
  Puzzle,
  Radio,
  Settings,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  badge?: 'queue';
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

const BASE_NAV_GROUPS: NavGroup[] = [
  {
    group: 'CREATE',
    items: [
      { id: 'library', label: 'Library', path: '/', icon: Library },
      { id: 'voices', label: 'Voices', path: '/voices', icon: Mic },
    ],
  },
  {
    group: 'MONITOR',
    items: [
      { id: 'activity', label: 'Activity', path: '/activity', icon: BarChart2, badge: 'queue' },
    ],
  },
  {
    group: 'PLATFORM',
    items: [
      { id: 'engines', label: 'Engines', path: '/engines', icon: Puzzle },
      { id: 'integrations', label: 'Integrations', path: '/integrations', icon: Plug },
    ],
  },
  {
    group: 'MANAGE',
    items: [{ id: 'settings', label: 'Settings', path: '/settings', icon: Settings }],
  },
];

const DEVELOPER_GROUP: NavGroup = {
  group: 'DEVELOPER',
  items: [
    { id: 'progress-test', label: 'Progress test', path: '/progress-test', icon: FlaskConical },
    { id: 'event-stream', label: 'Event stream', path: '/event-stream', icon: Radio },
  ],
};

export function buildNavGroups(devMode: boolean): NavGroup[] {
  return devMode ? [...BASE_NAV_GROUPS, DEVELOPER_GROUP] : [...BASE_NAV_GROUPS];
}

export function getActiveNavId(pathname: string): string {
  const path = pathname || '/';

  if (
    path === '/' ||
    path.startsWith('/project/') ||
    path.startsWith('/chapter/') ||
    path.startsWith('/book/')
  ) {
    return 'library';
  }

  if (path.startsWith('/voices')) {
    return 'voices';
  }

  if (path.startsWith('/activity') || path.startsWith('/queue')) {
    return 'activity';
  }

  if (path.startsWith('/engines')) {
    return 'engines';
  }

  if (path.startsWith('/integrations')) {
    return 'integrations';
  }

  if (path.startsWith('/settings')) {
    return 'settings';
  }

  if (path === '/progress-test') {
    return 'progress-test';
  }

  if (path === '/event-stream') {
    return 'event-stream';
  }

  return 'library';
}
