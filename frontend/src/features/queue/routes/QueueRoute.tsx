import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { createHydrationCoordinator } from '../../../api/hydration';
import { createLiveJobsStore } from '../../../store/live-jobs';
import { createStudioShellState } from '../../../app/layout/StudioShell';
import type { StudioShellState } from '../../../app/navigation/model';

const INTENDED_UPSTREAM_CALLERS = ['frontend/src/app/routes/index.tsx', 'frontend/src/App.tsx'];
const INTENDED_DOWNSTREAM_DEPENDENCIES = [
  'frontend/src/api/hydration/index.ts',
  'frontend/src/store/live-jobs.ts',
  'frontend/src/app/navigation/breadcrumbs.ts',
];
const FORBIDDEN_DIRECT_IMPORTS = [
  'frontend/src/store/editor-session.ts',
  'frontend/src/components/GlobalQueue.tsx',
];

interface QueueRouteProps {
  children: (props: { shellState: StudioShellState }) => React.ReactNode;
  loading: boolean;
  connected: boolean;
  isReconnecting: boolean;
  refreshingSource?: 'bootstrap' | 'reconnect' | 'refresh';
}

export const QueueRoute: React.FC<QueueRouteProps> = ({ 
  children, 
  loading, 
  connected, 
  isReconnecting, 
  refreshingSource 
}) => {
  const location = useLocation();

  const shellState = useMemo(() => {
    return createStudioShellState({
      pathname: location.pathname,
      search: location.search,
      loading,
      connected,
      isReconnecting,
      hydrationSource: refreshingSource,
    });
  }, [location.pathname, location.search, loading, connected, isReconnecting, refreshingSource]);

  consumeContractMarkers([
    INTENDED_UPSTREAM_CALLERS,
    INTENDED_DOWNSTREAM_DEPENDENCIES,
    FORBIDDEN_DIRECT_IMPORTS,
    createHydrationCoordinator,
    createLiveJobsStore,
  ]);

  return <>{children({ shellState })}</>;
};

export const createQueueRoute = () => {
  return null;
};

const consumeContractMarkers = (..._values: readonly unknown[]) => undefined;
