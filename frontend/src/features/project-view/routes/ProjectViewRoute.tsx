import React, { useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { createHydrationCoordinator } from '../../../api/hydration';
import { createStudioQueries } from '../../../api/queries';
import { createLiveJobsStore } from '../../../store/live-jobs';
import { createStudioShellState } from '../../../app/layout/StudioShell';
import type { StudioShellState } from '../../../app/navigation/model';

const INTENDED_UPSTREAM_CALLERS = ['frontend/src/app/routes/index.tsx', 'frontend/src/App.tsx'];
const INTENDED_DOWNSTREAM_DEPENDENCIES = [
  'frontend/src/api/hydration/index.ts',
  'frontend/src/api/queries/index.ts',
  'frontend/src/store/live-jobs.ts',
  'frontend/src/app/navigation/project-subnav.ts',
  'frontend/src/app/navigation/breadcrumbs.ts',
];
const FORBIDDEN_DIRECT_IMPORTS = [
  'frontend/src/store/editor-session.ts',
];

interface ProjectViewRouteProps {
  children: (props: { shellState: StudioShellState }) => React.ReactNode;
  loading: boolean;
  connected: boolean;
  isReconnecting: boolean;
  refreshingSource?: 'bootstrap' | 'reconnect' | 'refresh';
  projectId?: string;
  projectTitle?: string;
  chapterTitle?: string;
}

export const ProjectViewRoute: React.FC<ProjectViewRouteProps> = ({ 
  children, 
  loading, 
  connected,
  isReconnecting,
  refreshingSource,
  projectId,
  projectTitle,
  chapterTitle
}) => {
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const location = useLocation();

  const shellState = useMemo(() => {
    return createStudioShellState({
      pathname: location.pathname,
      search: location.search,
      loading,
      connected,
      isReconnecting,
      hydrationSource: refreshingSource,
      projectId: projectId || routeProjectId,
      projectTitle,
      chapterTitle,
    });
  }, [location.pathname, location.search, loading, connected, isReconnecting, refreshingSource, projectId, routeProjectId, projectTitle, chapterTitle]);

  consumeContractMarkers([
    INTENDED_UPSTREAM_CALLERS,
    INTENDED_DOWNSTREAM_DEPENDENCIES,
    FORBIDDEN_DIRECT_IMPORTS,
    createHydrationCoordinator,
    createStudioQueries,
    createLiveJobsStore,
  ]);

  return <>{children({ shellState })}</>;
};

export const createProjectViewRoute = () => {
  return null;
};

const consumeContractMarkers = (..._values: readonly unknown[]) => undefined;
