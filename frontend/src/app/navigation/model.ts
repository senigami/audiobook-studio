// Navigation model for Studio 2.0.
//
// This module defines the intended shell hierarchy and route relationships so
// later UI work can implement navigation against a stable UX model instead of
// inventing structure ad hoc.

export interface NavigationNode {
  id: string;
  label: string;
  level: 'global' | 'project' | 'chapter' | 'companion';
  parentId?: string;
}

export const GLOBAL_NAVIGATION_NODES: NavigationNode[] = [
  { id: 'library', label: 'Library', level: 'global' },
  { id: 'project', label: 'Project', level: 'global' },
  { id: 'queue', label: 'Queue', level: 'global' },
  { id: 'voices', label: 'Voices', level: 'global' },
  { id: 'settings', label: 'Settings', level: 'global' },
];

export const PROJECT_NAVIGATION_NODES: NavigationNode[] = [
  { id: 'project-overview', label: 'Overview', level: 'project', parentId: 'project' },
  { id: 'project-chapters', label: 'Chapters', level: 'project', parentId: 'project' },
  { id: 'project-queue', label: 'Queue', level: 'project', parentId: 'project' },
  { id: 'project-export', label: 'Export', level: 'project', parentId: 'project' },
  { id: 'project-settings', label: 'Settings', level: 'project', parentId: 'project' },
];

export const CHAPTER_NAVIGATION_NODES: NavigationNode[] = [
  { id: 'chapter-editor', label: 'Chapter Editor', level: 'chapter', parentId: 'project-chapters' },
];

export const COMPANION_SURFACES: NavigationNode[] = [
  { id: 'global-queue-drawer', label: 'Queue Drawer', level: 'companion', parentId: 'queue' },
  { id: 'notifications-panel', label: 'Notifications', level: 'companion' },
];
