import { createChapterBreadcrumbs, createProjectBreadcrumbs } from '../navigation/breadcrumbs';
import { GLOBAL_NAVIGATION_NODES } from '../navigation/model';
import type {
  RouteKind,
  NavigationState,
  ShellHydrationState,
  StudioShellState,
  HydrationStatus,
} from '../navigation/model';
import { createProjectSubnav } from '../navigation/project-subnav';

const INTENDED_UPSTREAM_CALLERS = ['frontend/src/app/routes/index.tsx'];
const INTENDED_DOWNSTREAM_DEPENDENCIES = [
  'frontend/src/app/navigation/model.ts',
  'frontend/src/app/navigation/breadcrumbs.ts',
  'frontend/src/app/navigation/project-subnav.ts',
];
const FORBIDDEN_DIRECT_IMPORTS = [
  'frontend/src/features',
  'frontend/src/components',
];

export interface ShellInputs {
  pathname: string;
  search?: string;
  loading: boolean;
  connected: boolean;
  isReconnecting: boolean;
  hydrationSource?: 'bootstrap' | 'reconnect' | 'refresh';
  projectTitle?: string;
  chapterTitle?: string;
}

export const deriveNavigationState = (pathname: string, search?: string): NavigationState => {
  const parts = pathname.split('/').filter(Boolean);
  
  let routeKind: RouteKind = 'unknown';
  let activeGlobalId = 'library';
  let activeProjectId: string | undefined;
  let activeChapterId: string | undefined;
  let activeProjectSubnavId: string | undefined;

  if (pathname === '/') {
    routeKind = 'library';
    activeGlobalId = 'library';
  } else if (pathname === '/queue') {
    routeKind = 'queue';
    activeGlobalId = 'queue';
  } else if (pathname === '/voices') {
    routeKind = 'voices';
    activeGlobalId = 'voices';
  } else if (pathname === '/settings') {
    routeKind = 'settings';
    activeGlobalId = 'settings';
  } else if (parts[0] === 'project' && parts[1]) {
    routeKind = 'project-overview';
    activeGlobalId = 'project';
    activeProjectId = parts[1];

    // Derive project subnav from tab param
    const params = new URLSearchParams(search || '');
    const tab = params.get('tab');
    if (tab === 'chapters') {
      routeKind = 'project-chapters';
      activeProjectSubnavId = 'project-chapters';
    } else if (tab === 'characters') {
      routeKind = 'project-chapters'; // Map to project-chapters for now as it's a sub-pane
      activeProjectSubnavId = 'project-characters';
    } else if (tab === 'queue') {
      routeKind = 'project-queue';
      activeProjectSubnavId = 'project-queue';
    } else if (tab === 'export') {
      routeKind = 'project-export';
      activeProjectSubnavId = 'project-export';
    } else if (tab === 'settings') {
      routeKind = 'project-settings';
      activeProjectSubnavId = 'project-settings';
    } else {
      activeProjectSubnavId = 'project-overview';
    }
  } else if (parts[0] === 'chapter' && parts[1]) {
    routeKind = 'chapter-editor';
    activeGlobalId = 'project';
    activeChapterId = parts[1];
  }

  return {
    activeGlobalId,
    activeProjectId,
    activeChapterId,
    activeProjectSubnavId,
    routeKind,
  };
};

export const deriveHydrationStatus = (inputs: {
  loading: boolean;
  connected: boolean;
  isReconnecting: boolean;
  source?: 'bootstrap' | 'reconnect' | 'refresh';
}): HydrationStatus => {
  if (inputs.loading || inputs.source === 'bootstrap') return 'bootstrap';
  if (inputs.source === 'reconnect') return 'recovering';
  if (inputs.isReconnecting) return 'reconnecting';
  if (inputs.source === 'refresh') return 'refreshing';
  if (!inputs.connected) return 'error';
  return 'ready';
};

export const createStudioShellState = (inputs: ShellInputs): StudioShellState => {
  const navigation = deriveNavigationState(inputs.pathname, inputs.search);
  const hydration: ShellHydrationState = {
    status: deriveHydrationStatus({
      loading: inputs.loading,
      connected: inputs.connected,
      isReconnecting: inputs.isReconnecting,
      source: inputs.hydrationSource,
    }),
    lastHydratedAt: Date.now(),
  };

  const breadcrumbContext = {
    projectId: navigation.activeProjectId,
    projectTitle: inputs.projectTitle,
    chapterId: navigation.activeChapterId,
    chapterTitle: inputs.chapterTitle,
    isEditorSurface: navigation.routeKind === 'chapter-editor',
  };

  const breadcrumbs = navigation.activeChapterId 
    ? createChapterBreadcrumbs(breadcrumbContext)
    : createProjectBreadcrumbs(breadcrumbContext);

  const projectSubnav = createProjectSubnav(navigation.activeProjectId);

  return {
    navigation,
    hydration,
    breadcrumbs,
    projectSubnav,
  };
};

export const createStudioShell = () => {
  consumeContractMarkers([
    INTENDED_UPSTREAM_CALLERS,
    INTENDED_DOWNSTREAM_DEPENDENCIES,
    FORBIDDEN_DIRECT_IMPORTS,
    GLOBAL_NAVIGATION_NODES,
    createProjectBreadcrumbs,
    createChapterBreadcrumbs,
    createProjectSubnav,
  ]);
  return {
    // Return a minimal compatibility shape if needed, 
    // but the main goal is providing the state derivation above.
    version: '2.0-beta',
    status: 'state-only'
  };
};

const consumeContractMarkers = (..._values: readonly unknown[]) => undefined;
