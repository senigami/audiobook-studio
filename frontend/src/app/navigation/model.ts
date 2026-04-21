export type NavigationLevel = 'global' | 'project' | 'chapter' | 'companion';

export interface NavigationNode {
  id: string;
  label: string;
  level: NavigationLevel;
  parentId?: string;
  href?: string;
}

export type RouteKind = 
  | 'library' 
  | 'project-overview' 
  | 'project-chapters' 
  | 'project-queue' 
  | 'project-export' 
  | 'project-settings' 
  | 'chapter-editor' 
  | 'queue' 
  | 'voices' 
  | 'settings' 
  | 'unknown';

export interface NavigationState {
  activeGlobalId: string;
  activeProjectId?: string;
  activeChapterId?: string;
  activeProjectSubnavId?: string;
  routeKind: RouteKind;
}

export type HydrationStatus = 
  | 'bootstrap' 
  | 'ready' 
  | 'reconnecting' 
  | 'recovering' 
  | 'refreshing' 
  | 'error';

export interface ShellHydrationState {
  status: HydrationStatus;
  lastHydratedAt?: number;
}

export interface StudioShellState {
  navigation: NavigationState;
  hydration: ShellHydrationState;
  breadcrumbs: { id: string; label: string; href?: string }[];
  projectSubnav: { id: string; label: string; href?: string }[];
}

export const GLOBAL_NAVIGATION_NODES: NavigationNode[] = [
  { id: 'library', label: 'Library', level: 'global', href: '/' },
  { id: 'queue', label: 'Queue', level: 'global', href: '/queue' },
  { id: 'voices', label: 'Voices', level: 'global', href: '/voices' },
  { id: 'settings', label: 'Settings', level: 'global', href: '/settings' },
];

export const PROJECT_NAVIGATION_NODES: NavigationNode[] = [
  { id: 'project-chapters', label: 'Chapters', level: 'project', parentId: 'project' },
  { id: 'project-characters', label: 'Characters', level: 'project', parentId: 'project' },
];

export const CHAPTER_NAVIGATION_NODES: NavigationNode[] = [
  { id: 'chapter-editor', label: 'Chapter Editor', level: 'chapter', parentId: 'project-chapters' },
];

export const COMPANION_SURFACES: NavigationNode[] = [
  { id: 'global-queue-drawer', label: 'Queue Drawer', level: 'companion', parentId: 'queue' },
  { id: 'notifications-panel', label: 'Notifications', level: 'companion' },
];
